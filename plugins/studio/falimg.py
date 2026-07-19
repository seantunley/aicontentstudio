#!/usr/bin/env python3
"""fal.ai reference-conditioned LAUNCH media — brand-accurate image + video.

Takes the brand's REAL product image(s) (captured in research) + Claude's art-direction and renders an
on-brand launch IMAGE via an image-EDIT model (nano-banana-2 by default), and — for video jobs — a
people-free hero animated by a premium video model (Veo 3 by default). The whole point: the REAL product,
not an invented one. Verified recipe 2026-06-16.

Standalone-safe (stdlib + ffmpeg + db for settings), so the worker calls it directly. Both models are
operator-settable in Settings → Media (fal_image_model / fal_video_model); env is the fallback. Never
raises — returns None so the caller falls back to the standard agent and the generator never breaks.
"""
import os
import json
import subprocess
import urllib.request

FAL_KEY = os.environ.get("FAL_KEY", "")
_DEFAULT_IMAGE = "fal-ai/nano-banana-2/edit"   # reference-edit; keeps the real product, adds the scene
_DEFAULT_VIDEO = "fal-ai/veo3/image-to-video"  # premium reveal; NB: Veo blocks animating people/minors


def _setting(key, default):
    try:
        import db
        v = db.get_setting(key)
        return (v or default).strip()
    except Exception:  # noqa: BLE001
        return default


def configured():
    return bool(FAL_KEY)


def image_model():
    return _setting("fal_image_model", os.environ.get("FAL_EDIT_MODEL") or _DEFAULT_IMAGE)


def video_model():
    return _setting("fal_video_model", os.environ.get("FAL_VIDEO_MODEL") or _DEFAULT_VIDEO)


def _post(model, payload, timeout):
    req = urllib.request.Request(f"https://fal.run/{model}", data=json.dumps(payload).encode(),
                                 headers={"Authorization": f"Key {FAL_KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _download(url, out_path, timeout=180):
    with urllib.request.urlopen(url, timeout=timeout) as r, open(out_path, "wb") as f:
        f.write(r.read())
    return out_path if os.path.exists(out_path) and os.path.getsize(out_path) > 1000 else None


def _img_prompt(art_direction, people=True):
    # Brand-NEUTRAL by default — the subject can be a product, a place, a person or a scene. The brand's
    # look comes from `art_direction` (its palette/mood/art-direction + the post's brief), never hardcoded.
    p = ("Use the attached photo(s) as the reference. Create a striking, editorial hero image. "
         "Keep whatever real subject the reference shows FAITHFUL to it — same form, colour, materials, "
         "proportions and details; do NOT restyle or add/remove parts. It is the hero, well lit and "
         "razor sharp. ")
    if people:
        p += ("Include natural, CANDID people — genuinely engaged, not posing; realistic and well-proportioned "
              "faces and hands, no arms-raised-to-the-sky clichés. ")
    else:
        p += "NO people and no figures at all — the subject is the sole star. "
    p += "Polished, premium, photorealistic, sharp, high resolution."
    if art_direction:
        p += f" ART DIRECTION FOR THIS POST: {art_direction}"
    return p


def edit_image(reference_urls, art_direction, out_path, people=True, timeout=240):
    """Reference-edit (nano-banana-2): real product photo(s) + art-direction -> on-brand launch image.
    Returns (public_url, local_path) or (None, None)."""
    refs = [u for u in (reference_urls or []) if str(u).startswith("http")][:14]
    if not (FAL_KEY and refs):
        return None, None
    try:
        d = _post(image_model(), {"prompt": _img_prompt(art_direction, people), "image_urls": refs, "resolution": "2K"}, timeout)
        url = ((d.get("images") or [{}])[0] or {}).get("url") or (d.get("image") or {}).get("url")
        if not url:
            return None, None
        return url, _download(url, out_path)
    except Exception:  # noqa: BLE001
        return None, None


def animate(image_url, out_path, motion="", timeout=560):
    """Animate a (people-free) hero image into a short reveal via the video model (Veo 3). image_url must be
    a public URL; `motion` carries the brand/post art-direction so the movement fits the brand (defaults to a
    neutral, tasteful reveal — NOT hardcoded to any one product category). Returns local_path or None."""
    if not (FAL_KEY and image_url):
        return None
    prompt = ("Cinematic reveal with gentle, tasteful motion — a slow camera push-in or subtle parallax drift, "
              "soft light and a hint of drifting atmosphere; premium, polished and photoreal. The subject stays "
              "exactly as shown, unchanged.")
    if motion:
        prompt += f" ART DIRECTION: {motion}"
    try:
        d = _post(video_model(), {"image_url": image_url, "prompt": prompt, "generate_audio": True}, timeout)
        url = (d.get("video") or (d.get("videos") or [{}])[0] or {}).get("url")
        return _download(url, out_path) if url else None
    except Exception:  # noqa: BLE001
        return None


def derive(master_path, tw, th):
    """ffmpeg center-crop + scale to a platform size (mirrors tools._derive_image). Returns the path."""
    out = f"{os.path.splitext(master_path)[0]}_{tw}x{th}.jpg"
    vf = f"crop=w='min(iw,ih*{tw}/{th})':h='min(ih,iw*{th}/{tw})',scale={tw}:{th}"
    subprocess.run(["ffmpeg", "-y", "-i", master_path, "-vf", vf, "-q:v", "3", out],
                   check=True, capture_output=True, timeout=60)
    return out
