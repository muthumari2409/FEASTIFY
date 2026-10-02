"""
FEASTIFY - models/visit_model.py
One document in "visits" = one browser session of a customer or guest.
"""
from utils.helpers import iso


def new_visit_doc(session_id, page, now):
    return {
        "session_id": session_id,
        "user_id": None,          # filled in when a logged-in customer is recognised
        "visitor_name": "Guest",
        "visitor_email": None,
        "visit_date": now,        # start of the visit
        "last_seen": now,
        "is_admin": False,        # admins are never stored as visitors
        "pages": [page],
        "page_views": 1,
    }


def serialize_visit(v):
    return {
        "id": str(v["_id"]),
        "session_id": v.get("session_id"),
        "user_id": str(v["user_id"]) if v.get("user_id") else None,
        "visitor_name": v.get("visitor_name") or "Guest",
        "visitor_email": v.get("visitor_email"),
        "visit_date": iso(v.get("visit_date")),
        "last_seen": iso(v.get("last_seen")),
        "is_admin": v.get("is_admin", False),
        "pages": v.get("pages", []),
        "page_views": v.get("page_views", 1),
    }
