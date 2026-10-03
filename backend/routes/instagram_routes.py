"""
FEASTIFY - routes/instagram_routes.py
Instagram insights for the admin.

1. TRACKED automatically (from the link people click on Instagram,
   e.g. https://your-site/?from=instagram):
     website visits, new sign-ups, table bookings and food pre-orders
     that came from Instagram.
2. LIVE from the Instagram account (needs INSTAGRAM_ACCESS_TOKEN):
     followers, posts, likes, comments, views, reach.
3. Instagram POSTS typed by the admin (used until Instagram is connected).
"""
from datetime import timedelta, timezone

from flask import Blueprint, request, g
from pymongo import DESCENDING

from database import get_db
from models.booking_model import serialize_booking
from utils.auth import admin_required
from utils.helpers import ok, error, now_utc, local_midnight, iso, to_object_id, TZ
from utils.validators import clean
from utils.instagram_api import fetch_instagram, InstagramError

instagram_bp = Blueprint("instagram", __name__)
SOURCE = "instagram"
NOT_CANCELLED = {"status": {"$ne": "Cancelled"}}


def _local_day(value):
    """Mongo returns UTC datetimes; turn one into a local YYYY-MM-DD string."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(TZ).date().isoformat()


def _by_source(collection, match=None):
    rows = collection.aggregate([
        {"$match": match or {}},
        {"$group": {"_id": {"$ifNull": ["$source", "direct"]}, "n": {"$sum": 1}}},
    ])
    return {row["_id"]: row["n"] for row in rows}


def _serialize_post(p):
    return {
        "id": str(p["_id"]),
        "title": p.get("title", ""),
        "url": p.get("url", ""),
        "posted_on": p.get("posted_on", ""),
        "likes": p.get("likes", 0),
        "comments": p.get("comments", 0),
        "updated_at": iso(p.get("updated_at")),
    }


@instagram_bp.get("/api/admin/instagram")
@admin_required
def instagram_stats():
    db = get_db()
    week_start = local_midnight() - timedelta(days=6)
    days14_start = local_midnight() - timedelta(days=13)
    ig = {"source": SOURCE}

    visits = db.visits.count_documents(ig)
    signups = db.users.count_documents(ig)
    bookings = db.bookings.count_documents({**ig, **NOT_CANCELLED})
    pre = list(db.bookings.aggregate([
        {"$match": {**ig, **NOT_CANCELLED, "preorder_items.0": {"$exists": True}}},
        {"$group": {"_id": None, "n": {"$sum": 1}, "value": {"$sum": "$preorder_total"}}},
    ]))

    # daily visits and bookings from Instagram, last 14 days
    labels = [(days14_start + timedelta(days=i)).date().isoformat() for i in range(14)]
    daily_visits = dict.fromkeys(labels, 0)
    daily_bookings = dict.fromkeys(labels, 0)
    for v in db.visits.find({**ig, "visit_date": {"$gte": days14_start}}, {"visit_date": 1}):
        day = _local_day(v["visit_date"])
        if day in daily_visits:
            daily_visits[day] += 1
    for b in db.bookings.find({**ig, **NOT_CANCELLED, "created_at": {"$gte": days14_start}}, {"created_at": 1}):
        day = _local_day(b["created_at"])
        if day in daily_bookings:
            daily_bookings[day] += 1

    # compare every source (instagram, direct, whatsapp, ...)
    v_src = _by_source(db.visits)
    u_src = _by_source(db.users)
    b_src = _by_source(db.bookings, NOT_CANCELLED)
    sources = sorted(set(v_src) | set(u_src) | set(b_src),
                     key=lambda s: (-(v_src.get(s, 0)), s))

    recent = db.bookings.find(ig).sort("created_at", DESCENDING).limit(10)
    posts = db.instagram_posts.find().sort("posted_on", DESCENDING)

    return ok({"instagram": {
        "summary": {
            "visits": visits,
            "visits_7d": db.visits.count_documents({**ig, "visit_date": {"$gte": week_start}}),
            "signups": signups,
            "signups_7d": db.users.count_documents({**ig, "created_at": {"$gte": week_start}}),
            "bookings": bookings,
            "bookings_7d": db.bookings.count_documents({**ig, **NOT_CANCELLED, "created_at": {"$gte": week_start}}),
            "preorders": pre[0]["n"] if pre else 0,
            "preorder_value": pre[0]["value"] if pre else 0,
            "conversion": round(bookings / visits * 100, 1) if visits else 0,
        },
        "daily": {"labels": labels, "visits": list(daily_visits.values()),
                  "bookings": list(daily_bookings.values())},
        "sources": [{"source": s, "visits": v_src.get(s, 0), "signups": u_src.get(s, 0),
                     "bookings": b_src.get(s, 0)} for s in sources],
        "recent_bookings": [serialize_booking(b) for b in recent],
        "posts": [_serialize_post(p) for p in posts],
    }})


# ------------------------------------------------------------------ live data from the Instagram account
@instagram_bp.get("/api/admin/instagram/live")
@admin_required
def instagram_live():
    """Followers, posts, likes, comments, views and reach straight from Instagram."""
    try:
        return ok({"live": fetch_instagram(force=request.args.get("refresh") == "1")})
    except InstagramError as e:
        stale = (get_db().settings.find_one({"_id": "instagram_cache"}) or {}).get("data")
        return ok({"live": stale or {"connected": True, "posts": []},
                   "warning": f"Instagram did not answer: {e}"})


# ------------------------------------------------------------------ Instagram posts (typed by the admin)
def _read_post():
    data = request.get_json(silent=True) or {}
    title = clean(data.get("title"), 120)
    url = clean(data.get("url"), 300)
    posted_on = clean(data.get("posted_on"), 10)
    try:
        likes = max(0, int(data.get("likes") or 0))
        comments = max(0, int(data.get("comments") or 0))
    except (TypeError, ValueError):
        return None, "Likes and comments must be numbers."
    if len(title) < 2:
        return None, "Please give the post a short title."
    if url and not url.startswith("https://"):
        return None, "The post link must start with https://"
    return {"title": title, "url": url, "posted_on": posted_on,
            "likes": likes, "comments": comments}, None


@instagram_bp.post("/api/admin/instagram/posts")
@admin_required
def add_post():
    doc, problem = _read_post()
    if problem:
        return error(problem)
    doc.update({"created_at": now_utc(), "updated_at": now_utc(), "updated_by": g.admin["username"]})
    doc["_id"] = get_db().instagram_posts.insert_one(doc).inserted_id
    return ok({"post": _serialize_post(doc)}, message="Instagram post added.", status=201)


@instagram_bp.put("/api/admin/instagram/posts/<post_id>")
@admin_required
def update_post(post_id):
    oid = to_object_id(post_id)
    doc, problem = _read_post()
    if problem:
        return error(problem)
    doc.update({"updated_at": now_utc(), "updated_by": g.admin["username"]})
    if not oid or not get_db().instagram_posts.update_one({"_id": oid}, {"$set": doc}).matched_count:
        return error("Post not found.", 404)
    return ok(message="Instagram post updated.")


@instagram_bp.delete("/api/admin/instagram/posts/<post_id>")
@admin_required
def delete_post(post_id):
    oid = to_object_id(post_id)
    if not oid or not get_db().instagram_posts.delete_one({"_id": oid}).deleted_count:
        return error("Post not found.", 404)
    return ok(message="Instagram post deleted.")