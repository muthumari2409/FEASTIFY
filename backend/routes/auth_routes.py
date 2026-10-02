"""
FEASTIFY - routes/auth_routes.py
Customer register / login / logout / current user / profile update.
"""
from flask import Blueprint, request, jsonify, g
from pymongo.errors import DuplicateKeyError
from werkzeug.security import generate_password_hash, check_password_hash

from database import get_db
from models.user_model import new_user_doc, serialize_user
from utils.auth import (create_token, set_auth_cookie, clear_auth_cookie,
                        current_customer, customer_required, CUSTOMER_COOKIE)
from utils.helpers import error, ok, now_utc
from utils.validators import (clean, normalise_phone, valid_email, valid_phone,
                              valid_name, password_problem)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _login_response(user, message, status=200):
    token = create_token(user["_id"], "customer", user["name"])
    response = jsonify({"success": True, "message": message, "user": serialize_user(user)})
    response.status_code = status
    return set_auth_cookie(response, CUSTOMER_COOKIE, token)


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = clean(data.get("name"), 50)
    email = clean(data.get("email"), 120).lower()
    phone = normalise_phone(clean(data.get("phone"), 25))
    password = str(data.get("password") or "")
    confirm = str(data.get("confirm_password") or "")

    if not valid_name(name):
        return error("Please enter your full name (2-50 characters).")
    if not valid_email(email):
        return error("Please enter a valid email address.")
    if not valid_phone(phone):
        return error("Please enter a valid phone number (10-15 digits).")
    problem = password_problem(password)
    if problem:
        return error(problem)
    if password != confirm:
        return error("Passwords do not match.")

    db = get_db()
    if db.users.find_one({"email": email}):
        return error("An account with this email already exists. Please log in.", 409)

    doc = new_user_doc(name, email, phone, generate_password_hash(password))
    doc["last_login"] = now_utc()
    try:
        doc["_id"] = db.users.insert_one(doc).inserted_id
    except DuplicateKeyError:
        return error("An account with this email already exists. Please log in.", 409)

    return _login_response(doc, "Account created. Welcome to Feastify!", 201)


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = clean(data.get("email"), 120).lower()
    password = str(data.get("password") or "")
    if not email or not password:
        return error("Please enter your email and password.")

    db = get_db()
    user = db.users.find_one({"email": email, "role": "customer"})
    if not user or not check_password_hash(user["password_hash"], password):
        return error("Incorrect email or password.", 401)

    db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": now_utc()}})
    return _login_response(user, f"Welcome back, {user['name']}!")


@auth_bp.get("/me")
def me():
    """Tells the frontend who is logged in. Always 200 so pages load without console errors."""
    user = current_customer()
    if not user:
        return jsonify({"success": True, "authenticated": False, "user": None})
    return jsonify({"success": True, "authenticated": True, "user": serialize_user(user)})


@auth_bp.post("/logout")
def logout():
    response = jsonify({"success": True, "message": "You have been logged out."})
    return clear_auth_cookie(response, CUSTOMER_COOKIE)


@auth_bp.put("/profile")
@customer_required
def update_profile():
    data = request.get_json(silent=True) or {}
    name = clean(data.get("name"), 50)
    phone = normalise_phone(clean(data.get("phone"), 25))
    if not valid_name(name):
        return error("Please enter your full name (2-50 characters).")
    if not valid_phone(phone):
        return error("Please enter a valid phone number (10-15 digits).")

    db = get_db()
    db.users.update_one({"_id": g.user["_id"]}, {"$set": {"name": name, "phone": phone}})
    user = db.users.find_one({"_id": g.user["_id"]})
    return _login_response(user, "Profile updated.")


@auth_bp.put("/password")
@customer_required
def change_password():
    data = request.get_json(silent=True) or {}
    current = str(data.get("current_password") or "")
    new = str(data.get("new_password") or "")
    confirm = str(data.get("confirm_password") or "")
    if not check_password_hash(g.user["password_hash"], current):
        return error("Your current password is incorrect.", 400)
    problem = password_problem(new)
    if problem:
        return error(problem)
    if new != confirm:
        return error("New passwords do not match.")
    get_db().users.update_one({"_id": g.user["_id"]},
                              {"$set": {"password_hash": generate_password_hash(new)}})
    return ok(message="Password changed.")
