from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import check_production_settings, settings
from app.errors import AppError, ValidationFailed
from app.ratelimit import TooManyRequests
from app.routers import auth, health, jobs, members, photos, workspaces

check_production_settings()
app = FastAPI(title="Fieldcard API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Fieldcard"],
    allow_credentials=True,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """The API only returns JSON, files and images, never pages: lock down what a browser may do with them."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if request.url.path.startswith("/auth"):
        response.headers["Cache-Control"] = "no-store"
    if settings.cookie_secure:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.exception_handler(AppError)
async def app_error_handler(_: Request, error: AppError) -> JSONResponse:
    if isinstance(error, ValidationFailed):
        return JSONResponse(status_code=422, content={"detail": "Validation failed", "errors": error.errors})
    headers = {"WWW-Authenticate": "Bearer"} if error.status_code == 401 else None
    if isinstance(error, TooManyRequests):
        headers = {"Retry-After": str(error.retry_after)}
    return JSONResponse(
        status_code=error.status_code, content={"detail": getattr(error, "what", str(error))}, headers=headers
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(members.router)
app.include_router(jobs.router)
app.include_router(photos.router)
