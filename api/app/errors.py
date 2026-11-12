class AppError(Exception):
    """Base class for errors that map to an HTTP status."""

    status_code = 400


class NotFound(AppError):
    status_code = 404

    def __init__(self, what: str = "Not found"):
        super().__init__(what)
        self.what = what


class Conflict(AppError):
    status_code = 409

    def __init__(self, what: str):
        super().__init__(what)
        self.what = what


class ValidationFailed(AppError):
    """Field-level problems, reported as {field_key: message}."""

    status_code = 422

    def __init__(self, errors: dict[str, str]):
        super().__init__("Validation failed")
        self.errors = errors


class Unauthorized(AppError):
    """Missing, expired or wrong credentials."""

    status_code = 401

    def __init__(self, what: str = "Not signed in"):
        super().__init__(what)
        self.what = what


class Forbidden(AppError):
    """Signed in and a member, but the role lacks the permission."""

    status_code = 403

    def __init__(self, what: str = "You do not have permission to do that"):
        super().__init__(what)
        self.what = what
