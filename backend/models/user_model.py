"""
FEASTIFY - models/user_model.py
Shape of a customer document in the "users" collection.
"""
from utils.helpers import iso, now_utc


def new_user_doc(name, email, phone, password_hash):
    return {
        "name": name,
        "email": email,
        "phone": phone,
        "password_hash": password_hash,   # never the plain password
        "role": "customer",               # admins live in the separate "admins" collection
        "created_at": now_utc(),
        "last_login": None,
        "visit_count": 0,
        "first_visit": None,
        "last_visit": None,
    }


def serialize_user(user):
    """Convert a user document into safe JSON (no password hash)."""
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "phone": user.get("phone", ""),
        "role": user.get("role", "customer"),
        "created_at": iso(user.get("created_at")),
        "last_login": iso(user.get("last_login")),
        "visit_count": user.get("visit_count", 0),
        "first_visit": iso(user.get("first_visit")),
        "last_visit": iso(user.get("last_visit")),
    }
