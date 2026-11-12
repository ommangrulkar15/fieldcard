"""Password hashing, access tokens and refresh tokens."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import settings
from app.errors import Unauthorized

_hasher = PasswordHasher()  # argon2id with the library's recommended parameters
# Verified when the email is unknown, so a miss costs the same as a hit.
_DUMMY_HASH = _hasher.hash("not-a-real-password")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(stored_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def verify_against_dummy(password: str) -> None:
    verify_password(_DUMMY_HASH, password)


def create_access_token(user_id) -> str:
    now = datetime.now(timezone.utc)
    claims = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=settings.access_token_minutes), "typ": "access"}
    return jwt.encode(claims, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str:
    """Return the user id (as text) or raise Unauthorized."""
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        raise Unauthorized("Session expired. Sign in again") from None
    if claims.get("typ") != "access":
        raise Unauthorized("Session expired. Sign in again")
    return claims["sub"]


def new_refresh_token() -> tuple[str, str]:
    """(token for the cookie, hash for the database)."""
    token = secrets.token_urlsafe(48)
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
