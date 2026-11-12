"""Request dependencies: who is calling, and what may they do in this workspace."""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import Forbidden, NotFound, Unauthorized
from app.models import Membership, User
from app.permissions import ROLE_PERMISSIONS
from app.security import decode_access_token


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise Unauthorized()
    try:
        user_id = uuid.UUID(decode_access_token(token))
    except ValueError:
        raise Unauthorized() from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise Unauthorized()
    return user


@dataclass
class Access:
    user: User
    role: str
    workspace_id: uuid.UUID


def workspace_access(permission: str):
    """Dependency factory. A non-member gets 404 (the workspace does not exist for them),
    a member without the permission gets 403."""

    def dependency(workspace_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Access:
        role = db.scalar(
            select(Membership.role).where(Membership.user_id == user.id, Membership.workspace_id == workspace_id)
        )
        if role is None:
            raise NotFound("Workspace not found")
        if permission not in ROLE_PERMISSIONS[role]:
            raise Forbidden()
        return Access(user=user, role=role, workspace_id=workspace_id)

    return dependency
