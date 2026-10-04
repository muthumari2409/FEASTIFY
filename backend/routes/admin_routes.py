"""
FEASTIFY - routes/admin_routes.py
Admin login and every admin-only endpoint. All routes except /login are
protected with @admin_required, so customers get 401 "Unauthorized access".
"""
import re
from datetime import timedelta

from flask import Blueprint, request, jsonify, g
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash

from database import get_db
from models.booking_model import STATUSES, ACTIVE_STATUSES, serialize_booking
from models.user_model import serialize_user
from models.visit_model import serialize_visit
from utils.analytics import build_analytics
from utils.auth import (create_token, set_auth_cookie, clear_auth_cookie,
                        admin_required, ADMIN_COOKIE)
from utils.helpers import ok, error, now_utc, iso, to_object_id
from utils.validators import clean, parse_date
from utils.login_guard import is_blocked, record_attempt, log_blocked

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _limit(default=200, maximum=1000):
    try:
        return max(1, min(int(request.args.get("limit", default)), maximum))
    except ValueError:
        return default


@admin_bp.post("/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    username = clean(data.get("username"), 50).lower()
    password = str(data.get("password") or "")
    if not username or not password:
        return error("Please enter the admin username and password.")

    # Brute-force protection (Sliding Window Rate-Limiting algorithm)
    if is_blocked(username, "admin"):
        log_blocked(username, "admin")
        return error("Too many attempts. Please try again after 15 minutes.", 429)

    db = get_db()
    admin = db.admins.find_one({"username": username, "role": "admin"})
    if not admin or not check_password_hash(admin["password_hash"], password):
        record_attempt(username, "admin", False)
        return error("Incorrect admin username or password.", 401)

    record_attempt(username, "admin", True)
    db.admins.update_one({"_id": admin["_id"]}, {"$set": {"last_login": now_utc()}})
    response = jsonify({"success": True, "message": f"Signed in as {admin['username']}.",
                        "admin": {"username": admin["username"]}})
    return set_auth_cookie(response, ADMIN_COOKIE,
                           create_token(admin["_id"], "admin", admin["username"]))


@admin_bp.get("/me")
@admin_required
def admin_me():
    return ok({"admin": {"username": g.admin["username"], "role": "admin",
                         "last_login": iso(g.admin.get("last_login"))}})


@admin_bp.post("/logout")
def admin_logout():
    return clear_auth_cookie(jsonify({"success": True, "message": "Signed out."}), ADMIN_COOKIE)


# ---------------------------------------------------------------- bookings
@admin_bp.get("/bookings")
@admin_required
def list_bookings():
    query = {}
    status = request.args.get("status")
    if status in STATUSES:
        query["status"] = status
    date_s = request.args.get("date")
    if parse_date(date_s):
        query["date"] = date_s
    q = clean(request.args.get("q"), 60)
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"customer_name": rx}, {"email": rx}, {"phone": rx}, {"booking_ref": rx}]

    db = get_db()
    bookings = db.bookings.find(query).sort("created_at", -1).limit(_limit())
    counts = {r["_id"]: r["count"] for r in db.bookings.aggregate(
        [{"$group": {"_id": "$status", "count": {"$sum": 1}}}])}
    return ok({"bookings": [serialize_booking(b) for b in bookings],
               "counts": {s: counts.get(s, 0) for s in STATUSES}})


@admin_bp.get("/bookings/<booking_id>")
@admin_required
def get_booking(booking_id):
    oid = to_object_id(booking_id)
    booking = get_db().bookings.find_one({"_id": oid}) if oid else None
    if not booking:
        return error("Booking not found.", 404)
    return ok({"booking": serialize_booking(booking)})


@admin_bp.put("/bookings/<booking_id>/status")
@admin_required
def update_booking_status(booking_id):
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in STATUSES:
        return error("Status must be Pending, Confirmed, Completed or Cancelled.")
    oid = to_object_id(booking_id)
    db = get_db()
    booking = db.bookings.find_one({"_id": oid}) if oid else None
    if not booking:
        return error("Booking not found.", 404)

    now = now_utc()
    update = {"status": status, "active": status in ACTIVE_STATUSES,
              "updated_at": now, "updated_by": g.admin["username"]}
    try:
        db.bookings.update_one({"_id": oid}, {"$set": update})
    except DuplicateKeyError:
        # Re-activating a cancelled booking whose slot was taken by someone else
        return error(f"Cannot restore this booking: Table {booking['table_number']} "
                     "is already booked for this time.", 409)
    booking.update(update)
    return ok({"booking": serialize_booking(booking)}, message=f"Booking marked as {status}.")


# ---------------------------------------------------------------- customers & visits
@admin_bp.get("/customers")
@admin_required
def list_customers():
    db = get_db()
    q = clean(request.args.get("q"), 60)
    query = {"role": "customer"}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"email": rx}, {"phone": rx}]

    users = list(db.users.find(query, {"password_hash": 0}).sort("last_visit", -1).limit(_limit(500, 2000)))
    booking_counts = {r["_id"]: r for r in db.bookings.aggregate([
        {"$match": {"user_id": {"$in": [u["_id"] for u in users]}}},
        {"$group": {"_id": "$user_id", "total": {"$sum": 1},
                    "cancelled": {"$sum": {"$cond": [{"$eq": ["$status", "Cancelled"]}, 1, 0]}}}},
    ])}

    customers = []
    for u in users:
        row = serialize_user(u)
        stats = booking_counts.get(u["_id"], {})
        row["bookings"] = stats.get("total", 0)
        row["cancelled_bookings"] = stats.get("cancelled", 0)
        customers.append(row)
    return ok({"customers": customers, "total": db.users.count_documents({"role": "customer"})})


@admin_bp.get("/visits")
@admin_required
def list_visits():
    cursor = get_db().visits.find({"is_admin": False}).sort("last_seen", -1).limit(_limit(100, 500))
    return ok({"visits": [serialize_visit(v) for v in cursor]})


@admin_bp.get("/messages")
@admin_required
def list_messages():
    cursor = get_db().messages.find().sort("created_at", -1).limit(_limit(50, 200))
    return ok({"messages": [{
        "id": str(m["_id"]), "name": m.get("name"), "email": m.get("email"),
        "subject": m.get("subject"), "message": m.get("message"),
        "created_at": iso(m.get("created_at")),
    } for m in cursor]})


# ---------------------------------------------------------------- analytics
@admin_bp.get("/analytics")
@admin_required
def analytics():
    return ok({"analytics": build_analytics()})


# ---------------------------------------------------------------- security logs
@admin_bp.get("/security-logs")
@admin_required
def security_logs():
    db = get_db()
    now = now_utc()
    logs = db.security_logs.find().sort("time", -1).limit(_limit(100, 500))
    return ok({
        "logs": [{
            "id": str(l["_id"]), "event": l.get("event"), "email": l.get("email"),
            "role": l.get("role"), "ip": l.get("ip"),
            "user_agent": l.get("user_agent"), "time": iso(l.get("time")),
        } for l in logs],
        "total": db.security_logs.count_documents({}),
        "last_24h": db.security_logs.count_documents({"time": {"$gte": now - timedelta(hours=24)}}),
        "failed_15m": db.login_attempts.count_documents(
            {"success": False, "time": {"$gte": now - timedelta(minutes=15)}}),
    })