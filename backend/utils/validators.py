"""
FEASTIFY - utils/validators.py
Server-side input validation. The frontend also validates, but the
backend never trusts the browser.
"""
import re
from datetime import datetime

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")
UNSAFE_RE = re.compile(r"[<>{}$]")


def clean(value, max_len=200):
    """Trim whitespace and limit length."""
    return str(value or "").strip()[:max_len]


def normalise_phone(value):
    return re.sub(r"[\s\-()]", "", str(value or ""))


def valid_email(email):
    return bool(EMAIL_RE.match(email or ""))


def valid_phone(phone):
    return bool(PHONE_RE.match(phone or ""))


def valid_name(name):
    return 2 <= len(name or "") <= 50 and not UNSAFE_RE.search(name)


def password_problem(password):
    """Return a message describing what is wrong, or None if the password is fine."""
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r"[A-Za-z]", password):
        return "Password must contain at least one letter."
    if not re.search(r"[0-9]", password):
        return "Password must contain at least one number."
    if len(password) > 128:
        return "Password is too long."
    return None


def parse_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None
