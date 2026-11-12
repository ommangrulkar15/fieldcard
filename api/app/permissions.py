"""The one place that decides what each role may do.

The API checks these on every request; /auth/me sends the same sets to the web app,
so the UI shows exactly the buttons the API will honour. Roles are read from the
database on each request, never copied into the access token.
"""

CREW = {"job:read", "job:create", "job:update"}
SUPERVISOR = CREW | {"job:delete", "job:export"}
ADMIN = SUPERVISOR | {"fields:manage", "users:manage", "workspace:manage"}

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "crew": frozenset(CREW),
    "supervisor": frozenset(SUPERVISOR),
    "admin": frozenset(ADMIN),
}
ROLES = tuple(ROLE_PERMISSIONS)
