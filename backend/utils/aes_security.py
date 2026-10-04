"""
FEASTIFY - utils/aes_security.py
AES-256-GCM encryption for customer personal data (phone numbers).

- encrypt_data("9367562490")  ->  "enc:kX9a2LmQ7vPz..."   (stored in MongoDB)
- decrypt_data("enc:kX9a...") ->  "9367562490"           (shown to the admin)

The 256-bit secret key lives ONLY on the server (AES_KEY in backend/.env and in
Vercel Environment Variables), never in the database or in GitHub.
"""
import os
import base64

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "enc:"   # marks values that are encrypted


def _key():
    key_b64 = os.environ.get("AES_KEY", "")
    if not key_b64:
        raise RuntimeError("AES_KEY is missing. Add it to backend/.env (and to Vercel).")
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise RuntimeError("AES_KEY must be a 32-byte (256-bit) key in base64.")
    return key


def encrypt_data(text):
    """Plain text -> 'enc:' + base64(nonce + ciphertext + tag)."""
    if not text or str(text).startswith(PREFIX):
        return text
    nonce = os.urandom(12)                                   # new random nonce every time
    cipher = AESGCM(_key()).encrypt(nonce, str(text).encode(), None)
    return PREFIX + base64.b64encode(nonce + cipher).decode()


def decrypt_data(value):
    """'enc:...' -> plain text. Old (unencrypted) values are returned unchanged."""
    if not value or not str(value).startswith(PREFIX):
        return value
    try:
        raw = base64.b64decode(value[len(PREFIX):])
        return AESGCM(_key()).decrypt(raw[:12], raw[12:], None).decode()
    except Exception:
        return "[cannot decrypt]"