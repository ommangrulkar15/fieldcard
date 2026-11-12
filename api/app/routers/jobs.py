import uuid

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import Access, workspace_access
from app.schemas import JobIn, JobOut, JobPage
from app.services import audit, exports
from app.services import fields as field_service
from app.services import jobs as job_service
from app.services.workspaces import get_workspace

router = APIRouter(prefix="/workspaces/{workspace_id}/jobs", tags=["jobs"])


@router.post("", response_model=JobOut, status_code=201)
def create_job(body: JobIn, access: Access = Depends(workspace_access("job:create")), db: Session = Depends(get_db)):
    return job_service.create_job(db, access.workspace_id, body.values)


@router.get("", response_model=JobPage)
def list_jobs(
    request: Request, q: str | None = None, sort: str = "date", order: str = "desc", page: int = 1,
    page_size: int = 25, access: Access = Depends(workspace_access("job:read")), db: Session = Depends(get_db),
):
    """Filters on any field use `f.<key>=value`, e.g. `?f.division=North&f.mo_amount=1000..5000`."""
    filters = {name[2:]: value for name, value in request.query_params.items() if name.startswith("f.")}
    return job_service.list_jobs(
        db, access.workspace_id, q=q, sort=sort, order=order, filters=filters, page=page, page_size=page_size
    )


@router.get("/export")
def export_jobs(
    request: Request, format: str = Query("csv", pattern="^(csv|xlsx)$"), q: str | None = None, sort: str = "date",
    order: str = "desc", access: Access = Depends(workspace_access("job:export")), db: Session = Depends(get_db),
):
    """The Data table as a file: same search, sort and `f.<key>` filters as the list, no paging."""
    filters = {name[2:]: value for name, value in request.query_params.items() if name.startswith("f.")}
    jobs, columns, truncated = job_service.export_jobs(
        db, access.workspace_id, q=q, sort=sort, order=order, filters=filters, limit=exports.EXPORT_LIMIT
    )
    audit.record(db, access, "job.export", f"{len(jobs)} rows as {format}")
    if format == "xlsx":
        body = exports.to_xlsx(jobs, columns)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        body, media = exports.to_csv(jobs, columns), "text/csv; charset=utf-8"
    headers = {"Content-Disposition": f'attachment; filename="jobs.{format}"', "X-Export-Truncated": str(truncated).lower(),
               "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    return Response(body, media_type=media, headers=headers)


@router.get("/{job_id}/card")
def job_card(job_id: uuid.UUID, access: Access = Depends(workspace_access("job:read")), db: Session = Depends(get_db)):
    job = job_service.get_job(db, access.workspace_id, job_id)
    fields = field_service.with_groups(db, access.workspace_id, field_service.list_fields(db, access.workspace_id))
    workspace = get_workspace(db, access.workspace_id)
    pdf = exports.job_card_pdf(workspace.name, job, fields)
    number = job["values"].get("job_no", "")
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="job-card-{number}.pdf"', "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"})


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, access: Access = Depends(workspace_access("job:read")), db: Session = Depends(get_db)):
    return job_service.get_job(db, access.workspace_id, job_id)


@router.patch("/{job_id}", response_model=JobOut)
def update_job(job_id: uuid.UUID, body: JobIn, access: Access = Depends(workspace_access("job:update")),
               db: Session = Depends(get_db)):
    return job_service.update_job(db, access.workspace_id, job_id, body.values)


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: uuid.UUID, access: Access = Depends(workspace_access("job:delete")),
               db: Session = Depends(get_db)):
    number = job_service.get_job(db, access.workspace_id, job_id)["values"].get("job_no")
    job_service.delete_job(db, access.workspace_id, job_id)
    audit.record(db, access, "job.delete", f"Job card {number}")
