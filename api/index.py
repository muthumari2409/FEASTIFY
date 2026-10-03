"""
FEASTIFY - api/index.py
Entry point for Vercel. It loads the same Flask app from the backend folder.
"""
import os
import sys

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402  (backend/app.py)

app = create_app()
