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

LOCK = "/tmp/studio_worker.lock"


def _telegram_notify(text):
    """DM the operator on Telegram (two-way loop) — best effort, reads creds from the volume .env."""
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
LOCK_STALE_SECONDS = 1800
RUN_TIMEOUT_SECONDS = 600


def _agent_prompt(job, with_image):
    p = (
        f"Work on the EXISTING job {job['id']} — do NOT create a new job. "
        f"Topic: {job['topic']!r}. Brand: {job['brand']}. "
        "Research it properly: search the web, read real sources, then call save_brief with cited "
        "facts (each with a real source_url and a snippet) and 2-3 distinct angles. Then write a "
        "Bluesky post under 300 characters, grounded only in the brief, and call create_draft "
        "(platform bluesky). "
    )
    if with_image:
        p += ("Then use the image_gen tool to create ONE relevant, on-brand, safe image for this "
              "post, and call set_draft_image with the file path image_gen returns. ")
    p += "Then stop. Do not publish."
    return p


def process_one(job):
    jid = job["id"]
    with_image = (job.get("queued_action") or "") == "research_draft_image"
    db.enqueue_action(jid, "processing")  # claim + mark running (status the cockpit shows)
    db.record_event(jid, "worker: starting research + draft" + (" + image" if with_image else ""), actor="system")
    try:
        r = subprocess.run(["hermes", "-z", _agent_prompt(job, with_image)],
                           capture_output=True, text=True, timeout=RUN_TIMEOUT_SECONDS)
        state = db.get_job(jid)["state"]
        if state == "preview":
            db.clear_queued(jid)
            db.record_event(jid, "worker: done — draft ready for review", actor="system")
            _telegram_notify(f'\U0001f4dd Draft ready to review: "{job["topic"]}" — it\'s in your approval queue.')
        else:
            db.enqueue_action(jid, "failed")
            db.record_event(jid, f"worker: did not reach preview (state={state}, rc={r.returncode})", actor="system")
    except subprocess.TimeoutExpired:
        db.enqueue_action(jid, "failed")
        db.record_event(jid, "worker: timed out", actor="system")
    except Exception as e:  # noqa: BLE001
        db.enqueue_action(jid, "failed")
        db.record_event(jid, f"worker: error: {e}", actor="system")


def _locked():
    if os.path.exists(LOCK):
        if time.time() - os.path.getmtime(LOCK) < LOCK_STALE_SECONDS:
            return True
    with open(LOCK, "w") as f:
        f.write(str(os.getpid()))
    return False


def main():
    db.init_db()
    if _locked():
        print("worker: another run is in progress, skipping")
        return
    try:
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
