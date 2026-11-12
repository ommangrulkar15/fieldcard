"""Validation and conversion of one submitted value, per field type.

`coerce` turns raw JSON input into the value we store, or raises ValueError with a
message for the user. Empty input returns None ("no value").
"""

import re
from datetime import date
from decimal import Decimal, InvalidOperation

FIELD_TYPES = ("text", "longtext", "number", "date", "dropdown", "choice", "yesno", "photo")
KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")

MAX_TEXT = 200
MAX_LONGTEXT = 5000
MAX_NUMBER = Decimal("999999999999.9999")
MAX_DECIMALS = 4


def active_option_values(options: list) -> set[str]:
    return {o["value"] for o in options if not o.get("archived")}


def coerce(field, raw):
    """Return the storable value for `field`, or None when `raw` is empty."""
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        return None

    t = field.type
    if t == "photo":
        raise ValueError("Photos are uploaded separately")

    if t in ("text", "longtext"):
        if not isinstance(raw, str):
            raise ValueError("Must be text")
        value = raw.strip()
        limit = MAX_LONGTEXT if t == "longtext" else MAX_TEXT
        if len(value) > limit:
            raise ValueError(f"Must be at most {limit} characters")
        return value

    if t == "number":
        if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
            raise ValueError("Must be a number")
        try:
            number = Decimal(str(raw).strip())
        except InvalidOperation:
            raise ValueError("Must be a number") from None
        if not number.is_finite():
            raise ValueError("Must be a number")
        if abs(number) > MAX_NUMBER:
            raise ValueError("Number is too large")
        if -number.as_tuple().exponent > MAX_DECIMALS:
            raise ValueError(f"Use at most {MAX_DECIMALS} decimal places")
        text = format(number.normalize(), "f")
        return "0" if text in ("-0", "") else text

    if t == "date":
        if not isinstance(raw, str):
            raise ValueError("Must be a date (YYYY-MM-DD)")
        try:
            value = date.fromisoformat(raw.strip())
        except ValueError:
            raise ValueError("Must be a date (YYYY-MM-DD)") from None
        if not (1900 <= value.year <= 2100):
            raise ValueError("Date is out of range")
        return value.isoformat()

    if t in ("dropdown", "choice"):
        if not isinstance(raw, str):
            raise ValueError("Must be text")
        value = raw.strip()
        if value in active_option_values(field.options):
            return value
        if t == "dropdown" and field.config.get("allow_custom"):
            if len(value) > MAX_TEXT:
                raise ValueError(f"Must be at most {MAX_TEXT} characters")
            return value
        raise ValueError("Pick one of the listed options")

    if t == "yesno":
        if not isinstance(raw, bool):
            raise ValueError("Must be yes or no")
        return raw

    raise ValueError("Unsupported field type")
