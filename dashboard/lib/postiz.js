// Minimal Postiz public-API client for the dashboard's human-clicked Publish action.
// Mirrors plugins/studio/postiz.py. Auth header is `Authorization: <key>` (no Bearer).
const API_URL = (process.env.POSTIZ_API_URL || 'http://host.docker.internal:4007/api/public/v1').replace(/\/$/, '');
const API_KEY = process.env.POSTIZ_API_KEY || '';

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

// Upload a raw media buffer (operator's own photo/clip) to Postiz. Returns {id, path}.
export async function uploadMedia(buffer, filename, mime) {
  if (!API_KEY) throw new Error('POSTIZ_API_KEY not configured');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), filename);
  const r = await fetch(`${API_URL}/upload`, { method: 'POST', headers: { Authorization: API_KEY }, body: fd });
  if (!r.ok) throw new Error(`Postiz upload HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export async function createPost(integrationId, content, platform, image, video, opts = {}) {
  // `image`/`video` are already-uploaded Postiz media refs {id, path} stored on the draft.
  // Postiz carries both in the same per-post media array; a video takes precedence when present.
  // opts.when: 'now' (default) or 'schedule'; opts.date: ISO time for a scheduled post.
  const media = video && video.id ? video : image && image.id ? image : null;
  const when = opts.when === 'schedule' ? 'schedule' : 'now';
  return req('POST', '/posts', {
    type: when,
    date: opts.date || new Date().toISOString(),
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: integrationId },
      value: [{ content, image: media ? [{ id: media.id, path: media.path }] : [] }],
      settings: { __type: platform },
    }],
  }, { retry: true }); // §9b: survive transient platform hiccups
}
