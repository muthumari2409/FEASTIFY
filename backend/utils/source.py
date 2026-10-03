"""
FEASTIFY - utils/source.py
Where did this visitor come from? (instagram, whatsapp, ... or direct)
The browser remembers the source from the link they clicked
(e.g. https://your-site/?from=instagram) and sends it in the
"X-Feastify-Source" header with every API request.
"""
import re

from flask import request

_SAFE = re.compile(r"^[a-z0-9_-]{1,30}$")


def request_source():
    value = (request.headers.get("X-Feastify-Source") or "").strip().lower()
    return value if _SAFE.match(value) else "direct"