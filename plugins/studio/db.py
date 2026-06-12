"""Studio job store — SQLite data layer (Phase 0).

Owns the jobs/state-machine, the transition audit log, the cost ledger, and the
§4a publish-token table. Lives at STUDIO_DB_PATH (default /opt/studio/studio.db,
which is the gitignored ./studio-data on the host).
"""
import os
import json
import uuid
import secrets
import sqlite3
import datetime
import contextlib

DB_PATH = os.environ.get("STUDIO_DB_PATH", "/opt/studio/studio.db")

# Content pipeline states (plan §3).
STATES = [
    "requested", "researched", "planned", "generated",
    "preview", "approved", "published", "failed", "cancelled",
]

# Legal forward transitions. Keeps the state machine honest; advance_job rejects
# anything not listed here.
LEGAL_TRANSITIONS = {
    "requested":  {"researched", "failed", "cancelled"},
    "researched": {"planned", "failed", "cancelled"},
    "planned":    {"generated", "failed", "cancelled"},
    "generated":  {"preview", "failed", "cancelled"},
    "preview":    {"approved", "generated", "failed", "cancelled"},  # bounce back to regenerate
    "approved":   {"published", "failed", "cancelled"},
    "published":  set(),
    "failed":     {"requested"},   # allow a retry
    "cancelled":  set(),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    brand       TEXT NOT NULL DEFAULT 'unassigned',
    topic       TEXT NOT NULL,
    state       TEXT NOT NULL DEFAULT 'requested',
    source      TEXT NOT NULL DEFAULT 'telegram',
    created_by  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    meta        TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS job_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     TEXT NOT NULL REFERENCES jobs(id),
    from_state TEXT,
    to_state   TEXT,
    actor      TEXT NOT NULL DEFAULT 'system',
    at         TEXT NOT NULL,
    detail     TEXT
);
CREATE TABLE IF NOT EXISTS cost_ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     TEXT REFERENCES jobs(id),
    brand      TEXT,
    provider   TEXT,
    model      TEXT,
    operation  TEXT,
    units      REAL,
    cost_usd   REAL,
    at         TEXT NOT NULL,
    detail     TEXT
);
CREATE TABLE IF NOT EXISTS publish_tokens (
    token      TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES jobs(id),
    minted_by  TEXT,
    minted_at  TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT
);
CREATE TABLE IF NOT EXISTS briefs (
    job_id     TEXT PRIMARY KEY REFERENCES jobs(id),
    brief_json TEXT NOT NULL,
    recency    TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS drafts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id     TEXT NOT NULL REFERENCES jobs(id),
    platform   TEXT NOT NULL,
    angle      TEXT,
    body       TEXT NOT NULL,
    char_count INTEGER,
    variant    INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id);
"""


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


@contextlib.contextmanager
def _db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _db() as conn:
        conn.executescript(SCHEMA)
        # migration: a job can carry a queued action the studio worker picks up (dashboard-originated work)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(jobs)").fetchall()]
        if "queued_action" not in cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN queued_action TEXT")
        # an AI-generated image can be attached to a draft (Phase 2). Uploaded to the publisher at
        # attach-time, so we store the publisher's media reference (id + url), not the local file.
        dcols = [r[1] for r in conn.execute("PRAGMA table_info(drafts)").fetchall()]
        if "image_path" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN image_path TEXT")  # publisher media URL
        if "image_id" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN image_id TEXT")    # publisher media id


# --- work queue (dashboard-originated jobs, processed by worker.py) ---
def enqueue_action(job_id, action="research_draft"):
    with _db() as conn:
        conn.execute("UPDATE jobs SET queued_action=?, updated_at=? WHERE id=?", (action, _utcnow(), job_id))


def get_queued_jobs():
    # Only the actionable queue values; 'processing'/'failed' are status markers, not work to pick up.
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM jobs WHERE queued_action IN ('research_draft','research_draft_image')"
            " ORDER BY created_at").fetchall()]


def clear_queued(job_id):
    with _db() as conn:
        conn.execute("UPDATE jobs SET queued_action=NULL WHERE id=?", (job_id,))


# --- jobs -------------------------------------------------------------------
def create_job(topic, brand="unassigned", source="telegram", created_by=None, meta=None):
    job_id = str(uuid.uuid4())
    now = _utcnow()
    with _db() as conn:
        conn.execute(
            "INSERT INTO jobs (id, brand, topic, state, source, created_by, created_at, updated_at, meta)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (job_id, brand or "unassigned", topic, "requested", source, created_by, now, now,
             json.dumps(meta or {})),
        )
        conn.execute(
            "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
            (job_id, None, "requested", "agent", now, "job created"),
        )
    return get_job(job_id)


def get_job(job_id):
    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return dict(row) if row else None


def find_job(id_or_prefix):
    """Exact id, else a unique short-prefix match (so operators can use the first 8 chars)."""
    job = get_job(id_or_prefix)
    if job:
        return job
    with _db() as conn:
        rows = conn.execute("SELECT * FROM jobs WHERE id LIKE ?", (id_or_prefix + "%",)).fetchall()
    return dict(rows[0]) if len(rows) == 1 else None


def list_jobs(state=None, brand=None, limit=20):
    q = "SELECT * FROM jobs"
    clauses, params = [], []
    if state:
        clauses.append("state=?"); params.append(state)
    if brand:
        clauses.append("brand=?"); params.append(brand)
    if clauses:
        q += " WHERE " + " AND ".join(clauses)
    q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
    with _db() as conn:
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def advance_job(job_id, to_state, actor="agent", detail=None):
    job = get_job(job_id)
    if not job:
        raise ValueError(f"no job {job_id}")
    frm = job["state"]
    if to_state not in STATES:
        raise ValueError(f"unknown state '{to_state}' (valid: {', '.join(STATES)})")
    if to_state not in LEGAL_TRANSITIONS.get(frm, set()):
        legal = ", ".join(sorted(LEGAL_TRANSITIONS.get(frm, set()))) or "(none — terminal state)"
        raise ValueError(f"illegal transition '{frm}' -> '{to_state}'. From '{frm}' you may go to: {legal}")
    now = _utcnow()
    with _db() as conn:
        conn.execute("UPDATE jobs SET state=?, updated_at=? WHERE id=?", (to_state, now, job_id))
        conn.execute(
            "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
            (job_id, frm, to_state, actor, now, detail),
        )
    return get_job(job_id)


def record_event(job_id, detail, actor="system", from_state=None, to_state=None):
    with _db() as conn:
        conn.execute(
            "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
            (job_id, from_state, to_state, actor, _utcnow(), detail),
        )


# --- cost ledger (plan §10) — scaffolded; populated once generation exists ---
def record_cost(job_id, provider, model, operation, units, cost_usd, brand=None, detail=None):
    with _db() as conn:
        conn.execute(
            "INSERT INTO cost_ledger (job_id, brand, provider, model, operation, units, cost_usd, at, detail)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (job_id, brand, provider, model, operation, units, cost_usd, _utcnow(), detail),
        )


# --- research briefs (Phase 1, §3c) -----------------------------------------
def save_brief(job_id, facts, angles, unverified=None, recency=None):
    """Persist a structured, cited brief and advance the job to 'researched'.
    Enforces §3c mechanically: every fact must carry a source_url + snippet, and
    at least two distinct angles are required (no uncited claims, no single reword)."""
    job = get_job(job_id)
    if not job:
        raise ValueError(f"no job {job_id}")
    if not isinstance(facts, list) or not facts:
        raise ValueError("at least one cited fact is required")
    for i, f in enumerate(facts):
        if not isinstance(f, dict) or not f.get("claim") or not f.get("source_url") or not f.get("snippet"):
            raise ValueError(
                f"fact #{i + 1} must have a non-empty claim, source_url, and snippet "
                "(§3c — nothing enters the brief as fact without a clickable source)"
            )
    if not isinstance(angles, list) or len(angles) < 2:
        raise ValueError("at least two genuinely distinct angles are required (§3c)")
    for i, a in enumerate(angles):
        if not isinstance(a, dict) or not a.get("name") or not a.get("hook"):
            raise ValueError(f"angle #{i + 1} must have a name and a hook")
    brief = {"facts": facts, "angles": angles, "unverified": unverified or [], "recency": recency or ""}
    now = _utcnow()
    with _db() as conn:
        conn.execute(
            "INSERT INTO briefs (job_id, brief_json, recency, created_at, updated_at) VALUES (?,?,?,?,?)"
            " ON CONFLICT(job_id) DO UPDATE SET brief_json=excluded.brief_json,"
            " recency=excluded.recency, updated_at=excluded.updated_at",
            (job_id, json.dumps(brief), recency or "", now, now),
        )
    if job["state"] == "requested":
        advance_job(job_id, "researched", actor="agent", detail="research brief saved")
    else:
        record_event(job_id, "research brief updated", actor="agent")
    return brief


def get_brief(job_id):
    with _db() as conn:
        row = conn.execute("SELECT * FROM briefs WHERE job_id=?", (job_id,)).fetchone()
    return dict(row) if row else None


# --- drafts (Phase 1, platform-specific posts/captions) ---------------------
PLATFORM_LIMITS = {"bluesky": 300}  # grapheme/char ceiling per platform; extend as platforms are added
PIPELINE_ORDER = ["requested", "researched", "planned", "generated", "preview", "approved", "published"]


def _advance_to(job_id, target, actor="agent", detail=None):
    """Walk the linear pipeline forward to `target`, logging each legal single step."""
    while PIPELINE_ORDER.index(get_job(job_id)["state"]) < PIPELINE_ORDER.index(target):
        cur = get_job(job_id)["state"]
        nxt = PIPELINE_ORDER[PIPELINE_ORDER.index(cur) + 1]
        advance_job(job_id, nxt, actor=actor, detail=detail)


def create_draft(job_id, platform, body, angle=None, variant=1):
    """Persist a platform draft and move the job to 'preview' (ready for the approval gate).
    Requires a saved brief (§3c: no draft without grounded research)."""
    job = get_job(job_id)
    if not job:
        raise ValueError(f"no job {job_id}")
    if not get_brief(job_id):
        raise ValueError("no brief for this job — research and save_brief first (§3c: no draft without a grounded brief)")
    if job["state"] in ("published", "cancelled", "failed"):
        raise ValueError(f"job is '{job['state']}' — cannot draft")
    platform = (platform or "").strip().lower()
    body = (body or "").strip()
    if not body:
        raise ValueError("draft body is empty")
    limit = PLATFORM_LIMITS.get(platform)
    if limit and len(body) > limit:
        raise ValueError(f"{platform} limit is {limit} characters; this draft is {len(body)}")
    now = _utcnow()
    with _db() as conn:
        conn.execute(
            "INSERT INTO drafts (job_id, platform, angle, body, char_count, variant, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (job_id, platform, angle, body, len(body), variant, now),
        )
    if PIPELINE_ORDER.index(job["state"]) < PIPELINE_ORDER.index("preview"):
        _advance_to(job_id, "preview", actor="agent", detail=f"draft created for {platform}")
    else:
        record_event(job_id, f"draft revised for {platform}", actor="agent")
    return {"platform": platform, "char_count": len(body), "limit": limit, "state": get_job(job_id)["state"]}


def list_drafts(job_id):
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT id, platform, angle, body, char_count, variant, image_path, image_id, created_at FROM drafts"
            " WHERE job_id=? ORDER BY id", (job_id,)
        ).fetchall()]


def set_draft_image(job_id, image_id, image_path):
    """Attach an already-uploaded publisher media reference (id + url) to the job's latest draft."""
    with _db() as conn:
        row = conn.execute("SELECT id FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1", (job_id,)).fetchone()
        if not row:
            raise ValueError("no draft to attach an image to — create_draft first")
        conn.execute("UPDATE drafts SET image_id=?, image_path=? WHERE id=?", (image_id, image_path, row["id"]))
    record_event(job_id, "image attached to draft", actor="agent")
    return image_path


# --- §4a publish gate -------------------------------------------------------
# Token minting is HUMAN-ONLY. It is intentionally NOT exposed as a model tool,
# so no model output (or prompt injection) can authorize a publish.
def mint_publish_token(job_id, minted_by="operator", ttl_seconds=3600):
    job = get_job(job_id)
    if not job:
        raise ValueError(f"no job {job_id}")
    token = secrets.token_urlsafe(32)
    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(seconds=ttl_seconds)
    with _db() as conn:
        conn.execute(
            "INSERT INTO publish_tokens (token, job_id, minted_by, minted_at, expires_at, used_at)"
            " VALUES (?,?,?,?,?,NULL)",
            (token, job_id, minted_by, now.isoformat(), exp.isoformat()),
        )
    record_event(job_id, f"publish token minted by {minted_by} (ttl {ttl_seconds}s)", actor="human")
    return token


def consume_publish_token(token, job_id):
    """Atomically validate + consume a single-use token. True only if it is for this
    job, unused, and unexpired."""
    now = datetime.datetime.now(datetime.timezone.utc)
    with _db() as conn:
        row = conn.execute("SELECT * FROM publish_tokens WHERE token=?", (token,)).fetchone()
        if not row or row["job_id"] != job_id or row["used_at"] is not None:
            return False
        try:
            if now > datetime.datetime.fromisoformat(row["expires_at"]):
                return False
        except ValueError:
            return False
        cur = conn.execute(
            "UPDATE publish_tokens SET used_at=? WHERE token=? AND used_at IS NULL",
            (now.isoformat(), token),
        )
        return cur.rowcount == 1


def consume_any_token(job_id):
    """Consume ANY valid, unused, unexpired token for the job — used when a human approved via a
    surface that minted a token without handing the value to the publisher (e.g. the dashboard).
    Still §4a-safe: minting is human-only, so this succeeds only if a human already approved."""
    now = datetime.datetime.now(datetime.timezone.utc)
    with _db() as conn:
        rows = conn.execute(
            "SELECT token, expires_at FROM publish_tokens WHERE job_id=? AND used_at IS NULL", (job_id,)
        ).fetchall()
        for r in rows:
            try:
                if now > datetime.datetime.fromisoformat(r["expires_at"]):
                    continue
            except ValueError:
                continue
            cur = conn.execute(
                "UPDATE publish_tokens SET used_at=? WHERE token=? AND used_at IS NULL",
                (now.isoformat(), r["token"]),
            )
            if cur.rowcount == 1:
                return True
        return False
