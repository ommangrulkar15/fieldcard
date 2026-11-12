import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import Access, current_user, workspace_access
from app.models import Membership, User
from app.schemas import AuditOut, FieldCreate, FieldOrder, FieldOut, WorkspaceCreate, WorkspaceOut
from app.services import audit
from app.services import fields as field_service
from app.services import workspaces as workspace_service

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.post("", response_model=WorkspaceOut, status_code=201)
def create_workspace(body: WorkspaceCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Any signed-in user may start another workspace; they become its admin."""
    workspace = workspace_service.create_workspace(db, body.name, body.template, commit=False)
    db.add(Membership(user_id=user.id, workspace_id=workspace.id, role="admin"))
    db.commit()
    return workspace


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(access: Access = Depends(workspace_access("job:read")), db: Session = Depends(get_db)):
    return workspace_service.get_workspace(db, access.workspace_id)


@router.get("/{workspace_id}/fields", response_model=list[FieldOut])
def list_fields(include_hidden: bool = True, access: Access = Depends(workspace_access("job:read")),
                db: Session = Depends(get_db)):
    rows = field_service.list_fields(db, access.workspace_id, include_hidden)
    return field_service.with_groups(db, access.workspace_id, rows)


@router.post("/{workspace_id}/fields", response_model=FieldOut, status_code=201)
def create_field(body: FieldCreate, access: Access = Depends(workspace_access("fields:manage")),
                 db: Session = Depends(get_db)):
    created = field_service.create_field(db, access.workspace_id, body.model_dump())
    audit.record(db, access, "field.create", f"{created.label} ({created.type})")
    return field_service.with_groups(db, access.workspace_id, [created])[0]


@router.post("/{workspace_id}/fields/reorder", response_model=list[FieldOut])
def reorder_fields(body: FieldOrder, access: Access = Depends(workspace_access("fields:manage")),
                   db: Session = Depends(get_db)):
    rows = field_service.reorder_fields(db, access.workspace_id, body.ids)
    audit.record(db, access, "field.reorder", f"{len(body.ids)} fields")
    return field_service.with_groups(db, access.workspace_id, rows)


@router.patch("/{workspace_id}/fields/{field_id}", response_model=FieldOut)
def update_field(field_id: uuid.UUID, body: dict, access: Access = Depends(workspace_access("fields:manage")),
                 db: Session = Depends(get_db)):
    changed = ", ".join(sorted(body))
    updated = field_service.update_field(db, access.workspace_id, field_id, body)
    audit.record(db, access, "field.update", f"{updated.label}: {changed}")
    return field_service.with_groups(db, access.workspace_id, [updated])[0]


@router.get("/{workspace_id}/audit", response_model=list[AuditOut])
def audit_log(access: Access = Depends(workspace_access("users:manage")), db: Session = Depends(get_db)):
    return audit.recent(db, access.workspace_id)
