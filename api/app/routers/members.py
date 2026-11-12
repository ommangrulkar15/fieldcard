import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import Access, workspace_access
from app.schemas import MemberCreate, MemberPassword, MemberRole
from app.services import audit
from app.services import members as member_service

router = APIRouter(prefix="/workspaces/{workspace_id}/members", tags=["members"])
manage = workspace_access("users:manage")


@router.get("")
def list_members(access: Access = Depends(manage), db: Session = Depends(get_db)):
    return member_service.list_members(db, access.workspace_id)


@router.post("", status_code=201)
def add_member(body: MemberCreate, access: Access = Depends(manage), db: Session = Depends(get_db)):
    result = member_service.add_member(db, access.workspace_id, body.email, body.name, body.role, body.password)
    audit.record(db, access, "member.add", f"{result['email']} as {result['role']}")
    return result


@router.patch("/{user_id}")
def change_role(user_id: uuid.UUID, body: MemberRole, access: Access = Depends(manage), db: Session = Depends(get_db)):
    result = member_service.change_role(db, access.workspace_id, user_id, body.role)
    audit.record(db, access, "member.role", f"{audit.label_user(db, user_id)} to {body.role}")
    return result


@router.delete("/{user_id}", status_code=204)
def remove_member(user_id: uuid.UUID, access: Access = Depends(manage), db: Session = Depends(get_db)):
    who = audit.label_user(db, user_id)
    member_service.remove_member(db, access.workspace_id, user_id)
    audit.record(db, access, "member.remove", who)


@router.post("/{user_id}/password", status_code=204)
def reset_password(user_id: uuid.UUID, body: MemberPassword, access: Access = Depends(manage), db: Session = Depends(get_db)):
    member_service.reset_password(db, access.workspace_id, user_id, body.new_password)
    audit.record(db, access, "member.password_reset", audit.label_user(db, user_id))
