"""Tool handlers. Each receives an args dict, returns a JSON string, and never raises
(errors come back as {"error": ...}) — the Hermes plugin handler contract."""
import os
import json

from . import db, postiz


def _ok(**kw):
    kw.setdefault("success", True)
    return json.dumps(kw)


def _err(msg):
    return json.dumps({"error": msg})


def _dry_run():
    return os.environ.get("STUDIO_DRY_RUN", "true").strip().lower() not in ("false", "0", "no", "off")


def log_job(args, **kwargs):
    topic = (args.get("topic") or "").strip()
    if not topic:
        return _err("topic is required")
    brand = (args.get("brand") or "unassigned").strip() or "unassigned"
    created_by = str(kwargs.get("user_id") or args.get("created_by") or "") or None
    try:
        job = db.create_job(topic=topic, brand=brand, created_by=created_by)
    except Exception as e:  # noqa: BLE001 — handler contract: never raise
        return _err(str(e))
    tail = (" Brand is unassigned — ask the operator which brand this is for."
            if brand == "unassigned" else f" Brand: {brand}.")
    return _ok(
        job_id=job["id"], short_id=job["id"][:8], state=job["state"], brand=job["brand"], topic=job["topic"],
        message=f"Logged job {job['id'][:8]} ('{topic}') in state 'requested'.{tail}",
    )


def get_job(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    if not jid:
        return _err("job_id is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    return _ok(job=job)


def list_jobs(args, **kwargs):
    state = (args.get("state") or "").strip() or None
    brand = (args.get("brand") or "").strip() or None
    if state and state not in db.STATES:
        return _err(f"unknown state '{state}' (valid: {', '.join(db.STATES)})")
    try:
        jobs = db.list_jobs(state=state, brand=brand)
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    summary = [{"short_id": j["id"][:8], "state": j["state"], "brand": j["brand"], "topic": j["topic"]} for j in jobs]
    return _ok(count=len(jobs), jobs=summary)


def advance_job(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    to_state = (args.get("to_state") or "").strip()
    if not jid or not to_state:
        return _err("job_id and to_state are required")
    if to_state in ("approved", "published"):
        return _err(
            "REFUSED: you cannot approve or publish — those are the operator's actions at the gate "
            "(in the cockpit). Take the job to 'preview' and stop, then tell the operator it's ready to review."
        )
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    try:
        updated = db.advance_job(job["id"], to_state, actor="agent", detail=args.get("note"))
    except ValueError as e:
        return _err(str(e))
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    return _ok(job_id=updated["id"], short_id=updated["id"][:8], state=updated["state"],
               message=f"Job {updated['id'][:8]} -> {updated['state']}")


def publish(args, **kwargs):
    """Hard-gated, dry-run publish (plan §4, §4a). Refuses without a valid human-minted token;
    even with one, makes no real platform call while STUDIO_DRY_RUN is set."""
    jid = (args.get("job_id") or "").strip()
    token = (args.get("confirmation_token") or "").strip()
    if not jid:
        return _err("job_id is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    if token:
        if not db.consume_publish_token(token, job["id"]):
            return _err(
                "REFUSED: the confirmation token is invalid, expired, already used, or for a different "
                "job (plan §4a). A fresh human approval is required."
            )
    elif not db.consume_any_token(job["id"]):
        return _err(
            "REFUSED: no human approval on file for this job (plan §4a). Approve it first "
            "(dashboard or approve.py) to mint a token — you cannot create one."
        )
    # Token valid and now consumed (single-use). Resolve the draft + target channel.
    drafts = db.list_drafts(job["id"])
    if not drafts:
        return _err("no draft to publish for this job — create_draft first")
    draft = drafts[-1]
    platform = draft["platform"]

    if _dry_run():
        # Prove the Postiz hand-off (resolve the channel) but make NO post.
        try:
            ig = postiz.find_integration(platform)
        except postiz.PostizError as e:
            db.record_event(job["id"], f"DRY-RUN: Postiz check failed: {e}", actor="system")
            return _ok(dry_run=True, would_publish=True, job_id=job["id"], short_id=job["id"][:8],
                       postiz_reachable=False,
                       message=f"DRY-RUN — would publish job {job['id'][:8]} to {platform}, but Postiz check failed: {e}")
        target = ig.get("profile") if ig else None
        db.record_event(job["id"], f"DRY-RUN: would publish to {platform} ({target})", actor="system")
        return _ok(dry_run=True, would_publish=True, job_id=job["id"], short_id=job["id"][:8],
                   platform=platform, channel=target, channel_found=bool(ig),
                   message=(f"DRY-RUN — would publish job {job['id'][:8]} to {platform} channel '{target}'. "
                            "No post made (STUDIO_DRY_RUN=true)." if ig
                            else f"DRY-RUN — but no connected {platform} channel found in Postiz."))

    # Dry-run OFF → real publish via Postiz.
    try:
        ig = postiz.find_integration(platform)
        if not ig:
            return _err(f"no connected {platform} channel in Postiz — connect one first")
        image = {"id": draft["image_id"], "path": draft["image_path"]} if draft.get("image_id") else None
        postiz.create_post(ig["id"], draft["body"], platform, when="now", image=image)
    except postiz.PostizError as e:
        db.record_event(job["id"], f"publish FAILED via Postiz: {e}", actor="system")
        return _err(f"publish failed: {e}")
    db._advance_to(job["id"], "published", actor="system",
                   detail=f"published to {platform} via Postiz ({ig.get('profile')})"
                          + (" with image" if draft.get("image_id") else ""))
    return _ok(published=True, job_id=job["id"], short_id=job["id"][:8], platform=platform,
               channel=ig.get("profile"), with_image=bool(draft.get("image_id")), state="published",
               message=f"Published job {job['id'][:8]} to {platform} ({ig.get('profile')}) via Postiz"
                       + (" with image." if draft.get("image_id") else "."))


def save_brief(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    if not jid:
        return _err("job_id is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    try:
        brief = db.save_brief(job["id"], args.get("facts"), args.get("angles"),
                              args.get("unverified"), args.get("recency"))
    except ValueError as e:
        return _err(str(e))
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    state = db.get_job(job["id"])["state"]
    return _ok(job_id=job["id"], short_id=job["id"][:8], state=state,
               facts=len(brief["facts"]), angles=len(brief["angles"]), unverified=len(brief["unverified"]),
               message=(f"Saved brief for {job['id'][:8]}: {len(brief['facts'])} cited facts, "
                        f"{len(brief['angles'])} angles, {len(brief['unverified'])} unverified. Job -> {state}."))


def get_brief(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    if not jid:
        return _err("job_id is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    b = db.get_brief(job["id"])
    if not b:
        return _err(f"no brief saved for {job['id'][:8]} yet")
    return _ok(job_id=job["id"], recency=b.get("recency"), brief=json.loads(b["brief_json"]))


def create_draft(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    platform = (args.get("platform") or "").strip()
    body = args.get("body") or ""
    if not jid or not platform or not body.strip():
        return _err("job_id, platform, and body are required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    try:
        r = db.create_draft(job["id"], platform, body, angle=args.get("angle"))
    except ValueError as e:
        return _err(str(e))
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    fit = f"/{r['limit']}" if r["limit"] else ""
    return _ok(job_id=job["id"], short_id=job["id"][:8], platform=r["platform"],
               char_count=r["char_count"], limit=r["limit"], state=r["state"],
               message=(f"Draft saved for {job['id'][:8]} on {r['platform']} "
                        f"({r['char_count']}{fit} chars). Job -> {r['state']}, awaiting your approval."))


def list_drafts(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    if not jid:
        return _err("job_id is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    drafts = db.list_drafts(job["id"])
    return _ok(job_id=job["id"], count=len(drafts), drafts=drafts)


def operator_decision(args, **kwargs):
    """The operator's explicit Approve/Reject/Defer on a previewed job (from a Telegram button tap).
    approve -> publish live; reject -> cancel; defer -> leave it. This is a HUMAN decision surface."""
    jid = (args.get("job_id") or "").strip()
    decision = (args.get("decision") or "").strip().lower()
    if not jid or decision not in ("approve", "reject", "defer"):
        return _err("job_id and decision (approve|reject|defer) are required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")

    if decision == "defer":
        db.record_event(job["id"], "operator deferred — left in the queue", actor="human")
        return _ok(job_id=job["id"], decision="defer", message=f"Left {job['id'][:8]} in the queue.")

    if job["state"] != "preview":
        return _err(f"job is '{job['state']}', not awaiting approval — only previewed jobs can be approved/rejected.")

    if decision == "reject":
        try:
            db.advance_job(job["id"], "cancelled", actor="human", detail="operator rejected via Telegram")
        except Exception as e:  # noqa: BLE001
            return _err(str(e))
        return _ok(job_id=job["id"], decision="reject", message=f"Rejected {job['id'][:8]} — cancelled.")

    # approve -> advance preview -> approved. Does NOT publish: publishing stays a cockpit-only
    # human action (§4a). The job now sits in 'Ready to publish' for the operator to ship there.
    try:
        db.advance_job(job["id"], "approved", actor="human", detail="operator approved via Telegram")
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    return _ok(job_id=job["id"], decision="approve", state="approved",
               message=f"Approved {job['id'][:8]} — it's now in 'Ready to publish' in the cockpit; publish it there.")


def set_draft_image(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    path = (args.get("image_path") or "").strip()
    if not jid or not path:
        return _err("job_id and image_path are required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    if not db.list_drafts(job["id"]):
        return _err("no draft to attach an image to — create_draft first")
    try:
        media = postiz.upload_image(path)  # upload the local file to the publisher now
        db.set_draft_image(job["id"], media.get("id"), media.get("path"))
    except postiz.PostizError as e:
        return _err(f"image upload failed: {e}")
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    return _ok(job_id=job["id"], short_id=job["id"][:8],
               message=f"Image uploaded + attached to {job['id'][:8]}'s draft; it will post with the image.")
