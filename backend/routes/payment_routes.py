"""
FEASTIFY - Dummy payment (no real money is taken).
Future la real payment (Razorpay) connect pannumbodhu indha file-a mattum maathina podhum.
"""
import random
from datetime import datetime

from bson import ObjectId
from flask import Blueprint, request, jsonify

from database import get_db
from utils.auth import current_admin

payments_bp = Blueprint("payments", __name__)

ALLOWED_METHODS = {"UPI", "Card"}


# Customer "Pay Now" click pannumbodhu idhu run aagum
@payments_bp.post("/api/payments/pay")
def pay():
    data = request.get_json(silent=True) or {}
    method = data.get("method")
    booking_id = str(data.get("booking_id") or "")
    try:
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0

    if method not in ALLOWED_METHODS:
        return jsonify({"success": False, "message": "Choose a payment method."}), 400
    if amount <= 0:
        return jsonify({"success": False, "message": "Invalid amount."}), 400

    db = get_db()
    booking = None
    if booking_id:
        try:
            booking = db.bookings.find_one({"_id": ObjectId(booking_id)})
        except Exception:
            booking = None
        if not booking:
            return jsonify({"success": False, "message": "Booking not found."}), 404
        if booking.get("payment_status") == "Paid":
            return jsonify({"success": False, "message": "This booking is already paid."}), 400

    txn_id = "FST" + str(random.randint(10000000, 99999999))
    customer = ""
    if booking:
        customer = booking.get("name") or booking.get("customer_name") or booking.get("email") or ""

    db.payments.insert_one({
        "booking_id": booking_id,
        "customer": customer,
        "amount": amount,
        "method": method,
        "transaction_id": txn_id,
        "status": "Paid",
        "paid_at": datetime.now(),
    })

    if booking:
        db.bookings.update_one(
            {"_id": booking["_id"]},
            {"$set": {"payment_status": "Paid", "transaction_id": txn_id}}
        )

    return jsonify({"success": True, "message": "Payment successful.", "transaction_id": txn_id})


# Admin payments list
@payments_bp.get("/api/admin/payments")
def admin_payments():
    if not current_admin():
        return jsonify({"success": False, "message": "Admin login required."}), 401

    rows = []
    for p in get_db().payments.find().sort("paid_at", -1).limit(500):
        rows.append({
            "customer": p.get("customer") or "-",
            "booking_id": p.get("booking_id") or "-",
            "amount": p.get("amount"),
            "method": p.get("method"),
            "transaction_id": p.get("transaction_id"),
            "status": p.get("status"),
            "paid_at": p["paid_at"].strftime("%d-%m-%Y %I:%M %p") if p.get("paid_at") else "-",
        })
    return jsonify({"success": True, "payments": rows})