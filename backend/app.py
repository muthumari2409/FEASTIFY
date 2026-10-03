"""
FEASTIFY - app.py
Start the whole project with:   python app.py
Then open:                       http://127.0.0.1:5000

Flask serves BOTH the website (frontend folder) and the REST API (/api/...).
"""
import os
import sys

from flask import Flask, send_from_directory, redirect, request, jsonify
from flask_cors import CORS

from config import Config
from database import init_db
from routes.admin_routes import admin_bp
from routes.auth_routes import auth_bp
from routes.booking_routes import bookings_bp
from routes.public_routes import public_bp
from routes.review_routes import reviews_bp
from routes.instagram_routes import instagram_bp
from routes.visit_routes import visits_bp
from utils.auth import current_admin

# Admin pages that require a valid admin cookie BEFORE the HTML is even sent
PROTECTED_ADMIN_PAGES = {
    "admin-dashboard.html",
    "admin-bookings.html",
    "admin-customers.html",
    "admin-analytics.html",
    "admin-reviews.html",
    "admin-instagram.html",
}


def create_app():
    if not Config.SECRET_KEY or Config.SECRET_KEY.startswith("change-this"):
        raise RuntimeError("SECRET_KEY is missing in backend/.env. Put a long random value there.")

    app = Flask(__name__, static_folder=None)
    app.config["SECRET_KEY"] = Config.SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024  # 1 MB request limit

    CORS(app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}}, supports_credentials=True)

    init_db()

    for bp in (public_bp, auth_bp, bookings_bp, visits_bp, admin_bp, reviews_bp, instagram_bp):
        app.register_blueprint(bp)

    # ------------------------------------------------ frontend pages
    @app.get("/")
    def home():
        return send_from_directory(Config.FRONTEND_DIR, "index.html")

    @app.get("/admin")
    @app.get("/admin.html")
    def admin_shortcut():
        return redirect("/admin-dashboard.html")

    @app.get("/<path:filename>")
    def frontend_files(filename):
        if filename.startswith("api/"):
            return jsonify({"success": False, "message": "API endpoint not found."}), 404
        if filename in PROTECTED_ADMIN_PAGES and not current_admin():
            # Customers and guests never receive admin HTML
            return redirect("/admin-login.html?error=unauthorized")
        full_path = os.path.join(Config.FRONTEND_DIR, filename)
        if not os.path.isfile(full_path):
            if filename.endswith(".html"):
                return redirect("/")
            return ("Not found", 404)
        return send_from_directory(Config.FRONTEND_DIR, filename)

    @app.after_request
    def no_cache_html(response):
        # Stops the browser "Back" button from showing admin pages after logout
        if response.mimetype == "text/html" or request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        return response

    # ------------------------------------------------ JSON errors for the API
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"success": False, "message": "Not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return jsonify({"success": False, "message": "Method not allowed."}), 405

    @app.errorhandler(413)
    def too_large(_e):
        return jsonify({"success": False, "message": "Request is too large."}), 413

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"success": False, "message": "Something went wrong on the server. Check the terminal."}), 500

    return app


if __name__ == "__main__":
    try:
        app = create_app()
    except Exception as exc:  # friendly start-up message for beginners
        print("\n[FEASTIFY] Could not start the server:")
        print("   ", exc)
        print("    Check backend/.env (MONGO_URI, SECRET_KEY) and your internet connection.")
        print("    Tip: run  python test_connection.py  to test MongoDB on its own.\n")
        sys.exit(1)

    print("\n" + "=" * 56)
    print("  FEASTIFY is running  ->  http://127.0.0.1:%d" % Config.PORT)
    print("  Admin login          ->  http://127.0.0.1:%d/admin-login.html" % Config.PORT)
    try:
        from database import get_db
        if get_db().admins.count_documents({}) == 0:
            print("  [!] No admin accounts yet. Stop the server and run: python seed_admins.py")
    except Exception:
        pass
    print("  Press CTRL+C to stop")
    print("=" * 56 + "\n")
    app.run(host="127.0.0.1", port=Config.PORT, debug=True)