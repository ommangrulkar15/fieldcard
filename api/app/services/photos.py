"""Job photos: validate, re-encode, store, serve.

The upload is never stored as received. It is decoded, resized and re-encoded as WebP, which
drops EXIF (GPS, device) and anything that is not pixels. Whatever the client claims about the
file is ignored; only a successful decode counts.
"""

import io
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import Conflict, NotFound, ValidationFailed
from app.models import Job, JobPhoto
from app.services import jobs as job_service
from app.storage import Storage

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PHOTOS_PER_JOB = 5
FULL_SIDE, THUMB_SIDE = 1280, 320
ACCEPTED = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = 40_000_000  # blocks decompression bombs


def key_for(photo: JobPhoto, size: str) -> str:
    return f"{photo.workspace_id}/{photo.job_id}/{photo.id}.{size}.webp"


def _encode(image: Image.Image, side: int, quality: int) -> tuple[bytes, tuple[int, int]]:
    copy = image.copy()
    copy.thumbnail((side, side))
    out = io.BytesIO()
    copy.save(out, "WEBP", quality=quality, method=4)
    return out.getvalue(), copy.size


def _decode(raw: bytes) -> Image.Image:
    if not raw:
        raise ValidationFailed({"file": "The file is empty"})
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValidationFailed({"file": "The photo is larger than 8 MB"})
    try:
        image = Image.open(io.BytesIO(raw))
        if image.format not in ACCEPTED:
            raise ValidationFailed({"file": "Use a JPEG, PNG or WebP photo"})
        image.load()
        image = ImageOps.exif_transpose(image)  # honour phone rotation, then metadata is dropped on save
    except ValidationFailed:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError):
        raise ValidationFailed({"file": "That file is not a readable photo"}) from None
    return image.convert("RGB")


def list_photos(db: Session, workspace_id: uuid.UUID, job_id: uuid.UUID) -> list[JobPhoto]:
    job_service.get_job_row(db, workspace_id, job_id)
    return list(db.scalars(
        select(JobPhoto).where(JobPhoto.workspace_id == workspace_id, JobPhoto.job_id == job_id)
        .order_by(JobPhoto.created_at, JobPhoto.id)
    ))


def add_photo(db: Session, storage: Storage, workspace_id: uuid.UUID, job_id: uuid.UUID, raw: bytes) -> JobPhoto:
    job = job_service.get_job_row(db, workspace_id, job_id)
    image = _decode(raw)
    # Serialise concurrent uploads for one job so the limit cannot be beaten by racing requests.
    db.execute(select(Job.id).where(Job.id == job.id).with_for_update())
    count = db.scalar(select(func.count()).select_from(JobPhoto).where(
        JobPhoto.workspace_id == workspace_id, JobPhoto.job_id == job_id)) or 0
    if count >= MAX_PHOTOS_PER_JOB:
        raise Conflict(f"A job can have at most {MAX_PHOTOS_PER_JOB} photos")

    full, (width, height) = _encode(image, FULL_SIDE, 80)
    thumb, _ = _encode(image, THUMB_SIDE, 70)
    photo = JobPhoto(id=uuid.uuid4(), workspace_id=workspace_id, job_id=job_id,
                     size_bytes=len(full), width=width, height=height)
    storage.put(key_for(photo, "full"), full)
    storage.put(key_for(photo, "thumb"), thumb)
    db.add(photo)
    try:
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(key_for(photo, "full"))
        storage.delete(key_for(photo, "thumb"))
        raise
    return photo


def get_photo(db: Session, workspace_id: uuid.UUID, job_id: uuid.UUID, photo_id: uuid.UUID) -> JobPhoto:
    job_service.get_job_row(db, workspace_id, job_id)
    photo = db.scalar(select(JobPhoto).where(
        JobPhoto.id == photo_id, JobPhoto.workspace_id == workspace_id, JobPhoto.job_id == job_id))
    if photo is None:
        raise NotFound("Photo not found")
    return photo


def read_photo(storage: Storage, photo: JobPhoto, size: str) -> bytes:
    try:
        return storage.get(key_for(photo, "thumb" if size == "thumb" else "full"))
    except FileNotFoundError:
        raise NotFound("Photo not found") from None


def delete_photo(db: Session, storage: Storage, workspace_id: uuid.UUID, job_id: uuid.UUID, photo_id: uuid.UUID) -> None:
    photo = get_photo(db, workspace_id, job_id, photo_id)
    keys = [key_for(photo, "full"), key_for(photo, "thumb")]
    db.delete(photo)
    db.commit()
    for key in keys:  # after the commit: an orphaned file is harmless, a row pointing at nothing is not
        storage.delete(key)
