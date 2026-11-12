"""Who changed what, for the actions an owner would ask about: users, form setup, deletes, exports."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import Access
from app.models import AuditEntry, User

MAX_ENTRIES = 200


def record(db: Session, access: Access, action: str, target: str = "") -> None:
    """Call after the change has been committed. A failure here must never undo or fail the change."""
    try:
        db.add(AuditEntry(workspace_id=access.workspace_id, user_id=access.user.id, actor=access.user.email,
                          action=action[:40], target=target[:200]))
        db.commit()
    except Exception:  # noqa: BLE001 - the audit trail is best effort by design
        db.rollback()


def label_user(db: Session, user_id: uuid.UUID) -> str:
    return db.scalar(select(User.email).where(User.id == user_id)) or str(user_id)


def recent(db: Session, workspace_id: uuid.UUID) -> list[AuditEntry]:
    return list(db.scalars(
        select(AuditEntry).where(AuditEntry.workspace_id == workspace_id)
        .order_by(AuditEntry.created_at.desc(), AuditEntry.id.desc()).limit(MAX_ENTRIES)
    ))
