"""
FEASTIFY - utils/helpers.py
Small shared helpers: time, ObjectId conversion and JSON responses.
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from bson import ObjectId
from bson.errors import InvalidId
from flask import jsonify

from config import Config

TZ = ZoneInfo(Config.APP_TIMEZONE)


def now_utc():
    return datetime.now(timezone.utc)


def local_now():
    return datetime.now(TZ)


def today_str():
    return local_now().date().isoformat()


def local_midnight():
    return local_now().replace(hour=0, minute=0, second=0, microsecond=0)


def iso(value):
    """Convert datetimes to ISO text so they can be sent as JSON."""
    return value.isoformat() if isinstance(value, datetime) else value


def to_object_id(value):
    try:
        return ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def ok(data=None, message=None, status=200):
    body = {"success": True}
    if message:
        body["message"] = message
    if data:
        body.update(data)
    return jsonify(body), status


def error(message, status=400, **extra):
    body = {"success": False, "message": message}
    body.update(extra)
    return jsonify(body), status


def days_ago_utc(days):
    return now_utc() - timedelta(days=days)
