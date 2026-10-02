"""
FEASTIFY - seed_admins.py
Creates (or resets) EXACTLY the two admin accounts in MongoDB.

Run once from the backend folder:
    python seed_admins.py

Usernames/passwords are read from backend/.env (ADMIN1_..., ADMIN2_...),
hashed with Werkzeug, and stored in the "admins" collection.
They are never written into any frontend file.
Any other admin record is removed, so only these two can log in.
"""
import os
import sys

from werkzeug.security import generate_password_hash

from config import Config  # noqa: F401  (loads .env)
from database import init_db
from utils.helpers import now_utc


def main():
    admins = []
    for i in (1, 2):
        username = os.getenv(f"ADMIN{i}_USERNAME", "").strip().lower()
        password = os.getenv(f"ADMIN{i}_PASSWORD", "")
        if not username or not password:
            print(f"[!] ADMIN{i}_USERNAME / ADMIN{i}_PASSWORD missing in backend/.env")
            sys.exit(1)
        admins.append((username, password))

    if admins[0][0] == admins[1][0]:
        print("[!] The two admin usernames must be different.")
        sys.exit(1)

    db = init_db()
    for username, password in admins:
        db.admins.update_one(
            {"username": username},
            {"$set": {"password_hash": generate_password_hash(password), "role": "admin"},
             "$setOnInsert": {"created_at": now_utc(), "last_login": None}},
            upsert=True,
        )
        print(f"[ok] admin account ready: {username}")

    removed = db.admins.delete_many({"username": {"$nin": [u for u, _ in admins]}})
    if removed.deleted_count:
        print(f"[ok] removed {removed.deleted_count} old admin account(s)")

    print(f"\nTotal admin accounts in database: {db.admins.count_documents({})}")
    print("You can now log in at http://127.0.0.1:5000/admin-login.html")


if __name__ == "__main__":
    main()
