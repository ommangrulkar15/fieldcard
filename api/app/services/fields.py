import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import FieldGroup, FormField
from app.services.fieldtypes import FIELD_TYPES, KEY_RE

CHOICE_TYPES = ("dropdown", "choice")
MAX_OPTIONS = 100

# Properties an admin may change after creation. `key` and `type` are never in this list.
EDITABLE = {"label", "table_label", "options", "config", "group_id", "position", "table_position",
            "required", "on_card", "is_hidden"}


def list_fields(db: Session, workspace_id: uuid.UUID, include_hidden: bool = True) -> list[FormField]:
    query = select(FormField).where(FormField.workspace_id == workspace_id)
    if not include_hidden:
        query = query.where(FormField.is_hidden.is_(False))
    return list(db.scalars(query.order_by(FormField.position, FormField.key)))


def get_field(db: Session, workspace_id: uuid.UUID, field_id: uuid.UUID) -> FormField:
    found = db.scalar(select(FormField).where(FormField.id == field_id, FormField.workspace_id == workspace_id))
    if found is None:
        raise NotFound("Field not found")
    return found


def _clean_options(raw: list | None, field_type: str) -> list[dict]:
    if field_type not in CHOICE_TYPES:
        if raw:
            raise ValidationFailed({"options": "Only dropdown and choice fields have options"})
        return []
    values: list[str] = []
    for item in raw or []:
        value = (item if isinstance(item, str) else (item or {}).get("value", "")).strip()
        if not value:
            continue
        if len(value) > 200:
            raise ValidationFailed({"options": "An option is longer than 200 characters"})
        if value not in values:
            values.append(value)
    if not values:
        raise ValidationFailed({"options": "Add at least one option"})
    if len(values) > MAX_OPTIONS:
        raise ValidationFailed({"options": f"At most {MAX_OPTIONS} options"})
    return [{"value": v, "archived": False} for v in values]


def _check_group(db: Session, workspace_id: uuid.UUID, group_id: uuid.UUID | None) -> None:
    if group_id is None:
        return
    exists = db.scalar(select(FieldGroup.id).where(FieldGroup.id == group_id, FieldGroup.workspace_id == workspace_id))
    if exists is None:
        raise ValidationFailed({"group_id": "Group not found in this workspace"})


def create_field(db: Session, workspace_id: uuid.UUID, data: dict) -> FormField:
    key, label, field_type = data["key"], data["label"].strip(), data["type"]
    errors: dict[str, str] = {}
    if not KEY_RE.match(key):
        errors["key"] = "Use lowercase letters, digits and underscores, starting with a letter (max 40)"
    if field_type not in FIELD_TYPES:
        errors["type"] = f"Choose one of: {', '.join(FIELD_TYPES)}"
    if not label or len(label) > 80:
        errors["label"] = "Label must be 1 to 80 characters"
    if errors:
        raise ValidationFailed(errors)

    _check_group(db, workspace_id, data.get("group_id"))
    position = data.get("position")
    if position is None:
        position = (db.scalar(select(func.max(FormField.position)).where(FormField.workspace_id == workspace_id)) or 0) + 1

    created = FormField(
        workspace_id=workspace_id, key=key, label=label, table_label=(data.get("table_label") or None),
        type=field_type, options=_clean_options(data.get("options"), field_type), config=data.get("config") or {},
        group_id=data.get("group_id"), position=position, table_position=data.get("table_position"),
        required=bool(data.get("required")), on_card=bool(data.get("on_card")), on_form=True, is_core=False,
    )
    db.add(created)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(f"A field with key '{key}' already exists") from None
    return created


PATCH_TYPES: dict[str, tuple] = {
    "label": (str,), "table_label": (str, type(None)), "options": (list, type(None)), "config": (dict,),
    "group_id": (str, type(None)), "position": (int,), "table_position": (int, type(None)),
    "required": (bool,), "on_card": (bool,), "is_hidden": (bool,),
}


def _check_patch_types(patch: dict) -> None:
    """A PATCH body is a free-form dict, so each value's JSON type is checked before it nears the database."""
    errors = {}
    for name, allowed in PATCH_TYPES.items():
        if name not in patch:
            continue
        value = patch[name]
        if not isinstance(value, allowed) or (isinstance(value, bool) and bool not in allowed):
            errors[name] = "Wrong type of value"
    if "config" in patch and isinstance(patch["config"], dict):
        extra = set(patch["config"]) - {"allow_custom"}
        if extra or not isinstance(patch["config"].get("allow_custom", False), bool):
            errors["config"] = "Only allow_custom (true or false) can be set"
    if isinstance(patch.get("group_id"), str):
        try:
            patch["group_id"] = uuid.UUID(patch["group_id"])
        except ValueError:
            errors["group_id"] = "Not a valid id"
    for name in ("position", "table_position"):
        if isinstance(patch.get(name), int) and not (0 <= patch[name] <= 10_000):
            errors[name] = "Out of range"
    if errors:
        raise ValidationFailed(errors)


def update_field(db: Session, workspace_id: uuid.UUID, field_id: uuid.UUID, patch: dict) -> FormField:
    target = get_field(db, workspace_id, field_id)
    _check_patch_types(patch)

    immutable = {"key", "type"} & patch.keys()
    for name in immutable:
        if patch[name] != getattr(target, name):
            raise ValidationFailed({name: "Cannot be changed. Add a new field and hide this one instead"})
    unknown = set(patch) - EDITABLE - {"key", "type"}
    if unknown:
        raise ValidationFailed({name: "Not an editable property" for name in sorted(unknown)})

    if target.is_core:
        if patch.get("is_hidden"):
            raise ValidationFailed({"is_hidden": "Core fields cannot be hidden"})
        if "required" in patch and not patch["required"] and target.required:
            raise ValidationFailed({"required": "Core fields stay required"})

    if "group_id" in patch:
        _check_group(db, workspace_id, patch["group_id"])
    if "label" in patch:
        label = (patch["label"] or "").strip()
        if not label or len(label) > 80:
            raise ValidationFailed({"label": "Label must be 1 to 80 characters"})
        patch["label"] = label

    if "options" in patch:
        patch["options"] = _merge_options(target, patch["options"])

    for name, value in patch.items():
        if name in EDITABLE:
            setattr(target, name, value)
    db.commit()
    return target


def reorder_fields(db: Session, workspace_id: uuid.UUID, ids: list[uuid.UUID]) -> list[FormField]:
    """Set the form order to exactly `ids`, in one transaction. Every id must belong to this workspace."""
    if len(set(ids)) != len(ids):
        raise ValidationFailed({"ids": "Each field can appear only once"})
    rows = {f.id: f for f in db.scalars(select(FormField).where(FormField.workspace_id == workspace_id, FormField.id.in_(ids)))}
    if len(rows) != len(ids):
        raise NotFound("Field not found")
    for index, field_id in enumerate(ids, start=1):
        rows[field_id].position = index
    db.commit()
    return list_fields(db, workspace_id)


def _merge_options(target: FormField, requested: list | None) -> list[dict]:
    """New list wins, but an option dropped from it is archived, never deleted.

    Old jobs may still hold that value, and exports must keep showing it.
    """
    wanted = _clean_options(requested, target.type)
    wanted_values = {o["value"] for o in wanted}
    archived = [{"value": o["value"], "archived": True} for o in target.options if o["value"] not in wanted_values]
    return wanted + archived


def with_groups(db: Session, workspace_id: uuid.UUID, rows: list[FormField]) -> list[FormField]:
    """Attach `group_name` and `group_position` so the form can render sections."""
    groups = {g.id: g for g in db.scalars(select(FieldGroup).where(FieldGroup.workspace_id == workspace_id))}
    for row in rows:
        group = groups.get(row.group_id)
        row.group_name = group.name if group else None
        row.group_position = group.position if group else None
    return rows
