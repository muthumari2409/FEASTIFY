"""
FEASTIFY - utils/analytics.py
Builds every number and chart used by the admin dashboard and analytics
page directly from MongoDB. No numbers are invented.
"""
from datetime import date, timedelta, timezone

from config import Config
from database import get_db
from models.booking_model import TABLES, STATUSES
from utils.helpers import local_now, local_midnight, days_ago_utc

VISITOR_FILTER = {"is_admin": False}  # admins are never counted


def _counts(collection, field, match, start_utc, fmt):
    """Group documents by day ("%Y-%m-%d") or month ("%Y-%m") in the app's time zone."""
    pipeline = [
        {"$match": {**match, field: {"$gte": start_utc}}},
        {"$group": {
            "_id": {"$dateToString": {"format": fmt, "date": f"${field}", "timezone": Config.APP_TIMEZONE}},
            "count": {"$sum": 1},
        }},
    ]
    return {row["_id"]: row["count"] for row in collection.aggregate(pipeline)}


def _last_months(today, count=6):
    months, y, m = [], today.year, today.month
    for _ in range(count):
        months.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(months))


def build_analytics():
    db = get_db()
    now_l = local_now()
    today = now_l.date()
    midnight = local_midnight()

    # ---------- last 7 days ----------
    start7 = (midnight - timedelta(days=6)).astimezone(timezone.utc)
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    day_labels = [d.strftime("%a %d %b") for d in days]

    visits_by_day = _counts(db.visits, "visit_date", VISITOR_FILTER, start7, "%Y-%m-%d")
    daily_visits = [visits_by_day.get(d.isoformat(), 0) for d in days]

    bookings_by_day = _counts(db.bookings, "created_at", {}, start7, "%Y-%m-%d")
    daily_bookings = [bookings_by_day.get(d.isoformat(), 0) for d in days]

    regs_by_day = _counts(db.users, "created_at", {"role": "customer"}, start7, "%Y-%m-%d")
    daily_registrations = [regs_by_day.get(d.isoformat(), 0) for d in days]

    # ---------- last 8 weeks (weeks start on Monday) ----------
    this_monday = midnight - timedelta(days=midnight.weekday())
    first_monday = this_monday - timedelta(weeks=7)
    visits_8w = _counts(db.visits, "visit_date", VISITOR_FILTER,
                        first_monday.astimezone(timezone.utc), "%Y-%m-%d")
    week_labels, weekly_visits = [], []
    for w in range(8):
        week_start = (first_monday + timedelta(weeks=w)).date()
        week_labels.append(week_start.strftime("%d %b"))
        weekly_visits.append(sum(visits_8w.get((week_start + timedelta(days=i)).isoformat(), 0) for i in range(7)))

    # ---------- last 6 months ----------
    months = _last_months(today, 6)
    month_keys = [f"{y}-{m:02d}" for y, m in months]
    month_labels = [date(y, m, 1).strftime("%b %Y") for y, m in months]
    month_start_utc = midnight.replace(year=months[0][0], month=months[0][1], day=1).astimezone(timezone.utc)

    visits_by_month = _counts(db.visits, "visit_date", VISITOR_FILTER, month_start_utc, "%Y-%m")
    monthly_visits = [visits_by_month.get(k, 0) for k in month_keys]

    regs_by_month = _counts(db.users, "created_at", {"role": "customer"}, month_start_utc, "%Y-%m")
    monthly_registrations = [regs_by_month.get(k, 0) for k in month_keys]

    bookings_by_month = _counts(db.bookings, "created_at", {}, month_start_utc, "%Y-%m")
    monthly_bookings = [bookings_by_month.get(k, 0) for k in month_keys]

    # Total customers growth (cumulative)
    running = db.users.count_documents({"role": "customer", "created_at": {"$lt": month_start_utc}})
    customer_growth = []
    for n in monthly_registrations:
        running += n
        customer_growth.append(running)

    # ---------- reservations for the next 7 days (by reservation date) ----------
    next_days = [today + timedelta(days=i) for i in range(7)]
    upcoming_rows = db.bookings.aggregate([
        {"$match": {"date": {"$in": [d.isoformat() for d in next_days]}, "status": {"$ne": "Cancelled"}}},
        {"$group": {"_id": "$date", "count": {"$sum": 1}}},
    ])
    upcoming_map = {r["_id"]: r["count"] for r in upcoming_rows}

    # ---------- booking status ----------
    status_map = {r["_id"]: r["count"] for r in db.bookings.aggregate(
        [{"$group": {"_id": "$status", "count": {"$sum": 1}}}])}

    # ---------- table popularity & time slots ----------
    table_map = {r["_id"]: r["count"] for r in db.bookings.aggregate([
        {"$match": {"status": {"$ne": "Cancelled"}}},
        {"$group": {"_id": "$table_number", "count": {"$sum": 1}}},
    ])}
    slot_rows = list(db.bookings.aggregate([
        {"$match": {"status": {"$ne": "Cancelled"}}},
        {"$group": {"_id": "$time", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]))

    # ---------- summary cards ----------
    # ---------- food pre-orders: which dishes customers order most ----------
    # Lunch = time slots before 4 PM, dinner = 4 PM and later. Cancelled bookings are ignored.
    dish_rows = list(db.bookings.aggregate([
        {"$match": {"status": {"$ne": "Cancelled"}, "preorder_items.0": {"$exists": True}}},
        {"$unwind": "$preorder_items"},
        {"$group": {
            "_id": {"name": "$preorder_items.name",
                    "meal": {"$cond": [{"$lt": ["$time", "16:00"]}, "Lunch", "Dinner"]}},
            "qty": {"$sum": "$preorder_items.qty"},
            "revenue": {"$sum": "$preorder_items.subtotal"},
        }},
    ]))
    dishes = {}
    for row in dish_rows:
        d = dishes.setdefault(row["_id"]["name"], {"Lunch": 0, "Dinner": 0, "revenue": 0})
        d[row["_id"]["meal"]] += row["qty"]
        d["revenue"] += row["revenue"]
    top = sorted(dishes.items(), key=lambda kv: kv[1]["Lunch"] + kv[1]["Dinner"], reverse=True)[:10]
    top_lunch = max(dishes.items(), key=lambda kv: kv[1]["Lunch"], default=None)
    top_dinner = max(dishes.items(), key=lambda kv: kv[1]["Dinner"], default=None)
    food = {
        "labels": [name for name, _ in top],
        "lunch": [d["Lunch"] for _, d in top],
        "dinner": [d["Dinner"] for _, d in top],
        "table": [{"name": name, "lunch": d["Lunch"], "dinner": d["Dinner"],
                   "total": d["Lunch"] + d["Dinner"], "revenue": d["revenue"]} for name, d in top],
        "top_dish": top[0][0] if top else None,
        "top_lunch": top_lunch[0] if top_lunch and top_lunch[1]["Lunch"] else None,
        "top_dinner": top_dinner[0] if top_dinner and top_dinner[1]["Dinner"] else None,
        "dishes_ordered": sum(d["Lunch"] + d["Dinner"] for d in dishes.values()),
        "revenue": sum(d["revenue"] for d in dishes.values()),
        "preorder_bookings": db.bookings.count_documents(
            {"status": {"$ne": "Cancelled"}, "preorder_items.0": {"$exists": True}}),
    }
    today_s = today.isoformat()
    now_hm = now_l.strftime("%H:%M")
    summary = {
        "total_customers": db.users.count_documents({"role": "customer"}),
        "total_bookings": db.bookings.count_documents({}),
        "todays_bookings": db.bookings.count_documents({"date": today_s, "status": {"$ne": "Cancelled"}}),
        "upcoming_bookings": db.bookings.count_documents({
            "status": {"$in": ["Pending", "Confirmed"]},
            "$or": [{"date": {"$gt": today_s}}, {"date": today_s, "time": {"$gte": now_hm}}],
        }),
        "website_visitors": db.visits.count_documents(VISITOR_FILTER),
        "todays_visitors": daily_visits[-1],
        "active_customers": db.users.count_documents({"role": "customer", "last_visit": {"$gte": days_ago_utc(7)}}),
        "pending_bookings": status_map.get("Pending", 0),
        "guest_visits": db.visits.count_documents({**VISITOR_FILTER, "user_id": None}),
        "customer_visits": db.visits.count_documents({**VISITOR_FILTER, "user_id": {"$ne": None}}),
        "messages": db.messages.count_documents({}),
    }

    return {
        "generated_at": now_l.isoformat(),
        "summary": summary,
        "visits": {
            "daily": {"labels": day_labels, "data": daily_visits},
            "weekly": {"labels": week_labels, "data": weekly_visits},
            "monthly": {"labels": month_labels, "data": monthly_visits},
        },
        "bookings": {
            "daily": {"labels": day_labels, "data": daily_bookings},
            "monthly": {"labels": month_labels, "data": monthly_bookings},
            "upcoming": {"labels": [d.strftime("%a %d %b") for d in next_days],
                         "data": [upcoming_map.get(d.isoformat(), 0) for d in next_days]},
            "status": {"labels": STATUSES, "data": [status_map.get(s, 0) for s in STATUSES]},
            "tables": {"labels": [f"Table {n}" for n in TABLES],
                       "data": [table_map.get(n, 0) for n in TABLES]},
            "slots": {"labels": [r["_id"] for r in slot_rows], "data": [r["count"] for r in slot_rows]},
        },
        "customers": {
        "food": food,
            "growth": {"labels": month_labels, "data": customer_growth},
            "registrations_monthly": {"labels": month_labels, "data": monthly_registrations},
            "registrations_daily": {"labels": day_labels, "data": daily_registrations},
        },
    }
