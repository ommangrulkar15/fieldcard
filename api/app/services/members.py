import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.demo_guard import refuse_for_demo
from app.errors import Conflict, NotFound, ValidationFailed
from app.models import Membership, User
from app.permissions import ROLES
from app.services import auth


def _check_role(role: str) -> str:
    if role not in ROLES:
        raise ValidationFailed({"role": f"Choose one of: {', '.join(ROLES)}"})
    return role


def _admin_count(db: Session, workspace_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).select_from(Membership)
                     .where(Membership.workspace_id == workspace_id, Membership.role == "admin")) or 0


def _membership(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> Membership:
    found = db.get(Membership, (user_id, workspace_id))
    if found is None:
        raise NotFound("Member not found")
    return found


def list_members(db: Session, workspace_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        select(User, Membership.role).join(Membership, Membership.user_id == User.id)
        .where(Membership.workspace_id == workspace_id).order_by(User.name)
    ).all()
    return [{"user_id": u.id, "email": u.email, "name": u.name, "role": role, "is_active": u.is_active} for u, role in rows]


def add_member(db: Session, workspace_id: uuid.UUID, email: str, name: str, role: str, password: str | None) -> dict:
    """Add an existing account, or create one with the password the admin chose."""
    _check_role(role)
    address = auth.normalize_email(email)
    user = db.scalar(select(User).where(User.email == address))
    if user is None:
        if not password:
            raise ValidationFailed({"password": "Set a first password for the new account"})
        user = auth.create_user(db, address, password, name, managed_by=workspace_id)
    elif db.get(Membership, (user.id, workspace_id)) is not None:
        raise Conflict("That person is already a member")
    db.add(Membership(user_id=user.id, workspace_id=workspace_id, role=role))
    db.commit()
    return {"user_id": user.id, "email": user.email, "name": user.name, "role": role, "is_active": user.is_active}


def change_role(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID, role: str) -> dict:
    _check_role(role)
    member = _membership(db, workspace_id, user_id)
    refuse_for_demo(db.get(User, user_id))
    if member.role == "admin" and role != "admin" and _admin_count(db, workspace_id) <= 1:
        raise Conflict("A workspace needs at least one admin")
    member.role = role
    db.commit()
    return {"user_id": user_id, "role": role}


def remove_member(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID) -> None:
    member = _membership(db, workspace_id, user_id)
    refuse_for_demo(db.get(User, user_id))
    if member.role == "admin" and _admin_count(db, workspace_id) <= 1:
        raise Conflict("A workspace needs at least one admin")
    db.delete(member)
    db.commit()


def reset_password(db: Session, workspace_id: uuid.UUID, user_id: uuid.UUID, new_password: str) -> None:
    """An admin may reset only accounts they created that belong to no other workspace.
    Otherwise one tenant's admin could take over another tenant's user."""
    _membership(db, workspace_id, user_id)
    user = db.get(User, user_id)
    refuse_for_demo(user)
    others = db.scalar(select(func.count()).select_from(Membership)
                       .where(Membership.user_id == user_id, Membership.workspace_id != workspace_id)) or 0
    if user is None or user.managed_by != workspace_id or others:
        raise Conflict("This account can only change its own password")
    auth.set_password(db, user, new_password)
