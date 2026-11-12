import uuid

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import Access, workspace_access
from app.errors import ValidationFailed
from app.schemas import PhotoOut
from app.services import photos as photo_service
from app.storage import Storage, get_storage

router = APIRouter(prefix="/workspaces/{workspace_id}/jobs/{job_id}/photos", tags=["photos"])
read = workspace_access("job:read")
write = workspace_access("job:update")


@router.get("", response_model=list[PhotoOut])
def list_photos(job_id: uuid.UUID, access: Access = Depends(read), db: Session = Depends(get_db)):
    return photo_service.list_photos(db, access.workspace_id, job_id)


@router.post("", response_model=PhotoOut, status_code=201)
async def upload_photo(job_id: uuid.UUID, file: UploadFile = File(...), access: Access = Depends(write),
                       db: Session = Depends(get_db), storage: Storage = Depends(get_storage)):
    raw = await file.read(photo_service.MAX_UPLOAD_BYTES + 1)  # never buffer more than the limit
    if len(raw) > photo_service.MAX_UPLOAD_BYTES:
        raise ValidationFailed({"file": "The photo is larger than 8 MB"})
    return photo_service.add_photo(db, storage, access.workspace_id, job_id, raw)


@router.get("/{photo_id}/image")
def photo_image(job_id: uuid.UUID, photo_id: uuid.UUID, size: str = Query("full", pattern="^(full|thumb)$"),
                access: Access = Depends(read), db: Session = Depends(get_db),
                storage: Storage = Depends(get_storage)):
    photo = photo_service.get_photo(db, access.workspace_id, job_id, photo_id)
    return Response(photo_service.read_photo(storage, photo, size), media_type="image/webp",
                    headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


@router.delete("/{photo_id}", status_code=204)
def delete_photo(job_id: uuid.UUID, photo_id: uuid.UUID, access: Access = Depends(write),
                 db: Session = Depends(get_db), storage: Storage = Depends(get_storage)):
    photo_service.delete_photo(db, storage, access.workspace_id, job_id, photo_id)
