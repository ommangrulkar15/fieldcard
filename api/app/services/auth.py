import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.demo_guard import is_demo_email, refuse_for_demo
from app.errors import Conflict, Unauthorized, ValidationFailed
from app.models import Membership, RefreshToken, User, Workspace
from app.permissions import ROLE_PERMISSIONS
from app.security import (
    create_access_token, hash_password, hash_refresh_token, new_refresh_token, verify_against_dummy, verify_password,
)
from app.services.workspaces import create_workspace

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 10
MAX_PASSWORD = 128
BAD_LOGIN = "Wrong email or password"


def normalize_email(email: str) -> str:
    value = (email or "").strip().lower()
    if len(value) > 254 or not EMAIL_RE.match(value):
        raise ValidationFailed({"email": "Enter a valid email address"})
    return value


def check_password(password: str) -> None:
    if not (MIN_PASSWORD <= len(password or "") <= MAX_PASSWORD):
        raise ValidationFailed({"password": f"Use {MIN_PASSWORD} to {MAX_PASSWORD} characters"})


def check_name(name: str) -> str:
    value = (name or "").strip()
    if not value or len(value) > 120:
        raise ValidationFailed({"name": "Name must be 1 to 120 characters"})
    return value


def create_user(db: Session, email: str, password: str, name: str, managed_by: uuid.UUID | None = None,
                *, allow_demo: bool = False) -> User:
    address, display_name = normalize_email(email), check_name(name)
    if is_demo_email(address) and not allow_demo:
        raise ValidationFailed({"email": "That address is reserved"})
    check_password(password)
    user = User(email=address, name=display_name, password_hash=hash_password(password), managed_by=managed_by)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise Conflict("That email is already registered") from None
    return user


def signup(db: Session, email: str, password: str, name: str, workspace_name: str, template: str) -> User:
    """New account plus its own workspace, with the user as its admin, in one transaction."""
    user = create_user(db, email, password, name)
    workspace = create_workspace(db, workspace_name, template, commit=False)
    db.add(Membership(user_id=user.id, workspace_id=workspace.id, role="admin"))
    db.commit()
    return user


# ---------------------------------------------------------------- sessions


def _issue_refresh_token(db: Session, user_id: uuid.UUID) -> str:
    token, digest = new_refresh_token()
    db.add(RefreshToken(
        user_id=user_id, token_hash=digest,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_days),
    ))
    return token


def start_session(db: Session, user: User) -> tuple[str, str]:
    """(access token, refresh token)."""
    refresh = _issue_refresh_token(db, user.id)
    db.commit()
    return create_access_token(user.id), refresh


def login(db: Session, email: str, password: str) -> User:
    candidate = (email or "").strip().lower()
    user = db.scalar(select(User).where(User.email == candidate))
    if user is None:
        verify_against_dummy(password or "")  # same cost as a real check
        raise Unauthorized(BAD_LOGIN)
    if not verify_password(user.password_hash, password or "") or not user.is_active:
        raise Unauthorized(BAD_LOGIN)
    return user


def _revoke_all(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )


def refresh_session(db: Session, token: str | None) -> tuple[User, str, str]:
    """Rotate a refresh token. Presenting a used token means it leaked: revoke everything."""
    if not token:
        raise Unauthorized()
    # Row lock: two requests presenting one token queue up, so only the first can rotate it.
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token)).with_for_update())
    if row is None:
        raise Unauthorized()
    if row.revoked_at is not None:
        age = datetime.now(timezone.utc) - row.revoked_at
        if age > timedelta(seconds=settings.refresh_reuse_grace_seconds):
            _revoke_all(db, row.user_id)  # an old token coming back means it was copied
            db.commit()
        raise Unauthorized("Session expired. Sign in again")
    if row.expires_at <= datetime.now(timezone.utc):
        raise Unauthorized("Session expired. Sign in again")
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise Unauthorized()
    row.revoked_at = datetime.now(timezone.utc)
    new_token = _issue_refresh_token(db, user.id)
    db.commit()
    return user, create_access_token(user.id), new_token


def end_session(db: Session, token: str | None) -> None:
    if not token:
        return
    db.execute(
        update(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    db.commit()


def change_password(db: Session, user: User, current: str, new: str) -> None:
    refuse_for_demo(user)
    if not verify_password(user.password_hash, current or ""):
        raise Unauthorized("Current password is wrong")
    check_password(new)
    user.password_hash = hash_password(new)
    _revoke_all(db, user.id)  # every other device must sign in again
    db.commit()


def set_password(db: Session, user: User, new: str) -> None:
    refuse_for_demo(user)
    check_password(new)
    user.password_hash = hash_password(new)
    _revoke_all(db, user.id)
    db.commit()


def me(db: Session, user: User) -> dict:
    rows = db.execute(
        select(Workspace, Membership.role).join(Membership, Membership.workspace_id == Workspace.id)
        .where(Membership.user_id == user.id).order_by(Workspace.name)
    ).all()
    return {
        "user": {"id": user.id, "email": user.email, "name": user.name},
        "workspaces": [
            {"id": w.id, "name": w.name, "template": w.template, "role": role,
             "permissions": sorted(ROLE_PERMISSIONS[role])}
            for w, role in rows
        ],
    }
