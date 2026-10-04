"""
FEASTIFY - models/booking_model.py
Tables, time slots, statuses and the shape of a booking document.
"""
from utils.helpers import iso
from utils.aes_security import decrypt_data

# table number -> seats
TABLES = {1: 2, 2: 2, 3: 4, 4: 4, 5: 6, 6: 6, 7: 8, 8: 8}

TABLE_NAMES = {
    1: "Window nook", 2: "Garden view", 3: "Courtyard", 4: "Fireside",
    5: "Family table", 6: "Terrace", 7: "Grand table", 8: "Private room",
}

# Each booking reserves one of these slots (lunch and dinner service)
TIME_SLOTS = ["12:00", "13:00", "14:00", "15:00", "18:00", "19:00", "20:00", "21:00", "22:00"]

STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"]
# Bookings in these statuses hold the table. Cancelled ones free it.
ACTIVE_STATUSES = {"Pending", "Confirmed", "Completed"}

MAX_GUESTS = 8
MAX_ADVANCE_DAYS = 60


def slot_label(slot):
    hour, minute = map(int, slot.split(":"))
    suffix = "AM" if hour < 12 else "PM"
    return f"{(hour % 12) or 12}:{minute:02d} {suffix}"


def serialize_booking(b):
    return {
        "id": str(b["_id"]),
        "booking_ref": b.get("booking_ref", ""),
        "user_id": str(b.get("user_id")) if b.get("user_id") else None,
        "customer_name": b.get("customer_name", ""),
        "email": b.get("email", ""),
        "phone": decrypt_data(b.get("phone", "")),   # AES-256 decrypt for display
        "date": b.get("date"),
        "time": b.get("time"),
        "time_label": slot_label(b["time"]) if b.get("time") else "",
        "guests": b.get("guests"),
        "table_number": b.get("table_number"),
        "table_name": TABLE_NAMES.get(b.get("table_number"), ""),
        "table_seats": TABLES.get(b.get("table_number")),
        "special_request": b.get("special_request", ""),
        "preorder_items": b.get("preorder_items", []),
        "preorder_total": b.get("preorder_total", 0),
        "status": b.get("status"),
        "created_at": iso(b.get("created_at")),
        "updated_at": iso(b.get("updated_at")),
        "updated_by": b.get("updated_by"),
    }