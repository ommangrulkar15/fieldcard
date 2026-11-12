"""The one rule demo accounts need everywhere: their sign-in details cannot be changed."""

from app.errors import Forbidden
from app.models import User

DEMO_DOMAIN = "demo.fieldcard.example"


def is_demo_email(email: str) -> bool:
    return email.endswith("@" + DEMO_DOMAIN)


def refuse_for_demo(user: User | None) -> None:
    if user is not None and is_demo_email(user.email):
        raise Forbidden("Demo accounts are read-only for sign-in details")
