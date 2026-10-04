"""
FEASTIFY - utils/login_guard.py
Brute-force protection using the Sliding Window Rate-Limiting algorithm.
"""
from datetime import timedelta
from flask import request
from database import get_db
from utils.helpers import now_utc

MAX_FAILED = 5        # 5 wrong tries allowed, 6th is blocked
WINDOW_MINUTES = 15   # only failures in the last 15 minutes are counted


def _client_ip():
    fwd = request.headers.get("X-Forwarded-For", "")
    return fwd.split(",")[0].strip() if fwd else (request.remote_addr or "unknown")


def is_blocked(email, role):
    since = now_utc() - timedelta(minutes=WINDOW_MINUTES)
    failed = get_db().login_attempts.count_documents({
        "email": email, "role": role, "success": False, "time": {"$gte": since}
    })
    return failed >= MAX_FAILED


def record_attempt(email, role, success):
    db = get_db()
    db.login_attempts.insert_one({
        "email": email, "role": role, "ip": _client_ip(),
        "success": success, "time": now_utc()
    })
    if success:  # correct login resets the counter
        db.login_attempts.delete_many({"email": email, "role": role, "success": False})


def log_blocked(email, role):
    get_db().security_logs.insert_one({
        "event": "BLOCKED_LOGIN", "email": email, "role": role,
        "ip": _client_ip(),
        "user_agent": request.headers.get("User-Agent", "")[:200],
        "time": now_utc()
    })