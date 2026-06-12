"""Minimal Postiz public-API client (Phase 1).

The studio is a Postiz API *client*: it hands approved drafts to Postiz, which holds the
platform OAuth tokens and does the actual posting (§2c). Auth is `Authorization: <api-key>`
(no Bearer prefix). Stdlib-only so the plugin stays dependency-free.
"""
import os
import json
import datetime
import urllib.request
import urllib.error

API_URL = os.environ.get("POSTIZ_API_URL", "http://localhost:4007/api/public/v1").rstrip("/")
API_KEY = os.environ.get("POSTIZ_API_KEY", "")


class PostizError(Exception):
    pass


def _request(method, path, body=None):
    if not API_KEY:
        raise PostizError("POSTIZ_API_KEY is not configured")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API_URL}{path}", data=data, method=method)
    req.add_header("Authorization", API_KEY)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise PostizError(f"Postiz API HTTP {e.code}: {e.read().decode()[:200]}")
    except urllib.error.URLError as e:
        raise PostizError(f"Postiz unreachable at {API_URL}: {e.reason}")


def list_integrations():
    return _request("GET", "/integrations")


def find_integration(platform):
    """Return the first enabled connected channel for `platform` (e.g. 'bluesky'), or None."""
    for ig in list_integrations():
        if ig.get("identifier") == platform and not ig.get("disabled"):
            return ig
    return None


def upload_image(path):
    """Upload a local image file to Postiz. Returns the media object {id, path, ...}."""
    import requests
    if not API_KEY:
        raise PostizError("POSTIZ_API_KEY is not configured")
    try:
        with open(path, "rb") as f:
            r = requests.post(f"{API_URL}/upload", headers={"Authorization": API_KEY},
                              files={"file": f}, timeout=60)
    except OSError as e:
        raise PostizError(f"cannot read image {path}: {e}")
    if r.status_code >= 300:
        raise PostizError(f"Postiz upload HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def upload_video(path):
    """Upload a local video file to Postiz (same /upload endpoint; longer timeout)."""
    import requests
    if not API_KEY:
        raise PostizError("POSTIZ_API_KEY is not configured")
    try:
        with open(path, "rb") as f:
            r = requests.post(f"{API_URL}/upload", headers={"Authorization": API_KEY},
                              files={"file": f}, timeout=180)
    except OSError as e:
        raise PostizError(f"cannot read video {path}: {e}")
    if r.status_code >= 300:
        raise PostizError(f"Postiz video upload HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def build_post(integration_id, content, platform, when="now", image=None, video=None):
    """Construct the POST /posts payload (also used to preview in dry-run). `image`/`video` are
    Postiz media objects {id, path}. Postiz carries both in the same per-post media array; when a
    video is present it takes precedence (a post is video OR image, not both)."""
    media = video or image
    images = [{"id": media["id"], "path": media["path"]}] if media else []
    return {
        "type": when,                       # "now" (immediate) or "schedule"
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "shortLink": False,
        "tags": [],
        "posts": [{
            "integration": {"id": integration_id},
            "value": [{"content": content, "image": images}],
            "settings": {"__type": platform},
        }],
    }


def create_post(integration_id, content, platform, when="now", image=None, video=None):
    return _request("POST", "/posts", build_post(integration_id, content, platform, when, image, video))
