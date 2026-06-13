#!/usr/bin/env python3
"""Studio worker — processes dashboard-queued jobs by driving the agent through research + draft.

The dashboard's "New job" creates a job and sets queued_action='research_draft'. This worker picks
those up and runs the SAME agent flow that Telegram does (`hermes -z`), so a job started from the
cockpit gets researched and drafted, landing in the approval queue. Nothing here publishes.

Run in-container, one pass, via host cron:
  cd /home/hermes/aicontentstudio && docker compose exec -T hermes python /opt/data/plugins/studio/worker.py --once
"""
import os
import sys
import time
import subprocess

import json
import urllib.request

import db  # same directory
import humanize  # same directory — the second-model humanizer pass (Principle 0)

LOCK = "/tmp/studio_worker.lock"


def _telegram_notify(text, button=None):
    """DM the operator on Telegram (two-way loop) — best effort, reads creds from the volume .env.
    Optional `button` = {text, url} renders an inline tap-through (e.g. open the post in the cockpit)."""
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
    payload = {"chat_id": chat, "text": text}
    if button and button.get("url"):
        payload["reply_markup"] = {"inline_keyboard": [[{"text": button.get("text", "Open"), "url": button["url"]}]]}
    try:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(f"https://api.telegram.org/bot{tok}/sendMessage",
                                     data=data, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=10)
    except Exception:  # noqa: BLE001
        pass


def _cockpit_button(job_id, text="\U0001f50d Preview in cockpit"):
    base = os.environ.get("STUDIO_COCKPIT_URL", "").rstrip("/")
    return {"text": text, "url": f"{base}/job/{job_id}"} if base else None
LOCK_STALE_SECONDS = 1800
RUN_TIMEOUT_SECONDS = 600


def _brand_block(job):
    """If the job's brand has a profile, inject its voice/safety/region so generation sounds like
    that brand. Empty when no profile exists — generation behaves exactly as before. Needs no brand
    details until the operator fills a brand pack in."""
    try:
        b = db.get_brand(job.get("brand"))
    except Exception:  # noqa: BLE001
        b = None
    if not b:
        return ""
    bits = []
    if b.get("audience"):  bits.append(f"Audience: {b['audience']}.")
    if b.get("region"):    bits.append(f"Region: {b['region']} (use its conventions/spelling).")
    if b.get("voice"):     bits.append(f"Voice rules: {b['voice']}")
    if b.get("safety"):    bits.append(f"Brand-safety rules (follow strictly): {b['safety']}")
    if b.get("pillars"):   bits.append(f"Content pillars to draw from: {b['pillars']}")
    if not bits:
        return ""
    return f"BRAND PROFILE for {b.get('name') or job.get('brand')} — write in this brand's voice. " + " ".join(bits) + " "


def _agent_prompt(job, with_image, with_video=False):
    targets = (job.get("target_platforms") or "").strip()
    if targets:
        step2 = (f"Step 2 — draft for ONLY these platforms: {targets}. For EACH, write a draft TAILORED "
                 "to it (length/tone/hashtags, within its limit), grounded only in the brief, and call "
                 "create_draft for that platform. ")
    else:
        step2 = ("Step 2 — call list_channels; for EACH connected platform write a tailored draft and "
                 "call create_draft for it. ")
    p = (
        f"Work on the EXISTING job {job['id']} — do NOT create a new job. "
        f"Topic: {job['topic']!r}. Brand: {job['brand']}. "
        "Step 1 — research: FIRST consult the knowledge base — use your knowledge-base tools "
        "(search_notes / build_context) to pull (a) any imported facts, history or reference notes "
        f"relevant to {job['topic']!r}, and (b) this brand's prior approved posts (search for the brand "
        f"name {job['brand']!r} and tag 'voice') so you match its established voice and avoid repeating "
        "past posts. Then search the web, read real sources, and call save_brief with cited facts "
        "(each a real source_url + snippet) and 2-3 distinct angles. Use METRIC units only (Celsius, "
        "km, kg, litres), convert any imperial. "
        "Write every draft like a sharp human, not an AI: no em dashes, no significance inflation "
        "('a testament to', 'plays a vital role'), no rule-of-three lists, no 'serves as' (just say "
        "'is'), no trailing -ing filler, no AI words (delve, leverage, underscore, tapestry, landscape). "
        "Concrete and grounded; emojis and hashtags are fine where they fit the platform. "
        "Make each post persuasive: open with a hook, lead with the reader's benefit (not features), "
        "end with one clear call to action. Ethical only, never shame, scare, or use false urgency "
        "(especially on health or sensitive topics). "
        + _brand_block(job)
        + step2
    )
    if with_image:
        p += ("Step 3 — image: call image_gen ONCE for one relevant, on-brand, safe master image, then "
              "call set_draft_image once with its path AND a `tags` list of visual keywords describing "
              "what's in the image (subjects, setting, mood) for the media Vault search. ")
    if with_video:
        p += ("Step 4 — video: call make_video ONCE with the job id (it renders a branded short video "
              "per platform draft from that image and attaches it). ")
    p += "Then stop. Do NOT approve or publish — leave it in preview for the operator to review."
    return p


def process_one(job):
    jid = job["id"]
    qa = job.get("queued_action") or ""
    with_video = "video" in qa
    with_image = "image" in qa or with_video  # video needs an image to animate
    db.enqueue_action(jid, "processing")  # claim + mark running (status the cockpit shows)
    db.record_event(jid, "worker: starting research + draft"
                    + (" + image" if with_image else "") + (" + video" if with_video else ""), actor="system")
    try:
        r = subprocess.run(["hermes", "-z", _agent_prompt(job, with_image, with_video)],
                           capture_output=True, text=True, timeout=RUN_TIMEOUT_SECONDS)
        state = db.get_job(jid)["state"]
        if state == "preview":
            _polish_drafts(jid, job.get("brand"))  # Layer 2: psychology + humanizer passes before the operator sees it
            db.clear_queued(jid)
            db.record_event(jid, "worker: done — draft ready for review", actor="system")
            _telegram_notify(f'\U0001f4dd Draft ready to review: "{job["topic"]}" — it\'s in your approval queue.',
                             button=_cockpit_button(jid))
        else:
            db.enqueue_action(jid, "failed")
            db.record_event(jid, f"worker: did not reach preview (state={state}, rc={r.returncode})", actor="system")
    except subprocess.TimeoutExpired:
        db.enqueue_action(jid, "failed")
        db.record_event(jid, "worker: timed out", actor="system")
    except Exception as e:  # noqa: BLE001
        db.enqueue_action(jid, "failed")
        db.record_event(jid, f"worker: error: {e}", actor="system")


def _polish_one_draft(d, brand):
    """Run the polish pipeline (marketing-psychology -> humanizer) on one draft, recording what
    each pass changed for the preview pills. Best-effort — a failure never blocks the pipeline."""
    limit = db.PLATFORM_LIMITS.get(d["platform"])
    try:
        res = humanize.polish(d["body"], d["platform"], limit, brand)
    except Exception as e:  # noqa: BLE001
        print(f"worker: polish draft {d['id']} error: {e}")
        return  # leave polish_json NULL so it's retried next tick
    if res and res["changed"]:
        db.update_draft_body(d["id"], res["final"], polish_steps=res["steps"])
        labels = ", ".join(s["skill"] for s in res["steps"])
        db.record_event(d.get("job_id") or "", f"draft polished for {d['platform']} ({labels}; {len(res['final'])} chars)", actor="system")
        print(f"worker: polished draft {d['id']} ({d['platform']}: {labels})")
    else:
        db.mark_draft_polished(d["id"])  # attempted, no change — don't reprocess


def _polish_drafts(job_id, brand=None):
    """Polish all not-yet-polished drafts of one job (the worker's own dashboard jobs, inline
    before the 'draft ready' ping)."""
    for d in db.list_drafts(job_id):
        if d.get("polish_json"):
            continue
        _polish_one_draft(d, brand)


def _polish_pending(limit=12):
    """Sweep: polish any preview draft from ANY path (incl. Telegram conversations) that hasn't
    been through the pipeline yet. Mirrors the vision auto-tag sweep — makes polish universal."""
    pending = db.preview_drafts_unpolished(limit)
    if pending:
        print(f"worker: polishing {len(pending)} pending draft(s)")
    for d in pending:
        _polish_one_draft(d, d.get("brand"))


def _locked():
    if os.path.exists(LOCK):
        if time.time() - os.path.getmtime(LOCK) < LOCK_STALE_SECONDS:
            return True
    with open(LOCK, "w") as f:
        f.write(str(os.getpid()))
    return False


def _maybe_run_scout():
    """If the cockpit requested an on-demand scout run (marker file), honour it once."""
    marker = os.path.join(os.path.dirname(db.DB_PATH), ".scout-request")
    if not os.path.exists(marker):
        return
    try:
        os.remove(marker)
    except OSError:
        pass
    try:
        import scout  # same dir
        print("worker: running on-demand scout")
        scout.run_once(force=True)  # 'Run now' bypasses the schedule
    except Exception as e:  # noqa: BLE001
        print(f"worker: scout run error: {e}")


def _clean_tags(out):
    lines = [ln.strip() for ln in (out or "").splitlines() if ln.strip()]
    for ln in reversed(lines):  # prefer the last comma-separated line
        if "," in ln and len(ln) < 300:
            return ln.strip().strip('."\'')
    return lines[-1].strip()[:200] if lines else ""


def _autotag_media(limit=5):
    """Vision auto-tag any untagged Vault images (grok sees the image URL and lists content tags)."""
    for a in db.untagged_media(limit):
        prompt = ("Look at this image and reply with ONLY 6-10 short content tags describing what is IN it "
                  f"(objects, people, setting, mood, colours), comma-separated, nothing else. Image: {a['url']}")
        try:
            r = subprocess.run(["hermes", "-z", prompt], capture_output=True, text=True, timeout=120)
            tags = _clean_tags(r.stdout)
            if tags and "," in tags:
                db.set_media_tags(a["id"], tags)
                print(f"worker: auto-tagged asset {a['id']}: {tags[:60]}")
        except Exception as e:  # noqa: BLE001
            print(f"worker: autotag asset {a['id']} failed: {e}")


def _heartbeat():
    """Write a timestamp each run so the dashboard can show the worker is alive (and which job
    is actually being processed vs just queued)."""
    try:
        p = os.path.join(os.path.dirname(db.DB_PATH), ".worker_heartbeat")
        with open(p, "w") as f:
            f.write(__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat())
    except OSError:
        pass


def main():
    db.init_db()
    _heartbeat()
    if _locked():
        print("worker: another run is in progress, skipping")
        return
    try:
        _maybe_run_scout()
        _autotag_media()
        _polish_pending()  # polish drafts from ANY path (incl. Telegram) that aren't polished yet
        db.purge_trash(30)  # hard-delete trashed jobs + media older than 30 days

        jobs = db.get_queued_jobs()
        if not jobs:
            return
        print(f"worker: processing {len(jobs)} queued job(s)")
        for j in jobs:
            process_one(j)
    finally:
        try:
            os.remove(LOCK)
        except OSError:
            pass


if __name__ == "__main__":
    main()
