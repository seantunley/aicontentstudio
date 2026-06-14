#!/usr/bin/env python3
"""Studio worker — processes dashboard-queued jobs by driving the agent through research + draft.

The dashboard's "New job" creates a job and sets queued_action='research_draft'. This worker picks
those up and runs the SAME agent flow that Telegram does (`hermes -z`), so a job started from the
cockpit gets researched and drafted, landing in the approval queue. Nothing here publishes.

Run in-container, one pass, via host cron:
  cd /home/hermes/aicontentstudio && docker compose exec -T hermes python /opt/data/plugins/studio/worker.py --once
"""
import os
import re
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


def _campaign_block(job):
    """If the job is part of a campaign arc (§7e), tell the agent the shared theme so the piece is
    coherent with the series and distinct from its siblings. Empty otherwise."""
    c = db.get_campaign(job.get("campaign_id"))
    if not c:
        return ""
    bits = [f"This post is one piece of the campaign {c.get('name')!r}"]
    if c.get("theme"):
        bits.append(f"— the arc's shared theme: {c['theme']}")
    return (" ".join(bits) + ". Keep it coherent with that theme but make this piece distinct from the "
            "others in the series (its own angle/hook). ")


def _agent_prompt(job, with_image, with_video=False, with_carousel=False):
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
        + _campaign_block(job)
        + step2
    )
    if with_carousel:
        try:
            n_slides = int((json.loads(job.get("meta") or "{}")).get("carousel_slides") or 4)
        except Exception:  # noqa: BLE001
            n_slides = 4
        n_slides = max(2, min(10, n_slides))
        p += (f"Step 3 — carousel: this is a multi-image swipe post. Call image_gen {n_slides} times for "
              f"{n_slides} DISTINCT, on-brand, safe slides that form a coherent set ({n_slides} tips/steps or a "
              f"mini story), then call set_carousel ONCE with the {n_slides} image paths IN ORDER and a `tags` "
              "list of visual keywords (subjects, setting, mood) for the media Vault search. ")
    elif with_image:
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
    with_carousel = "carousel" in qa
    with_image = "image" in qa or with_video or with_carousel  # video animates an image; carousel = many
    db.enqueue_action(jid, "processing")  # claim + mark running (status the cockpit shows)
    db.record_event(jid, "worker: starting research + draft"
                    + (" + image" if with_image else "") + (" + video" if with_video else ""), actor="system")

    # 1) Run the agent. Only a genuine run failure — crash, timeout, or never reaching the gate — is
    # a 'failed'. (A draft that reached preview has succeeded; see step 2.)
    try:
        r = subprocess.run(["hermes", "-z", _agent_prompt(job, with_image, with_video, with_carousel)],
                           capture_output=True, text=True, timeout=RUN_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        db.enqueue_action(jid, "failed")
        db.record_event(jid, "worker: timed out", actor="system")
        return
    except Exception as e:  # noqa: BLE001
        db.enqueue_action(jid, "failed")
        db.record_event(jid, f"worker: agent run error: {e}", actor="system")
        return

    state = db.get_job(jid)["state"]
    if state != "preview":
        db.enqueue_action(jid, "failed")
        db.record_event(jid, f"worker: did not reach preview (state={state}, rc={r.returncode})", actor="system")
        return

    # 2) SUCCESS — the drafts are at the gate. From here NOTHING may flip the job to 'failed':
    # polish and the operator ping are best-effort bookkeeping, and the polish sweep backstops any
    # draft missed here. A transient DB hiccup in this block must not bury a good, review-ready job.
    try:
        _polish_drafts(jid, job.get("brand"))  # Layer 2: psychology + humanizer passes before the operator sees it
    except Exception as e:  # noqa: BLE001
        print(f"worker: polish error (non-fatal — sweep will retry): {e}")
    worst = "green"
    try:
        worst = _safety_check_drafts(jid, job.get("brand"))  # §6a stage-3 brand-safety review
    except Exception as e:  # noqa: BLE001
        print(f"worker: safety check error (non-fatal — sweep will retry): {e}")
    db.clear_queued(jid)  # drop the 'processing' marker so the cockpit shows it as a normal preview job
    try:
        flag = {"amber": " ⚠️ flagged for safety review", "red": " 🛑 SAFETY HOLD — read before approving"}.get(worst, "")
        db.record_event(jid, "worker: done — draft ready for review", actor="system")
        _telegram_notify(f'\U0001f4dd Draft ready to review: "{job["topic"]}" — it\'s in your approval queue.{flag}',
                         button=_cockpit_button(jid))
    except Exception as e:  # noqa: BLE001
        print(f"worker: post-success notify error (non-fatal): {e}")


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


def _check_occasions():
    """§7g lead-time automation: when an auto-draft occasion's window opens, queue a draft job for it
    (per the occasion's brand, or every enabled brand for a shared 'all' occasion). Sensitive
    occasions are notify-first — we ping the operator instead of auto-drafting. Idempotent per
    occurrence via occasions.last_handled_for, so a fast worker loop won't double-fire."""
    try:
        due = db.due_occasions()
    except Exception as e:  # noqa: BLE001
        print(f"worker: occasions check error: {e}")
        return
    if not due:
        return
    brands = [b["slug"] for b in db.list_brands() if b.get("enabled", 1)]
    for o in due:
        targets = ([o["brand"]] if o["brand"] != "all" else (brands or ["unassigned"]))
        when = o["next_date"]
        days = o["days_until"]
        if o.get("sensitive"):
            # notify-first: emotionally-charged occasion — let the operator decide the tone (§6a/§7g)
            for tb in targets:
                label = "" if tb in ("all", "unassigned") else f" for {tb}"
                _telegram_notify(
                    f"\U0001f56f️ {o['name']} is in {days} days ({when}) — flagged sensitive{label}. "
                    f"I won't auto-draft this one. Want me to put something together? Tell me the angle and I'll start it.")
            db.mark_occasion_handled(o["id"], when)
            print(f"worker: occasion '{o['name']}' sensitive — notified (not drafted)")
            continue
        for tb in targets:
            topic = f"{o['name']} — on-brand post for the occasion ({when})"
            job = db.create_job(topic, brand=tb, source="occasion")
            db.enqueue_action(job["id"], "research_draft")
            db.record_event(job["id"], f"auto-queued by occasions calendar (§7g): {o['name']} on {when}, {days}d out", actor="system")
        db.mark_occasion_handled(o["id"], when)
        _telegram_notify(
            f"\U0001f4c5 {o['name']} is {days} days out ({when}) — I've queued {'a draft' if len(targets)==1 else f'{len(targets)} drafts'} "
            f"for your approval queue. Nothing posts until you approve.")
        print(f"worker: occasion '{o['name']}' -> queued {len(targets)} draft(s)")


def _redraft_body(platform, limit, angle, facts_text, brand_block, current):
    """Focused model rewrite of one draft through a chosen angle, grounded in the saved brief's facts.
    Returns the new body (scrubbed, within limit) or None to leave the draft unchanged."""
    prompt = (
        f"Rewrite this {platform} post through a DIFFERENT angle. Use ONLY this angle as the lens: \"{angle}\". "
        f"Ground every claim ONLY in these researched facts (introduce no new facts):\n{facts_text}\n\n"
        + (brand_block or "")
        + "Write like a sharp human, not AI: no em dashes, no significance inflation, no rule-of-three lists, "
        "no AI words (delve, leverage, tapestry, landscape); concrete and grounded. Open with a hook, lead with "
        "the reader's benefit, end with one clear call to action. Ethical only — never shame, scare, or use false "
        f"urgency. Use METRIC units. The post MUST be {limit or 2000} characters or fewer. Output ONLY the "
        f"rewritten post — no preamble, no surrounding quotes.\n\nCURRENT POST (rewrite it to the new angle, keep "
        f"the platform's voice + fitting hashtags/emoji):\n{current}"
    )
    try:
        r = subprocess.run(["hermes", "-z", prompt], capture_output=True, text=True, timeout=RUN_TIMEOUT_SECONDS)
    except Exception:  # noqa: BLE001
        return None
    out = humanize.scrub((r.stdout or "").strip().strip('"').strip())
    if not out:
        return None
    return out[:limit] if limit and len(out) > limit else out


def _process_redrafts():
    """§7e/angle-switch: re-angle a job's drafts in place when the operator picks a different angle.
    Reuses the saved brief (no re-research); rewrites each platform draft, then re-polishes."""
    try:
        jobs = db.jobs_awaiting_redraft()
    except Exception as e:  # noqa: BLE001
        print(f"worker: redraft scan error: {e}")
        return
    for job in jobs:
        jid = job["id"]
        try:
            angle = (json.loads(job.get("meta") or "{}")).get("redraft_angle") or ""
        except Exception:  # noqa: BLE001
            angle = ""
        db.enqueue_action(jid, "processing")
        brief = db.get_brief(jid) or {}
        facts = brief.get("facts") or []
        facts_text = "\n".join(f"- {f.get('claim', '')} ({f.get('source_url', '')})" for f in facts) or "(keep the post's existing facts)"
        bb = _brand_block(job)
        n = 0
        for d in db.list_drafts(jid):
            limit = db.PLATFORM_LIMITS.get(d["platform"])
            nb = _redraft_body(d["platform"], limit, angle, facts_text, bb, d["body"])
            if nb:
                db.redraft_draft(d["id"], nb, angle)
                n += 1
        db.record_event(jid, f"re-angled to {angle!r} — {n} draft(s) rewritten", actor="human")
        try:
            _polish_drafts(jid, job.get("brand"))
        except Exception as e:  # noqa: BLE001
            print(f"worker: redraft polish error (non-fatal): {e}")
        db.clear_queued(jid)
        _telegram_notify(f'\U0001f504 Re-angled "{job["topic"]}" — {angle}. The updated draft is in your approval queue.')
        print(f"worker: re-angled job {jid[:8]} -> {n} draft(s)")


def _reply_prompt(brand, incoming):
    bb = _brand_block({"brand": brand})
    try:
        safety = humanize._brand_safety(brand)
    except Exception:  # noqa: BLE001
        safety = "Ethical only: never shame, scare, manipulate, or use false urgency."
    return (
        "You are replying on behalf of the brand to a follower's message on social media. "
        f"Their message: \"{incoming}\". " + (bb or "")
        + safety + " "
        "Draft a warm, genuinely helpful, on-brand reply in 1-3 sentences. Sound like a real person, not "
        "AI: no em dashes, no clichés, no significance inflation. NEVER give medical advice — point to a "
        "professional (IBCLC/doctor) instead. If the message is distressed, a complaint, or a possible "
        "crisis, reply gently and keep it safe (the operator reviews before it sends). Use METRIC units. "
        "Output ONLY the reply text — no preamble, no surrounding quotes."
    )


def _safety_check(body, brand):
    """§6a post-generation brand-safety classifier. Returns (verdict, reason); resolves DOWN on doubt."""
    try:
        bsafety = humanize._brand_safety(brand)
    except Exception:  # noqa: BLE001
        bsafety = "Ethical only: never shame, scare, manipulate, or use false urgency."
    prompt = (
        "You are a brand-safety reviewer. A social post is about to reach a human for final approval. "
        "Classify it as EXACTLY one of green, amber, or red.\n"
        "RED (would block): graphic violence/gore; hate/discrimination; sexual/explicit; anything sexualizing "
        "minors; instructions for illegal/dangerous acts; impersonation; harmful misinformation; unproven or "
        "dangerous health remedies; or — for a health/breastfeeding brand — anything that reads as personalised "
        "MEDICAL ADVICE rather than general info.\n"
        "AMBER (needs the operator's explicit yes): breaking tragedy/disaster newsjacking; divisive politics or "
        "religion; health/legal/financial guidance; naming real people/competitors; unapproved-sounding "
        "endorsements or undisclosed ads; guilt-inducing or shaming tone (e.g. guilt toward formula/combo "
        "feeding); ragebait/clickbait; risky platform imagery.\n"
        "GREEN: clearly safe, on-brand, low-stakes.\n"
        f"Brand rules: {bsafety}\n"
        "When UNCERTAIN resolve DOWN (amber over green, red over amber), never up. "
        "Reply in EXACTLY this format and nothing else:\nVERDICT: <green|amber|red>\nREASON: <one short sentence>\n\n"
        f"POST:\n{body}"
    )
    try:
        r = subprocess.run(["hermes", "-z", prompt], capture_output=True, text=True, timeout=120)
        out = r.stdout or ""
        v = re.search(r"VERDICT:\s*(green|amber|red)", out, re.I)
        rs = re.search(r"REASON:\s*(.+)", out)
        return (v.group(1).lower() if v else "amber"), (rs.group(1).strip() if rs else "")
    except Exception:  # noqa: BLE001
        return "amber", "automatic safety check unavailable — review manually"


def _safety_check_one(d, brand, job_id=None):
    if d.get("safety_json"):
        return None
    verdict, reason = _safety_check(d.get("body") or "", brand)
    db.set_draft_safety(d["id"], verdict, reason)
    jid = job_id or d.get("job_id")
    if verdict != "green" and jid:
        db.record_event(jid, f"brand-safety: {verdict.upper()} — {reason}", actor="system")  # audit trail (§6a)
    print(f"worker: safety {verdict} for draft {d['id']}")
    return verdict


def _safety_check_drafts(job_id, brand=None):
    worst = "green"
    order = {"green": 0, "amber": 1, "red": 2}
    for d in db.list_drafts(job_id):
        v = _safety_check_one(d, brand, job_id=job_id)
        if v and order.get(v, 0) > order.get(worst, 0):
            worst = v
    return worst


def _safety_pending(limit=12):
    """Sweep: safety-check any preview draft from ANY path (incl. Telegram) not yet checked."""
    pending = db.preview_drafts_unchecked(limit)
    if pending:
        print(f"worker: safety-checking {len(pending)} draft(s)")
    for d in pending:
        _safety_check_one(d, d.get("brand"))


def _process_reply_drafts():
    """§3d: draft on-brand replies to engagement (Chatwoot) conversations. The operator reviews +
    sends every draft — this only prepares the text (the human gate, §4a)."""
    try:
        pending = db.pending_reply_drafts()
    except Exception as e:  # noqa: BLE001
        print(f"worker: reply-draft scan error: {e}")
        return
    for r in pending:
        try:
            out = subprocess.run(["hermes", "-z", _reply_prompt(r.get("brand"), r.get("incoming") or "")],
                                 capture_output=True, text=True, timeout=RUN_TIMEOUT_SECONDS)
            text = humanize.scrub((out.stdout or "").strip().strip('"').strip())
            db.save_reply_draft(r["id"], text or "(couldn't draft — reply manually)", "drafted")
            print(f"worker: drafted reply for conversation {r.get('conversation_id')}")
        except Exception as e:  # noqa: BLE001
            db.save_reply_draft(r["id"], "(draft failed — reply manually)", "error")
            print(f"worker: reply-draft error: {e}")


def main():
    db.init_db()
    _heartbeat()
    if _locked():
        print("worker: another run is in progress, skipping")
        return
    try:
        _maybe_run_scout()
        _check_occasions()
        _process_redrafts()
        _process_reply_drafts()
        _autotag_media()
        _polish_pending()  # polish drafts from ANY path (incl. Telegram) that aren't polished yet
        _safety_pending()  # §6a brand-safety review on any preview draft not yet checked
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
