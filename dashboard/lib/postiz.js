// Minimal Postiz public-API client for the dashboard's human-clicked Publish action.
// Mirrors plugins/studio/postiz.py. Auth header is `Authorization: <key>` (no Bearer).
import crypto from 'crypto';

const API_URL = (process.env.POSTIZ_API_URL || 'http://host.docker.internal:4007/api/public/v1').replace(/\/$/, '');
const API_KEY = process.env.POSTIZ_API_KEY || '';
// Postiz's INTERNAL API (e.g. /api/posts/:id/date) — the public API can't reschedule. Derived from
// the public URL by dropping /public/v1. Authenticated with a minted `auth` JWT (see mintAuthToken).
const INTERNAL_URL = API_URL.replace(/\/public\/v\d+$/, '');
const JWT_SECRET = process.env.POSTIZ_JWT_SECRET || '';
const POSTIZ_USER_ID = process.env.POSTIZ_USER_ID || '';

// Mint the `auth` JWT Postiz's internal API expects: HS256 over {id}, signed with Postiz's JWT_SECRET
// (matches @gitroom AuthService.signJWT = jsonwebtoken.sign(value, JWT_SECRET), default HS256, no exp).
// Postiz re-loads the user from its DB by id, so the token only needs a valid signature + the user id.
export function mintAuthToken() {
  if (!JWT_SECRET || !POSTIZ_USER_ID) throw new Error('POSTIZ_JWT_SECRET / POSTIZ_USER_ID not configured');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ id: POSTIZ_USER_ID });
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

// Reschedule a post to a new time via Postiz's internal PUT /posts/:id/date (what its own calendar uses).
export async function reschedulePost(postId, dateISO) {
  const r = await fetch(`${INTERNAL_URL}/posts/${postId}/date`, {
    method: 'PUT',
    headers: { auth: mintAuthToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: dateISO, action: 'update' }),
  });
  if (!r.ok) throw new Error(`Postiz reschedule HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : { ok: true };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// opts.retry: retry transient failures (network errors, 5xx, 429) with exponential backoff before
// giving up (§9b). Only enabled for writes that should survive a platform hiccup. NOT retried on
// 4xx — a client error won't succeed on retry. Backoff: 0.5s, 1s, 2s.
async function req(method, path, body, opts = {}) {
  if (!API_KEY) throw new Error('POSTIZ_API_KEY not configured');
  const attempts = opts.retry ? (opts.attempts || 3) : 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(500 * 2 ** (i - 1));
    let r;
    try {
      r = await fetch(`${API_URL}${path}`, {
        method,
        headers: { Authorization: API_KEY, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      lastErr = new Error(`Postiz unreachable: ${String(e?.message || e)}`); // network blip -> retryable
      continue;
    }
    if (r.ok) {
      const text = await r.text();
      return text ? JSON.parse(text) : {};
    }
    const err = new Error(`Postiz API HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    if (r.status >= 500 || r.status === 429) { lastErr = err; continue; } // server/ratelimit -> retryable
    throw err; // 4xx -> permanent, don't retry
  }
  throw lastErr;
}

export async function findIntegration(platform) {
  const list = await req('GET', '/integrations');
  return (Array.isArray(list) ? list : []).find((i) => i.identifier === platform && !i.disabled) || null;
}

// All connected channels, for the accounts-health panel. Returns null if Postiz is unreachable.
export async function listIntegrations() {
  try {
    const list = await req('GET', '/integrations');
    return Array.isArray(list) ? list : [];
  } catch {
    return null;
  }
}

// List posts (scheduled + published) in a date range — the studio calendar mirror of Postiz.
// Returns a normalized array; [] if Postiz is unreachable (calendar degrades gracefully).
export async function listPosts(startISO, endISO) {
  try {
    const qs = `startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(endISO)}`;
    const data = await req('GET', `/posts?${qs}`);
    const arr = Array.isArray(data) ? data : data.posts || [];
    return arr.map((p) => ({
      id: p.id,
      date: p.publishDate,
      content: p.content || '',
      state: (p.state || '').toLowerCase(),     // published | queue | draft | error ...
      platform: p.integration?.providerIdentifier || null,
      account: p.integration?.name || null,
      releaseURL: p.releaseURL || null,
      group: p.group || null,
    }));
  } catch {
    return null; // unreachable
  }
}

// Upload a raw media buffer (operator's own photo/clip) to Postiz. Returns {id, path}.
export async function uploadMedia(buffer, filename, mime) {
  if (!API_KEY) throw new Error('POSTIZ_API_KEY not configured');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), filename);
  const r = await fetch(`${API_URL}/upload`, { method: 'POST', headers: { Authorization: API_KEY }, body: fd });
  if (!r.ok) throw new Error(`Postiz upload HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// §7f performance loop. Channel-level analytics for an integration over the last `days`. Postiz
// returns an array of metrics, each {label, percentageChange, data:[{total,date}]} — or [] for
// platforms it has no analytics provider for (e.g. Bluesky). [] on any error / unreachable.
export async function integrationAnalytics(integrationId, days = 7) {
  try {
    const data = await req('GET', `/analytics/${integrationId}?date=${days}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Per-post analytics (Postiz GET /analytics/post/:postId), where the platform supports it.
export async function postAnalytics(postId) {
  try {
    const data = await req('GET', `/analytics/post/${postId}`);
    return Array.isArray(data) ? data : (data ? [data] : []);
  } catch {
    return [];
  }
}

export async function createPost(integrationId, content, platform, image, video, opts = {}) {
  // `image` may be an ARRAY of {id,path} (a carousel/multi-image post), a single {id,path}, or null.
  // `video` (single) takes precedence. All already-uploaded Postiz media refs from the draft.
  // opts.when: 'now' (default) or 'schedule'; opts.date: ISO time for a scheduled post.
  let mediaArr;
  if (video && video.id) mediaArr = [{ id: video.id, path: video.path }];
  else if (Array.isArray(image)) mediaArr = image.filter((m) => m && m.id).map((m) => ({ id: m.id, path: m.path }));
  else if (image && image.id) mediaArr = [{ id: image.id, path: image.path }];
  else mediaArr = [];
  const when = opts.when === 'schedule' ? 'schedule' : 'now';
  return req('POST', '/posts', {
    type: when,
    date: opts.date || new Date().toISOString(),
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: integrationId },
      value: [{ content, image: mediaArr }], // Postiz renders 2+ images as a swipe carousel where the platform supports it
      settings: { __type: platform },
    }],
  }, { retry: true }); // §9b: survive transient platform hiccups
}
