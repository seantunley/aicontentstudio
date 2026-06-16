#!/usr/bin/env python3
"""Trend scout (§3b) — scheduled discovery. For each enabled niche, drive the agent to find a few
timely, specific ideas and record them as SUGGESTIONS (suggest-only). Nothing here researches deeply,
drafts, or publishes — the operator promotes a suggestion to a real job later.

Run in-container, one pass, via host cron (e.g. daily):
  cd /home/hermes/aicontentstudio && docker compose exec -T hermes python /opt/data/plugins/studio/scout.py --once
"""
import os
import time
import json
import subprocess
import urllib.request

import db  # same directory
import llm  # same directory — Studio model seam (STUDIO_TEXT_MODEL)


def _ints(key, default):
    """Operator-tunable integer (the /settings Scout & Discovery tab); falls back to the default."""
    try:
        v = db.get_setting(key)
        return int(v) if v not in (None, "") else default
    except Exception:  # noqa: BLE001
        return default


LOCK = "/tmp/studio_scout.lock"
LOCK_STALE_SECONDS = 1800
RUN_TIMEOUT_SECONDS = _ints("scout_timeout", int(os.environ.get("STUDIO_SCOUT_TIMEOUT", "300")))


def _telegram_notify(text):
    """DM the operator on Telegram — best effort, reads creds from the volume .env."""
    env = {}
    try:
        with open("/opt/data/.env") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k] = v
    except OSError:
        return
    tok = env.get("TELEGRAM_BOT_TOKEN", "")
    chat = env.get("TELEGRAM_ALLOWED_USERS", "").split(",")[0]
    if not tok or not chat:
        return
    try:
        data = json.dumps({"chat_id": chat, "text": text}).encode()
        req = urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage",
                                     data=data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception:  # noqa: BLE001
        pass


def _scout_prompt(niche):
    # §7e: steer discovery toward the brand's content pillars (the themes it actually rotates through)
    # rather than whatever's merely trending, and tag each idea with the pillar it serves.
    pillars = ""
    try:
        b = db.get_brand(niche.get("brand"))
        if b and (b.get("pillars") or "").strip():
            pillars = " ".join(b["pillars"].split())
    except Exception:  # noqa: BLE001
        pillars = ""
    pillar_block = (
        (f"This brand's CONTENT PILLARS (the themes it rotates through): {pillars}. "
         "Bias your discovery toward ideas that fit these pillars — this is what the brand is about, not "
         "just whatever is trending — and spread ideas ACROSS the pillars rather than clustering on one. "
         "For EACH suggestion set pillar=<the single pillar it serves, copied from that list>. ")
        if pillars else ""
    )
    pillar_arg = "pillar=<the brand pillar it serves>, " if pillars else ""
    _ideas = _ints("scout_ideas_per_niche", 5)   # /settings → Scout & Discovery
    _hdays = _ints("scout_horizon_days", 14)
    return (
        f"You are the studio's trend scout. Brand: {niche['brand']!r}. Niche: {niche['query']!r}. "
        + pillar_block
        + "Scan WIDELY for what's genuinely CURRENT and gaining attention in this niche right now. "
        "USE YOUR REAL-TIME X (Twitter) ACCESS first — see what's actually being posted, discussed, and "
        "trending on X this week — then also check news, Reddit and forums, YouTube, blogs and the open "
        f"web. Prefer things surfacing in the LAST {_hdays} DAYS over evergreen. Choose up to {_ideas} SPECIFIC ideas. "
        f"For EACH, call suggest_topic(brand={niche['brand']!r}, topic=<concrete idea>, "
        "rationale=<one line, grounded in what you actually read>, source_url=<real URL>, "
        "source=<WHERE you found it, e.g. 'Reddit r/beyondthebump', 'BBC News', 'X', 'YouTube'>, "
        "heat=<'hot' if surging/very timely right now, 'warm' if solidly relevant, 'cool' if mild>, "
        + pillar_arg
        + f"niche_id={niche['id']}). Judge heat HONESTLY from how much fresh recent attention it has — do "
        "not mark everything hot. Use METRIC units only (Celsius, km, kg, litres); convert any imperial. "
        "De-duplicate against ideas already raised. Suggest ONLY — do NOT log_job, save_brief, "
        "create_draft, advance_job, or publish. Then stop."
    )


def run_once(force=False):
    db.init_db()
    if not force and not db.scout_due():
        print("scout: not due yet (per schedule) — skipping")
        return
    niches = db.list_niches(enabled_only=True)
    if not niches:
        print("scout: no enabled niches — nothing to do")
        return  # don't stamp last_run, so it runs as soon as a niche is added and due
    db.mark_scout_ran()
    before = len(db.list_suggestions("new"))
    for niche in niches:
        try:
            llm.run_z(_scout_prompt(niche), timeout=RUN_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            print(f"scout: niche {niche['id']} timed out")
        except Exception as e:  # noqa: BLE001
            print(f"scout: niche {niche['id']} error: {e}")
    new = len(db.list_suggestions("new")) - before
    print(f"scout: {len(niches)} niche(s), {new} new suggestion(s)")
    if new > 0:
        _telegram_notify(f"\U0001f50d Scout found {new} new idea(s) — review them in the cockpit's Scout tab.")


def _locked():
    if os.path.exists(LOCK):
        if time.time() - os.path.getmtime(LOCK) < LOCK_STALE_SECONDS:
            return True
    with open(LOCK, "w") as f:
        f.write(str(os.getpid()))
    return False


def main():
    if _locked():
        print("scout: another run in progress, skipping")
        return
    try:
        run_once()
    finally:
        try:
            os.remove(LOCK)
        except OSError:
            pass


if __name__ == "__main__":
    main()
