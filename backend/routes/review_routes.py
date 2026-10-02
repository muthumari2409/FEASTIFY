"""
FEASTIFY - routes/review_routes.py
Customer reviews: star rating (1-5) + comment.
- Anyone can READ reviews (only the ones not hidden by an admin).
- A logged-in customer can write ONE review (writing again updates it) and delete it.
- Admins can see every review, hide/show it, or delete it.
"""
from flask import Blueprint, request, g
from pymongo import ASCENDING, DESCENDING

from database import get_db
from utils.auth import customer_required, admin_required, current_customer
from utils.helpers import ok, error, now_utc, iso, to_object_id
from utils.validators import clean

reviews_bp = Blueprint("reviews", __name__)


@reviews_bp.record_once
def _create_indexes(_state):
    # One review per customer, newest first when listing
    db = get_db()
    db.reviews.create_index([("user_id", ASCENDING)], unique=True, name="uniq_review_user")
    db.reviews.create_index([("created_at", DESCENDING)], name="reviews_created")


def serialize_review(r, admin=False):
    data = {
        "id": str(r["_id"]),
        "name": r.get("name", ""),
        "rating": r.get("rating", 0),
        "comment": r.get("comment", ""),
        "created_at": iso(r.get("created_at")),
        "updated_at": iso(r.get("updated_at")),
    }
    if admin:
        data.update({"email": r.get("email", ""), "hidden": bool(r.get("hidden"))})
    return data


def _summary(db):
    rows = db.reviews.aggregate([
        {"$match": {"hidden": {"$ne": True}}},
        {"$group": {"_id": "$rating", "n": {"$sum": 1}}},
    ])
    stars = {str(i): 0 for i in range(1, 6)}
    for row in rows:
        stars[str(row["_id"])] = row["n"]
    count = sum(stars.values())
    total = sum(int(k) * v for k, v in stars.items())
    return {"count": count, "average": round(total / count, 1) if count else 0, "stars": stars}


# ------------------------------------------------------------------ public
@reviews_bp.get("/api/reviews")
def list_reviews():
    db = get_db()
    cursor = db.reviews.find({"hidden": {"$ne": True}}).sort("created_at", DESCENDING).limit(100)
    mine = None
    user = current_customer()
    if user:
        own = db.reviews.find_one({"user_id": user["_id"]})
        if own:
            mine = serialize_review(own)
            mine["hidden"] = bool(own.get("hidden"))
    return ok({"reviews": [serialize_review(r) for r in cursor], "summary": _summary(db), "mine": mine})


# ------------------------------------------------------------------ customer
@reviews_bp.post("/api/reviews")
@customer_required
def save_review():
    data = request.get_json(silent=True) or {}
    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        rating = 0
    comment = clean(data.get("comment"), 500)
    if not 1 <= rating <= 5:
        return error("Please choose a star rating from 1 to 5.")
    if len(comment) < 10:
        return error("Please write at least 10 characters about your visit.")

    user, now = g.user, now_utc()
    db = get_db()
    existed = db.reviews.find_one({"user_id": user["_id"]}, {"_id": 1})
    db.reviews.update_one(
        {"user_id": user["_id"]},
        {"$set": {"name": user["name"], "email": user["email"], "rating": rating,
                  "comment": comment, "updated_at": now},
         "$setOnInsert": {"user_id": user["_id"], "created_at": now, "hidden": False}},
        upsert=True,
    )
    review = db.reviews.find_one({"user_id": user["_id"]})
    return ok({"review": serialize_review(review)},
              message="Your review has been updated." if existed else "Thank you! Your review is now live.")


@reviews_bp.delete("/api/reviews/mine")
@customer_required
def delete_my_review():
    get_db().reviews.delete_one({"user_id": g.user["_id"]})
    return ok(message="Your review has been deleted.")


# ------------------------------------------------------------------ admin
@reviews_bp.get("/api/admin/reviews")
@admin_required
def admin_reviews():
    db = get_db()
    cursor = db.reviews.find().sort("created_at", DESCENDING).limit(500)
    reviews = [serialize_review(r, admin=True) for r in cursor]
    return ok({"reviews": reviews, "summary": _summary(db),
               "hidden_count": sum(1 for r in reviews if r["hidden"])})


@reviews_bp.put("/api/admin/reviews/<review_id>/visibility")
@admin_required
def admin_review_visibility(review_id):
    oid = to_object_id(review_id)
    hidden = bool((request.get_json(silent=True) or {}).get("hidden"))
    if not oid or not get_db().reviews.update_one(
            {"_id": oid}, {"$set": {"hidden": hidden, "moderated_by": g.admin["username"],
                                    "moderated_at": now_utc()}}).matched_count:
        return error("Review not found.", 404)
    return ok(message="Review hidden from the website." if hidden else "Review is visible on the website again.")


@reviews_bp.delete("/api/admin/reviews/<review_id>")
@admin_required
def admin_delete_review(review_id):
    oid = to_object_id(review_id)
    if not oid or not get_db().reviews.delete_one({"_id": oid}).deleted_count:
        return error("Review not found.", 404)
    return ok(message="Review deleted.")