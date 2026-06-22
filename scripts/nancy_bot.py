#!/usr/bin/env python3
"""Nancy — Head of Content. A Claude-powered Telegram bot (your Claude SUBSCRIPTION, via the host
`claude` CLI), parallel to Constance (the Hermes/Grok CEO bot). Nancy is the content specialist: she runs
on the same model that researches, writes and checks every post in the Studio, so the chat voice and
the published voice are one. She reports to Constance and they share ONE studio (this same studio.db).

Design (deliberately dependency-light — stdlib only, so it runs anywhere the subscription `claude` does):
  • transport  — the Telegram Bot API by hand (long-poll getUpdates + sendMessage/sendPhoto + buttons).
  • brain      — `claude --print` with NANCY.md as the system prompt (clean persona, not the coding agent),
                 the live studio state + recent conversation fed in each turn. Subscription, no API cost.
  • actions    — Nancy ends a reply with ONE ```studio {json}``` block; this executes it against db.py
                 (the SAME source of truth the worker + dashboard use). queue / clarify / review / suggest.
  • §4a gate   — Approve/Reject/Defer are DETERMINISTIC button callbacks (db.advance_job), never a model
                 decision; approve only moves a job to 'approved' (Ready to publish) — publishing stays a
                 human action in the cockpit.

  Run:  NANCY_BOT_TOKEN=<botfather token> TELEGRAM_ALLOWED_USERS=<id,id> python3 scripts/nancy_bot.py
"""
import os
import re
import sys
import json
import time
import datetime
import uuid
import mimetypes
import urllib.request
import urllib.parse
import subprocess
from collections import Counter

REPO = os.environ.get("STUDIO_REPO", "/home/hermes/aicontentstudio")
TOKEN = os.environ.get("NANCY_BOT_TOKEN", "")
ALLOWED = {u.strip() for u in os.environ.get("TELEGRAM_ALLOWED_USERS", "").split(",") if u.strip()}
HOME = os.environ.get("TELEGRAM_HOME_CHANNEL") or (sorted(ALLOWED)[0] if ALLOWED else None)  # where Nancy pushes proactive notes (delegations)
CLAUDE = os.environ.get("CLAUDE_BIN", "claude")
MODEL = os.environ.get("NANCY_MODEL", "claude-sonnet-4-6")  # match the content model → consistent tone
PERSONA = os.environ.get("NANCY_PERSONA", os.path.join(REPO, "config", "NANCY.md"))
DB_PATH = os.environ.get("STUDIO_DB_PATH", os.path.join(REPO, "studio-data", "studio.db"))
SESS_FILE = os.path.join(REPO, "studio-data", "nancy-sessions.json")
POSTIZ_FALLBACK = "127.0.0.1:4007"
HISTORY_TURNS = 8  # ~4 exchanges of working memory — short on purpose so old topics/pastes age out fast
# Nancy talks; she doesn't touch the filesystem/shell — disable the coding-agent tools entirely.
DISALLOWED = ["Bash", "Edit", "Write", "Read", "NotebookEdit", "WebFetch", "WebSearch",
              "Glob", "Grep", "Task", "TodoWrite"]

sys.path.insert(0, os.path.join(REPO, "plugins", "studio"))
os.environ.setdefault("STUDIO_DB_PATH", DB_PATH)
import db  # noqa: E402  — the studio source of truth (same file the worker + dashboard use)

API = f"https://api.telegram.org/bot{TOKEN}"


# ----------------------------------------------------------------------------- Telegram (stdlib)
def _tg(method, data=None, files=None, timeout=40):
    url = f"{API}/{method}"
    if files:
        boundary = uuid.uuid4().hex
        body = bytearray()
        for k, v in (data or {}).items():
            body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        for k, (fname, content) in files.items():
            ctype = mimetypes.guess_type(fname)[0] or "application/octet-stream"
            body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\n"
                     f"Content-Type: {ctype}\r\n\r\n").encode()
            body += content + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        req = urllib.request.Request(url, data=bytes(body),
                                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    else:
        req = urllib.request.Request(url, data=urllib.parse.urlencode(data or {}).encode())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except Exception as e:  # noqa: BLE001
        print(f"nancy: telegram {method} error: {e}", flush=True)
        return None


def send(chat_id, text, buttons=None):
    """buttons = list of rows, each row a list of (label, callback_data)."""
    data = {"chat_id": chat_id, "text": text[:4096], "disable_web_page_preview": "true"}
    if buttons:
        kb = [[{"text": lbl, "callback_data": cd} for (lbl, cd) in row] for row in buttons]
        data["reply_markup"] = json.dumps({"inline_keyboard": kb})
    return _tg("sendMessage", data)


def send_photo(chat_id, img_bytes, caption=""):
    return _tg("sendPhoto", data={"chat_id": chat_id, "caption": caption[:1024]},
               files={"photo": ("preview.jpg", img_bytes)})


def typing(chat_id):
    _tg("sendChatAction", {"chat_id": chat_id, "action": "typing"})


def answer_cb(cb_id, text=""):
    _tg("answerCallbackQuery", {"callback_query_id": cb_id, "text": text})


# ----------------------------------------------------------------------------- sessions / history
def _load():
    try:
        with open(SESS_FILE) as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def _save(s):
    try:
        tmp = SESS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(s, f)
        os.replace(tmp, SESS_FILE)
    except Exception as e:  # noqa: BLE001
        print(f"nancy: session save error: {e}", flush=True)


SESS = _load()


def _chat(cid):
    return SESS.setdefault(str(cid), {"history": [], "clarify": [], "review": None})


def _remember(cid, role, text):
    c = _chat(cid)
    c["history"].append([role, text])
    c["history"] = c["history"][-HISTORY_TURNS:]
    _save(SESS)


# ----------------------------------------------------------------------------- studio state (the truth)
# Only CURRENT, actionable work is surfaced to the brain each turn. Cancelled/failed/rejected jobs are
# NEVER shown — re-surfacing them is exactly what made Nancy drag up "posts that never happened".
DEAD_STATES = {"cancelled", "failed", "rejected"}


def studio_state():
    jobs = [j for j in db.list_jobs(limit=80) if j.get("state") not in DEAD_STATES]
    counts = Counter(j["state"] for j in jobs)
    lines = ["QUEUE BY STATE (live only): " + (", ".join(f"{k}={v}" for k, v in counts.items()) or "empty")]
    preview = [j for j in jobs if j["state"] == "preview"]
    if preview:
        lines.append("AWAITING REVIEW (preview) — use a review action with the id to show one:")
        for j in preview[:10]:
            lines.append(f"  • [{j['id'][:8]}] {j['topic']} ({j['brand']})")
    ready = [j for j in jobs if j["state"] == "approved"]
    if ready:
        lines.append(f"READY TO PUBLISH (approved, operator publishes in cockpit): {len(ready)}")
    inflight = [j for j in jobs if j["state"] not in ("preview", "approved", "published")]
    if inflight:
        lines.append("IN PROGRESS (being built right now — do NOT re-queue or re-pitch these):")
        for j in inflight[:6]:
            lines.append(f"  • [{j['id'][:8]}] {j['topic']} — {j['state']} ({j['brand']})")
    try:
        brands = [b.get("name") or b.get("slug") for b in db.list_brands()]
    except Exception:  # noqa: BLE001
        brands = []
    lines.append("BRANDS (registered — the only valid brands): " + (", ".join(b for b in brands if b) or "none registered"))
    try:
        opens = db.open_delegations("nancy")
    except Exception:  # noqa: BLE001
        opens = []
    if opens:
        lines.append("OPEN DELEGATIONS FROM CONSTANCE (CEO) — pick each up: queue it and include its delegation_id so the loop closes:")
        for d in opens:
            meta = ", ".join(b for b in [
                (f"brand={d['brand']}" if d.get("brand") else "NO BRAND — ask the operator which"),
                (f"media={d['media']}" if d.get("media") else ""),
                (f"platforms={d['platforms']}" if d.get("platforms") else "")] if b)
            lines.append(f"  • delegation_id={d['id']} :: {d['task']} ({meta})"
                         + (f" — note: {d['note']}" if d.get("note") else ""))
    return "\n".join(lines)


# ----------------------------------------------------------------------------- the brain (subscription)
def run_claude(prompt, timeout=200):
    # read fresh each turn so a Settings change takes effect on the next message (no restart)
    model = (db.get_setting("studio_brain_model") or os.environ.get("NANCY_MODEL") or "opus").strip()
    effort = (db.get_setting("studio_brain_effort") or "").strip()
    cmd = [CLAUDE, "--print", "--model", model, "--fallback-model", "sonnet"]
    if effort:
        cmd += ["--effort", effort]
    cmd += ["--exclude-dynamic-system-prompt-sections", "--system-prompt-file", PERSONA, "--disallowedTools", *DISALLOWED]
    try:
        r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    if r.returncode != 0:
        print(f"nancy: claude error: {(r.stderr or '')[:300]}", flush=True)
        return None
    return (r.stdout or "").strip() or None


def split_action(text):
    m = re.search(r"```studio\s*(\{.*?\})\s*```", text, re.S)
    if not m:
        return text.strip(), None
    action = None
    try:
        action = json.loads(m.group(1))
    except Exception:  # noqa: BLE001
        action = None
    clean = (text[:m.start()] + text[m.end():]).strip()
    return clean, action


def think(cid, user_text):
    c = _chat(cid)
    hist = "\n".join(f"{r.upper()}: {t}" for r, t in c["history"]) or "(none yet)"
    prompt = (f"LIVE STUDIO STATE (the truth — read it, never invent a status):\n{studio_state()}\n\n"
              f"CONVERSATION SO FAR:\n{hist}\n\n"
              f"OPERATOR'S NEW MESSAGE:\n{user_text}\n\n"
              "Reply in your own voice as Nancy. If the operator should choose, or you're queuing / "
              "reviewing / suggesting, end with exactly one ```studio JSON action block per your interface. "
              "Otherwise just reply, no block.")
    return split_action(run_claude(prompt) or "")


# ----------------------------------------------------------------------------- media fetch (for previews)
def _fetch_image(url_or_path, cap=26_214_400):
    if not url_or_path:
        return None
    if str(url_or_path).startswith("http"):
        cands = [url_or_path]
        m = re.match(r"(https?://)([^/]+)(/.*)", url_or_path)
        if m and "127.0.0.1" not in m.group(2):
            cands.append(m.group(1) + POSTIZ_FALLBACK + m.group(3))
        for u in cands:
            try:
                with urllib.request.urlopen(u, timeout=20) as r:
                    data = r.read(cap + 1)
                if data and len(data) <= cap:
                    return data
            except Exception:  # noqa: BLE001
                continue
        return None
    try:
        if os.path.exists(url_or_path) and os.path.getsize(url_or_path) <= cap:
            with open(url_or_path, "rb") as f:
                return f.read()
    except Exception:  # noqa: BLE001
        pass
    return None


def _draft_image_url(draft):
    imgs = draft.get("images_json")
    if imgs:
        try:
            arr = json.loads(imgs) if isinstance(imgs, str) else imgs
            first = arr[0] if arr else None
            return (first.get("url") or first.get("path")) if isinstance(first, dict) else first
        except Exception:  # noqa: BLE001
            pass
    return draft.get("image_path")


# ----------------------------------------------------------------------------- actions
def do_action(cid, action):
    kind = (action.get("action") or "").strip().lower()
    try:
        if kind == "queue":
            return _act_queue(cid, action)
        if kind == "clarify":
            return _act_clarify(cid, action)
        if kind == "review":
            return _act_review(cid, action)
        if kind == "suggest":
            return _act_suggest(cid, action)
        send(cid, f"(I tried an action I don't support yet: {kind})")
    except Exception as e:  # noqa: BLE001
        send(cid, f"That action hit a snag: {e}")


def _resolve_deleg(s):
    """Map a delegation id (full or short prefix) to its full id, or None."""
    try:
        for d in db.list_delegations(limit=100):
            if d["id"] == s or d["id"].startswith(s):
                return d["id"]
    except Exception:  # noqa: BLE001
        pass
    return None


def _act_queue(cid, a):
    topic = (a.get("topic") or "").strip()
    if not topic:
        return send(cid, "(no topic to queue)")
    platforms = a.get("platforms") or []
    if isinstance(platforms, str):
        platforms = [platforms]
    job = db.create_and_queue(
        topic, brand=(a.get("brand") or "unassigned").strip() or "unassigned",
        source="nancy", created_by="Nancy", platforms=platforms,
        media=(a.get("media") or "none").strip().lower(), slides=a.get("slides") or 4,
        direction=(a.get("direction") or "").strip() or None)
    did = (a.get("delegation_id") or "").strip()
    linked = ""
    if did:
        try:
            db.link_delegation(_resolve_deleg(did) or did, job["id"])
            linked = " (closing Constance's loop on it)"
        except Exception:  # noqa: BLE001
            pass
    plats = ", ".join(platforms) or "no platform set"
    send(cid, f"✅ On Nancy's desk → the Studio: \"{topic}\" — {a.get('media') or 'text'} for {plats}  ·  [{job['id'][:8]}]{linked}\n"
              "I'll bring it back to you to review once it's built.")


def _act_clarify(cid, a):
    q = (a.get("question") or "Pick one:").strip()
    choices = [str(c) for c in (a.get("choices") or []) if str(c).strip()][:8]
    if not choices:
        return send(cid, q)
    c = _chat(cid)
    c["clarify"] = choices
    _save(SESS)
    rows = [[(ch, f"clar|{i}")] for i, ch in enumerate(choices)]
    send(cid, q, buttons=rows)


def _act_review(cid, a):
    job = db.find_job((a.get("job_id") or "").strip())
    if not job:
        return send(cid, "Couldn't find that job to review.")
    drafts = db.list_drafts(job["id"])
    if not drafts:
        return send(cid, "Nothing drafted on that one yet.")
    d = drafts[-1]
    img = _fetch_image(_draft_image_url(d))
    if img:
        send_photo(cid, img, caption=f"{d['platform']} preview")
    send(cid, (d.get("body") or "")[:4000])
    c = _chat(cid)
    c["review"] = job["id"]
    _save(SESS)
    send(cid, "Approve, reject, or defer?",
         buttons=[[("✅ Approve", "dec|approve"), ("❌ Reject", "dec|reject"), ("🕒 Defer", "dec|defer")]])


def _act_suggest(cid, a):
    topic = (a.get("topic") or "").strip()
    if not topic:
        return send(cid, "(no idea to log)")
    r = db.create_suggestion((a.get("brand") or "unassigned").strip() or "unassigned", topic,
                             (a.get("rationale") or "").strip() or None,
                             (a.get("source_url") or "").strip() or None, None, source="nancy", heat="warm")
    if r.get("duplicate"):
        send(cid, f"Already on the ideas list: \"{topic}\".")
    else:
        send(cid, f"💡 Logged as an idea: \"{topic}\" — it's in the cockpit's Scout tab for you to promote.")


# ----------------------------------------------------------------------------- dispatch
RESET_TRIGGERS = {"new post", "newpost", "new", "start over", "startover", "start fresh", "fresh start",
                  "fresh", "reset", "clear", "clear context", "new brief", "start again", "scratch that",
                  "/new", "/clear", "/reset"}


def _is_reset(text):
    """A short, standalone 'let's start fresh' message — NOT one that already carries a topic
    (e.g. 'new post about winter savings' is a real brief and goes to the brain, not a reset)."""
    return (text or "").strip().lower().rstrip(" .!?") in RESET_TRIGGERS


def _reset_chat(cid):
    """Wipe this chat's working context so a fresh request can't blend with an earlier topic or paste.
    Studio jobs/drafts are untouched — this only clears Nancy's short-term conversational memory."""
    SESS[str(cid)] = {"history": [], "clarify": [], "review": None, "deleg_brand": None}
    _save(SESS)
    send(cid, "Clean slate. 🧹 What's the new post — give me the topic or angle, and the brand if you know it.")


def handle_message(msg):
    frm = str((msg.get("from") or {}).get("id") or "")
    cid = (msg.get("chat") or {}).get("id")
    text = (msg.get("text") or "").strip()
    if not cid or not text:
        return
    if ALLOWED and frm not in ALLOWED:
        return send(cid, "Sorry, you're not on this studio's allow-list.")
    if text in ("/start", "/help"):
        return send(cid, "I'm Nancy, Head of Content. Tell me what you want to make — a topic, a platform, "
                         "a vibe — and I'll shape it and put it through the Studio. Ask me what's waiting to "
                         "review, too. (Constance runs the ops side.) Say \"new post\" any time to start clean.")
    if _is_reset(text):
        return _reset_chat(cid)
    typing(cid)
    _remember(cid, "operator", text)
    reply, action = think(cid, text)
    if reply:
        send(cid, reply)
        _remember(cid, "nancy", reply)
    if action:
        do_action(cid, action)


def handle_callback(cb):
    frm = str((cb.get("from") or {}).get("id") or "")
    cid = ((cb.get("message") or {}).get("chat") or {}).get("id")
    data = cb.get("data") or ""
    answer_cb(cb.get("id"))
    if not cid or (ALLOWED and frm not in ALLOWED):
        return
    if data.startswith("clar|"):
        c = _chat(cid)
        try:
            choice = c["clarify"][int(data.split("|")[1])]
        except Exception:  # noqa: BLE001
            return
        send(cid, f"➡️ {choice}")
        typing(cid)
        _remember(cid, "operator", choice)
        reply, action = think(cid, choice)
        if reply:
            send(cid, reply)
            _remember(cid, "nancy", reply)
        if action:
            do_action(cid, action)
    elif data.startswith("dec|"):
        decision = data.split("|")[1]
        jid = _chat(cid).get("review")
        if not jid:
            return send(cid, "Lost track of which job — ask me to show it again.")
        _decide(cid, jid, decision)
    elif data.startswith("dbr|"):
        # Brand picked (or dropped) for a no-brand delegation — deterministic, no model call.
        c = _chat(cid)
        pend = c.get("deleg_brand") or {}
        sel = data.split("|", 1)[1]
        if sel == "drop":
            try:
                db.drop_delegation(pend.get("did"))
            except Exception:  # noqa: BLE001
                pass
            c["deleg_brand"] = None; _save(SESS)
            return send(cid, f"Dropped it — \"{pend.get('task', 'that one')}\" is off the list. Ask again if you change your mind.")
        try:
            slug = pend["brands"][int(sel)]
        except Exception:  # noqa: BLE001
            return send(cid, "That brand choice expired — ask me to show it again.")
        try:
            job = _queue_delegation(cid, pend.get("did"), pend["task"], slug,
                                    pend.get("media"), pend.get("platforms"), pend.get("direction"))
            send(cid, f"On it — \"{pend['task']}\" queued for {slug} [{job['id'][:8]}]. I'll bring it back to review once it's built.")
        except Exception as e:  # noqa: BLE001
            send(cid, f"Hit a snag queuing that: {e}")
        c["deleg_brand"] = None; _save(SESS)


def _decide(cid, jid, decision):
    """§4a — DETERMINISTIC, never a model call. Approve only moves the job to 'Ready to publish'."""
    job = db.get_job(jid)
    if not job:
        return send(cid, "That job's gone.")
    if job["state"] != "preview":
        return send(cid, f"That one's already '{job['state']}', not awaiting approval.")
    try:
        if decision == "approve":
            db.advance_job(jid, "approved", actor="human", detail="operator approved via Nancy (Telegram)")
            send(cid, f"Approved [{jid[:8]}] — it's in 'Ready to publish' in the cockpit. Publish it there.")
        elif decision == "reject":
            db.advance_job(jid, "cancelled", actor="human", detail="operator rejected via Nancy (Telegram)")
            send(cid, f"Rejected [{jid[:8]}] — cancelled and out of the queue.")
        else:
            send(cid, f"Left [{jid[:8]}] in the queue.")
    except Exception as e:  # noqa: BLE001
        send(cid, f"Couldn't apply that: {e}")


def _setting_int(key, default):
    """Operator-tunable integer (read per poll); falls back to the default on any bad/empty value."""
    try:
        v = db.get_setting(key)
        return int(v) if v not in (None, "") else default
    except Exception:  # noqa: BLE001
        return default


def _age_hours(iso, now):
    """Hours since an ISO8601 timestamp, or None if it can't be parsed."""
    try:
        dt = datetime.datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return (now - dt).total_seconds() / 3600.0
    except Exception:  # noqa: BLE001
        return None


def _queue_delegation(cid, did, task, brand, media="none", platforms="", direction=None):
    """Queue a delegated brief into the Studio and link it so Constance's loop auto-closes."""
    plats = [p for p in (platforms or "").split(",") if p]
    job = db.create_and_queue(task, brand=brand, source="nancy",
                              created_by="Nancy (delegated by Constance)", platforms=plats,
                              media=(media or "none"), direction=direction)
    if did:
        try:
            db.link_delegation(did, job["id"])
        except Exception:  # noqa: BLE001
            pass
    return job


def _stage_deleg(cid, d, brand_slugs):
    """Stash a delegation against the chat so a later dbr| button tap can act on it deterministically."""
    c = _chat(cid)
    c["deleg_brand"] = {"did": d["id"], "task": d["task"], "media": d.get("media") or "none",
                        "platforms": d.get("platforms") or "", "direction": d.get("direction"),
                        "brands": brand_slugs}
    _save(SESS)


def _ask_brand(cid, d, lead=None):
    """No brand pinned — ask which, with one button per brand (like Constance), plus a drop option.
    `lead` overrides the prompt line (e.g. an about-to-expire framing). RULE: options → buttons."""
    try:
        brands = [(b.get("slug") or b.get("name"), b.get("name") or b.get("slug"))
                  for b in (db.list_brands() or [])][:8]
    except Exception:  # noqa: BLE001
        brands = []
    task = d["task"]
    if not brands:
        return send(cid, lead or (f"📥 Constance's handed me: \"{task}\" — but there are no brands set up yet. "
                                  f"Add a brand in the studio (or just tell me the brand here) and I'll queue it."))
    _stage_deleg(cid, d, [s for (s, n) in brands])
    rows = [[(n, f"dbr|{i}")] for i, (s, n) in enumerate(brands)]
    rows.append([("✕ Not now — drop it", "dbr|drop")])
    send(cid, lead or f"📥 Constance's handed me: \"{task}\" — which brand is it for?", buttons=rows)


def _poll_delegations():
    """Proactive pickup — Nancy notices delegations from Constance: queues them when a brand is set (and
    links them so the loop auto-closes) or asks which brand with buttons. Also warns the operator before a
    stranded delegation auto-expires, then drops it — so an un-actioned one can't nag forever. Each poll."""
    warn_h = _setting_int("delegation_warn_hours", 36)
    exp_h = _setting_int("delegation_expiry_hours", 48)
    try:
        db.sync_delegations()
        opens = db.open_delegations("nancy")
    except Exception as e:  # noqa: BLE001
        print(f"nancy: delegation poll error: {e}", flush=True)
        return
    seen = SESS.setdefault("_deleg_seen", [])
    warned = SESS.setdefault("_deleg_warned", [])
    changed = False
    now = datetime.datetime.now(datetime.timezone.utc)
    for d in opens:
        # Heads-up before we auto-drop it — give the operator a chance to act.
        if HOME and warn_h and exp_h and warn_h < exp_h and d["id"] not in warned:
            age = _age_hours(d.get("created_at"), now)
            if age is not None and warn_h <= age < exp_h:
                left = max(1, round(exp_h - age))
                if not d.get("brand"):
                    # options → buttons: re-offer the brand picker (+ drop), now with an expiry framing.
                    _ask_brand(HOME, d, lead=f"⏳ Constance's delegation \"{d['task']}\" has waited ~{round(age)}h "
                                              f"with no brand — I'll auto-drop it in ~{left}h. Pick a brand, or drop it:")
                else:
                    # branded but stuck (rare) — the only real action is to drop it; give it a button.
                    _stage_deleg(HOME, d, [])
                    send(HOME, f"⏳ Constance's delegation \"{d['task']}\" has waited ~{round(age)}h unqueued. "
                               f"I'll auto-drop it in ~{left}h.", buttons=[[("✕ Drop it now", "dbr|drop")]])
                warned.append(d["id"]); changed = True
        if d["id"] in seen:
            continue
        seen.append(d["id"]); changed = True
        if not HOME:
            continue
        task, brand = d["task"], d.get("brand")
        if brand:
            try:
                job = _queue_delegation(HOME, d["id"], task, brand, d.get("media"), d.get("platforms"), d.get("direction"))
                send(HOME, f"📥 Constance's handed me: \"{task}\" for {brand}. On it — queued to the Studio "
                           f"[{job['id'][:8]}]. I'll bring it back to review when it's built. Shout if you want a different angle or format.")
            except Exception as e:  # noqa: BLE001
                send(HOME, f"📥 Constance handed me \"{task}\" for {brand}, but I hit a snag queuing it: {e}")
        else:
            _ask_brand(HOME, d)
    # Auto-expire the truly stale ones and let the operator know they were dropped.
    try:
        expired = db.expire_stale_delegations(exp_h)
    except Exception as e:  # noqa: BLE001
        expired = []
        print(f"nancy: delegation expire error: {e}", flush=True)
    for ex in expired:
        if HOME:
            send(HOME, f"🗑️ Dropped Constance's stale delegation \"{ex['task']}\" — no action in {exp_h}h. Just ask again if you still want it.")
    if changed or expired:
        SESS["_deleg_seen"] = seen[-300:]
        SESS["_deleg_warned"] = warned[-300:]
        _save(SESS)


def main():
    if not TOKEN:
        print("nancy: NANCY_BOT_TOKEN not set — create a bot with @BotFather and export the token.", flush=True)
        sys.exit(1)
    me = _tg("getMe", timeout=15)
    who = (me or {}).get("result", {}).get("username", "?")
    eff_model = (db.get_setting("studio_brain_model") or os.environ.get("NANCY_MODEL") or "opus").strip()
    eff_effort = (db.get_setting("studio_brain_effort") or "").strip() or "default"
    print(f"nancy: up as @{who}; brain={eff_model} effort={eff_effort} (subscription); db={DB_PATH}; allow={sorted(ALLOWED) or 'ANY'}", flush=True)
    offset = None
    while True:
        _poll_delegations()
        params = {"timeout": 25}
        if offset is not None:
            params["offset"] = offset
        upd = _tg("getUpdates", params, timeout=35)
        if not upd or not upd.get("ok"):
            time.sleep(2)
            continue
        for u in upd.get("result", []):
            offset = u["update_id"] + 1
            try:
                if "message" in u:
                    handle_message(u["message"])
                elif "callback_query" in u:
                    handle_callback(u["callback_query"])
            except Exception as e:  # noqa: BLE001
                print(f"nancy: update error: {e}", flush=True)


if __name__ == "__main__":
    main()
