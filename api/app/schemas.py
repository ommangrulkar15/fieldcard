import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceCreate(BaseModel):
    name: str
    template: str = "blank"


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    template: str


class OptionOut(BaseModel):
    value: str
    archived: bool


class FieldCreate(BaseModel):
    key: str
    label: str
    type: str
    options: list[str] | None = None
    config: dict | None = None
    group_id: uuid.UUID | None = None
    position: int | None = None
    table_label: str | None = None
    table_position: int | None = None
    required: bool = False
    on_card: bool = False


class FieldOrder(BaseModel):
    ids: list[uuid.UUID]


class FieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    label: str
    table_label: str | None
    type: str
    options: list[OptionOut]
    config: dict
    group_id: uuid.UUID | None
    position: int
    table_position: int | None
    required: bool
    on_card: bool
    on_form: bool
    is_core: bool
    is_hidden: bool
    group_name: str | None = None
    group_position: int | None = None


class JobIn(BaseModel):
    """`values` maps field key -> value. Core and custom fields share one shape."""

    values: dict[str, object] = Field(default_factory=dict)


class JobOut(BaseModel):
    id: uuid.UUID
    values: dict[str, object]
    created_at: datetime
    updated_at: datetime


class JobPage(BaseModel):
    items: list[JobOut]
    total: int
    page: int
    page_size: int


class SignupIn(BaseModel):
    email: str
    password: str
    name: str
    workspace_name: str
    template: str = "blank"


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class MemberCreate(BaseModel):
    email: str
    name: str = ""
    role: str = "crew"
    password: str | None = None


class MemberRole(BaseModel):
    role: str


class MemberPassword(BaseModel):
    new_password: str


class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    width: int
    height: int
    size_bytes: int
    created_at: datetime


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor: str
    action: str
    target: str
    created_at: datetime


class DemoIn(BaseModel):
    role: str


class PublicConfig(BaseModel):
    signup_enabled: bool
    demo_enabled: bool
