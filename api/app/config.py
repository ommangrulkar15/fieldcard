from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (never committed)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres@127.0.0.1:5433/fieldcard"
    cors_origins: str = "http://localhost:5173"

    env: str = "dev"  # set ENV=prod in production; the API then refuses to start with the dev secret
    secret_key: str = "dev-only-insecure-secret-change-me-0123456789"
    access_token_minutes: int = 15
    refresh_token_days: int = 14
    # A just-rotated refresh token may be presented again by a second browser tab within this
    # window without being treated as theft (both tabs share one cookie jar).
    refresh_reuse_grace_seconds: int = 30
    trust_proxy_hops: int = 0  # 1 on Render/Fly: read the client address from X-Forwarded-For
    signup_enabled: bool = True  # False on the public portfolio site: visitors use the demo accounts instead
    demo_enabled: bool = False  # exposes one-click demo sign-in; only for the public portfolio deployment
    # Path the refresh cookie is scoped to. "/auth" when the API is served at the site root; if a
    # proxy mounts it under /api (Vercel rewrite), set COOKIE_PATH=/api/auth so the browser sends it.
    cookie_path: str = "/auth"
    cookie_secure: bool = False  # True in production (HTTPS)
    cookie_samesite: str = "lax"  # "none" only if the web app and API are on different sites

    # Photo storage. "local" writes to a folder (development, tests). "s3" uses any S3-compatible
    # bucket, such as Supabase Storage's S3 endpoint.
    storage_backend: str = "local"
    storage_dir: str = "./storage"
    s3_endpoint: str = ""
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key: str = ""
    s3_secret_key: str = ""


settings = Settings()

# Supabase and most hosts hand out "postgresql://" (or "postgres://"); SQLAlchemy needs the driver named.
for _prefix in ("postgres://", "postgresql://"):
    if settings.database_url.startswith(_prefix):
        settings.database_url = "postgresql+psycopg://" + settings.database_url[len(_prefix):]


def check_production_settings() -> None:
    """Fail closed: never run production on the development signing key."""
    if settings.env == "prod" and (settings.secret_key.startswith("dev-only") or len(settings.secret_key) < 32):
        raise RuntimeError("SECRET_KEY must be set to a random value of at least 32 characters when ENV=prod")
    if settings.env == "prod" and settings.storage_backend != "s3":
        raise RuntimeError("STORAGE_BACKEND must be s3 in production: a hosted API's local disk is wiped on every deploy")
