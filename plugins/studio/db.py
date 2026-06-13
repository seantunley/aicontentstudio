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
CREATE TABLE IF NOT EXISTS scout_niches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    brand      TEXT NOT NULL,
    query      TEXT NOT NULL,        -- what to scout for (a niche/topic area)
    enabled    INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suggestions (
    id         TEXT PRIMARY KEY,
    brand      TEXT NOT NULL,
    topic      TEXT NOT NULL,
    rationale  TEXT,                 -- why it's timely/relevant (grounded)
    source_url TEXT,
    source     TEXT,                 -- WHERE it was found (e.g. 'Reddit r/...', 'BBC News', 'X')
    heat       TEXT DEFAULT 'warm',  -- trend strength: hot | warm | cool
    niche_id   INTEGER REFERENCES scout_niches(id),
    status     TEXT NOT NULL DEFAULT 'new',   -- new | promoted | dismissed
    job_id     TEXT,                 -- set when promoted to a real job
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_assets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,        -- image | video
    url        TEXT NOT NULL UNIQUE, -- publisher (Postiz) media URL
    media_id   TEXT,                 -- publisher media id
    source     TEXT,                 -- generated | derived | rendered | uploaded
    job_id     TEXT,
    draft_id   INTEGER,
    platform   TEXT,
    width      INTEGER,
    height     INTEGER,
    topic      TEXT,                 -- the job topic, for context
    tags       TEXT,                 -- content keywords for search (what's IN the image)
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scout_schedule (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    enabled       INTEGER DEFAULT 1,
    days          TEXT DEFAULT '1,2,3,4,5',  -- ISO weekdays to run on (1=Mon .. 7=Sun)
    hour          INTEGER DEFAULT 7,         -- local time-of-day to run
    minute        INTEGER DEFAULT 0,
    tz_offset_min INTEGER DEFAULT 120,       -- operator TZ offset from UTC (SAST = +120)
    cadence_hours INTEGER DEFAULT 24,        -- legacy, unused
    last_run_at   TEXT
);
CREATE TABLE IF NOT EXISTS brands (
    slug        TEXT PRIMARY KEY,         -- stable id; matches jobs.brand
    name        TEXT NOT NULL,
    region      TEXT,                     -- audience country/region (tone, occasions §7g)
    audience    TEXT,                     -- who they are
    voice       TEXT,                     -- voice rules / do's & don'ts (free text, injected into generation)
    safety      TEXT,                     -- brand-safety notes (§6a), free text
    pillars     TEXT,                     -- content pillars (one per line / comma)
    sensitive   TEXT,                     -- sensitive topics/occasions -> notify-first
    channels    TEXT,                     -- comma-sep Postiz integration ids this brand may post to (§1b hard boundary)
    enabled     INTEGER DEFAULT 1,
    created_at  TEXT,
    updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
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
        if "target_platforms" not in cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN target_platforms TEXT")  # comma-sep platforms to draft for
        # an AI-generated image can be attached to a draft (Phase 2). Uploaded to the publisher at
        # attach-time, so we store the publisher's media reference (id + url), not the local file.
        dcols = [r[1] for r in conn.execute("PRAGMA table_info(drafts)").fetchall()]
        if "image_path" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN image_path TEXT")  # publisher media URL
        if "image_id" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN image_id TEXT")    # publisher media id
        if "video_path" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN video_path TEXT")  # publisher media URL (video)
        if "video_id" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN video_id TEXT")    # publisher media id (video)
        if "polish_json" not in dcols:
            # Per-skill transformation history for the preview pills: JSON list of
            # {skill, before, after, notes} from the psychology + humanizer passes.
            conn.execute("ALTER TABLE drafts ADD COLUMN polish_json TEXT")
        mcols = [r[1] for r in conn.execute("PRAGMA table_info(media_assets)").fetchall()]
        if "deleted_at" not in mcols:
            # Vault soft-delete: deleted images go to Trash, restorable, purged after 30 days.
            conn.execute("ALTER TABLE media_assets ADD COLUMN deleted_at TEXT")
        try:
            bcols = [r[1] for r in conn.execute("PRAGMA table_info(brands)").fetchall()]
            if bcols and "channels" not in bcols:
                conn.execute("ALTER TABLE brands ADD COLUMN channels TEXT")  # per-brand Postiz accounts (§1b)
        except Exception:  # noqa: BLE001 — brands table may not exist on very old DBs
            pass
        # scout suggestions: where it was found + trend heat (§3b score/flag)
        scols = [r[1] for r in conn.execute("PRAGMA table_info(suggestions)").fetchall()]
        if scols:  # table exists
            if "source" not in scols:
                conn.execute("ALTER TABLE suggestions ADD COLUMN source TEXT")
            if "heat" not in scols:
                conn.execute("ALTER TABLE suggestions ADD COLUMN heat TEXT DEFAULT 'warm'")
        # scout schedule: day-of-week + time-of-day (upgrade from the old cadence-only model)
        schcols = [r[1] for r in conn.execute("PRAGMA table_info(scout_schedule)").fetchall()]
        if schcols:
            if "days" not in schcols:
                conn.execute("ALTER TABLE scout_schedule ADD COLUMN days TEXT DEFAULT '1,2,3,4,5'")
            if "hour" not in schcols:
                conn.execute("ALTER TABLE scout_schedule ADD COLUMN hour INTEGER DEFAULT 7")
            if "minute" not in schcols:
                conn.execute("ALTER TABLE scout_schedule ADD COLUMN minute INTEGER DEFAULT 0")
            if "tz_offset_min" not in schcols:
                conn.execute("ALTER TABLE scout_schedule ADD COLUMN tz_offset_min INTEGER DEFAULT 120")
        # one-time Vault backfill from media already attached to drafts (idempotent via UNIQUE url)
        _now = _utcnow()
        conn.execute(
            "INSERT OR IGNORE INTO media_assets (kind,url,media_id,source,job_id,draft_id,platform,topic,created_at) "
            "SELECT 'image', d.image_path, d.image_id, 'derived', d.job_id, d.id, d.platform, j.topic, ? "
            "FROM drafts d LEFT JOIN jobs j ON j.id=d.job_id WHERE d.image_path IS NOT NULL", (_now,))
        conn.execute(
            "INSERT OR IGNORE INTO media_assets (kind,url,media_id,source,job_id,draft_id,platform,topic,created_at) "
            "SELECT 'video', d.video_path, d.video_id, 'rendered', d.job_id, d.id, d.platform, j.topic, ? "
            "FROM drafts d LEFT JOIN jobs j ON j.id=d.job_id WHERE d.video_path IS NOT NULL", (_now,))


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


def set_job_brand(job_id, brand, actor="human"):
    """Record the brand for a job (e.g. after the operator answers the brand clarify on Telegram)."""
    brand = (brand or "").strip()
    if not brand:
        raise ValueError("brand is required")
    job = get_job(job_id)
    if not job:
        raise ValueError(f"no job {job_id}")
    prev = job.get("brand") or "unassigned"
    now = _utcnow()
    with _db() as conn:
        conn.execute("UPDATE jobs SET brand=?, updated_at=? WHERE id=?", (brand, now, job_id))
        detail = f"brand set to '{brand}'" + (f" (was '{prev}')" if prev != brand else "")
        conn.execute(
            "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
            (job_id, None, None, actor, now, detail),
        )
    return get_job(job_id)


def known_brands(limit=4):
    """Distinct brands already seen in the job store (excludes 'unassigned'), most-recently-used first.
    Used to offer the operator tappable brand choices via the clarify tool. Self-populating: a brand
    typed once via clarify's 'Other' shows up as a button next time."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT brand, MAX(created_at) mx FROM jobs"
            " WHERE brand IS NOT NULL AND brand!='unassigned' AND TRIM(brand)!=''"
            " GROUP BY brand ORDER BY mx DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [r["brand"] for r in rows]


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
# Character ceilings per platform (None = no hard limit). Postiz does the actual posting via the
# channel identifier; these just guard draft length. Scoped to the platforms the operator wants.
PLATFORM_LIMITS = {
    "bluesky": 300,
    "x": 280,
    "instagram": 2200,
    "facebook": 63206,
    "telegram": 4096,
    "vk": 16000,
    "linkedin": 3000,
    "youtube": 5000,    # description
    "tiktok": 2200,
}
SUPPORTED_PLATFORMS = sorted(PLATFORM_LIMITS.keys())

# Primary image size (w, h) per platform — the master image is cropped+scaled to this (June 2026 specs).
PLATFORM_IMAGE = {
    "bluesky":   (1080, 1080),   # 1:1
    "x":         (1600, 900),    # 16:9
    "instagram": (1080, 1350),   # 4:5 (Meta prioritises portrait)
    "facebook":  (1080, 1350),   # 4:5
    "telegram":  (1080, 1080),   # flexible
    "vk":        (1080, 1080),   # flexible
    "linkedin":  (1200, 1200),   # 1:1
    "youtube":   (1280, 720),    # 16:9 thumbnail
    "tiktok":    (1080, 1920),   # 9:16
}
# Primary video frame per platform (short-form social). Vertical 9:16 dominates;
# YouTube landscape, LinkedIn/Bluesky square-ish for safe in-feed playback.
PLATFORM_VIDEO = {
    "bluesky":   (1080, 1080),   # 1:1 (limited video support — keep safe)
    "x":         (1080, 1920),   # 9:16
    "instagram": (1080, 1920),   # 9:16 Reels
    "facebook":  (1080, 1920),   # 9:16 Reels
    "telegram":  (1080, 1920),   # 9:16
    "vk":        (1080, 1920),   # 9:16 Clips
    "linkedin":  (1080, 1350),   # 4:5
    "youtube":   (1920, 1080),   # 16:9
    "tiktok":    (1080, 1920),   # 9:16
}
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
            "SELECT id, platform, angle, body, char_count, variant, image_path, image_id, video_path, video_id, polish_json, created_at FROM drafts"
            " WHERE job_id=? ORDER BY id", (job_id,)
        ).fetchall()]


def preview_drafts_unpolished(limit=12):
    """Drafts on jobs at the gate ('preview') that the polish pipeline hasn't touched yet —
    used by the worker sweep so posts from ANY path (incl. Telegram) get polished + pills."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT d.id, d.platform, d.body, d.job_id, j.brand FROM drafts d JOIN jobs j ON j.id = d.job_id"
            " WHERE j.state='preview' AND d.polish_json IS NULL ORDER BY d.id LIMIT ?", (limit,)
        ).fetchall()]


def mark_draft_polished(draft_id):
    """Mark a draft as polished-with-no-change (empty steps), so the sweep won't reprocess it."""
    with _db() as conn:
        conn.execute("UPDATE drafts SET polish_json='[]' WHERE id=? AND polish_json IS NULL", (draft_id,))


def get_brand(slug):
    """A brand's profile (or None). Read at generation time to shape voice + safety per brand."""
    if not slug:
        return None
    with _db() as conn:
        r = conn.execute("SELECT * FROM brands WHERE slug=? AND enabled=1", (slug,)).fetchone()
    return dict(r) if r else None


def list_brands():
    with _db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM brands ORDER BY name").fetchall()]


def purge_trash(ttl_days=30):
    """Hard-delete trashed items older than ttl_days: rejected (cancelled) jobs and soft-deleted
    media. Spend rows in the cost ledger are kept (job_id nulled) so per-brand totals survive."""
    import datetime
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=ttl_days)).isoformat()
    with _db() as conn:
        job_ids = [r[0] for r in conn.execute(
            "SELECT id FROM jobs WHERE state='cancelled' AND updated_at < ?", (cutoff,)).fetchall()]
        for jid in job_ids:
            conn.execute("UPDATE cost_ledger SET job_id=NULL WHERE job_id=?", (jid,))  # keep spend history
            conn.execute("UPDATE suggestions SET job_id=NULL WHERE job_id=?", (jid,))
            for t in ("drafts", "briefs", "job_events", "publish_tokens"):
                conn.execute(f"DELETE FROM {t} WHERE job_id=?", (jid,))
            conn.execute("DELETE FROM jobs WHERE id=?", (jid,))
        media = conn.execute(
            "DELETE FROM media_assets WHERE deleted_at IS NOT NULL AND deleted_at < ?", (cutoff,)).rowcount
    if job_ids or media:
        print(f"worker: purged {len(job_ids)} trashed job(s) + {media} media older than {ttl_days}d")
    return {"jobs": len(job_ids), "media": media}


def update_draft_body(draft_id, body, polish_steps=None):
    """Replace a draft's body (used by the worker's polish pipeline). Recomputes char_count.
    polish_steps (optional) = list of {skill, before, after, notes} stored for the preview pills."""
    body = (body or "").strip()
    if not body:
        raise ValueError("draft body is empty")
    pj = json.dumps(polish_steps) if polish_steps else None
    with _db() as conn:
        if pj is not None:
            conn.execute("UPDATE drafts SET body=?, char_count=?, polish_json=? WHERE id=?", (body, len(body), pj, draft_id))
        else:
            conn.execute("UPDATE drafts SET body=?, char_count=? WHERE id=?", (body, len(body), draft_id))


def set_draft_image(job_id, image_id, image_path):
    """Attach an already-uploaded publisher media reference (id + url) to the job's latest draft."""
    with _db() as conn:
        row = conn.execute("SELECT id FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1", (job_id,)).fetchone()
        if not row:
            raise ValueError("no draft to attach an image to — create_draft first")
        conn.execute("UPDATE drafts SET image_id=?, image_path=? WHERE id=?", (image_id, image_path, row["id"]))
    record_event(job_id, "image attached to draft", actor="agent")
    return image_path


def set_draft_image_by_id(draft_id, image_id, image_path):
    with _db() as conn:
        conn.execute("UPDATE drafts SET image_id=?, image_path=? WHERE id=?", (image_id, image_path, draft_id))


def set_draft_video_by_id(draft_id, video_id, video_path):
    with _db() as conn:
        conn.execute("UPDATE drafts SET video_id=?, video_path=? WHERE id=?", (video_id, video_path, draft_id))


# --- The Vault: every generated/uploaded asset, catalogued for reuse -------
def add_media_asset(kind, url, media_id=None, source=None, job_id=None, draft_id=None,
                    platform=None, width=None, height=None, topic=None, tags=None):
    if not url:
        return
    if not topic and job_id:
        j = get_job(job_id)
        topic = j["topic"] if j else None
    with _db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO media_assets "
            "(kind,url,media_id,source,job_id,draft_id,platform,width,height,topic,tags,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (kind, url, media_id, source, job_id, draft_id, platform, width, height, topic, tags, _utcnow()))


def set_media_tags(asset_id, tags):
    with _db() as conn:
        conn.execute("UPDATE media_assets SET tags=? WHERE id=?", (tags, asset_id))


def search_media(q=None, kind=None, limit=600):
    """Search the vault by free text across tags, topic, platform, source."""
    clauses, args = [], []
    if kind in ("image", "video"):
        clauses.append("kind=?")
        args.append(kind)
    if q:
        like = f"%{q.strip().lower()}%"
        clauses.append("(lower(COALESCE(tags,'')) LIKE ? OR lower(COALESCE(topic,'')) LIKE ? "
                       "OR lower(COALESCE(platform,'')) LIKE ? OR lower(COALESCE(source,'')) LIKE ?)")
        args += [like, like, like, like]
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            f"SELECT * FROM media_assets{where} ORDER BY id DESC LIMIT ?", args + [limit]).fetchall()]


def list_media(kind=None, limit=600):
    q = "SELECT * FROM media_assets"
    args = []
    if kind in ("image", "video"):
        q += " WHERE kind=?"
        args.append(kind)
    q += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    with _db() as conn:
        return [dict(r) for r in conn.execute(q, args).fetchall()]


def media_counts():
    with _db() as conn:
        rows = conn.execute("SELECT kind, COUNT(*) n FROM media_assets GROUP BY kind").fetchall()
        m = {r["kind"]: r["n"] for r in rows}
        return {"image": m.get("image", 0), "video": m.get("video", 0), "total": sum(m.values())}


def untagged_media(limit=5):
    """Image assets with no tags yet — fed to the vision auto-tagger."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT id, url, job_id FROM media_assets WHERE kind='image' AND (tags IS NULL OR trim(tags)='') "
            "ORDER BY id DESC LIMIT ?", (limit,)).fetchall()]


# --- Trend scout (§3b): niches + suggestions -------------------------------
def add_niche(brand, query):
    now = _utcnow()
    with _db() as conn:
        cur = conn.execute("INSERT INTO scout_niches (brand, query, enabled, created_at) VALUES (?,?,1,?)",
                           (brand or "unassigned", query, now))
        return {"id": cur.lastrowid, "brand": brand or "unassigned", "query": query}


def list_niches(enabled_only=True):
    q = "SELECT * FROM scout_niches" + (" WHERE enabled=1" if enabled_only else "") + " ORDER BY id"
    with _db() as conn:
        return [dict(r) for r in conn.execute(q).fetchall()]


def remove_niche(niche_id):
    with _db() as conn:
        # detach any ideas first so the FK doesn't block the delete (they stay as suggestions)
        conn.execute("UPDATE suggestions SET niche_id=NULL WHERE niche_id=?", (niche_id,))
        conn.execute("DELETE FROM scout_niches WHERE id=?", (niche_id,))


def get_niche(niche_id):
    with _db() as conn:
        row = conn.execute("SELECT * FROM scout_niches WHERE id=?", (niche_id,)).fetchone()
        return dict(row) if row else None


def get_scout_schedule():
    with _db() as conn:
        conn.execute("INSERT OR IGNORE INTO scout_schedule (id, enabled) VALUES (1, 1)")
        return dict(conn.execute("SELECT * FROM scout_schedule WHERE id=1").fetchone())


def set_scout_schedule(days=None, hour=None, minute=None, enabled=None, tz_offset_min=None):
    """days = list/iterable of ISO weekdays (1=Mon..7=Sun) or a comma string."""
    if days is not None and not isinstance(days, str):
        days = ",".join(str(int(d)) for d in days)
    with _db() as conn:
        conn.execute("INSERT OR IGNORE INTO scout_schedule (id, enabled) VALUES (1, 1)")
        if days is not None:
            conn.execute("UPDATE scout_schedule SET days=? WHERE id=1", (days,))
        if hour is not None:
            conn.execute("UPDATE scout_schedule SET hour=? WHERE id=1", (max(0, min(23, int(hour))),))
        if minute is not None:
            conn.execute("UPDATE scout_schedule SET minute=? WHERE id=1", (max(0, min(59, int(minute))),))
        if tz_offset_min is not None:
            conn.execute("UPDATE scout_schedule SET tz_offset_min=? WHERE id=1", (int(tz_offset_min),))
        if enabled is not None:
            conn.execute("UPDATE scout_schedule SET enabled=? WHERE id=1", (1 if enabled else 0,))
    return get_scout_schedule()


def mark_scout_ran():
    with _db() as conn:
        conn.execute("UPDATE scout_schedule SET last_run_at=? WHERE id=1", (_utcnow(),))


def _sched_days(s):
    return [int(d) for d in (s.get("days") or "").split(",") if d.strip().isdigit()]


def _now_local(s):
    off = datetime.timedelta(minutes=s.get("tz_offset_min") or 0)
    return (datetime.datetime.now(datetime.timezone.utc) + off).replace(tzinfo=None)


def scout_due():
    """True if auto-scout is enabled, today (operator-local) is a scheduled day, the scheduled
    time has passed, and it hasn't already run today."""
    s = get_scout_schedule()
    if not s.get("enabled"):
        return False
    days = _sched_days(s)
    if not days:
        return False
    now_local = _now_local(s)
    if now_local.isoweekday() not in days:
        return False
    sched = now_local.replace(hour=s.get("hour") or 0, minute=s.get("minute") or 0, second=0, microsecond=0)
    if now_local < sched:
        return False
    if s.get("last_run_at"):  # already ran today (operator-local)?
        try:
            off = datetime.timedelta(minutes=s.get("tz_offset_min") or 0)
            last_local = (datetime.datetime.fromisoformat(s["last_run_at"]) + off).replace(tzinfo=None)
            if last_local.date() == now_local.date():
                return False
        except (ValueError, TypeError):
            pass
    return True


def scout_next_run(s=None):
    """ISO (operator-local) of the next scheduled run, or None if disabled/no days."""
    s = s or get_scout_schedule()
    if not s.get("enabled"):
        return None
    days = _sched_days(s)
    if not days:
        return None
    now_local = _now_local(s)
    for ahead in range(0, 8):
        day = now_local + datetime.timedelta(days=ahead)
        if day.isoweekday() not in days:
            continue
        run = day.replace(hour=s.get("hour") or 0, minute=s.get("minute") or 0, second=0, microsecond=0)
        if run >= now_local:
            return run.isoformat(timespec="minutes")
    return None


_HEAT = {"hot", "warm", "cool"}
# hot-first, then most recent
_HEAT_ORDER = "CASE heat WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 WHEN 'cool' THEN 2 ELSE 3 END, created_at DESC"


def create_suggestion(brand, topic, rationale=None, source_url=None, niche_id=None, source=None, heat="warm"):
    """Record a scout idea for the operator to promote or dismiss. Dedupes on (brand, topic) among
    still-open suggestions so repeated scout runs don't pile duplicates."""
    topic = (topic or "").strip()
    if not topic:
        raise ValueError("topic is required")
    heat = (heat or "warm").strip().lower()
    if heat not in _HEAT:
        heat = "warm"
    sid = str(uuid.uuid4())
    now = _utcnow()
    with _db() as conn:
        dup = conn.execute(
            "SELECT id FROM suggestions WHERE brand=? AND lower(topic)=lower(?) AND status='new'",
            (brand or "unassigned", topic)).fetchone()
        if dup:
            return {"id": dup["id"], "duplicate": True, "topic": topic}
        conn.execute(
            "INSERT INTO suggestions (id, brand, topic, rationale, source_url, source, heat, niche_id, status, created_at)"
            " VALUES (?,?,?,?,?,?,?,?, 'new', ?)",
            (sid, brand or "unassigned", topic, rationale, source_url, source, heat, niche_id, now))
    return {"id": sid, "duplicate": False, "topic": topic, "heat": heat}


def list_suggestions(status="new"):
    with _db() as conn:
        if status:
            rows = conn.execute(f"SELECT * FROM suggestions WHERE status=? ORDER BY {_HEAT_ORDER}", (status,)).fetchall()
        else:
            rows = conn.execute(f"SELECT * FROM suggestions ORDER BY {_HEAT_ORDER}").fetchall()
        return [dict(r) for r in rows]


def get_suggestion(sid):
    with _db() as conn:
        row = conn.execute("SELECT * FROM suggestions WHERE id=?", (sid,)).fetchone()
        return dict(row) if row else None


def set_suggestion_status(sid, status, job_id=None):
    with _db() as conn:
        conn.execute("UPDATE suggestions SET status=?, job_id=COALESCE(?, job_id) WHERE id=?",
                     (status, job_id, sid))


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
