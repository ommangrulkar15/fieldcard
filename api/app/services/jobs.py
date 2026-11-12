"""Jobs: create, read, update, soft-delete, and a list query over custom fields.

Core fields live in real columns; every other field lives in `jobs.data`, keyed by
the field's immutable key. User input never reaches SQL as an identifier: sort and
filter keys are looked up in the workspace's own field list first, then bound as
parameters.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy import Numeric, cast, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import FormField, Job, JobCounter
from app.services.fields import list_fields
from app.services.fieldtypes import coerce
from app.services.workspaces import get_workspace

IST = ZoneInfo("Asia/Kolkata")
MAX_JOB_NO = 2_000_000_000
MAX_PAGE_SIZE = 100

# Field key -> real column on `jobs`.
CORE_COLUMNS = {
    "date": "job_date",
    "job_no": "job_no",
    "description": "description",
    "status": "status",
    "closed_at": "closed_at",
}
NULLABLE_CORE = {"closed_at"}
TEXTUAL = ("text", "longtext", "dropdown", "choice")


def today_ist() -> date:
    return datetime.now(IST).date()


# --------------------------------------------------------------------------- input


def _fields_by_key(db: Session, workspace_id: uuid.UUID) -> dict[str, FormField]:
    return {f.key: f for f in list_fields(db, workspace_id)}


def _core_value(key: str, stored):
    """Convert a coerced core value to the Python type of its column."""
    if key in ("date", "closed_at"):
        return date.fromisoformat(stored)
    if key == "job_no":
        number = Decimal(stored)
        if number != number.to_integral_value() or not (0 < number <= MAX_JOB_NO):
            raise ValueError("Must be a whole number from 1")
        return int(number)
    return stored


def _split_values(fields: dict[str, FormField], values: dict) -> tuple[dict, dict, dict]:
    """Validate submitted values.

    Returns (core, data, errors). A value of None means "clear this field".
    """
    core: dict[str, object] = {}
    data: dict[str, object] = {}
    errors: dict[str, str] = {}
    for key, raw in values.items():
        field = fields.get(key)
        if field is None:
            errors[key] = "Unknown field"
            continue
        if field.is_hidden:
            errors[key] = "This field is hidden"
            continue
        if not field.on_form and key != "closed_at":
            errors[key] = "Set by the system"
            continue
        try:
            stored = coerce(field, raw)
            if stored is not None and key in CORE_COLUMNS:
                stored = _core_value(key, stored)
        except ValueError as problem:
            errors[key] = str(problem)
            continue
        (core if key in CORE_COLUMNS else data)[key] = stored
    return core, data, errors


def _search_text(job_no: int, description: str, status: str, data: dict) -> str:
    parts = [str(job_no), description, status]
    parts += [str(v) for v in data.values() if not isinstance(v, bool)]
    return " ".join(parts)[:20000]


# --------------------------------------------------------------------------- output


def serialize(job: Job, fields: dict[str, FormField]) -> dict:
    """The job as the API returns it: every visible field's value under `values`."""
    values: dict[str, object] = {}
    for key, field in fields.items():
        if field.is_hidden or field.type == "photo":
            continue
        if key in CORE_COLUMNS:
            value = getattr(job, CORE_COLUMNS[key])
            if isinstance(value, date):
                value = value.isoformat()
        else:
            value = job.data.get(key)
        if value is not None:
            values[key] = value
    return {
        "id": job.id,
        "values": values,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


# --------------------------------------------------------------------------- write


def _allocate_number(db: Session, workspace_id: uuid.UUID, manual: int | None) -> int:
    counter = JobCounter
    if manual is not None:
        db.execute(
            update(counter).where(counter.workspace_id == workspace_id)
            .values(next_no=func.greatest(counter.next_no, manual + 1))
        )
        return manual
    # The UPDATE row-locks the counter until commit, so concurrent creates queue up.
    return db.execute(
        update(counter).where(counter.workspace_id == workspace_id)
        .values(next_no=counter.next_no + 1).returning(counter.next_no - 1)
    ).scalar_one()


def create_job(db: Session, workspace_id: uuid.UUID, values: dict) -> dict:
    get_workspace(db, workspace_id)
    fields = _fields_by_key(db, workspace_id)
    core, data, errors = _split_values(fields, values)

    for key, field in fields.items():
        provided = core.get(key) if key in CORE_COLUMNS else data.get(key)
        if field.required and field.on_form and not field.is_hidden and provided is None and key != "job_no":
            errors.setdefault(key, "Required")
    if errors:
        raise ValidationFailed(errors)
    data = {k: v for k, v in data.items() if v is not None}

    status = core["status"]
    closed_at = (core.get("closed_at") or today_ist()) if status == "closed" else None
    job_no = _allocate_number(db, workspace_id, core.get("job_no"))
    job = Job(
        workspace_id=workspace_id, job_no=job_no, job_date=core["date"], description=core["description"],
        status=status, closed_at=closed_at, data=data,
        search_text=_search_text(job_no, core["description"], status, data),
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(f"Job card number {job_no} is already used") from None
    return serialize(job, fields)


def get_job_row(db: Session, workspace_id: uuid.UUID, job_id: uuid.UUID) -> Job:
    job = db.scalar(
        select(Job).where(Job.id == job_id, Job.workspace_id == workspace_id, Job.deleted_at.is_(None))
    )
    if job is None:
        raise NotFound("Job not found")
    return job


def get_job(db: Session, workspace_id: uuid.UUID, job_id: uuid.UUID) -> dict:
    job = get_job_row(db, workspace_id, job_id)
    return serialize(job, _fields_by_key(db, workspace_id))


def update_job(db: Session, workspace_id: uuid.UUID, job_id: uuid.UUID, values: dict) -> dict:
    job = get_job_row(db, workspace_id, job_id)
    fields = _fields_by_key(db, workspace_id)
    core, data, errors = _split_values(fields, values)

    for key, value in {**core, **data}.items():
        if value is None and fields[key].required:
            errors[key] = "Required"
        if value is None and key in CORE_COLUMNS and key not in NULLABLE_CORE:
            errors[key] = "Required"
    if errors:
        raise ValidationFailed(errors)

    merged = dict(job.data)
    for key, value in data.items():
        if value is None:
            merged.pop(key, None)
        else:
            merged[key] = value
    job.data = merged

    for key, value in core.items():
        if key == "closed_at":
            continue
        setattr(job, CORE_COLUMNS[key], value)
    if job.status == "closed":
        job.closed_at = core.get("closed_at") or job.closed_at or today_ist()
    else:
        job.closed_at = None

    job.search_text = _search_text(job.job_no, job.description, job.status, job.data)
    job.updated_at = datetime.now(timezone.utc)
    if "job_no" in core:
        _allocate_number(db, workspace_id, core["job_no"])
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(f"Job card number {core.get('job_no')} is already used") from None
    return serialize(job, fields)


def delete_job(db: Session, workspace_id: uuid.UUID, job_id: uuid.UUID) -> None:
    job = get_job_row(db, workspace_id, job_id)
    job.deleted_at = datetime.now(timezone.utc)
    db.commit()


# --------------------------------------------------------------------------- list


def _node(key: str):
    """JSONB value of a custom field as text. `key` is bound as a parameter."""
    return Job.data[key].as_string()


def _checked_field(fields: dict[str, FormField], key: str, where: str) -> FormField:
    field = fields.get(key)
    if field is None or field.is_hidden or field.type == "photo":
        raise ValidationFailed({where: f"Unknown field '{key}'"})
    return field


def _sort_expression(field: FormField):
    if field.key in CORE_COLUMNS:
        return getattr(Job, CORE_COLUMNS[field.key])
    node = _node(field.key)
    if field.type == "number":
        return cast(node, Numeric)
    if field.type in TEXTUAL:
        return func.lower(node)
    return node  # ISO dates and booleans sort correctly as text


def _range(raw: str, parse, where: str):
    """'a..b', 'a..', '..b' or a single value -> (low, high), each may be None."""
    try:
        if ".." in raw:
            low, high = raw.split("..", 1)
            return (parse(low) if low else None, parse(high) if high else None)
        value = parse(raw)
        return value, value
    except (ValueError, InvalidOperation):
        raise ValidationFailed({where: "Invalid value"}) from None


def _filter_clause(field: FormField, raw: str):
    where = f"f.{field.key}"
    column = getattr(Job, CORE_COLUMNS[field.key]) if field.key in CORE_COLUMNS else None
    if field.type == "number":
        expr = column if column is not None else cast(_node(field.key), Numeric)
        low, high = _range(raw, Decimal, where)
    elif field.type == "date":
        expr = column if column is not None else _node(field.key)
        parse = date.fromisoformat if column is not None else (lambda s: date.fromisoformat(s).isoformat())
        low, high = _range(raw, parse, where)
    elif field.type in ("dropdown", "choice"):
        if column is not None:
            return column == raw
        return Job.data.contains({field.key: raw})
    elif field.type == "yesno":
        if raw not in ("true", "false"):
            raise ValidationFailed({where: "Use true or false"})
        return Job.data.contains({field.key: raw == "true"})
    else:  # text, longtext: substring match
        expr = column if column is not None else _node(field.key)
        return expr.ilike(f"%{_escape_like(raw)}%", escape="\\")
    clauses = []
    if low is not None:
        clauses.append(expr >= low)
    if high is not None:
        clauses.append(expr <= high)
    return clauses[0] if len(clauses) == 1 else (clauses[0] & clauses[1] if clauses else expr.is_not(None))


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _matching(
    db: Session, workspace_id: uuid.UUID, q: str | None, sort: str, order: str, filters: dict[str, str] | None,
):
    """The filtered, ordered query shared by the list endpoint and the exports."""
    get_workspace(db, workspace_id)
    fields = _fields_by_key(db, workspace_id)
    if order not in ("asc", "desc"):
        raise ValidationFailed({"order": "Use asc or desc"})

    query = select(Job).where(Job.workspace_id == workspace_id, Job.deleted_at.is_(None))
    if q and q.strip():
        query = query.where(Job.search_text.ilike(f"%{_escape_like(q.strip())}%", escape="\\"))
    for key, raw in (filters or {}).items():
        query = query.where(_filter_clause(_checked_field(fields, key, f"f.{key}"), raw))

    sort_field = _checked_field(fields, sort, "sort")
    expression = _sort_expression(sort_field)
    ordering = expression.asc().nulls_last() if order == "asc" else expression.desc().nulls_last()
    return query, ordering, fields


def list_jobs(
    db: Session, workspace_id: uuid.UUID, *, q: str | None = None, sort: str = "date", order: str = "desc",
    filters: dict[str, str] | None = None, page: int = 1, page_size: int = 25,
) -> dict:
    if page < 1 or not (1 <= page_size <= MAX_PAGE_SIZE):
        raise ValidationFailed({"page": f"page >= 1 and page_size 1 to {MAX_PAGE_SIZE}"})
    query, ordering, fields = _matching(db, workspace_id, q, sort, order, filters)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(ordering, Job.job_no.desc(), Job.id).limit(page_size).offset((page - 1) * page_size)
    ).all()
    return {
        "items": [serialize(job, fields) for job in rows],
        "total": total, "page": page, "page_size": page_size,
    }


def export_jobs(
    db: Session, workspace_id: uuid.UUID, *, q: str | None, sort: str, order: str, filters: dict[str, str] | None,
    limit: int,
) -> tuple[list[dict], list[FormField], bool]:
    """Every matching job up to `limit`, plus the table columns. The flag says rows were cut off."""
    query, ordering, fields = _matching(db, workspace_id, q, sort, order, filters)
    rows = db.scalars(query.order_by(ordering, Job.job_no.desc(), Job.id).limit(limit + 1)).all()
    columns = sorted(
        (f for f in fields.values() if f.table_position is not None and not f.is_hidden and f.type != "photo"),
        key=lambda f: f.table_position,
    )
    return [serialize(job, fields) for job in rows[:limit]], columns, len(rows) > limit
