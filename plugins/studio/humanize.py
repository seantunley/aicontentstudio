"""Humanizer pass (plan Principle 0: not 'AI slop').

Every AI-generated post runs through two layers before it reaches the approval gate:

  1. scrub(text) — a deterministic, social-safe pass that fixes the highest-signal
     mechanical tells (em/en dashes, curly quotes, double-hyphen dashes). Pure, cheap,
     no model call. Applied at the create_draft chokepoint, so it covers every path
     (Telegram conversation + dashboard worker). It does NOT touch emojis or hashtags —
     those are legitimate in social copy; judging them is the model pass's job.

  2. humanize_via_model(...) — a second-model rewrite that applies the full "Signs of
     AI writing" ruleset with social-media judgment. Runs via `hermes -z` (same pattern
     the worker already uses for vision auto-tagging), so it uses Hermes' own provider
     auth. Validates the result and falls back to the scrubbed original if the rewrite
     fails, comes back empty, or blows the platform character limit.

Ruleset distilled from Wikipedia's "Signs of AI writing" (the blader/humanizer skill).
"""
import re
import subprocess

# Curly quotes -> straight (safe everywhere).
_CURLY = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})
# Em/en dash (with surrounding spaces) and the double-hyphen dash -> comma, the humanizer's
# default for a tight aside. A few rare cases would read better as a period, but the model
# pass refines; this just guarantees the #1 tell never survives.
_SPACED_DASH = re.compile(r"\s*[—–]\s*|\s+--\s+")
# A dash glued to words (foo—bar) -> ", ".
_TIGHT_DASH = re.compile(r"[—–]")


def scrub(text):
    """Deterministic, social-safe mechanical de-slop. Returns cleaned text."""
    if not text:
        return text
    t = text.translate(_CURLY)
    t = _SPACED_DASH.sub(", ", t)
    t = _TIGHT_DASH.sub(", ", t)
    # tidy any doubled punctuation the substitutions might create
    t = re.sub(r",\s*,", ",", t)
    t = re.sub(r"\s+,", ",", t)
    return t.strip()


_PROMPT = (
    "You are an editor removing signs of AI-generated writing from a social media post, "
    "following Wikipedia's 'Signs of AI writing' guide. Rewrite the POST so it reads as if a "
    "sharp human wrote it. Remove these tells:\n"
    "- em/en dashes (use commas, periods, or restructure the sentence)\n"
    "- significance inflation ('a testament to', 'plays a vital/crucial role', 'marks a pivotal moment')\n"
    "- promotional fluff ('vibrant', 'rich', 'breathtaking', 'nestled', 'stands as')\n"
    "- copula avoidance (write 'is/are', not 'serves as/boasts/features')\n"
    "- rule-of-three lists and forced parallelism ('not just X, but Y')\n"
    "- trailing '-ing' filler clauses that add fake depth\n"
    "- AI vocabulary (delve, leverage, underscore, intricate, tapestry, landscape, foster)\n"
    "- vague hedging, filler phrases, and any chatbot tone ('let me know', 'I hope this helps')\n"
    "Keep the post's meaning and every fact intact. Keep the platform's natural voice, any hashtags, "
    "and genuinely-fitting emoji (this is social media, not an encyclopedia — do not strip emoji that belong). "
    "Use metric units. Do NOT add a preamble, explanation, or surrounding quotes. "
    "Output ONLY the rewritten post and nothing else. It MUST be {limit} characters or fewer.\n\n"
    "PLATFORM: {platform}\n\nPOST:\n{body}"
)


def _strip_wrapping(out):
    """Drop a leading 'Here is...' line and surrounding quotes the model sometimes adds."""
    out = (out or "").strip()
    if not out:
        return ""
    # if the whole thing is wrapped in matching quotes, unwrap once
    if len(out) >= 2 and out[0] in "\"'" and out[-1] == out[0]:
        out = out[1:-1].strip()
    return out


def humanize_via_model(body, platform, limit=None, timeout=120):
    """Rewrite one draft through the model. Returns the humanized text, or None to keep the original."""
    body = (body or "").strip()
    if not body:
        return None
    prompt = _PROMPT.format(platform=platform or "social", body=body, limit=limit or 2000)
    try:
        r = subprocess.run(["hermes", "-z", prompt], capture_output=True, text=True, timeout=timeout)
    except Exception:  # noqa: BLE001 — never let a humanize failure break the pipeline
        return None
    out = scrub(_strip_wrapping(r.stdout))
    if not out:
        return None
    if limit and len(out) > limit:
        return None  # an over-limit rewrite is worse than the original; keep the original
    return out
