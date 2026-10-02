"""
FEASTIFY - test_connection.py
Checks that backend/.env is correct and MongoDB Atlas is reachable.

    python test_connection.py
"""
from config import Config
from database import init_db

print("Connecting to MongoDB Atlas ...")
try:
    db = init_db()
except Exception as exc:
    print("\n[FAILED]", exc)
    print("\nCommon fixes:")
    print(" 1. Is MONGO_URI in backend/.env pasted completely (starts with mongodb+srv://)?")
    print(" 2. Did you replace <password> with your real database-user password?")
    print(" 3. Is your IP allowed in Atlas -> Network Access?")
    print(" 4. Special characters in the password (@ : / ?) must be URL-encoded, or use a simple password.")
    raise SystemExit(1)

print(f"[OK] Connected. Database: {Config.DB_NAME}")
print("Collections:", ", ".join(sorted(db.list_collection_names())) or "(none yet)")
for name in ("users", "admins", "bookings", "visits", "messages"):
    print(f"  {name:<9} {db[name].count_documents({})} document(s)")
