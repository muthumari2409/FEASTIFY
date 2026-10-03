"""
FEASTIFY - utils/instagram_api.py
Reads YOUR Instagram account's posts (likes, comments, views, reach) using
Meta's official "Instagram API with Instagram Login".

Needs:
  * the Instagram account switched to a Professional (Creator/Business) account
  * an access token in the INSTAGRAM_ACCESS_TOKEN environment variable
    (backend/.env on your laptop, and Vercel -> Settings -> Environment Variables)

Results are cached in MongoDB for 10 minutes so Instagram is not called on
every page refresh. Tokens last 60 days; this file refreshes the token
automatically once a week and keeps the newest one in MongoDB.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta, timezone

from database import get_db
from utils.helpers import now_utc

API = "https://graph.instagram.com"
CACHE_MINUTES = 10
MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count"


class InstagramError(Exception):
    pass


def _get(path, params):
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    try:
        with urllib.request.urlopen(url, timeout=8) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error", {}).get("message", str(e))
        except Exception:  # noqa: BLE001
            msg = str(e)
        raise InstagramError(msg) from None
    except Exception as e:  # noqa: BLE001  (network problems)
        raise InstagramError(f"Could not reach Instagram: {e}") from None


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def _token():
    """Newest token: the one refreshed into MongoDB, else the environment variable."""
    saved = get_db().settings.find_one({"_id": "instagram"}) or {}
    return saved.get("token") or os.getenv("INSTAGRAM_ACCESS_TOKEN", "").strip(), saved


def _refresh_if_due(token, saved):
    last = _aware(saved.get("refreshed_at"))
    if last and now_utc() - last < timedelta(days=7):
        return
    try:
        data = _get("refresh_access_token", {"grant_type": "ig_refresh_token", "access_token": token})
        if data.get("access_token"):
            get_db().settings.update_one({"_id": "instagram"},
                                         {"$set": {"token": data["access_token"], "refreshed_at": now_utc()}},
                                         upsert=True)
    except InstagramError:
        pass  # a fresh token (under 24 hours old) cannot be refreshed yet; try again later


def _insights(media_id, token):
    """views + reach for one post. Older or unsupported posts simply return zeros."""
    out = {"views": 0, "reach": 0}
    for metric in ("views", "reach"):
        try:
            data = _get(f"{media_id}/insights", {"metric": metric, "access_token": token})
            out[metric] = data["data"][0]["values"][0]["value"]
        except (InstagramError, KeyError, IndexError):
            pass
    return out


def fetch_instagram(force=False):
    """Account + latest posts. Returns {"connected": False} when no token is set."""
    token, saved = _token()
    if not token:
        return {"connected": False}

    db = get_db()
    cache = db.settings.find_one({"_id": "instagram_cache"})
    fresh_until = _aware(cache.get("fetched_at")) + timedelta(minutes=CACHE_MINUTES) if cache else None
    if cache and not force and fresh_until > now_utc():
        return cache["data"]

    account = _get("me", {"fields": "username,followers_count,follows_count,media_count",
                          "access_token": token})
    media = _get("me/media", {"fields": MEDIA_FIELDS, "limit": 25, "access_token": token}).get("data", [])
    posts = []
    for m in media:
        stats = _insights(m["id"], token)
        posts.append({
            "id": m["id"],
            "caption": (m.get("caption") or "")[:140],
            "type": m.get("media_type", ""),
            "image": m.get("thumbnail_url") or m.get("media_url") or "",
            "permalink": m.get("permalink", ""),
            "timestamp": m.get("timestamp", ""),
            "likes": m.get("like_count", 0),
            "comments": m.get("comments_count", 0),
            "views": stats["views"],
            "reach": stats["reach"],
        })

    data = {
        "connected": True,
        "account": {
            "username": account.get("username", ""),
            "followers": account.get("followers_count", 0),
            "following": account.get("follows_count", 0),
            "posts": account.get("media_count", 0),
        },
        "totals": {k: sum(p[k] for p in posts) for k in ("likes", "comments", "views", "reach")},
        "posts": posts,
        "fetched_at": now_utc().isoformat(),
    }
    db.settings.update_one({"_id": "instagram_cache"},
                           {"$set": {"data": data, "fetched_at": now_utc()}}, upsert=True)
    _refresh_if_due(token, saved)
    return data