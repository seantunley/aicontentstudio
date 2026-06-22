"""Tool handlers. Each receives an args dict, returns a JSON string, and never raises
(errors come back as {"error": ...}) — the Hermes plugin handler contract."""
import os
import re
import json
import subprocess
import datetime

from . import db, postiz, humanize, registry, socialpulse

_KNOWLEDGE_DIR = os.environ.get("KNOWLEDGE_DIR", "/opt/studio/knowledge")


def _write_voice_example(brand, platform, topic, body, job_id):
    """Learning flywheel (§7): an approved post becomes a brand-tagged voice-example note in the
    shared knowledge base, so future generation can retrieve it and stay on-voice. Best-effort —
    matches the dashboard's writer (lib/knowledge.js) so both approval paths produce the same notes."""
    try:
        text = (body or "").strip()
        if not text:
            return
        bslug = re.sub(r"[^a-z0-9]+", "-", (brand or "unassigned").lower()).strip("-") or "unassigned"
        d = os.path.join(_KNOWLEDGE_DIR, "voice", bslug)
        os.makedirs(d, exist_ok=True)
        title = f"{(topic or 'post').replace(chr(10), ' ')[:80]} — {platform or 'post'}"
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        fm = "\n".join([
            "---", f"title: {title.replace(chr(34), chr(39))}", "type: voice-example",
            f"brand: {brand or 'unassigned'}", f"platform: {platform or ''}",
            f"approved: {now}", f"tags: [voice, {bslug}" + (f", {platform}" if platform else "") + "]", "---",
        ])
        with open(os.path.join(d, f"{str(job_id)[:8]}-{platform or 'post'}.md"), "w") as f:
            f.write(f"{fm}\n\n# {title}\n\n{text}\n")
    except Exception:  # noqa: BLE001 — never break the approval gate
        pass


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
    if brand == "unassigned":
        # Offer brands already in use + the plan's primary/template brand (§1a); 'Other' is auto-added
        # by the clarify UI. On Telegram these render as tappable buttons.
        choices = []
        for b in db.known_brands(4) + ["breastfeeding-support"]:
            if b not in choices:
                choices.append(b)
        choices = choices[:4]
        tail = (f" Brand is unassigned. Call the `clarify` tool NOW — question \"Which brand is this for?\","
                f" choices {choices} (the operator taps one, or picks 'Other' to type a new brand)."
                f" Then call `set_brand` with job_id '{job['id']}' and their answer BEFORE researching.")
    else:
        tail = f" Brand: {brand}."
    return _ok(
        job_id=job["id"], short_id=job["id"][:8], state=job["state"], brand=job["brand"], topic=job["topic"],
        message=f"Logged job {job['id'][:8]} ('{topic}') in state 'requested'.{tail}",
    )


def queue_content(args, **kwargs):
    """Hand a content request to the Studio: create a QUEUED job the worker will research, draft,
    polish, safety-check and validate, then notify when review-ready. The work flows through the
    Studio — the agent never drafts in the chat. One call per distinct piece."""
    topic = (args.get("topic") or "").strip()
    if not topic:
        return _err("topic is required")
    brand = (args.get("brand") or "unassigned").strip() or "unassigned"
    media = (args.get("media") or "none").strip().lower()
    if media not in ("none", "image", "video", "carousel", "script"):
        media = "none"
    direction = (args.get("direction") or "").strip() or None  # creative direction the bot agreed (format/look/angle)
    raw = args.get("platforms") or []
    if isinstance(raw, str):
        raw = [p for p in re.split(r"[,\s]+", raw) if p]
    known = set(registry.PLATFORM_RULES.keys())
    platforms = [p.lower() for p in raw if isinstance(p, str) and p.lower() in known]
    try:
        slides = int(args.get("slides") or 4)
    except (TypeError, ValueError):
        slides = 4
    created_by = str(kwargs.get("user_id") or "") or None
    pillar = (args.get("pillar") or "").strip() or None

    if brand == "unassigned":
        choices = []
        for b in db.known_brands(4) + ["breastfeeding-support"]:
            if b not in choices:
                choices.append(b)
        return _ok(needs_brand=True, topic=topic, message=(
            "Brand not set. Call the `clarify` tool NOW — question \"Which brand is this for?\", "
            f"choices {choices[:4]} — then call queue_content again WITH that brand. Never queue 'unassigned'."))

    try:
        job = db.create_and_queue(topic=topic, brand=brand, source="telegram",
                                  created_by=created_by, platforms=platforms, media=media, slides=slides,
                                  pillar=pillar, direction=direction)
    except Exception as e:  # noqa: BLE001 — handler contract: never raise
        return _err(str(e))

    plat_txt = ", ".join(platforms) if platforms else "all connected platforms"
    media_txt = "" if media == "none" else f" (+{media})"
    return _ok(
        job_id=job["id"], short_id=job["id"][:8], brand=brand, platforms=platforms or "all",
        queued_action=job.get("queued_action"),
        message=(f"Queued to the Studio: '{topic}' for {plat_txt}{media_txt}. The worker will research, draft, "
                 "polish and validate it, then it lands in the approval queue. Tell the operator in ONE short "
                 "line what you queued — do NOT draft or describe the post in the chat."),
    )


def set_brand(args, **kwargs):
    jid = (args.get("job_id") or "").strip()
    brand = (args.get("brand") or "").strip()
    if not jid:
        return _err("job_id is required")
    if not brand:
        return _err("brand is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    try:
        updated = db.set_job_brand(job["id"], brand, actor=str(kwargs.get("user_id") or "human"))
    except Exception as e:  # noqa: BLE001 — handler contract: never raise
        return _err(str(e))
    return _ok(
        job_id=updated["id"], short_id=updated["id"][:8], brand=updated["brand"],
        message=f"Brand set to '{updated['brand']}' for job {updated['id'][:8]}.",
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
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    if to_state == job["state"]:
        # already there — graceful no-op so the model doesn't loop trying to re-advance
        return _ok(job_id=job["id"], short_id=job["id"][:8], state=job["state"],
                   message=f"Job {job['id'][:8]} is already at '{job['state']}'. Nothing to do — stop here.")
    if to_state in ("approved", "published"):
        return _err(
            "REFUSED — you cannot approve or publish; that is the operator's call in the cockpit. The "
            "draft stops at 'preview'. Tell the operator it's ready to review and STOP. Do NOT call "
            "advance_job again for this job."
        )
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
        video = {"id": draft["video_id"], "path": draft["video_path"]} if draft.get("video_id") else None
        postiz.create_post(ig["id"], draft["body"], platform, when="now", image=image, video=video)
    except postiz.PostizError as e:
        db.record_event(job["id"], f"publish FAILED via Postiz: {e}", actor="system")
        return _err(f"publish failed: {e}")
    media = "video" if video else ("image" if image else None)
    db._advance_to(job["id"], "published", actor="system",
                   detail=f"published to {platform} via Postiz ({ig.get('profile')})"
                          + (f" with {media}" if media else ""))
    return _ok(published=True, job_id=job["id"], short_id=job["id"][:8], platform=platform,
               channel=ig.get("profile"), media=media, with_image=bool(image), state="published",
               message=f"Published job {job['id'][:8]} to {platform} ({ig.get('profile')}) via Postiz"
                       + (f" with {media}." if media else "."))


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
    # Layer 1 of the humanizer (Principle 0): a safe deterministic de-slop on every draft,
    # whatever path created it. The full second-model rewrite runs later in the worker.
    body = humanize.scrub((args.get("body") or "").strip())
    if not jid or not platform or not body:
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
    # Learning flywheel (§7): capture the greenlit drafts as brand-tagged voice examples.
    for dr in db.list_drafts(job["id"]):
        _write_voice_example(job.get("brand"), dr.get("platform"), job.get("topic"), dr.get("body"), job["id"])
    return _ok(job_id=job["id"], decision="approve", state="approved",
               message=f"Approved {job['id'][:8]} — it's now in 'Ready to publish' in the cockpit; publish it there.")


def _telegram_creds():
    env = {}
    try:
        with open("/opt/data/.env") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k] = v
    except OSError:
        return None, None
    return env.get("TELEGRAM_BOT_TOKEN"), env.get("TELEGRAM_ALLOWED_USERS", "").split(",")[0]


def _render_mockup(platform, handle, body, imgs, video):
    """Render the on-platform mockup card (what the dashboard PostPreview shows) to a PNG via the
    renderer. Returns image bytes, or None so the caller can fall back to a raw media send."""
    import requests
    try:
        payload = {
            "platform": (platform or "instagram").lower(),
            "handle": handle or "",
            "body": body or "",
            "images": [m.get("path") for m in (imgs or []) if m.get("path")][:10],
            "video": bool(video),
            "palette": db.brand_palette(handle),  # brand-theme the preview card; {} = studio default look
        }
        r = requests.post(f"{RENDER_URL}/preview", json=payload, timeout=120)
        if r.status_code == 200 and r.content:
            return r.content
    except Exception:  # noqa: BLE001 — renderer down/unreachable -> fall back to raw send
        return None
    return None


def present_for_review(args, **kwargs):
    """Push the CLEAN post preview (the on-platform mockup card as it'll appear) to the operator's
    Telegram — no brief, no sources, no ids. Call this, then present Approve/Reject/Defer via clarify."""
    import requests
    jid = (args.get("job_id") or "").strip()
    if not jid:
        return _err("job_id is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    drafts = db.list_drafts(job["id"])
    if not drafts:
        return _err("no draft to preview yet")
    draft = drafts[-1]
    tok, chat = _telegram_creds()
    if not tok or not chat:
        return _err("Telegram not configured")
    cap = draft["body"]
    # gather the draft's image(s): a carousel sends all slides as a media group, a single image one photo.
    imgs = []
    try:
        imgs = json.loads(draft.get("images_json") or "null") or []
    except Exception:  # noqa: BLE001
        imgs = []
    if not imgs and draft.get("image_path"):
        imgs = [{"path": draft["image_path"]}]

    # Preferred: a styled "as it'll appear on <platform>" mockup card rendered to a PNG.
    png = _render_mockup(draft["platform"], job.get("brand"), cap, imgs, draft.get("video_path"))
    if png:
        try:
            requests.post(f"https://api.telegram.org/bot{tok}/sendPhoto",
                          data={"chat_id": chat, "caption": f"{draft['platform']} preview"},
                          files={"photo": ("preview.png", png)}, timeout=30)
            return _ok(job_id=job["id"], short_id=job["id"][:8], platform=draft["platform"],
                       message=("On-platform preview sent to Telegram. NOW call the clarify tool with choices "
                                "['Approve','Reject','Defer'] to give the operator tap buttons."))
        except Exception:  # noqa: BLE001 — fall through to the raw media send below
            pass

    # Fallback: raw media + caption (renderer unreachable, or no mockup produced).
    try:
        if len(imgs) > 1:
            files, media = {}, []
            for i, m in enumerate(imgs[:10]):
                try:
                    content = requests.get(m["path"], timeout=30).content
                except Exception:  # noqa: BLE001
                    continue
                key = f"photo{i}"
                files[key] = (f"{key}.jpg", content)
                item = {"type": "photo", "media": f"attach://{key}"}
                if not media:
                    item["caption"] = cap  # caption rides on the first slide
                media.append(item)
            if media:
                requests.post(f"https://api.telegram.org/bot{tok}/sendMediaGroup",
                              data={"chat_id": chat, "media": json.dumps(media)}, files=files, timeout=60)
            else:
                requests.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                              data={"chat_id": chat, "text": cap}, timeout=15)
        elif imgs:
            img = requests.get(imgs[0]["path"], timeout=30).content
            requests.post(f"https://api.telegram.org/bot{tok}/sendPhoto",
                          data={"chat_id": chat, "caption": cap},
                          files={"photo": ("post.jpg", img)}, timeout=30)
        else:
            requests.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                          data={"chat_id": chat, "text": cap}, timeout=15)
    except Exception as e:  # noqa: BLE001
        return _err(f"preview send failed: {e}")
    return _ok(job_id=job["id"], short_id=job["id"][:8], platform=draft["platform"],
               message=("Clean post preview sent to Telegram. NOW call the clarify tool with choices "
                        "['Approve','Reject','Defer'] to give the operator tap buttons."))


_L30D = "/opt/data/skills/research/last30days/scripts/last30days.py"


def social_pulse(args, **kwargs):
    """Pull what people are ACTUALLY saying about a topic in the last ~30 days (Reddit + social),
    clustered by theme with engagement signal, via the vetted last30days skill. Returns a current-
    discussion brief the research agent CORRELATES with its web sources — live social signal the
    studio's general web search misses. Research-time tool (not for casual chat)."""
    topic = (args.get("topic") or "").strip()
    if not topic:
        return _err("topic is required")
    sources = (args.get("sources") or "reddit").strip() or "reddit"
    try:
        pulse = socialpulse.pull(topic, sources)  # runs last30days + drops off-topic trending noise
    except Exception as e:  # noqa: BLE001 — handler contract: never raise
        return _err(f"social pulse failed: {e}")
    if not pulse or not (pulse.get("text") or "").strip():
        return _err("no relevant current social discussion found for this topic — rely on web research")
    return _ok(
        topic=topic, sources=sources, brief=pulse["text"][:8000],
        message=("Current ON-TOPIC social discussion pulled (off-topic trending posts filtered out). "
                 "CORRELATE this with your web research — weave only verified, cross-checked points into "
                 "the brief, cite distinct sources, never lean on one."),
    )


def list_channels(args, **kwargs):
    """List the social channels actually connected in Postiz (so you draft for ones that exist)."""
    try:
        chans = postiz.list_integrations()
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    out = [{"platform": c.get("identifier"), "name": c.get("name"), "handle": c.get("profile"),
            "connected": not c.get("disabled")} for c in (chans or [])]
    return _ok(count=len(out), channels=out)


def _derive_image(master_path, tw, th):
    """Center-crop the master to the target aspect ratio, scale to (tw, th). Returns the output path."""
    out = f"{os.path.splitext(master_path)[0]}_{tw}x{th}.jpg"
    vf = f"crop=w='min(iw,ih*{tw}/{th})':h='min(ih,iw*{th}/{tw})',scale={tw}:{th}"
    subprocess.run(["ffmpeg", "-y", "-i", master_path, "-vf", vf, "-q:v", "3", out],
                   check=True, capture_output=True, timeout=60)
    return out


def set_draft_image(args, **kwargs):
    """Attach the generated MASTER image to the job's draft(s), each cropped to its platform's size.
    One master in -> every platform variant out (plan §5/§7c master-asset derivation)."""
    jid = (args.get("job_id") or "").strip()
    path = (args.get("image_path") or "").strip()
    tags = (args.get("tags") or "").strip() or None  # content keywords for the Vault search
    if not jid or not path:
        return _err("job_id and image_path are required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    drafts = db.list_drafts(job["id"])
    if not drafts:
        return _err("no draft to attach an image to — create_draft first")
    if not os.path.exists(path):
        return _err(f"image file not found: {path}")
    done = []
    for d in drafts:
        tw, th = db.PLATFORM_IMAGE.get(d["platform"], (1080, 1080))
        try:
            derived = _derive_image(path, tw, th)
            media = postiz.upload_image(derived)
            db.set_draft_image_by_id(d["id"], media.get("id"), media.get("path"))
            db.add_media_asset("image", media.get("path"), media.get("id"), source="derived",
                               job_id=job["id"], draft_id=d["id"], platform=d["platform"], width=tw, height=th, tags=tags)
            done.append(f"{d['platform']} {tw}x{th}")
        except postiz.PostizError as e:
            return _err(f"upload for {d['platform']} failed: {e}")
        except Exception as e:  # noqa: BLE001
            return _err(f"derive/attach for {d['platform']} failed: {e}")
    db.record_event(job["id"], f"master image derived + attached: {', '.join(done)}", actor="agent")
    return _ok(job_id=job["id"], short_id=job["id"][:8], attached=done,
               message=f"Image sized per platform and attached to {len(done)} draft(s): {', '.join(done)}.")


def set_carousel(args, **kwargs):
    """Attach MULTIPLE images as a swipe CAROUSEL to the job's draft(s) — each slide sized per
    platform, in order. Generate the slides with image_gen first (a distinct image per slide), then
    pass their file paths here in order. For a single image use set_draft_image instead."""
    jid = (args.get("job_id") or "").strip()
    paths = args.get("image_paths") or []
    if isinstance(paths, str):
        paths = [paths]
    paths = [p.strip() for p in paths if p and str(p).strip()]
    tags = (args.get("tags") or "").strip() or None
    if not jid or not paths:
        return _err("job_id and image_paths (a list of 2+ paths) are required")
    if len(paths) < 2:
        return _err("a carousel needs at least 2 images — use set_draft_image for one image")
    if len(paths) > 10:
        return _err("carousels are capped at 10 images")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    drafts = db.list_drafts(job["id"])
    if not drafts:
        return _err("no draft to attach to — create_draft first")
    for p in paths:
        if not os.path.exists(p):
            return _err(f"image file not found: {p}")
    done = []
    for d in drafts:
        tw, th = db.PLATFORM_IMAGE.get(d["platform"], (1080, 1080))
        media_list = []
        try:
            for p in paths:
                derived = _derive_image(p, tw, th)
                media = postiz.upload_image(derived)
                media_list.append({"id": media.get("id"), "path": media.get("path")})
                db.add_media_asset("image", media.get("path"), media.get("id"), source="derived",
                                   job_id=job["id"], draft_id=d["id"], platform=d["platform"], width=tw, height=th, tags=tags)
            db.set_draft_images_by_id(d["id"], media_list)
            done.append(f"{d['platform']} x{len(media_list)}")
        except postiz.PostizError as e:
            return _err(f"upload for {d['platform']} failed: {e}")
        except Exception as e:  # noqa: BLE001
            return _err(f"carousel attach for {d['platform']} failed: {e}")
    db.record_event(job["id"], f"carousel attached ({len(paths)} slides): {', '.join(done)}", actor="agent")
    return _ok(job_id=job["id"], short_id=job["id"][:8], slides=len(paths), attached=done,
               message=f"Carousel of {len(paths)} images attached to {len(done)} draft(s).")


def suggest_topic(args, **kwargs):
    """Record a timely content idea for the operator to review (trend scout, §3b). SUGGEST ONLY —
    does NOT create a job, research, or publish. The operator promotes it later if they want it."""
    topic = (args.get("topic") or "").strip()
    if not topic:
        return _err("topic is required")
    brand = (args.get("brand") or "unassigned").strip() or "unassigned"
    rationale = (args.get("rationale") or "").strip() or None
    source_url = (args.get("source_url") or "").strip() or None
    source = (args.get("source") or "").strip() or None
    heat = (args.get("heat") or "warm").strip().lower()
    pillar = (args.get("pillar") or "").strip() or None
    niche_id = args.get("niche_id")
    if brand == "unassigned" and niche_id:  # backfill the brand from the scout niche
        n = db.get_niche(niche_id)
        if n:
            brand = n["brand"]
    try:
        r = db.create_suggestion(brand, topic, rationale, source_url, niche_id, source=source, heat=heat, pillar=pillar)
    except Exception as e:  # noqa: BLE001 — handler contract: never raise
        return _err(str(e))
    if r.get("duplicate"):
        return _ok(duplicate=True, message=f"'{topic}' was already suggested — skipped the duplicate.")
    return _ok(suggestion_id=r["id"], topic=topic, brand=brand,
               message=f"Suggested '{topic}' for {brand} — it's in the operator's ideas list.")


def delegate(args, **kwargs):
    """§org (Phase B) — the CEO hands a CONTENT task to Nancy (Head of Content). Records a tracked
    delegation; Nancy's bot picks it up automatically. Constance does NOT produce content himself — this
    is the hand-off, and he follows up via the delegations tool to close the loop."""
    task = (args.get("task") or "").strip()
    if not task:
        return _err("task is required — what should Nancy make?")
    brand = (args.get("brand") or "").strip() or None
    try:
        d = db.create_delegation(task, brand=brand, from_agent="constance", to_agent="nancy",
                                 platforms=args.get("platforms") or None,
                                 media=(args.get("media") or "").strip().lower() or None,
                                 direction=(args.get("direction") or "").strip() or None,
                                 note=(args.get("note") or "").strip() or None)
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    tail = (f" for {brand}" if brand else " — no brand pinned, so Nancy will chase the operator for it first")
    return _ok(delegation_id=d["id"][:8], task=task, brand=brand, status=d["status"],
               message=f"Handed to Nancy: \"{task}\"{tail}. She picks it up automatically; follow up with the delegations tool.")


def delegations(args, **kwargs):
    """§org (Phase B) — the CEO's follow-up view: what's been handed to Nancy and where it stands.
    Auto-closes any delegation whose content has reached the gate. Use it to close the loop."""
    status = (args.get("status") or "").strip() or None
    try:
        rows = db.list_delegations(from_agent="constance", status=status, limit=30)
    except Exception as e:  # noqa: BLE001
        return _err(str(e))
    items = [{"id": r["id"][:8], "task": r["task"], "brand": r.get("brand"), "status": r["status"],
              "job": (r.get("job_id") or "")[:8] or None} for r in rows]
    o = sum(1 for r in rows if r["status"] == "open")
    a = sum(1 for r in rows if r["status"] == "accepted")
    done = sum(1 for r in rows if r["status"] == "done")
    return _ok(count=len(items), open=o, in_progress=a, delivered=done, delegations=items,
               message=f"{o} not started, {a} being made, {done} delivered. Delivered ones are sitting in review — chase the operator to approve them in the cockpit.")


RENDER_URL = os.environ.get("STUDIO_RENDER_URL", "http://127.0.0.1:3100").rstrip("/")


def _video_caption(body, limit=120):
    """A short on-screen hook from the post body — first sentence, else a trimmed lead."""
    body = (body or "").strip().replace("\n", " ")
    for sep in (". ", "! ", "? "):
        i = body.find(sep)
        if 0 < i <= limit:
            return body[: i + 1].strip()
    if len(body) <= limit:
        return body
    return body[:limit].rsplit(" ", 1)[0].strip() + "…"


def _grok_animate(local_image_path, motion_prompt, width, height, seconds, retries=3):
    """Animate a still into a short moving clip via xAI Grok Imagine (image-to-video, §7b). Returns a
    video URL (vidgen.x.ai) or None. xAI's video gen is flaky (~1-in-2 first calls hit a transient
    'internal error'), so retry. Runs on the operator's Grok subscription — no per-clip metering."""
    import sys as _sys
    if "/opt/hermes" not in _sys.path:
        _sys.path.append("/opt/hermes")  # hermes 'tools'/'agent' packages the plugin imports
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("xai_vidgen", "/opt/hermes/plugins/video_gen/xai/__init__.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        prov = mod.XAIVideoGenProvider()
    except Exception as e:  # noqa: BLE001
        db.log_system_event("warn", "video", "Grok video backend unavailable", str(e)[:300])
        return None
    if not prov.is_available():
        db.log_system_event("warn", "video", "Grok video backend not configured (no xAI credentials)", None)
        return None
    ar = "9:16" if height > width else ("16:9" if width > height else "1:1")
    secs = max(3, min(15, int(round(seconds or 6))))
    last = None
    for _ in range(max(1, retries)):
        try:
            res = prov.generate(motion_prompt, image_url=local_image_path, aspect_ratio=ar,
                                resolution="720p", duration=secs)
        except Exception as e:  # noqa: BLE001
            last = str(e)
            continue
        if isinstance(res, dict) and res.get("success") and res.get("video"):
            return res.get("video")
        last = (res or {}).get("error") if isinstance(res, dict) else str(res)
    db.log_system_event("warn", "video", "Grok image-to-video failed after retries (still-image fallback used)", str(last)[:400])
    return None


def make_video(args, **kwargs):
    """Render a branded short video for each of the job's platform drafts (Remotion + ffmpeg) and
    attach it. With a `script`, it generates an AI voiceover (Piper/ElevenLabs TTS) + time-synced
    kinetic captions; the background defaults to a real Grok Imagine motion clip (image-to-video,
    §7b) animating the draft's image — set animate=false to use the free Ken-Burns still instead.
    Without a script: a silent on-screen caption. Sizes per platform."""
    import tempfile
    import requests
    jid = (args.get("job_id") or "").strip()
    if not jid:
        return _err("job_id is required")
    job = db.find_job(jid)
    if not job:
        return _err(f"no job matching '{jid}'")
    drafts = db.list_drafts(job["id"])
    if not drafts:
        return _err("no drafts — create_draft first")
    kicker = (args.get("kicker") or job.get("brand") or "").strip()
    if kicker.lower() == "unassigned":
        kicker = ""
    script = (args.get("script") or "").strip()  # spoken voiceover narration → voiced video (§7b Phase 3)
    # animate / captions default from the /settings page when the caller doesn't say; explicit arg wins.
    animate = bool(args["animate"]) if "animate" in args else db.get_setting_bool("video_animate", True)
    captions = bool(args["captions"]) if "captions" in args else db.get_setting_bool("video_captions", False)
    try:
        _maxv = float(db.get_setting("video_max_seconds") or 15)   # /settings → Generation & Media
        dur = max(4.0, min(_maxv, float(args.get("duration_sec") or db.get_setting("video_default_seconds") or 6)))
    except (TypeError, ValueError):
        dur = 6.0
    _bvis = db.brand_visual_text(job.get("brand"))   # brand mood → woven into the motion prompt (§visual identity)
    _palette = db.brand_palette(job.get("brand"))     # brand palette → renderer theming (caption pills / kicker / accent)
    done, failed = [], []
    for d in drafts:
        w, h = db.PLATFORM_VIDEO.get(d["platform"], (1080, 1920))
        video_url = None
        if script:
            img_url = d.get("image_path") or ""
            # Default background = a real Grok Imagine motion clip animating the draft's image. xAI
            # can't reach our LAN, so fetch the image locally first and hand it over as base64.
            if animate and img_url:
                imgtmp = None
                try:
                    ir = requests.get(img_url, timeout=60)
                    if ir.ok and ir.content:
                        itf = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
                        itf.write(ir.content)
                        itf.close()
                        imgtmp = itf.name
                except requests.RequestException:
                    imgtmp = None
                if imgtmp:
                    secs = max(3, min(15, round(len(script.split()) / 2.6)))  # ~clip length ≈ voiceover
                    motion = ("Gentle, slow cinematic camera push-in with soft natural light and subtle, "
                              "lifelike motion; calm and premium." + (f" Theme: {kicker}." if kicker else ""))
                    if _bvis:
                        motion += " " + _bvis  # honour the brand's mood/art-direction in the motion treatment
                    video_url = _grok_animate(imgtmp, motion, w, h, secs)
                    try:
                        os.unlink(imgtmp)
                    except OSError:
                        pass
            payload = {"script": script, "imageUrl": img_url, "kicker": kicker, "width": w, "height": h,
                       "captions": captions}  # captions toggle from /settings (default on)
            if _palette:
                payload["palette"] = _palette  # brand-theme the caption pills + kicker (falls back to studio look)
            if video_url:
                payload["videoUrl"] = video_url  # renderer loops it under the voiceover + captions
            endpoint, vtimeout = "/video", 1200  # voiced render is frame-by-frame; allow slow CPU renders
        else:
            caption = (args.get("caption") or _video_caption(d["body"])).strip()
            payload = {"imageUrl": d.get("image_path") or "", "caption": caption,
                       "kicker": kicker, "width": w, "height": h, "durationSec": dur, "id": d["id"]}
            if _palette:
                payload["palette"] = _palette  # brand-theme the accent bar + kicker (falls back to studio look)
            endpoint, vtimeout = "/render", 300
        try:
            r = requests.post(f"{RENDER_URL}{endpoint}", json=payload, timeout=vtimeout)
            if r.status_code >= 300 or not r.headers.get("Content-Type", "").startswith("video") or not r.content:
                detail = r.text[:140] if r.content else f"HTTP {r.status_code}"
                failed.append(f"{d['platform']}: render failed ({detail})")
                continue
            tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            tmp.write(r.content)
            tmp.close()
            try:
                media = postiz.upload_video(tmp.name)
            finally:
                os.unlink(tmp.name)
            db.set_draft_video_by_id(d["id"], media.get("id"), media.get("path"))
            db.add_media_asset("video", media.get("path"), media.get("id"), source="rendered",
                               job_id=job["id"], draft_id=d["id"], platform=d["platform"], width=w, height=h,
                               tags=(args.get("caption") or "").strip() or None)
            done.append(f"{d['platform']} {w}x{h}{' +Grok-motion' if video_url else ''}")
            db.record_build_step(job["id"], "video",
                                 model=("xAI Grok Imagine — image→video motion" if video_url else "Ken-Burns still (no motion)"),
                                 provider=("xai" if video_url else "renderer"),
                                 params={"platform": d["platform"], "dimensions": f"{w}x{h}", "duration_sec": round(dur, 1),
                                         "animate": animate, "grok_motion": bool(video_url), "captions": captions})
        except requests.RequestException as e:
            failed.append(f"{d['platform']}: renderer unreachable ({e})")
        except postiz.PostizError as e:
            failed.append(f"{d['platform']}: upload failed ({e})")
        except Exception as e:  # noqa: BLE001 — handler contract: never raise
            failed.append(f"{d['platform']}: {e}")
    if done:
        db.record_event(job["id"], f"video rendered + attached: {', '.join(done)}", actor="agent")
    if failed:
        db.log_system_event("error" if not done else "warn", "video",
                            f"Video render issue: {job.get('topic')}", "; ".join(failed), job["id"])
    if not done:
        return _err("no videos produced. " + "; ".join(failed))
    msg = f"Rendered + attached video to {len(done)} draft(s): {', '.join(done)}."
    if failed:
        msg += " Failed: " + "; ".join(failed)
    return _ok(job_id=job["id"], short_id=job["id"][:8], rendered=done, failed=failed, message=msg)
