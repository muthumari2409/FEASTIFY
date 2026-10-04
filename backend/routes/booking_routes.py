"""
FEASTIFY - routes/booking_routes.py
Create a booking, list my bookings, cancel my booking.
The backend performs the FINAL availability check; MongoDB's unique index
makes double booking impossible even if two requests arrive together.
"""
from datetime import timedelta

from bson import ObjectId
from flask import Blueprint, request, g
from pymongo.errors import DuplicateKeyError

from database import get_db
from models.booking_model import (TABLES, TIME_SLOTS, MAX_GUESTS, MAX_ADVANCE_DAYS,
                                  serialize_booking)
from models.menu_model import menu_list, build_preorder
from utils.source import request_source
from utils.auth import customer_required
from utils.helpers import ok, error, now_utc, local_now, to_object_id
from utils.validators import clean, normalise_phone, valid_phone, valid_name, parse_date
from utils.aes_security import encrypt_data, decrypt_data

bookings_bp = Blueprint("bookings", __name__)


def _slot_in_past(date_s, time_s):
    now_l = local_now()
    today_s = now_l.date().isoformat()
    return date_s < today_s or (date_s == today_s and time_s <= now_l.strftime("%H:%M"))


@bookings_bp.get("/api/menu")
def menu():
    """Dishes and prices for the pre-order section of the booking page."""
    return ok({"menu": menu_list()})


@bookings_bp.post("/api/bookings")
@customer_required
def create_booking():
    user = g.user
    data = request.get_json(silent=True) or {}

    name = clean(data.get("customer_name"), 50) or user["name"]
    phone = normalise_phone(clean(data.get("phone"), 25)) or decrypt_data(user.get("phone", ""))
    date_s = clean(data.get("date"), 10)
    time_s = clean(data.get("time"), 5)
    special = clean(data.get("special_request"), 300)

    try:
        guests = int(data.get("guests"))
    except (TypeError, ValueError):
        return error("Please choose the number of guests.")
    try:
        table = int(data.get("table_number"))
    except (TypeError, ValueError):
        return error("Please select a table.")

    # ---- validation ----
    if not valid_name(name):
        return error("Please enter the name for the booking.")
    if not valid_phone(phone):
        return error("Please enter a valid phone number (10-15 digits).")
    day = parse_date(date_s)
    if not day:
        return error("Please choose a valid date.")
    today = local_now().date()
    if day < today:
        return error("You cannot book a table for a past date.")
    if day > today + timedelta(days=MAX_ADVANCE_DAYS):
        return error(f"Bookings can be made up to {MAX_ADVANCE_DAYS} days in advance.")
    if time_s not in TIME_SLOTS:
        return error("Please choose a valid time slot.")
    if _slot_in_past(date_s, time_s):
        return error("This time slot has already passed. Please choose a later time.")
    if not 1 <= guests <= MAX_GUESTS:
        return error(f"Guests must be between 1 and {MAX_GUESTS}.")
    if table not in TABLES:
        return error("Please select a valid table.")
    if guests > TABLES[table]:
        return error(f"Table {table} seats only {TABLES[table]} guests. Please choose a larger table.")

    # Optional food pre-order: prices are taken from the backend menu, never from the browser
    preorder_items, preorder_total, problem = build_preorder(data.get("preorder"))
    if problem:
        return error(problem)

    db = get_db()
    taken_message = f"Table {table} is already booked for this time."

    # Same customer cannot hold two tables at the same time
    if db.bookings.find_one({"user_id": user["_id"], "date": date_s, "time": time_s, "active": True}):
        return error("You already have a booking at this date and time. "
                     "Cancel it first if you want a different table.", 409)

    # Friendly check (the unique index below is the real guarantee)
    if db.bookings.find_one({"table_number": table, "date": date_s, "time": time_s, "active": True}):
        return error(taken_message, 409, code="TABLE_TAKEN")

    oid = ObjectId()
    doc = {
        "_id": oid,
        "booking_ref": "FST-" + str(oid)[-6:].upper(),
        "user_id": user["_id"],
        "customer_name": name,
        "email": user["email"],
        "phone": encrypt_data(phone),          # AES-256 encrypted before saving
        "date": date_s,
        "time": time_s,
        "guests": guests,
        "table_number": table,
        "special_request": special,
        "preorder_items": preorder_items,
        "preorder_total": preorder_total,
        "source": request_source(),
        "status": "Pending",
        "active": True,
        "created_at": now_utc(),
    }
    try:
        db.bookings.insert_one(doc)
    except DuplicateKeyError:
        # Another customer booked this exact table/time a split second earlier
        return error(taken_message, 409, code="TABLE_TAKEN")

    return ok({"booking": serialize_booking(doc)},
              message=f"Table {table} is reserved for you"
                      + (" with your food pre-order" if preorder_items else "")
                      + ". Your booking is pending confirmation.",
              status=201)


@bookings_bp.get("/api/bookings/my")
@customer_required
def my_bookings():
    cursor = get_db().bookings.find({"user_id": g.user["_id"]}).sort([("date", -1), ("time", -1)])
    return ok({
        "bookings": [serialize_booking(b) for b in cursor],
        "today": local_now().date().isoformat(),
        "now_time": local_now().strftime("%H:%M"),
    })


@bookings_bp.put("/api/bookings/<booking_id>/cancel")
@customer_required
def cancel_booking(booking_id):
    oid = to_object_id(booking_id)
    if not oid:
        return error("Booking not found.", 404)
    db = get_db()
    # user_id in the filter guarantees customers can only touch their own bookings
    booking = db.bookings.find_one({"_id": oid, "user_id": g.user["_id"]})
    if not booking:
        return error("Booking not found.", 404)
    if booking["status"] not in ("Pending", "Confirmed"):
        return error(f"A {booking['status'].lower()} booking cannot be cancelled.")
    if _slot_in_past(booking["date"], booking["time"]):
        return error("Past bookings cannot be cancelled.")

    now = now_utc()
    db.bookings.update_one({"_id": oid}, {"$set": {
        "status": "Cancelled", "active": False, "updated_at": now,
        "updated_by": "customer", "cancelled_at": now,
    }})
    booking.update({"status": "Cancelled", "updated_at": now, "updated_by": "customer"})
    return ok({"booking": serialize_booking(booking)}, message="Your booking has been cancelled.")