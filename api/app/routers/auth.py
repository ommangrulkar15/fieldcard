from fastapi import APIRouter, Cookie, Depends, Header, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import current_user
from app.errors import Forbidden, NotFound, Unauthorized
from app.ratelimit import PER_ACCOUNT_FAILURES, PER_ADDRESS, client_address
from app.models import User
from app.schemas import DemoIn, LoginIn, PasswordChangeIn, SignupIn, TokenOut
from app.services import auth as auth_service
from app.services import demo as demo_service
from app.storage import Storage, get_storage

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE = "fc_refresh"


def _csrf_guard(x_fieldcard: str | None) -> None:
    """Cookie-authenticated calls must carry a custom header. Browsers will not send one
    cross-site without a CORS preflight, which this API only allows for its own web app."""
    if x_fieldcard != "1":
        raise Forbidden("Missing X-Fieldcard header")


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE, token, max_age=settings.refresh_token_days * 86400, httponly=True,
        secure=settings.cookie_secure, samesite=settings.cookie_samesite, path=settings.cookie_path,
    )


def _tokens(response: Response, access: str, refresh: str) -> TokenOut:
    _set_cookie(response, refresh)
    return TokenOut(access_token=access, expires_in=settings.access_token_minutes * 60)


@router.post("/signup", response_model=TokenOut, status_code=201)
def signup(body: SignupIn, request: Request, response: Response, db: Session = Depends(get_db)):
    if not settings.signup_enabled:
        raise Forbidden("Sign-up is closed on this site. Use the demo sign-in instead")
    address = client_address(request)
    PER_ADDRESS.check(f"auth:{address}")
    PER_ADDRESS.record(f"auth:{address}")
    user = auth_service.signup(db, body.email, body.password, body.name, body.workspace_name, body.template)
    return _tokens(response, *auth_service.start_session(db, user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    address = client_address(request)
    account = f"{address}|{(body.email or '').strip().lower()}"
    PER_ADDRESS.check(f"auth:{address}")
    PER_ACCOUNT_FAILURES.check(account)
    PER_ADDRESS.record(f"auth:{address}")
    try:
        user = auth_service.login(db, body.email, body.password)
    except Unauthorized:
        PER_ACCOUNT_FAILURES.record(account)
        raise
    return _tokens(response, *auth_service.start_session(db, user))


@router.post("/demo", response_model=TokenOut)
def demo_login(body: DemoIn, request: Request, response: Response, db: Session = Depends(get_db),
               storage: Storage = Depends(get_storage)):
    """One-click sign-in as a demo role. 404 unless this deployment turned the demo on."""
    if not settings.demo_enabled:
        raise NotFound("Not found")
    address = client_address(request)
    PER_ADDRESS.check(f"auth:{address}")
    PER_ADDRESS.record(f"auth:{address}")
    user = demo_service.demo_login(db, storage, body.role)
    return _tokens(response, *auth_service.start_session(db, user))


@router.post("/refresh", response_model=TokenOut)
def refresh(
    response: Response, db: Session = Depends(get_db), fc_refresh: str | None = Cookie(default=None),
    x_fieldcard: str | None = Header(default=None),
):
    _csrf_guard(x_fieldcard)
    _, access, new_token = auth_service.refresh_session(db, fc_refresh)
    return _tokens(response, access, new_token)


@router.post("/logout", status_code=204)
def logout(
    response: Response, db: Session = Depends(get_db), fc_refresh: str | None = Cookie(default=None),
    x_fieldcard: str | None = Header(default=None),
):
    _csrf_guard(x_fieldcard)
    auth_service.end_session(db, fc_refresh)
    response.delete_cookie(COOKIE, path=settings.cookie_path)


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return auth_service.me(db, user)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChangeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    auth_service.change_password(db, user, body.current_password, body.new_password)
