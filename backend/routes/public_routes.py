"""
FEASTIFY - routes/public_routes.py
Open endpoints: health check, table list, real-time availability, contact form.
"""
from datetime import timedelta

from flask import Blueprint, request

from database import get_db
from models.booking_model import (TABLES, TABLE_NAMES, TIME_SLOTS, MAX_GUESTS,
                                  MAX_ADVANCE_DAYS, slot_label)
from utils.helpers import ok, error, now_utc, local_now
from utils.validators import clean, parse_date, valid_email, valid_name

public_bp = Blueprint("public", __name__)


@public_bp.get("/api/health")
def health():
    get_db().command("ping")
    return ok({"status": "ok", "database": "connected", "time": now_utc().isoformat()})


@public_bp.get("/api/tables")
def tables():
    return ok({
        "tables": [{"number": n, "seats": s, "name": TABLE_NAMES[n]} for n, s in TABLES.items()],
        "time_slots": [{"value": t, "label": slot_label(t)} for t in TIME_SLOTS],
        "max_guests": MAX_GUESTS,
        "max_advance_days": MAX_ADVANCE_DAYS,
        "today": local_now().date().isoformat(),
        "now_time": local_now().strftime("%H:%M"),
    })


@public_bp.get("/api/tables/availability")
def availability():
    """Which tables are free for a date + time. Read straight from MongoDB every time."""
    date_s = clean(request.args.get("date"), 10)
    time_s = clean(request.args.get("time"), 5)
    guests_raw = request.args.get("guests")

    day = parse_date(date_s)
    if not day:
        return error("Please choose a valid date.")
    if time_s not in TIME_SLOTS:
        return error("Please choose a valid time slot.")
    try:
        guests = int(guests_raw) if guests_raw else None
    except ValueError:
        guests = None

    now_l = local_now()
    slot_passed = day < now_l.date() or (day == now_l.date() and time_s <= now_l.strftime("%H:%M"))

    booked = {
        b["table_number"]
        for b in get_db().bookings.find(
            {"date": date_s, "time": time_s, "active": True}, {"table_number": 1})
    }

    result = []
    for number, seats in TABLES.items():
        fits = guests is None or guests <= seats
        is_free = number not in booked
        result.append({
            "number": number,
            "seats": seats,
            "name": TABLE_NAMES[number],
            "booked": not is_free,
            "fits": fits,
            "available": is_free and fits and not slot_passed,
        })

    return ok({
        "date": date_s,
        "time": time_s,
        "time_label": slot_label(time_s),
        "slot_passed": slot_passed,
        "tables": result,
        "available_count": sum(1 for t in result if t["available"]),
        "checked_at": now_utc().isoformat(),
    })


@public_bp.post("/api/contact")
def contact():
    data = request.get_json(silent=True) or {}
    name = clean(data.get("name"), 50)
    email = clean(data.get("email"), 120).lower()
    subject = clean(data.get("subject"), 100) or "General enquiry"
    message = clean(data.get("message"), 1500)

    if not valid_name(name):
        return error("Please enter your name.")
    if not valid_email(email):
        return error("Please enter a valid email address.")
    if len(message) < 10:
        return error("Please write a message of at least 10 characters.")

    db = get_db()
    # simple spam guard: max 5 messages per email per hour
    recent = db.messages.count_documents({"email": email, "created_at": {"$gte": now_utc() - timedelta(hours=1)}})
    if recent >= 5:
        return error("You have sent several messages recently. Please try again later.", 429)

    db.messages.insert_one({"name": name, "email": email, "subject": subject,
                            "message": message, "created_at": now_utc()})
    return ok(message="Thank you! Your message has been sent. We will reply within 24 hours.", status=201)
