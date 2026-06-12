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

import db  # same directory

LOCK = "/tmp/studio_worker.lock"
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
    db.clear_queued(jid)  # claim it so it isn't picked up twice
    db.record_event(jid, "worker: starting research + draft" + (" + image" if with_image else ""), actor="system")
    try:
        r = subprocess.run(["hermes", "-z", _agent_prompt(job, with_image)],
                           capture_output=True, text=True, timeout=RUN_TIMEOUT_SECONDS)
        state = db.get_job(jid)["state"]
        db.record_event(jid, f"worker: agent run finished (rc={r.returncode}, state={state})", actor="system")
    except subprocess.TimeoutExpired:
        db.record_event(jid, "worker: agent run timed out", actor="system")
    except Exception as e:  # noqa: BLE001
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
