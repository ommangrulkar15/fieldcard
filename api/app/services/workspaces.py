import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import NotFound, ValidationFailed
from app.models import FieldGroup, FormField, JobCounter, Workspace
from app.templates import TEMPLATES


def create_workspace(db: Session, name: str, template: str, *, commit: bool = True) -> Workspace:
    name = name.strip()
    if not name or len(name) > 120:
        raise ValidationFailed({"name": "Name must be 1 to 120 characters"})
    specs = TEMPLATES.get(template)
    if specs is None:
        raise ValidationFailed({"template": f"Unknown template. Choose one of: {', '.join(TEMPLATES)}"})

    workspace = Workspace(name=name, template=template)
    db.add(workspace)
    db.flush()
    db.add(JobCounter(workspace_id=workspace.id, next_no=1))

    groups: dict[str, FieldGroup] = {}
    for spec in specs:
        if spec.group not in groups:
            group = FieldGroup(workspace_id=workspace.id, name=spec.group, position=len(groups))
            db.add(group)
            db.flush()
            groups[spec.group] = group

    for position, spec in enumerate(specs, start=1):
        db.add(
            FormField(
                workspace_id=workspace.id, key=spec.key, label=spec.label, table_label=spec.table_label,
                type=spec.type, options=spec.options, config=spec.config, group_id=groups[spec.group].id,
                position=position, table_position=spec.table_position, required=spec.required,
                on_card=spec.on_card, on_form=spec.on_form, is_core=spec.is_core,
            )
        )
    if commit:
        db.commit()
    return workspace


def get_workspace(db: Session, workspace_id: uuid.UUID) -> Workspace:
    workspace = db.scalar(select(Workspace).where(Workspace.id == workspace_id))
    if workspace is None:
        raise NotFound("Workspace not found")
    return workspace
