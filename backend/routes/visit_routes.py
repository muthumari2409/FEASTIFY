"""
FEASTIFY - routes/visit_routes.py
Backend-based visitor tracking.

How a visit is counted:
1. Each browser gets a session_id (kept by the browser for 30 minutes of activity).
2. The FIRST ping with a new session_id creates one "visits" document  -> +1 visitor.
3. Later pings from the same session (Home, About, Menu, ...) only update last_seen
   and the list of pages. They never add a new visitor.
4. If the request carries a valid ADMIN cookie, nothing is recorded at all.
5. When a logged-in customer is recognised, the visit is linked to them once
   and their visit_count / first_visit / last_visit are updated.
"""
import re

from flask import Blueprint, request
from pymongo.errors import DuplicateKeyError

from database import get_db
from models.visit_model import new_visit_doc
from utils.auth import current_admin, current_customer
from utils.helpers import ok, error, now_utc
from utils.validators import clean

visits_bp = Blueprint("visits", __name__)
SESSION_RE = re.compile(r"^[A-Za-z0-9\-]{8,64}$")


@visits_bp.post("/api/visits")
def record_visit():
    data = request.get_json(silent=True) or {}
    session_id = str(data.get("session_id") or "")
    page = clean(data.get("page"), 40) or "page"

    if not SESSION_RE.match(session_id):
        return error("Invalid session id.")

    # ---- Rule: admins are NEVER counted ----
    if current_admin():
        return ok({"counted": False, "reason": "Admin sessions are not counted as website visits."})

    db = get_db()
    now = now_utc()
    customer = current_customer()

    visit = db.visits.find_one({"session_id": session_id})
    new_visit = False
    if visit is None:
        doc = new_visit_doc(session_id, page, now)
        try:
            db.visits.insert_one(doc)
            visit, new_visit = doc, True
        except DuplicateKeyError:
            # two tabs sent the first ping at the same moment
            visit = db.visits.find_one({"session_id": session_id})

    if not new_visit:
        db.visits.update_one({"_id": visit["_id"]}, {
            "$set": {"last_seen": now},
            "$inc": {"page_views": 1},
            "$addToSet": {"pages": page},
        })

    if customer:
        if visit.get("user_id") is None:
            # Link this visit to the customer exactly once (atomic filter on user_id None)
            linked = db.visits.update_one(
                {"_id": visit["_id"], "user_id": None},
                {"$set": {"user_id": customer["_id"], "visitor_name": customer["name"],
                          "visitor_email": customer["email"]}},
            )
            if linked.modified_count:
                db.users.update_one({"_id": customer["_id"]},
                                    {"$inc": {"visit_count": 1}, "$set": {"last_visit": now}})
                db.users.update_one({"_id": customer["_id"], "first_visit": None},
                                    {"$set": {"first_visit": now}})
        elif visit.get("user_id") == customer["_id"]:
            db.users.update_one({"_id": customer["_id"]}, {"$set": {"last_visit": now}})

    return ok({"counted": new_visit})
