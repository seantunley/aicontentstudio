"""Minimal Postiz public-API client (Phase 1).

The studio is a Postiz API *client*: it hands approved drafts to Postiz, which holds the
platform OAuth tokens and does the actual posting (§2c). Auth is `Authorization: <api-key>`
(no Bearer prefix). Stdlib-only so the plugin stays dependency-free.
"""
import os
import json
import time
import datetime
import urllib.request
import urllib.error

API_URL = os.environ.get("POSTIZ_API_URL", "http://localhost:4007/api/public/v1").rstrip("/")
API_KEY = os.environ.get("POSTIZ_API_KEY", "")


class PostizError(Exception):
    pass


RETRY_STATUS = {429, 500, 502, 503, 504}


def _request(method, path, body=None, retry=False):
    if not API_KEY:
        raise PostizError("POSTIZ_API_KEY is not configured")
    data = json.dumps(body).encode() if body is not None else None
    attempts = 3 if retry else 1  # §9b: retry transient failures with backoff (0.5s, 1s)
    last = None
    for i in range(attempts):
        if i:
            time.sleep(0.5 * (2 ** (i - 1)))
        req = urllib.request.Request(f"{API_URL}{path}", data=data, method=method)
        req.add_header("Authorization", API_KEY)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            if e.code in RETRY_STATUS:
                last = PostizError(f"Postiz API HTTP {e.code}")
                continue
            raise PostizError(f"Postiz API HTTP {e.code}: {e.read().decode()[:200]}")
        except urllib.error.URLError as e:
            last = PostizError(f"Postiz unreachable at {API_URL}: {e.reason}")
            continue
    raise last


def list_integrations():
    return _request("GET", "/integrations")


def find_integration(platform):
    """Return the first enabled connected channel for `platform` (e.g. 'bluesky'), or None."""
    for ig in list_integrations():
        if ig.get("identifier") == platform and not ig.get("disabled"):
            return ig
    return None


def _upload_file(path, timeout, what="media"):
    """Upload a local file to Postiz with retry/backoff on transient failures (§9b)."""
    import requests
    if not API_KEY:
        raise PostizError("POSTIZ_API_KEY is not configured")
    last = None
    for i in range(3):
        if i:
            time.sleep(0.5 * (2 ** (i - 1)))
        try:
            with open(path, "rb") as f:
                r = requests.post(f"{API_URL}/upload", headers={"Authorization": API_KEY},
                                  files={"file": f}, timeout=timeout)
        except OSError as e:
            raise PostizError(f"cannot read {what} {path}: {e}")  # not transient — don't retry
        except requests.RequestException as e:
            last = PostizError(f"Postiz upload error: {e}")
            continue
        if r.status_code < 300:
            return r.json()
        if r.status_code in RETRY_STATUS:
            last = PostizError(f"Postiz {what} upload HTTP {r.status_code}")
            continue
        raise PostizError(f"Postiz {what} upload HTTP {r.status_code}: {r.text[:200]}")
    raise last


def upload_image(path):
    """Upload a local image file to Postiz. Returns the media object {id, path, ...}."""
    return _upload_file(path, 60, "image")


def upload_video(path):
    """Upload a local video file to Postiz (same /upload endpoint; longer timeout)."""
    return _upload_file(path, 180, "video")


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
    return _request("POST", "/posts", build_post(integration_id, content, platform, when, image, video), retry=True)
