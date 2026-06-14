"""Platform capability registry + validation (inspired by an external spec review).

Replaces scattered per-platform knowledge (char limits in db.PLATFORM_LIMITS, sizes in
db.PLATFORM_IMAGE, prose in SOUL.md) with ONE structured source the studio can validate against
before the gate. Values are sensible June-2026 defaults — edit here, not in UI/agent code.
"""

# Per-platform rules. caption_max mirrors db.PLATFORM_LIMITS; media_max is the carousel/album ceiling.
PLATFORM_RULES = {
    "instagram": {"caption_max": 2200, "media_max": 10, "carousel": True, "video": True, "alt_text": True, "hashtags": True},
    "facebook": {"caption_max": 63206, "media_max": 10, "carousel": True, "video": True, "alt_text": True, "hashtags": True},
    "x": {"caption_max": 280, "media_max": 4, "carousel": True, "video": True, "alt_text": True, "hashtags": True},
    "bluesky": {"caption_max": 300, "media_max": 4, "carousel": True, "video": True, "alt_text": True, "hashtags": True},
    "linkedin": {"caption_max": 3000, "media_max": 20, "carousel": True, "video": True, "alt_text": True, "hashtags": True},
    "telegram": {"caption_max": 4096, "media_max": 10, "carousel": True, "video": True, "alt_text": False, "hashtags": False},
    "vk": {"caption_max": 16000, "media_max": 10, "carousel": True, "video": True, "alt_text": False, "hashtags": True},
    "youtube": {"caption_max": 5000, "media_max": 1, "carousel": False, "video": True, "alt_text": False, "hashtags": True},
    "tiktok": {"caption_max": 2200, "media_max": 35, "carousel": True, "video": True, "alt_text": False, "hashtags": True},
}


def _images(draft):
    import json
    try:
        arr = json.loads(draft.get("images_json") or "null") or []
    except Exception:  # noqa: BLE001
        arr = []
    if not arr and draft.get("image_path"):
        arr = [{"path": draft["image_path"]}]
    return arr


def content_type(draft):
    """Derive the content type from what's attached to the draft."""
    if draft.get("video_path"):
        return "video"
    n = len(_images(draft))
    if n > 1:
        return "carousel"
    if n == 1:
        return "image"
    return "text"


def validate_draft(draft):
    """Check a draft against its platform's rules. Returns a list of
    {level: info|warning|error, code, message}. Empty list = clean."""
    plat = (draft.get("platform") or "").lower()
    rules = PLATFORM_RULES.get(plat)
    msgs = []
    if not rules:
        return msgs  # unknown platform — nothing to assert
    ctype = content_type(draft)
    imgs = _images(draft)
    body = draft.get("body") or ""

    if rules.get("caption_max") and len(body) > rules["caption_max"]:
        msgs.append({"level": "error", "code": "caption_too_long",
                     "message": f"Caption is {len(body)} chars; {plat} allows {rules['caption_max']}."})

    if ctype == "carousel":
        if not rules.get("carousel"):
            msgs.append({"level": "error", "code": "carousel_unsupported",
                         "message": f"{plat} doesn't support multi-image carousels — use a single image or video."})
        elif len(imgs) > rules.get("media_max", 10):
            msgs.append({"level": "error", "code": "too_many_slides",
                         "message": f"{len(imgs)} slides; {plat} allows at most {rules['media_max']}."})
    elif ctype == "image" and rules.get("media_max", 1) < 1:
        msgs.append({"level": "error", "code": "image_unsupported", "message": f"{plat} doesn't accept a still image here."})

    if ctype == "video" and not rules.get("video"):
        msgs.append({"level": "error", "code": "video_unsupported", "message": f"{plat} doesn't accept video in this format."})

    # alt text is an accessibility win + a real field on supporting platforms; nudge, don't block.
    if ctype in ("image", "carousel") and rules.get("alt_text") and not draft.get("alt_text"):
        msgs.append({"level": "info", "code": "alt_text_missing",
                     "message": f"No alt text — {plat} supports it (accessibility + reach)."})

    return msgs
