from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.schemas import PublicConfig

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    """Liveness plus a real database round-trip. Also what the keep-alive job calls."""
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/config", response_model=PublicConfig)
def public_config() -> PublicConfig:
    """What the sign-in screen needs to know before anyone is signed in. Nothing secret."""
    return PublicConfig(signup_enabled=settings.signup_enabled, demo_enabled=settings.demo_enabled)
