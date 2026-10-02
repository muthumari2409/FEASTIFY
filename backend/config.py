"""
FEASTIFY - config.py
Reads all settings from backend/.env so no secret is ever written in code.
"""
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


class Config:
    # MongoDB Atlas
    MONGO_URI = os.getenv("MONGO_URI", "").strip()
    DB_NAME = os.getenv("DB_NAME", "feastify").strip() or "feastify"

    # Security
    SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
    JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "24"))
    # Set to true only when the site runs on HTTPS (for example after deployment)
    COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

    # Time zone used for "today", daily charts, etc.
    APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Kolkata").strip() or "Asia/Kolkata"

    # Where the HTML/CSS/JS files live (served by Flask)
    FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

    # Which websites may call the API (Flask serves the frontend itself, so this is mostly a safety net)
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://127.0.0.1:5000,http://localhost:5000"
        ).split(",")
        if origin.strip()
    ]

    # A visitor who is inactive for this many minutes starts a new visit
    VISIT_TIMEOUT_MINUTES = 30

    PORT = int(os.getenv("PORT", "5000"))
