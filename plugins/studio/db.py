"""Studio job store — SQLite data layer (Phase 0).

Owns the jobs/state-machine, the transition audit log, the cost ledger, and the
§4a publish-token table. Lives at STUDIO_DB_PATH (default /opt/studio/studio.db,
which is the gitignored ./studio-data on the host).
"""
import os
import json
import time
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
CREATE TABLE IF NOT EXISTS occasions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    brand         TEXT NOT NULL DEFAULT 'all',  -- brand slug, or 'all' = shows for every brand (§7g)
    name          TEXT NOT NULL,
    rule          TEXT NOT NULL,                -- JSON: {"type":"fixed","month":12,"day":25}
                                                --     | {"type":"nth_weekday","month":5,"weekday":6,"n":2}  (weekday 0=Mon..6=Sun, n=-1=last)
    region        TEXT,                         -- country/region label (display; informs research)
    lead_days     INTEGER DEFAULT 14,           -- how far ahead to auto-draft
    sensitive     INTEGER DEFAULT 0,            -- notify-first instead of auto-cheerful-draft (§6a/§7g)
    auto_draft    INTEGER DEFAULT 0,            -- generate drafts when the lead window opens (off by default)
    source        TEXT DEFAULT 'manual',        -- 'builtin' | 'manual'
    enabled       INTEGER DEFAULT 1,
    last_handled_for TEXT,                      -- ISO date of the occurrence we last drafted/notified (idempotency)
    created_at    TEXT,
    updated_at    TEXT
);
CREATE TABLE IF NOT EXISTS campaigns (
    id          TEXT PRIMARY KEY,
    brand       TEXT NOT NULL DEFAULT 'unassigned',
    name        TEXT NOT NULL,
    theme       TEXT,                         -- the shared idea/brief the arc rotates around (§7e)
    platforms   TEXT,                         -- comma-sep target platforms for the arc
    status      TEXT NOT NULL DEFAULT 'active',
    created_by  TEXT,
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reply_drafts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,                -- Chatwoot conversation id (§3d engagement)
    brand           TEXT,
    incoming        TEXT,                          -- the follower message we're replying to (context)
    draft           TEXT,                          -- the AI-drafted reply (operator reviews before sending)
    status          TEXT NOT NULL DEFAULT 'requested',  -- requested | drafted | error
    created_at      TEXT NOT NULL,
    updated_at      TEXT
);
CREATE TABLE IF NOT EXISTS system_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT NOT NULL,                      -- 'error' | 'warn' | 'info'
    source     TEXT,                               -- e.g. 'worker', 'video', 'image_gen', 'publish', 'fal'
    message    TEXT NOT NULL,                      -- one-line summary
    detail     TEXT,                               -- fuller error / context
    job_id     TEXT,                               -- related job, if any
    seen       INTEGER NOT NULL DEFAULT 0,         -- 0 = unseen (drives the badge), 1 = acknowledged
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sysevents_level ON system_events(level);
CREATE TABLE IF NOT EXISTS learnings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    brand      TEXT,
    kind       TEXT NOT NULL,                     -- 'edit' (operator rewrote a draft) | 'reject'
    platform   TEXT,
    topic      TEXT,
    before     TEXT,                               -- the AI draft
    after      TEXT,                               -- the operator's rewrite (edit); NULL for a reject
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learnings_brand ON learnings(brand);
CREATE TABLE IF NOT EXISTS social_pulses (
    job_id     TEXT PRIMARY KEY,                  -- one current-discussion pulse per job (latest)
    topic      TEXT,
    sources    TEXT,                               -- which sources were queried (e.g. 'reddit')
    data_json  TEXT NOT NULL,                      -- {clusters:[{theme,score,sources,items:[…]}], freshness, range}
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,                   -- operator-configurable runtime setting (the /settings page)
    value      TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS build_steps (             -- per-post build trace: which model/params built each piece (§ observability)
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id   TEXT NOT NULL,
    step     TEXT NOT NULL,                          -- 'config' | 'image' | 'video' | ...
    model    TEXT,
    provider TEXT,
    params   TEXT,                                   -- JSON of the key params (animate, duration, dims, ...)
    at       TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS delegations (             -- §org: CEO (Constance) -> Head of Content (Nancy) hand-off, tracked end to end (Phase B)
    id          TEXT PRIMARY KEY,
    from_agent  TEXT NOT NULL,                        -- 'constance'
    to_agent    TEXT NOT NULL,                        -- 'nancy'
    task        TEXT NOT NULL,                        -- the content brief (a line)
    brand       TEXT,
    platforms   TEXT,                                 -- comma-joined, optional
    media       TEXT,                                 -- none|image|video|carousel|script, optional
    direction   TEXT,                                 -- creative direction, optional
    note        TEXT,
    status      TEXT NOT NULL DEFAULT 'open',         -- open -> accepted -> done | cancelled
    job_id      TEXT,                                 -- linked once the assignee queues it
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    closed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_build_steps_job ON build_steps(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_occasions_brand ON occasions(brand);
CREATE INDEX IF NOT EXISTS idx_reply_drafts_conv ON reply_drafts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_delegations_to ON delegations(to_agent, status);
CREATE INDEX IF NOT EXISTS idx_delegations_from ON delegations(from_agent);
"""


def _utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# --- operator-configurable runtime settings (the /settings page; env is the fallback) ---
def get_setting(key, default=None):
    try:
        with _db() as conn:
            r = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return r["value"] if r and r["value"] is not None else default
    except Exception:  # noqa: BLE001 — settings must never break the worker
        return default


def get_setting_bool(key, default=False):
    v = get_setting(key)
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def set_setting(key, value):
    with _db() as conn:
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, None if value is None else str(value), _utcnow()))


def record_build_step(job_id, step, model=None, provider=None, params=None):
    """Build trace (§ observability): record which model/params built a piece of a post. Best-effort."""
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO build_steps (job_id, step, model, provider, params, at) VALUES (?,?,?,?,?,?)",
                (job_id, step, model, provider, json.dumps(params or {}), _utcnow()))
    except Exception:  # noqa: BLE001 — a trace failure must never break generation
        pass


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
        if "campaign_id" not in cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN campaign_id TEXT")  # links a job to a campaign arc (§7e)
        if "pillar" not in cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN pillar TEXT")  # the content pillar this piece serves (§7e)
        if "claim_action" not in cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN claim_action TEXT")  # real action stashed at claim, for crash/restart recovery (§9b)
        if "attempts" not in cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN attempts INTEGER DEFAULT 0")  # process_one passes, for the resumable-loop cap (§9b)
        if "direction" not in cols:
            conn.execute("ALTER TABLE jobs ADD COLUMN direction TEXT")  # creative direction the bot agreed with the operator; the worker honours it
        # an AI-generated image can be attached to a draft (Phase 2). Uploaded to the publisher at
        # attach-time, so we store the publisher's media reference (id + url), not the local file.
        dcols = [r[1] for r in conn.execute("PRAGMA table_info(drafts)").fetchall()]
        if "image_path" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN image_path TEXT")  # publisher media URL
        if "image_id" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN image_id TEXT")    # publisher media id
        if "images_json" not in dcols:
            # multi-image carousel (§7c): JSON array of [{id, path}] in slide order. image_id/image_path
            # stay as the PRIMARY (= images_json[0]) for single-image consumers.
            conn.execute("ALTER TABLE drafts ADD COLUMN images_json TEXT")
        if "safety_json" not in dcols:
            # brand-safety verdict (§6a): JSON {verdict: green|amber|red, reason, at}. Surfaced at the gate.
            conn.execute("ALTER TABLE drafts ADD COLUMN safety_json TEXT")
        if "validation_json" not in dcols:
            # platform-rule validation (capability registry): JSON list of {level, code, message}.
            conn.execute("ALTER TABLE drafts ADD COLUMN validation_json TEXT")
        if "alt_text" not in dcols:
            conn.execute("ALTER TABLE drafts ADD COLUMN alt_text TEXT")  # accessibility alt text for the image(s)
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
            if "pillar" not in scols:
                conn.execute("ALTER TABLE suggestions ADD COLUMN pillar TEXT")  # which brand pillar it serves (§7e)
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
        # seed the recurring occasions calendar (§7g) once, brand='all' as a shared reference set.
        # Stored as RULES, not fixed dates, so moveable days recompute every year. auto_draft is OFF
        # by default — they populate the calendar; the operator opts specific ones into auto-drafting.
        if conn.execute("SELECT COUNT(*) FROM occasions").fetchone()[0] == 0:
            _seed_occasions(conn)


# --- occasions calendar (§7g) -------------------------------------------------
# Recurring built-ins for a South-Africa-based operator (the audience default, see metric units).
# region '' = universal; 'ZA' = South African public holiday/observance. weekday: 0=Mon..6=Sun.
_OCCASION_SEED = [
    ("New Year's Day", {"type": "fixed", "month": 1, "day": 1}, ""),
    ("Valentine's Day", {"type": "fixed", "month": 2, "day": 14}, ""),
    ("Human Rights Day", {"type": "fixed", "month": 3, "day": 21}, "ZA"),
    ("Good Friday", {"type": "easter_relative", "offset": -2}, ""),
    ("Easter Sunday", {"type": "easter_relative", "offset": 0}, ""),
    ("Easter Monday / Family Day", {"type": "easter_relative", "offset": 1}, "ZA"),
    ("Workers' Day", {"type": "fixed", "month": 5, "day": 1}, "ZA"),
    ("Mother's Day", {"type": "nth_weekday", "month": 5, "weekday": 6, "n": 2}, ""),
    ("Youth Day", {"type": "fixed", "month": 6, "day": 16}, "ZA"),
    ("Father's Day", {"type": "nth_weekday", "month": 6, "weekday": 6, "n": 3}, ""),
    ("Mandela Day", {"type": "fixed", "month": 7, "day": 18}, "ZA"),
    ("National Women's Day", {"type": "fixed", "month": 8, "day": 9}, "ZA"),
    ("Heritage Day", {"type": "fixed", "month": 9, "day": 24}, "ZA"),
    ("Black Friday", {"type": "nth_weekday", "month": 11, "weekday": 4, "n": 4}, ""),
    ("Christmas Day", {"type": "fixed", "month": 12, "day": 25}, ""),
    ("Day of Goodwill", {"type": "fixed", "month": 12, "day": 26}, "ZA"),
    ("New Year's Eve", {"type": "fixed", "month": 12, "day": 31}, ""),
]


def _seed_occasions(conn):
    now = _utcnow()
    for name, rule, region in _OCCASION_SEED:
        conn.execute(
            "INSERT INTO occasions (brand, name, rule, region, lead_days, sensitive, auto_draft, source, enabled, created_at, updated_at)"
            " VALUES ('all',?,?,?,14,0,0,'builtin',1,?,?)",
            (name, json.dumps(rule), region, now, now))


def _nth_weekday_date(year, month, weekday, n):
    """Date of the n-th `weekday` (0=Mon..6=Sun) of `month`/`year`; n=-1 => last. None if out of range."""
    import calendar
    if n and n > 0:
        first = datetime.date(year, month, 1)
        day = 1 + (weekday - first.weekday()) % 7 + (n - 1) * 7
        if day > calendar.monthrange(year, month)[1]:
            return None
        return datetime.date(year, month, day)
    last = calendar.monthrange(year, month)[1]
    d = datetime.date(year, month, last)
    return datetime.date(year, month, last - (d.weekday() - weekday) % 7)


def _easter_date(year):
    """Western (Gregorian) Easter Sunday for `year` — Anonymous Gregorian computus. Moveable feasts
    (Good Friday, Easter Monday, Shrove Tuesday, etc.) are expressed as a day offset from this."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    el = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * el) // 451
    month = (h + el - 7 * m + 114) // 31
    day = ((h + el - 7 * m + 114) % 31) + 1
    return datetime.date(year, month, day)


def next_occurrence(rule, from_date):
    """Next date this rule fires on/after from_date (rolls into next year if this year's has passed)."""
    if isinstance(rule, str):
        try:
            rule = json.loads(rule)
        except (ValueError, TypeError):
            return None
    t = (rule or {}).get("type")
    for year in (from_date.year, from_date.year + 1):
        cand = None
        if t == "fixed":
            try:
                cand = datetime.date(year, int(rule["month"]), int(rule["day"]))
            except (ValueError, KeyError, TypeError):
                continue
        elif t == "nth_weekday":
            try:
                cand = _nth_weekday_date(year, int(rule["month"]), int(rule["weekday"]), int(rule["n"]))
            except (ValueError, KeyError, TypeError):
                continue
        elif t == "easter_relative":
            try:
                cand = _easter_date(year) + datetime.timedelta(days=int(rule.get("offset", 0)))
            except (ValueError, KeyError, TypeError):
                continue
        if cand and cand >= from_date:
            return cand
    return None


def _today_local(tz_offset_min=120):
    return (datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(minutes=tz_offset_min)).date()


def list_occasions(brand=None, include_all=True):
    """Occasions for a brand (plus the shared 'all' set), each with computed next date + days_until.
    brand None => every occasion. Sorted by how soon they fire."""
    with _db() as conn:
        if brand and include_all:
            rows = conn.execute("SELECT * FROM occasions WHERE brand=? OR brand='all'", (brand,)).fetchall()
        elif brand:
            rows = conn.execute("SELECT * FROM occasions WHERE brand=?", (brand,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM occasions").fetchall()
    today = _today_local()
    out = []
    for r in rows:
        o = dict(r)
        nxt = next_occurrence(o["rule"], today)
        o["next_date"] = nxt.isoformat() if nxt else None
        o["days_until"] = (nxt - today).days if nxt else None
        out.append(o)
    out.sort(key=lambda o: (o["days_until"] is None, o["days_until"] if o["days_until"] is not None else 0))
    return out


def upsert_occasion(id=None, brand="all", name=None, rule=None, region=None,
                    lead_days=14, sensitive=0, auto_draft=0, enabled=1):
    now = _utcnow()
    rule_json = rule if isinstance(rule, str) else json.dumps(rule)
    with _db() as conn:
        if id:
            conn.execute(
                "UPDATE occasions SET brand=?, name=?, rule=?, region=?, lead_days=?, sensitive=?, auto_draft=?, enabled=?, updated_at=? WHERE id=?",
                (brand, name, rule_json, region, int(lead_days), int(bool(sensitive)), int(bool(auto_draft)), int(bool(enabled)), now, id))
            return id
        cur = conn.execute(
            "INSERT INTO occasions (brand, name, rule, region, lead_days, sensitive, auto_draft, source, enabled, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?,?, 'manual', ?,?,?)",
            (brand, name, rule_json, region, int(lead_days), int(bool(sensitive)), int(bool(auto_draft)), int(bool(enabled)), now, now))
        return cur.lastrowid


def delete_occasion(occ_id):
    with _db() as conn:
        conn.execute("DELETE FROM occasions WHERE id=?", (occ_id,))


def mark_occasion_handled(occ_id, occ_date):
    with _db() as conn:
        conn.execute("UPDATE occasions SET last_handled_for=?, updated_at=? WHERE id=?", (occ_date, _utcnow(), occ_id))


def due_occasions():
    """Enabled, auto-draft-on occasions whose lead window is open and which we haven't acted on yet
    for the upcoming occurrence. Returns dicts with next_date/days_until set."""
    due = []
    for o in list_occasions(brand=None):
        if not (o.get("enabled") and o.get("auto_draft")):
            continue
        if o["days_until"] is None or o["days_until"] > (o.get("lead_days") or 14) or o["days_until"] < 0:
            continue
        if o.get("last_handled_for") == o["next_date"]:
            continue
        due.append(o)
    return due


# --- work queue (dashboard-originated jobs, processed by worker.py) ---
def enqueue_action(job_id, action="research_draft"):
    with _db() as conn:
        conn.execute("UPDATE jobs SET queued_action=?, updated_at=? WHERE id=?", (action, _utcnow(), job_id))


def claim_job(job_id, action):
    """Mark a job running ('processing' — the marker the cockpit shows) while STASHING its real action
    in claim_action, so an interrupted run (crash/restart) can be returned to the queue intact (§9b)."""
    with _db() as conn:
        conn.execute("UPDATE jobs SET claim_action=?, queued_action='processing', updated_at=? WHERE id=?",
                     (action, _utcnow(), job_id))


def bump_attempts(job_id):
    """Increment + return a job's process_one attempt count (caps the resumable loop, §9b)."""
    with _db() as conn:
        conn.execute("UPDATE jobs SET attempts=COALESCE(attempts,0)+1 WHERE id=?", (job_id,))
        row = conn.execute("SELECT attempts FROM jobs WHERE id=?", (job_id,)).fetchone()
    return (row["attempts"] if row else 1)


def recover_stuck_jobs(max_age_seconds):
    """Jobs stuck in 'processing' longer than any honest run could take = their worker died. Return them
    to the queue with their original action so the loop continues instead of hanging silently. Returns
    the recovered rows (with claim_action = the action being resumed) for surfacing in the Activity log."""
    import datetime as _dt
    cutoff = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(seconds=max_age_seconds)).isoformat()
    with _db() as conn:
        rows = [dict(r) for r in conn.execute(
            "SELECT * FROM jobs WHERE queued_action='processing' AND claim_action IS NOT NULL"
            " AND state NOT IN ('cancelled','published','failed') AND updated_at < ?",  # never resurrect a finished/rejected job
            (cutoff,)).fetchall()]
        for r in rows:
            conn.execute("UPDATE jobs SET queued_action=claim_action, claim_action=NULL, updated_at=? WHERE id=?",
                         (_utcnow(), r["id"]))
    return rows


def get_queued_jobs():
    # Only the actionable queue values; 'processing'/'failed' are status markers, not work to pick up.
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM jobs WHERE queued_action IN ('research_draft','research_draft_image','research_draft_image_video','research_draft_carousel','research_draft_script')"
            " AND state NOT IN ('cancelled','published','failed') ORDER BY created_at").fetchall()]


def clear_queued(job_id):
    with _db() as conn:
        conn.execute("UPDATE jobs SET queued_action=NULL WHERE id=?", (job_id,))


# --- §org: CEO -> Head-of-Content delegations (Phase B), tracked end to end -------------------
def create_delegation(task, brand=None, from_agent="constance", to_agent="nancy",
                      platforms=None, media=None, direction=None, note=None):
    """Constance (CEO) hands a content task to Nancy. Returns the delegation row."""
    did = str(uuid.uuid4())
    now = _utcnow()
    plats = (",".join([p.strip() for p in platforms if p and p.strip()])
             if isinstance(platforms, list) else (platforms or None)) or None
    with _db() as conn:
        conn.execute(
            "INSERT INTO delegations (id, from_agent, to_agent, task, brand, platforms, media, direction, note,"
            " status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?, 'open', ?, ?)",
            (did, from_agent, to_agent, task, (brand or None), plats, (media or None),
             (direction or None), (note or None), now, now))
    return get_delegation(did)


def get_delegation(did):
    with _db() as conn:
        r = conn.execute("SELECT * FROM delegations WHERE id=?", (did,)).fetchone()
    return dict(r) if r else None


def open_delegations(to_agent="nancy"):
    """Delegations still needing the assignee to act (not yet queued)."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM delegations WHERE to_agent=? AND status='open' ORDER BY created_at", (to_agent,)).fetchall()]


def link_delegation(did, job_id):
    """Assignee accepted + queued the work — link the job and mark it in-flight."""
    with _db() as conn:
        conn.execute("UPDATE delegations SET job_id=?, status='accepted', updated_at=? WHERE id=? AND status='open'",
                     (job_id, _utcnow(), did))
    return get_delegation(did)


def sync_delegations():
    """Close any accepted delegation whose linked job reached the gate (preview/approved/published) —
    the content was delivered. Idempotent; safe from either bot. Returns the ids it closed."""
    closed = []
    with _db() as conn:
        rows = conn.execute(
            "SELECT d.id FROM delegations d JOIN jobs j ON j.id = d.job_id"
            " WHERE d.status='accepted' AND j.state IN ('preview','approved','published')").fetchall()
        now = _utcnow()
        for r in rows:
            conn.execute("UPDATE delegations SET status='done', closed_at=?, updated_at=? WHERE id=?",
                         (now, now, r["id"]))
            closed.append(r["id"])
    return closed


def expire_stale_delegations(hours=48, to_agent="nancy"):
    """Auto-close 'open' (un-actioned) delegations older than `hours`. An un-actioned delegation is
    re-injected into the assignee's per-turn context on every message, so a stranded/no-brand one
    would otherwise nag forever. Returns the rows it expired (id, task, brand) for an operator notice."""
    if not hours or hours <= 0:
        return []
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)).isoformat()
    now = _utcnow()
    expired = []
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, task, brand FROM delegations WHERE to_agent=? AND status='open' AND created_at < ?",
            (to_agent, cutoff)).fetchall()
        for r in rows:
            conn.execute(
                "UPDATE delegations SET status='expired', closed_at=?, updated_at=?, "
                "note = COALESCE(note,'') || ? WHERE id=? AND status='open'",
                (now, now, f" [auto-expired: un-actioned > {hours}h]", r["id"]))
            expired.append(dict(r))
    return expired


def drop_delegation(did, status="dropped"):
    """Operator declined an open delegation (or cleared it) — close it without delivering. Only acts on
    a still-'open' row, so it can't clobber one already accepted/delivered. Returns the updated row."""
    now = _utcnow()
    with _db() as conn:
        conn.execute("UPDATE delegations SET status=?, closed_at=?, updated_at=? WHERE id=? AND status='open'",
                     (status, now, now, did))
    return get_delegation(did)


def list_delegations(from_agent=None, status=None, limit=20):
    """For the CEO's follow-up view. Auto-syncs (closes delivered) before returning."""
    sync_delegations()
    q, params, cl = "SELECT * FROM delegations", [], []
    if from_agent:
        cl.append("from_agent=?"); params.append(from_agent)
    if status:
        cl.append("status=?"); params.append(status)
    if cl:
        q += " WHERE " + " AND ".join(cl)
    q += " ORDER BY created_at DESC LIMIT ?"; params.append(limit)
    with _db() as conn:
        return [dict(r) for r in conn.execute(q, params).fetchall()]


# --- jobs -------------------------------------------------------------------
def create_job(topic, brand="unassigned", source="telegram", created_by=None, meta=None, pillar=None):
    job_id = str(uuid.uuid4())
    now = _utcnow()
    with _db() as conn:
        conn.execute(
            "INSERT INTO jobs (id, brand, topic, state, source, created_by, created_at, updated_at, meta, pillar)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (job_id, brand or "unassigned", topic, "requested", source, created_by, now, now,
             json.dumps(meta or {}), (pillar or "").strip() or None),
        )
        conn.execute(
            "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
            (job_id, None, "requested", "agent", now, "job created"),
        )
    return get_job(job_id)


def create_and_queue(topic, brand="unassigned", source="telegram", created_by=None,
                     platforms=None, media="none", slides=4, pillar=None, direction=None):
    """Create a job AND queue it for the worker — the worker then researches, drafts, polishes,
    safety-checks and validates it, and pings when it's review-ready. This is how a control surface
    (Telegram, etc.) hands work to the Studio: the work flows through the Studio, nothing is done in
    the chat. media: 'none' | 'image' | 'video' | 'carousel' | 'script'. direction = the creative
    direction (format/look/angle) the bot agreed with the operator; the worker honours it."""
    media = (media or "none").strip().lower()
    action = {"carousel": "research_draft_carousel", "video": "research_draft_image_video",
              "image": "research_draft_image", "script": "research_draft_script"}.get(media, "research_draft")
    meta = {}
    if media == "carousel":
        try:
            n = int(slides)
        except (TypeError, ValueError):
            n = 4
        meta["carousel_slides"] = max(2, min(10, n))
    targets = ",".join([p.strip() for p in (platforms or []) if p and p.strip()]) or None
    job_id = str(uuid.uuid4())
    now = _utcnow()
    with _db() as conn:
        conn.execute(
            "INSERT INTO jobs (id, brand, topic, state, source, created_by, created_at, updated_at,"
            " meta, queued_action, target_platforms, pillar, direction) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (job_id, brand or "unassigned", topic, "requested", source, created_by, now, now,
             json.dumps(meta), action, targets, (pillar or "").strip() or None,
             (direction or "").strip() or None),
        )
        conn.execute(
            "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
            (job_id, None, "requested", "agent", now,
             f"job created + queued ({action}){' for ' + targets if targets else ''}"),
        )
    return get_job(job_id)


def get_job(job_id):
    with _db() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return dict(row) if row else None


def set_job_pillar(job_id, pillar):
    """Tag (or clear) the content pillar a job serves (§7e)."""
    with _db() as conn:
        conn.execute("UPDATE jobs SET pillar=?, updated_at=? WHERE id=?",
                     ((pillar or "").strip() or None, _utcnow(), job_id))


def pillar_coverage(brand=None):
    """How the brand's actual output is spread across its content pillars (§7e) — counts live jobs
    (anything not binned) by pillar, so the operator can see and balance coverage over real work,
    not just open scout ideas. Returns [{pillar, n}, ...] busiest first."""
    q = ("SELECT pillar, COUNT(*) n FROM jobs WHERE pillar IS NOT NULL AND pillar != ''"
         " AND state != 'cancelled'")
    params = []
    if brand and brand != "all":
        q += " AND brand=?"
        params.append(brand)
    q += " GROUP BY pillar ORDER BY n DESC"
    with _db() as conn:
        return [dict(r) for r in conn.execute(q, params).fetchall()]


def save_social_pulse(job_id, topic, sources, data):
    """Store the current-discussion social pulse for a job (one per job; latest wins)."""
    with _db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO social_pulses (job_id, topic, sources, data_json, created_at)"
            " VALUES (?,?,?,?,?)",
            (job_id, topic, sources, json.dumps(data or {}), _utcnow()),
        )


def add_learning(brand, kind, topic, before, after=None, platform=None):
    """Record an operator feedback signal (§7 'rejected/edited = a learning signal'): a draft they
    rewrote (kind='edit', before→after) or rejected (kind='reject'). Fed back into generation."""
    with _db() as conn:
        conn.execute(
            "INSERT INTO learnings (brand, kind, platform, topic, before, after, created_at) VALUES (?,?,?,?,?,?,?)",
            (brand or "unassigned", kind, platform, (topic or "")[:200],
             (before or "")[:2000], (after[:2000] if after else None), _utcnow()),
        )


def log_system_event(level, source, message, detail=None, job_id=None):
    """Record a failure/notice to the system log (surfaced in the dashboard Activity view, not Telegram).
    NEVER raises — it's called from except blocks; a logging failure must not mask the original error."""
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO system_events (level, source, message, detail, job_id, seen, created_at)"
                " VALUES (?,?,?,?,?,0,?)",
                ((level or "info"), source, (message or "")[:300], (str(detail)[:1500] if detail else None), job_id, _utcnow()),
            )
    except Exception:  # noqa: BLE001 — logging must never break the caller
        pass


def recent_learnings(brand, limit=None):
    """Most recent operator feedback for a brand — to teach generation the operator's voice/preferences.
    The count is operator-tunable via the /settings Content pipeline tab (recent_learnings_count)."""
    if limit is None:
        try:
            limit = int(get_setting("recent_learnings_count") or 6)
        except Exception:  # noqa: BLE001
            limit = 6
    with _db() as conn:
        rows = conn.execute(
            "SELECT kind, platform, topic, before, after FROM learnings WHERE brand=? ORDER BY id DESC LIMIT ?",
            (brand or "unassigned", limit),
        ).fetchall()
    return [dict(r) for r in rows]


def get_social_pulse(job_id):
    with _db() as conn:
        row = conn.execute("SELECT * FROM social_pulses WHERE job_id=?", (job_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    try:
        d["data"] = json.loads(d.get("data_json") or "{}")
    except Exception:  # noqa: BLE001
        d["data"] = {}
    return d


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
    terminal = to_state in ("cancelled", "published", "failed")
    with _db() as conn:
        if terminal:  # drop queue/claim markers so a finished or rejected job can't be re-picked or recovered
            conn.execute("UPDATE jobs SET state=?, queued_action=NULL, claim_action=NULL, updated_at=? WHERE id=?",
                         (to_state, now, job_id))
        else:
            conn.execute("UPDATE jobs SET state=?, updated_at=? WHERE id=?", (to_state, now, job_id))
        conn.execute(
            "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
            (job_id, frm, to_state, actor, now, detail),
        )
    return get_job(job_id)


def record_event(job_id, detail, actor="system", from_state=None, to_state=None):
    # The transition audit log is best-effort. The studio worker and the agent subprocess write the
    # same SQLite file through separate connections, so an INSERT can briefly lose a foreign-key /
    # lock race; a logging write must never propagate that up and fail an otherwise-good job. Retry
    # once (the contended row settles), then drop the line rather than raise.
    for attempt in (1, 2):
        try:
            with _db() as conn:
                conn.execute(
                    "INSERT INTO job_events (job_id, from_state, to_state, actor, at, detail) VALUES (?,?,?,?,?,?)",
                    (job_id, from_state, to_state, actor, _utcnow(), detail),
                )
            return
        except Exception as e:  # noqa: BLE001
            if attempt == 1:
                time.sleep(0.2)
                continue
            print(f"studio: record_event dropped for {job_id}: {e}")


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
def save_brief(job_id, facts, angles, unverified=None, recency=None, reference_images=None):
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
    brief = {"facts": facts, "angles": angles, "unverified": unverified or [], "recency": recency or "",
             "reference_images": [u for u in (reference_images or []) if isinstance(u, str) and u.strip()]}
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
    is_script = bool(angle and "script" in angle.lower())  # a shoot script is a production doc, not a post — no post limit
    if limit and len(body) > limit and not is_script:
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
            "SELECT id, job_id, platform, angle, body, char_count, variant, image_path, image_id, images_json, video_path, video_id, polish_json, safety_json, validation_json, alt_text, created_at FROM drafts"
            " WHERE job_id=? ORDER BY id", (job_id,)
        ).fetchall()]


def preview_drafts_unpolished(limit=12):
    """Drafts on jobs at the gate ('preview') that the polish pipeline hasn't touched yet —
    used by the worker sweep so posts from ANY path (incl. Telegram) get polished + pills."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT d.id, d.platform, d.body, d.job_id, j.brand FROM drafts d JOIN jobs j ON j.id = d.job_id"
            " WHERE j.state='preview' AND d.polish_json IS NULL"
            " AND (d.angle IS NULL OR LOWER(d.angle) NOT LIKE '%script%') ORDER BY d.id LIMIT ?", (limit,)  # scripts aren't posts — don't polish
        ).fetchall()]


def preview_drafts_unchecked(limit=12):
    """Preview drafts not yet run through the §6a brand-safety check (any path, incl. Telegram)."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT d.id, d.platform, d.body, d.job_id, j.brand FROM drafts d JOIN jobs j ON j.id = d.job_id"
            " WHERE j.state='preview' AND d.safety_json IS NULL ORDER BY d.id LIMIT ?", (limit,)
        ).fetchall()]


def preview_drafts_unvalidated(limit=12):
    """Preview drafts not yet checked against the platform capability registry."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT d.* FROM drafts d JOIN jobs j ON j.id = d.job_id"
            " WHERE j.state='preview' AND d.validation_json IS NULL"
            " AND (d.angle IS NULL OR LOWER(d.angle) NOT LIKE '%script%') ORDER BY d.id LIMIT ?", (limit,)  # scripts skip platform-post validation
        ).fetchall()]


def set_draft_validation(draft_id, messages):
    """Store a draft's platform-rule validation (capability registry): list of {level, code, message}."""
    with _db() as conn:
        conn.execute("UPDATE drafts SET validation_json=? WHERE id=?", (json.dumps(messages or []), draft_id))


def preview_drafts_unalttexted(limit=8):
    """Preview drafts that have an image/carousel but no accessibility alt text yet (any path)."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT d.* FROM drafts d JOIN jobs j ON j.id = d.job_id"
            " WHERE j.state='preview' AND (d.alt_text IS NULL OR trim(d.alt_text)='')"
            " AND (d.image_path IS NOT NULL OR d.images_json IS NOT NULL) ORDER BY d.id LIMIT ?", (limit,)
        ).fetchall()]


def set_draft_alt_text(draft_id, alt):
    """Store accessibility alt text for a draft's (primary) image."""
    with _db() as conn:
        conn.execute("UPDATE drafts SET alt_text=? WHERE id=?", ((alt or "").strip()[:420], draft_id))


def set_draft_safety(draft_id, verdict, reason):
    """Store a draft's brand-safety verdict (§6a): green | amber | red + a one-line reason."""
    verdict = (verdict or "amber").strip().lower()
    if verdict not in ("green", "amber", "red"):
        verdict = "amber"
    with _db() as conn:
        conn.execute("UPDATE drafts SET safety_json=? WHERE id=?",
                     (json.dumps({"verdict": verdict, "reason": (reason or "").strip()[:400], "at": _utcnow()}), draft_id))
    return verdict


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


def jobs_awaiting_redraft():
    """Jobs the operator asked to re-angle (queued_action='redraft'); the chosen angle is in meta."""
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM jobs WHERE queued_action='redraft' ORDER BY updated_at").fetchall()]


def redraft_draft(draft_id, body, angle=None):
    """Replace a draft's body in place with a re-angled rewrite (same draft id, no duplicate).
    Clears polish_json so the polish sweep re-runs on the new body."""
    body = (body or "").strip()
    if not body:
        raise ValueError("empty redraft")
    with _db() as conn:
        conn.execute("UPDATE drafts SET body=?, char_count=?, angle=?, polish_json=NULL WHERE id=?",
                     (body, len(body), angle, draft_id))


def create_reply_draft(conversation_id, brand, incoming):
    """Queue an AI reply-draft request for a Chatwoot conversation (§3d). The worker fills it in."""
    now = _utcnow()
    with _db() as conn:
        cur = conn.execute(
            "INSERT INTO reply_drafts (conversation_id, brand, incoming, status, created_at) VALUES (?,?,?, 'requested', ?)",
            (str(conversation_id), brand, incoming, now))
        return cur.lastrowid


def pending_reply_drafts(limit=8):
    with _db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM reply_drafts WHERE status='requested' ORDER BY id LIMIT ?", (limit,)).fetchall()]


def save_reply_draft(draft_id, text, status="drafted"):
    with _db() as conn:
        conn.execute("UPDATE reply_drafts SET draft=?, status=?, updated_at=? WHERE id=?",
                     (text, status, _utcnow(), draft_id))


def latest_reply_draft(conversation_id):
    """Most recent reply-draft for a conversation (what the inbox composer polls/shows)."""
    with _db() as conn:
        r = conn.execute("SELECT * FROM reply_drafts WHERE conversation_id=? ORDER BY id DESC LIMIT 1",
                         (str(conversation_id),)).fetchone()
    return dict(r) if r else None


def get_campaign(campaign_id):
    """A campaign's row (or None) — read at draft time so a piece knows its arc's theme (§7e)."""
    if not campaign_id:
        return None
    try:
        with _db() as conn:
            r = conn.execute("SELECT * FROM campaigns WHERE id=?", (campaign_id,)).fetchone()
        return dict(r) if r else None
    except Exception:  # noqa: BLE001 — table may not exist on an old DB
        return None


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
    # single image: it's both the primary and the whole (1-slide) image set.
    with _db() as conn:
        conn.execute("UPDATE drafts SET image_id=?, image_path=?, images_json=? WHERE id=?",
                     (image_id, image_path, json.dumps([{"id": image_id, "path": image_path}]), draft_id))


def set_draft_images_by_id(draft_id, media_list):
    """Attach a CAROUSEL (ordered list of {id, path}) to a draft. The first is the primary image."""
    media_list = [m for m in (media_list or []) if m and m.get("path")]
    if not media_list:
        raise ValueError("no images to attach")
    primary = media_list[0]
    with _db() as conn:
        conn.execute("UPDATE drafts SET image_id=?, image_path=?, images_json=? WHERE id=?",
                     (primary.get("id"), primary.get("path"), json.dumps(media_list), draft_id))
    return len(media_list)


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


def create_suggestion(brand, topic, rationale=None, source_url=None, niche_id=None, source=None, heat="warm", pillar=None):
    """Record a scout idea for the operator to promote or dismiss. Dedupes on (brand, topic) among
    still-open suggestions so repeated scout runs don't pile duplicates. `pillar` = which brand
    content pillar the idea serves (§7e), so the operator can see/balance pillar coverage."""
    topic = (topic or "").strip()
    if not topic:
        raise ValueError("topic is required")
    heat = (heat or "warm").strip().lower()
    if heat not in _HEAT:
        heat = "warm"
    pillar = (pillar or "").strip() or None
    sid = str(uuid.uuid4())
    now = _utcnow()
    with _db() as conn:
        dup = conn.execute(
            "SELECT id FROM suggestions WHERE brand=? AND lower(topic)=lower(?) AND status='new'",
            (brand or "unassigned", topic)).fetchone()
        if dup:
            return {"id": dup["id"], "duplicate": True, "topic": topic}
        conn.execute(
            "INSERT INTO suggestions (id, brand, topic, rationale, source_url, source, heat, pillar, niche_id, status, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?, 'new', ?)",
            (sid, brand or "unassigned", topic, rationale, source_url, source, heat, pillar, niche_id, now))
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
