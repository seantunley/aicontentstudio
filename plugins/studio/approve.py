#!/usr/bin/env python3
"""Human-only approval — mint a single-use publish confirmation token for a job (plan §4a).

This is deliberately NOT a Hermes tool, so the model (or a prompt injection) can never
invoke it. It is the human approval action that authorizes a publish. In Phase 1 this same
mint path gets wired behind the Telegram one-tap / dashboard approval.

Run inside the container:
    docker compose exec hermes python /opt/data/plugins/studio/approve.py <job_id> [--approve-state] [--ttl 3600] [--by you]
"""
import sys
import argparse

import db  # same directory (script dir is on sys.path when run directly)


def main():
    p = argparse.ArgumentParser(description="Mint a single-use publish token for a job (human approval, §4a).")
    p.add_argument("job_id", help="Full job id or unique short prefix.")
    p.add_argument("--approve-state", action="store_true", help="Also advance the job to 'approved' first.")
    p.add_argument("--ttl", type=int, default=3600, help="Token lifetime in seconds (default 3600).")
    p.add_argument("--by", default="operator", help="Who is approving (recorded in the audit log).")
    a = p.parse_args()

    db.init_db()
    job = db.find_job(a.job_id)
    if not job:
        print(f"No job matching '{a.job_id}'.", file=sys.stderr)
        sys.exit(1)

    if a.approve_state and job["state"] != "approved":
        try:
            db.advance_job(job["id"], "approved", actor="human", detail=f"approved via approve.py by {a.by}")
        except Exception as e:  # noqa: BLE001
            print(f"Warning: could not advance to 'approved': {e}", file=sys.stderr)

    token = db.mint_publish_token(job["id"], minted_by=a.by, ttl_seconds=a.ttl)
    print(f"job:    {job['id']}  ({job['topic']!r}, state={db.get_job(job['id'])['state']})")
    print(f"token:  {token}")
    print(f"ttl:    {a.ttl}s, single use. Hand this token to the publish action to authorize job {job['id'][:8]}.")


if __name__ == "__main__":
    main()
