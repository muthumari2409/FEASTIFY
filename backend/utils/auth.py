"""
FEASTIFY - utils/auth.py
JWT authentication stored in HttpOnly cookies.

* Customers receive the cookie "feastify_token".
* Admins receive a SEPARATE cookie "feastify_admin_token".

HttpOnly cookies cannot be read by JavaScript, so the token cannot be
stolen by a malicious script. The frontend asks /api/auth/me to learn
who is logged in; the name is never hard-coded.
"""
from datetime import datetime, timezone, timedelta
from functools import wraps

import jwt
from flask import request, g

from config import Config
from database import get_db
from utils.helpers import to_object_id, error

CUSTOMER_COOKIE = "feastify_token"
ADMIN_COOKIE = "feastify_admin_token"


def create_token(subject_id, role, name):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject_id),
        "role": role,
        "name": name,
        "iat": now,
        "exp": now + timedelta(hours=Config.JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")


def decode_token(token):
    if not token:
        return None
    try:
        return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def set_auth_cookie(response, cookie_name, token):
    response.set_cookie(
        cookie_name,
        token,
        max_age=Config.JWT_EXPIRES_HOURS * 3600,
        httponly=True,
        secure=Config.COOKIE_SECURE,
        samesite="Lax",
        path="/",
    )
    return response


def clear_auth_cookie(response, cookie_name):
    response.delete_cookie(cookie_name, path="/", samesite="Lax")
    return response


def current_customer():
    """Return the logged-in customer's document, or None."""
    payload = decode_token(request.cookies.get(CUSTOMER_COOKIE))
    if not payload or payload.get("role") != "customer":
        return None
    oid = to_object_id(payload.get("sub"))
    if not oid:
        return None
    return get_db().users.find_one({"_id": oid, "role": "customer"})


def current_admin():
    """Return the logged-in admin's document, or None."""
    payload = decode_token(request.cookies.get(ADMIN_COOKIE))
    if not payload or payload.get("role") != "admin":
        return None
    oid = to_object_id(payload.get("sub"))
    if not oid:
        return None
    return get_db().admins.find_one({"_id": oid, "role": "admin"})


def customer_required(fn):
    """Decorator: the route can only be used by a logged-in customer."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_customer()
        if not user:
            return error("Please log in to continue.", 401)
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    """Decorator: the route can only be used by one of the admin accounts."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        admin = current_admin()
        if not admin:
            return error("Unauthorized access. Admin login required.", 401)
        g.admin = admin
        return fn(*args, **kwargs)
    return wrapper
