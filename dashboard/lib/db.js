// Read-only-ish access to the shared studio SQLite DB (the same file the Hermes
// studio plugin writes). WAL mode lets both processes touch it concurrently at
// single-operator scale (§9 — SQLite to start, Postgres later).
import Database from 'better-sqlite3';
import crypto from 'crypto';

const DB_PATH = process.env.STUDIO_DB_PATH || '/opt/studio/studio.db';
const STATES = ['requested', 'researched', 'planned', 'generated', 'preview', 'approved', 'published'];

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

// Originate a job from the cockpit: create it + queue research+draft for the worker to pick up.
export function createAndQueueJob(topic, brand, who, withImage) {
  const d = db();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const action = withImage ? 'research_draft_image' : 'research_draft';
  const tx = d.transaction(() => {
    d.prepare('INSERT INTO jobs (id,brand,topic,state,source,created_by,created_at,updated_at,meta,queued_action) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, brand || 'unassigned', topic, 'requested', 'dashboard', who, now, now, '{}', action);
    d.prepare('INSERT INTO job_events (job_id,from_state,to_state,actor,at,detail) VALUES (?,?,?,?,?,?)')
      .run(id, null, 'requested', 'human', now, `job created + queued via dashboard by ${who}`);
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

export function getEvents(jobId) {
  return db().prepare('SELECT from_state,to_state,actor,detail,at FROM job_events WHERE job_id=? ORDER BY id').all(jobId);
}

const DRAFT_LIMITS = { bluesky: 300 };
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

export { STATES };
