"""
FEASTIFY - database.py
Connects to MongoDB Atlas and creates the indexes the app depends on.
The database "feastify" and its collections are created automatically
the first time an index or a document is written.
"""
import certifi
from pymongo import MongoClient, ASCENDING, DESCENDING

from config import Config

_client = None
_db = None


def init_db():
    """Connect to MongoDB, verify the connection and create indexes."""
    global _client, _db

    if not Config.MONGO_URI or "<" in Config.MONGO_URI:
        raise RuntimeError(
            "MONGO_URI is not set. Open backend/.env and paste your MongoDB Atlas "
            "connection string (see README.md, Step 6)."
        )

    options = {"serverSelectionTimeoutMS": 10000, "tz_aware": True}
    if Config.MONGO_URI.startswith("mongodb+srv://"):
        # Uses a trusted certificate bundle - avoids SSL errors on some Windows/Mac setups
        options["tlsCAFile"] = certifi.where()

    _client = MongoClient(Config.MONGO_URI, **options)
    _client.admin.command("ping")  # raises an error if Atlas cannot be reached
    _db = _client[Config.DB_NAME]
    create_indexes(_db)
    return _db


def get_db():
    if _db is None:
        raise RuntimeError("Database is not initialised. Call init_db() first.")
    return _db


def create_indexes(db):
    # users: one account per email
    db.users.create_index([("email", ASCENDING)], unique=True, name="uniq_user_email")
    db.users.create_index([("created_at", DESCENDING)], name="users_created")

    # admins: one record per username
    db.admins.create_index([("username", ASCENDING)], unique=True, name="uniq_admin_username")

    # bookings: THE duplicate-booking guard.
    # Only one ACTIVE booking may exist for the same table + date + time.
    # Cancelled bookings have active=False, so they free the slot again.
    # Because MongoDB enforces this, two customers clicking "Book" at the same
    # moment cannot both succeed - the second insert fails with DuplicateKeyError.
    db.bookings.create_index(
        [("table_number", ASCENDING), ("date", ASCENDING), ("time", ASCENDING)],
        unique=True,
        partialFilterExpression={"active": True},
        name="uniq_active_table_slot",
    )
    db.bookings.create_index([("user_id", ASCENDING), ("date", DESCENDING)], name="bookings_by_user")
    db.bookings.create_index([("created_at", DESCENDING)], name="bookings_created")

    # visits: one document per browser session
    db.visits.create_index([("session_id", ASCENDING)], unique=True, name="uniq_visit_session")
    db.visits.create_index([("visit_date", DESCENDING)], name="visits_date")
    db.visits.create_index([("user_id", ASCENDING)], name="visits_user")

    # contact form messages
    db.messages.create_index([("created_at", DESCENDING)], name="messages_created")
