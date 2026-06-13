// Read-only-ish access to the shared studio SQLite DB (the same file the Hermes
// studio plugin writes). WAL mode lets both processes touch it concurrently at
// single-operator scale (§9 — SQLite to start, Postgres later).
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';

const DB_PATH = process.env.STUDIO_DB_PATH || '/opt/studio/studio.db';
const STATES = ['requested', 'researched', 'planned', 'generated', 'preview', 'approved', 'scheduled', 'published'];

let _db;
function db() {
  if (!_db) {
    _db = new Database(DB_PATH, { fileMustExist: false });
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

export function pipelineCounts() {
  const rows = db().prepare('SELECT state, COUNT(*) n FROM jobs GROUP BY state').all();
  const map = Object.fromEntries(rows.map((r) => [r.state, r.n]));
  return STATES.map((s) => ({ state: s, count: map[s] || 0 }));
}

export function recentJobs(limit = 30) {
  return db().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function approvalQueue() {
  // Jobs awaiting the human gate, with their latest draft.
  const jobs = db().prepare("SELECT * FROM jobs WHERE state='preview' ORDER BY updated_at DESC").all();
  const latestDraft = db().prepare('SELECT * FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1');
  return jobs.map((j) => ({ ...j, draft: latestDraft.get(j.id) || null }));
}

export function costSummary() {
  const row = db().prepare('SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) total FROM cost_ledger').get();
  return { entries: row.n, totalUsd: row.total };
}

// --- Cost ledger (§10): spend per brand / per job, recent entries ---
export function costThisMonth() {
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const row = db().prepare('SELECT COALESCE(SUM(cost_usd),0) total, COUNT(*) n FROM cost_ledger WHERE at >= ?')
    .get(start.toISOString());
  return { totalUsd: row.total, entries: row.n };
}
export function costByBrand() {
  return db().prepare(
    'SELECT brand, COUNT(*) entries, COALESCE(SUM(cost_usd),0) total FROM cost_ledger GROUP BY brand ORDER BY total DESC',
  ).all();
}
export function costByOperation() {
  return db().prepare(
    'SELECT operation, provider, COUNT(*) entries, COALESCE(SUM(cost_usd),0) total FROM cost_ledger GROUP BY operation, provider ORDER BY total DESC',
  ).all();
}
export function recentCosts(limit = 60) {
  return db().prepare(
    `SELECT c.*, j.topic FROM cost_ledger c LEFT JOIN jobs j ON j.id = c.job_id ORDER BY c.id DESC LIMIT ?`,
  ).all(limit);
}
export function costForJob(jobId) {
  const row = db().prepare('SELECT COALESCE(SUM(cost_usd),0) total, COUNT(*) n FROM cost_ledger WHERE job_id=?').get(jobId);
  return { totalUsd: row.total, entries: row.n };
}

// --- write actions (the human gate, from the dashboard) ---
// Approve = advance preview->approved AND mint a single-use publish token (the §4a human approval).
// The studio publish tool later consumes a valid token for the job; the model can never mint one.
export function approveJob(jobId, who) {
  const d = db();
  const job = d.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('no such job');
  if (job.state !== 'preview') throw new Error(`job is '${job.state}', not awaiting approval`);
  const now = new Date().toISOString();
  const exp = new Date(Date.now() + 3600 * 1000).toISOString();
  const token = crypto.randomBytes(32).toString('base64url');
  const ev = d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)');
  const tx = d.transaction(() => {
    d.prepare('UPDATE jobs SET state=?, updated_at=? WHERE id=?').run('approved', now, jobId);
    ev.run(jobId, 'preview', 'approved', 'human', now, `approved via dashboard by ${who}`);
    d.prepare('INSERT INTO publish_tokens (token,job_id,minted_by,minted_at,expires_at,used_at) VALUES (?,?,?,?,?,NULL)')
      .run(token, jobId, who, now, exp);
    ev.run(jobId, null, null, 'human', now, `publish token minted by ${who} (dashboard)`);
  });
  tx();
  return { ok: true, jobId, state: 'approved' };
}

export function rejectJob(jobId, who) {
  const d = db();
  const job = d.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('no such job');
  if (job.state !== 'preview') throw new Error(`job is '${job.state}', not awaiting approval`);
  const now = new Date().toISOString();
  const tx = d.transaction(() => {
    d.prepare('UPDATE jobs SET state=?, updated_at=? WHERE id=?').run('cancelled', now, jobId);
    d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
      .run(jobId, 'preview', 'cancelled', 'human', now, `rejected via dashboard by ${who}`);
  });
  tx();
  return { ok: true, jobId, state: 'cancelled' };
}

export function getJobById(id) {
  return db().prepare('SELECT * FROM jobs WHERE id=?').get(id) || null;
}

// Schedule an approved job for a future time (handed to Postiz's queue). approved -> scheduled.
// The chosen time + channels are stored in jobs.meta so the Upcoming view can show them.
export function markScheduled(jobId, who, whenISO, where) {
  const d = db();
  const job = d.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('no such job');
  if (job.state !== 'approved') throw new Error(`job is '${job.state}', not approved`);
  const now = new Date().toISOString();
  let meta = {};
  try { meta = JSON.parse(job.meta || '{}'); } catch { meta = {}; }
  meta.scheduled_at = whenISO;
  meta.scheduled_to = where;
  const tx = d.transaction(() => {
    d.prepare('UPDATE jobs SET state=?, meta=?, updated_at=? WHERE id=?').run('scheduled', JSON.stringify(meta), now, jobId);
    d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
      .run(jobId, 'approved', 'scheduled', 'human', now, `scheduled for ${whenISO} on ${where} by ${who}`);
  });
  tx();
  return { ok: true, jobId, state: 'scheduled', scheduledAt: whenISO };
}

// Upcoming scheduled jobs (+ their latest draft), soonest first.
export function scheduledJobs() {
  const jobs = db().prepare("SELECT * FROM jobs WHERE state='scheduled' ORDER BY updated_at DESC").all();
  const latestDraft = db().prepare('SELECT * FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1');
  return jobs
    .map((j) => {
      let m = {};
      try { m = JSON.parse(j.meta || '{}'); } catch { m = {}; }
      return { ...j, scheduled_at: m.scheduled_at || null, scheduled_to: m.scheduled_to || null, draft: latestDraft.get(j.id) || null };
    })
    .sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
}

// Jobs the worker is queued on / working / failed (queued_action carries the status).
// Order: the job actually being processed first, then waiting, then failed.
export function inProgress() {
  return db().prepare(
    "SELECT * FROM jobs WHERE queued_action IS NOT NULL"
    + " ORDER BY CASE queued_action WHEN 'processing' THEN 0 WHEN 'failed' THEN 2 ELSE 1 END, updated_at DESC",
  ).all();
}

// Worker liveness: the .worker_heartbeat file the worker writes each run. null if never run.
export function workerHeartbeat() {
  try {
    const p = (process.env.STUDIO_DB_PATH || '/opt/studio/studio.db').replace(/[^/]+$/, '.worker_heartbeat');
    const at = fs.readFileSync(p, 'utf8').trim();
    const ms = Date.now() - new Date(at).getTime();
    if (isNaN(ms)) return null;
    return { at, agoSec: Math.max(0, Math.round(ms / 1000)) };
  } catch { return null; }
}

export function retryJob(jobId) {
  const d = db();
  const job = d.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('no such job');
  if (job.queued_action !== 'failed') throw new Error(`job is '${job.queued_action || 'idle'}', not failed`);
  const now = new Date().toISOString();
  const tx = d.transaction(() => {
    d.prepare('UPDATE jobs SET queued_action=?, updated_at=? WHERE id=?').run('research_draft', now, jobId);
    d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
      .run(jobId, null, null, 'human', now, 'retry requested via dashboard');
  });
  tx();
  return { ok: true };
}

// Originate a job from the cockpit: create it + queue research+draft for the worker to pick up.
export function createAndQueueJob(topic, brand, who, withImage, platforms, withVideo) {
  const d = db();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const action = withVideo ? 'research_draft_image_video' : withImage ? 'research_draft_image' : 'research_draft';
  const targets = platforms && platforms.length ? platforms.join(',') : null;
  const tx = d.transaction(() => {
    d.prepare('INSERT INTO jobs (id,brand,topic,state,source,created_by,created_at,updated_at,meta,queued_action,target_platforms) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, brand || 'unassigned', topic, 'requested', 'dashboard', who, now, now, '{}', action, targets);
    d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
      .run(id, null, 'requested', 'human', now, `job created + queued via dashboard by ${who}${targets ? ' for ' + targets : ''}`);
  });
  tx();
  return { ok: true, jobId: id };
}

export function latestDraft(jobId) {
  return db().prepare('SELECT * FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1').get(jobId) || null;
}

export function getBrief(jobId) {
  const row = db().prepare('SELECT brief_json, recency FROM briefs WHERE job_id=?').get(jobId);
  if (!row) return null;
  try { return { ...JSON.parse(row.brief_json), recency: row.recency }; } catch { return null; }
}

export function getDraftsFor(jobId) {
  return db().prepare('SELECT * FROM drafts WHERE job_id=? ORDER BY id').all(jobId);
}

// Attach operator-uploaded media to a draft (mirrors the studio plugin's setters).
export function setDraftImageById(draftId, mediaId, path) {
  db().prepare('UPDATE drafts SET image_id=?, image_path=? WHERE id=?').run(mediaId, path, draftId);
}
export function setDraftVideoById(draftId, mediaId, path) {
  db().prepare('UPDATE drafts SET video_id=?, video_path=? WHERE id=?').run(mediaId, path, draftId);
}
export function logEvent(jobId, detail, actor = 'human') {
  db().prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
    .run(jobId, null, null, actor, new Date().toISOString(), detail);
}

// --- Trend scout (§3b): suggestions + niches ---
export function listSuggestions(status = 'new') {
  return db().prepare(
    "SELECT * FROM suggestions WHERE status=? ORDER BY CASE heat WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 WHEN 'cool' THEN 2 ELSE 3 END, created_at DESC",
  ).all(status);
}
export function promoteSuggestion(sid, who, opts = {}) {
  const d = db();
  const s = d.prepare('SELECT * FROM suggestions WHERE id=?').get(sid);
  if (!s) throw new Error('no such suggestion');
  if (s.status !== 'new') throw new Error(`already ${s.status}`);
  const platforms = Array.isArray(opts.platforms) ? opts.platforms.filter(Boolean) : [];
  const res = createAndQueueJob(s.topic, s.brand, who, !!opts.withImage || !!opts.withVideo, platforms, !!opts.withVideo);
  d.prepare("UPDATE suggestions SET status='promoted', job_id=? WHERE id=?").run(res.jobId, sid);
  return { ok: true, jobId: res.jobId };
}
export function dismissSuggestion(sid) {
  const r = db().prepare("UPDATE suggestions SET status='dismissed' WHERE id=? AND status='new'").run(sid);
  if (!r.changes) throw new Error('not an open suggestion');
  return { ok: true };
}
export function listNiches() {
  return db().prepare('SELECT * FROM scout_niches ORDER BY id').all();
}
export function getScoutSchedule() {
  const d = db();
  d.prepare('INSERT OR IGNORE INTO scout_schedule (id, enabled) VALUES (1, 1)').run();
  return d.prepare('SELECT * FROM scout_schedule WHERE id=1').get();
}
export function setScoutSchedule({ days, hour, minute, enabled } = {}) {
  const d = db();
  d.prepare('INSERT OR IGNORE INTO scout_schedule (id, enabled) VALUES (1, 1)').run();
  if (days != null) d.prepare('UPDATE scout_schedule SET days=? WHERE id=1').run(Array.isArray(days) ? days.join(',') : String(days));
  if (hour != null) d.prepare('UPDATE scout_schedule SET hour=? WHERE id=1').run(Math.max(0, Math.min(23, Number(hour))));
  if (minute != null) d.prepare('UPDATE scout_schedule SET minute=? WHERE id=1').run(Math.max(0, Math.min(59, Number(minute))));
  if (enabled != null) d.prepare('UPDATE scout_schedule SET enabled=? WHERE id=1').run(enabled ? 1 : 0);
  return getScoutSchedule();
}
export function addNiche(brand, query) {
  const r = db().prepare('INSERT INTO scout_niches (brand, query, enabled, created_at) VALUES (?,?,1,?)')
    .run((brand || 'unassigned').trim() || 'unassigned', query.trim(), new Date().toISOString());
  return { ok: true, id: Number(r.lastInsertRowid) };
}
export function removeNiche(id) {
  const d = db();
  const tx = d.transaction(() => {
    // detach ideas first so the foreign key doesn't block the delete (they remain as suggestions)
    d.prepare('UPDATE suggestions SET niche_id=NULL WHERE niche_id=?').run(id);
    d.prepare('DELETE FROM scout_niches WHERE id=?').run(id);
  });
  tx();
  return { ok: true };
}

export function getEvents(jobId) {
  return db().prepare('SELECT from_state,to_state,actor,detail,at FROM job_events WHERE job_id=? ORDER BY id').all(jobId);
}

// --- The Vault: catalogue of every generated/uploaded asset ---
export function addMediaAsset({ kind, url, mediaId, source, jobId, draftId, platform, width, height, topic }) {
  if (!url) return;
  db().prepare(
    'INSERT OR IGNORE INTO media_assets (kind,url,media_id,source,job_id,draft_id,platform,width,height,topic,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  ).run(kind, url, mediaId || null, source || null, jobId || null, draftId || null, platform || null, width || null, height || null, topic || null, new Date().toISOString());
}
export function listMedia(kind, limit = 600) {
  const d = db();
  if (kind === 'image' || kind === 'video') return d.prepare('SELECT * FROM media_assets WHERE kind=? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?').all(kind, limit);
  return d.prepare('SELECT * FROM media_assets WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?').all(limit);
}
export function mediaCounts() {
  const rows = db().prepare('SELECT kind, COUNT(*) n FROM media_assets WHERE deleted_at IS NULL GROUP BY kind').all();
  const m = Object.fromEntries(rows.map((r) => [r.kind, r.n]));
  return { image: m.image || 0, video: m.video || 0, total: (m.image || 0) + (m.video || 0) };
}
export function setMediaTags(id, tags) {
  const r = db().prepare('UPDATE media_assets SET tags=? WHERE id=?').run(tags || null, Number(id));
  if (!r.changes) throw new Error('no such asset');
  return { ok: true };
}
// Vault soft-delete -> Trash (restorable, purged after 30 days).
export function softDeleteMedia(id) {
  const r = db().prepare('UPDATE media_assets SET deleted_at=? WHERE id=? AND deleted_at IS NULL')
    .run(new Date().toISOString(), Number(id));
  if (!r.changes) throw new Error('no such asset');
  return { ok: true };
}
export function restoreMedia(id) {
  const r = db().prepare('UPDATE media_assets SET deleted_at=NULL WHERE id=?').run(Number(id));
  if (!r.changes) throw new Error('no such asset');
  return { ok: true };
}
export function trashedMedia(limit = 300) {
  return db().prepare('SELECT * FROM media_assets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?').all(limit);
}

export const DRAFT_LIMITS = { bluesky: 300 };
export function updateDraftBody(draftId, body) {
  const d = db();
  const draft = d.prepare('SELECT * FROM drafts WHERE id=?').get(draftId);
  if (!draft) throw new Error('no such draft');
  const text = (body || '').trim();
  if (!text) throw new Error('draft cannot be empty');
  const lim = DRAFT_LIMITS[draft.platform];
  if (lim && text.length > lim) throw new Error(`${draft.platform} limit is ${lim} chars; this is ${text.length}`);
  const tx = d.transaction(() => {
    d.prepare('UPDATE drafts SET body=?, char_count=? WHERE id=?').run(text, text.length, draftId);
    d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
      .run(draft.job_id, null, null, 'human', new Date().toISOString(), `draft edited via dashboard (${text.length} chars)`);
  });
  tx();
  return { ok: true, char_count: text.length };
}

// Jobs approved and ready to publish, each with its latest draft.
export function publishable() {
  const jobs = db().prepare("SELECT * FROM jobs WHERE state='approved' ORDER BY updated_at DESC").all();
  const latestDraft = db().prepare('SELECT * FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1');
  return jobs.map((j) => ({ ...j, draft: latestDraft.get(j.id) || null }));
}

// Mark a job published (human did it from the dashboard): walk the pipeline forward to
// 'published' with an audit trail, and retire any outstanding approval token.
const ORDER = ['requested', 'researched', 'planned', 'generated', 'preview', 'approved', 'published'];
export function markPublished(jobId, who, channel) {
  const d = db();
  const ev = d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)');
  const tx = d.transaction(() => {
    let st = d.prepare('SELECT state FROM jobs WHERE id=?').get(jobId).state;
    while (ORDER.indexOf(st) < ORDER.indexOf('published')) {
      const nxt = ORDER[ORDER.indexOf(st) + 1];
      const now = new Date().toISOString();
      d.prepare('UPDATE jobs SET state=?, updated_at=? WHERE id=?').run(nxt, now, jobId);
      ev.run(jobId, st, nxt, 'human', now,
        nxt === 'published' ? `published to ${channel} via dashboard by ${who}` : 'auto-advance (dashboard publish)');
      st = nxt;
    }
    d.prepare('UPDATE publish_tokens SET used_at=? WHERE job_id=? AND used_at IS NULL')
      .run(new Date().toISOString(), jobId);
  });
  tx();
}

// --- Review-later flag (soft middle option between approve and reject) ---
export function toggleReview(jobId, who) {
  const d = db();
  const job = d.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('no such job');
  let meta = {};
  try { meta = JSON.parse(job.meta || '{}'); } catch { meta = {}; }
  const now = new Date().toISOString();
  const on = !meta.review_later;
  if (on) meta.review_later = now; else delete meta.review_later;
  d.prepare('UPDATE jobs SET meta=?, updated_at=? WHERE id=?').run(JSON.stringify(meta), now, jobId);
  d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
    .run(jobId, null, null, 'human', now, on ? `flagged for later review by ${who}` : `review flag cleared by ${who}`);
  return { ok: true, flagged: on };
}

// --- Trash: rejected jobs are 'cancelled' (soft-deleted), restorable, auto-purged after 30 days ---
export const TRASH_TTL_DAYS = 30;
export function trashedJobs() {
  const jobs = db().prepare("SELECT * FROM jobs WHERE state='cancelled' ORDER BY updated_at DESC").all();
  const latestDraft = db().prepare('SELECT * FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1');
  return jobs.map((j) => ({ ...j, draft: latestDraft.get(j.id) || null }));
}
export function restoreJob(jobId, who) {
  const d = db();
  const job = d.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
  if (!job) throw new Error('no such job');
  if (job.state !== 'cancelled') throw new Error(`job is '${job.state}', not in trash`);
  const now = new Date().toISOString();
  d.prepare('UPDATE jobs SET state=?, updated_at=? WHERE id=?').run('preview', now, jobId);
  d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
    .run(jobId, 'cancelled', 'preview', 'human', now, `restored from trash by ${who}`);
  return { ok: true };
}

// --- Pill revert: roll a draft back to the version BEFORE a polish step (e.g. the longer pre-humanize text) ---
export function revertDraftStep(draftId, stepIndex, who) {
  const d = db();
  const draft = d.prepare('SELECT * FROM drafts WHERE id=?').get(draftId);
  if (!draft) throw new Error('no such draft');
  let steps = [];
  try { steps = JSON.parse(draft.polish_json || '[]'); } catch { steps = []; }
  const step = steps[stepIndex];
  if (!step) throw new Error('no such polish step');
  const before = (step.before || '').trim();
  if (!before) throw new Error('no earlier version to revert to');
  const kept = steps.slice(0, stepIndex); // dropping this step and everything after it
  const tx = d.transaction(() => {
    d.prepare('UPDATE drafts SET body=?, char_count=?, polish_json=? WHERE id=?')
      .run(before, before.length, JSON.stringify(kept), draftId);
    d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
      .run(draft.job_id, null, null, 'human', new Date().toISOString(),
           `draft reverted to the version before "${step.skill}" via dashboard by ${who}`);
  });
  tx();
  return { ok: true, char_count: before.length };
}

// --- Brand registry (§1a/§7): empty until the operator fills packs in; generation uses a
// brand's profile when present, else the default behaviour. No brand details required to exist. ---
export function listBrands() {
  return db().prepare('SELECT * FROM brands ORDER BY name').all();
}
export function getBrandBySlug(slug) {
  return db().prepare('SELECT * FROM brands WHERE slug=?').get(slug) || null;
}
const slugify = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export function upsertBrand(b) {
  const d = db();
  const name = (b.name || '').trim();
  if (!name) throw new Error('name is required');
  const slug = (b.slug && b.slug.trim()) ? slugify(b.slug) : slugify(name);
  if (!slug) throw new Error('could not derive a slug');
  const now = new Date().toISOString();
  const vals = [name, b.region || null, b.audience || null, b.voice || null, b.safety || null, b.pillars || null, b.sensitive || null, b.enabled === false ? 0 : 1, now];
  if (d.prepare('SELECT slug FROM brands WHERE slug=?').get(slug)) {
    d.prepare('UPDATE brands SET name=?,region=?,audience=?,voice=?,safety=?,pillars=?,sensitive=?,enabled=?,updated_at=? WHERE slug=?').run(...vals, slug);
  } else {
    d.prepare('INSERT INTO brands (name,region,audience,voice,safety,pillars,sensitive,enabled,updated_at,created_at,slug) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...vals, now, slug);
  }
  return { ok: true, slug };
}
export function deleteBrand(slug) {
  const r = db().prepare('DELETE FROM brands WHERE slug=?').run(slug);
  if (!r.changes) throw new Error('no such brand');
  return { ok: true };
}

export { STATES };
