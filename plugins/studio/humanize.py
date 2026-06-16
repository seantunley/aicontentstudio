"""Post-polish pipeline (plan Principle 0: not 'AI slop', plus persuasion that respects §6a).

Every AI-generated post is polished before it reaches the approval gate:

  Layer 1 — scrub(text): deterministic, social-safe mechanical de-slop (em/en dashes,
  curly quotes). Pure, cheap, no model call. Applied at the create_draft chokepoint so it
  covers every path. Leaves emoji/hashtags alone (legitimate in social copy).

  Layer 2 — polish(body, platform, limit, brand): two second-model passes, in order:
    1. marketing psychology — apply persuasion principles (AIDA, outcome-framing, a clear
       CTA), constrained by ethical/brand-safety rules.
    2. humanize — strip AI-writing tells, so the humanizer always gets the last word.
  Each pass records {skill, before, after, notes} for the dashboard's preview pills. Both
  run via `hermes -z` (same pattern the worker uses for vision auto-tagging), so they use
  Hermes' own provider auth. A pass that fails, returns empty, or blows the platform
  character limit is skipped, leaving the previous (valid) text in place.

Rulesets: blader/humanizer ("Signs of AI writing") + coreyhaines31 marketing-psychology.
"""
import re
import subprocess

_CURLY = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})
_SPACED_DASH = re.compile(r"\s*[—–]\s*|\s+--\s+")
_TIGHT_DASH = re.compile(r"[—–]")
_NOTES_SEP = "---NOTES---"


def scrub(text):
    """Deterministic, social-safe mechanical de-slop. Returns cleaned text."""
    if not text:
        return text
    t = text.translate(_CURLY)
    t = _SPACED_DASH.sub(", ", t)
    t = _TIGHT_DASH.sub(", ", t)
    t = re.sub(r",\s*,", ",", t)
    t = re.sub(r"\s+,", ",", t)
    return t.strip()


def _strip_wrapping(out):
    out = (out or "").strip()
    if len(out) >= 2 and out[0] in "\"'" and out[-1] == out[0]:
        out = out[1:-1].strip()
    return out


def _split_notes(raw):
    """Split a model reply into (rewrite, notes) on the ---NOTES--- delimiter."""
    if _NOTES_SEP in raw:
        body, _, note = raw.partition(_NOTES_SEP)
        return body.strip(), note.strip().lstrip("-: ").strip()
    return raw.strip(), ""


def _run_pass(body, platform, limit, instructions, timeout=120):
    """One model rewrite pass. Returns {after, notes} or None to skip the pass. Runs on the Claude brain
    (Opus, the subscription) when configured — the same strong model that wrote the draft, so the de-slop
    REFINES without flattening — and falls back to the Studio model seam (llm.run_z) otherwise."""
    body = (body or "").strip()
    if not body:
        return None
    prompt = instructions.format(platform=platform or "social", body=body, limit=limit or 2000)
    raw = None
    try:
        import claude  # studio brain seam — prefer the strong model so polish doesn't flatten good copy
        if claude.configured():
            raw = claude.ask(prompt, timeout=timeout)
    except Exception:  # noqa: BLE001
        raw = None
    if raw is None:
        try:
            import llm  # Studio model seam; fallback when the brain isn't configured
            r = llm.run_z(prompt, timeout=timeout)
            raw = r.stdout or ""
        except Exception:  # noqa: BLE001 — a polish failure never breaks the pipeline
            return None
    after, notes = _split_notes(raw or "")
    after = scrub(_strip_wrapping(after))
    if not after:
        return None
    if limit and len(after) > limit:
        return None  # an over-limit rewrite is worse than the input; keep the input
    return {"after": after, "notes": notes}


# --- marketing psychology pass ---------------------------------------------
def _brand_safety(brand):
    base = ("Ethical persuasion ONLY: never shame, scare, manipulate, invent social proof, or use false "
            "urgency/scarcity. Stay truthful, specific, and supportive.")
    b = (brand or "").lower()
    if any(k in b for k in ("breast", "feed", "lacta", "mother", "baby", "infant")):
        base += (" This is a breastfeeding-support brand: the audience is often postpartum and vulnerable. "
                 "Never shame formula or combination feeding, never pressure the reader, never give medical "
                 "advice, and keep the tone gentle and reassuring.")
    return base


_MARKETING = (
    "You are a direct-response marketer applying behavioural psychology to a social post. Rewrite the POST to be "
    "more compelling AND to have real personality: open with a scroll-stopping hook, lead with the reader's "
    "outcome or benefit (NOT a spec list), build desire, and end with ONE clear, specific call to action (AIDA). "
    "Match the energy to the moment — a launch or announcement should feel genuinely exciting and alive; a "
    "sensitive topic stays warm and calm. Prefer concrete, vivid specifics over vague claims, and keep a strong "
    "human voice. {safety} Keep every fact intact, use metric units, and keep the platform's natural voice and "
    "any hashtags. Do NOT add a preamble or surrounding quotes. Output the rewritten post, then a line with "
    "exactly '---NOTES---', then ONE short sentence naming what you changed and the principle you applied. The "
    "post MUST be {limit} characters or fewer.\n\nPLATFORM: {platform}\n\nPOST:\n{body}"
)

_HUMANIZE = (
    "You are a sharp human copywriter doing a FINAL light edit — not a rewrite, and definitely not a flattening. "
    "Your only job is to remove the tells of AI writing while KEEPING all the life that's already there: the "
    "opening hook, the voice, the rhythm, the energy, and any genuinely-fitting emoji. De-slop, do NOT "
    "de-energize. If the post opens with a punchy hook, KEEP it (sharpen it if anything) — never replace it with "
    "a flat 'X has arrived' statement, and NEVER turn the post into a dry list of specs or features. Match the "
    "post's existing tone: leave a lively launch lively, leave a gentle or supportive post gentle. The result "
    "should read like a great human wrote it WITH FLAIR, not like an encyclopedia entry. "
    "Remove ONLY these tells: em/en dashes (use commas or periods), significance inflation ('a testament to', "
    "'plays a vital role', 'stands as'), EMPTY filler adjectives that carry no real information, copula avoidance "
    "('serves as' -> 'is'), rule-of-three lists and 'not just X but Y', trailing -ing filler clauses, AI "
    "vocabulary (delve, leverage, underscore, tapestry, landscape, foster), vague hedging and chatbot tone. Keep "
    "the meaning, facts, metric units, platform voice and hashtags. Do NOT add a preamble or quotes. Output the "
    "rewritten post, then a line with exactly '---NOTES---', then ONE short sentence naming what you changed. The "
    "post MUST be {limit} characters or fewer.\n\nPLATFORM: {platform}\n\nPOST:\n{body}"
)


def marketing_pass(body, platform, limit, brand=None):
    instructions = _MARKETING.replace("{safety}", _brand_safety(brand))
    return _run_pass(body, platform, limit, instructions)


def humanize_pass(body, platform, limit):
    return _run_pass(body, platform, limit, _HUMANIZE)


def polish(body, platform, limit=None, brand=None):
    """Run the full pipeline (psychology -> humanize) on one draft.
    Returns {final, steps:[{skill,before,after,notes}], changed}."""
    cur = scrub((body or "").strip())
    original = cur
    steps = []
    m = marketing_pass(cur, platform, limit, brand)
    if m and m["after"] != cur:
        steps.append({"skill": "Marketing psychology", "before": cur, "after": m["after"], "notes": m["notes"]})
        cur = m["after"]
    h = humanize_pass(cur, platform, limit)
    if h and h["after"] != cur:
        steps.append({"skill": "Humanized", "before": cur, "after": h["after"], "notes": h["notes"]})
        cur = h["after"]
    return {"final": cur, "steps": steps, "changed": cur != original}
