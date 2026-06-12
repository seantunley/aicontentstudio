// Minimal Postiz public-API client for the dashboard's human-clicked Publish action.
// Mirrors plugins/studio/postiz.py. Auth header is `Authorization: <key>` (no Bearer).
const API_URL = (process.env.POSTIZ_API_URL || 'http://host.docker.internal:4007/api/public/v1').replace(/\/$/, '');
const API_KEY = process.env.POSTIZ_API_KEY || '';

async function req(method, path, body) {
  if (!API_KEY) throw new Error('POSTIZ_API_KEY not configured');
  const r = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Postiz API HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = await r.text();
  return text ? JSON.parse(text) : {};
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

export async function createPost(integrationId, content, platform, image, video) {
  // `image`/`video` are already-uploaded Postiz media refs {id, path} stored on the draft.
  // Postiz carries both in the same per-post media array; a video takes precedence when present.
  const media = video && video.id ? video : image && image.id ? image : null;
  return req('POST', '/posts', {
    type: 'now',
    date: new Date().toISOString(),
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: integrationId },
      value: [{ content, image: media ? [{ id: media.id, path: media.path }] : [] }],
      settings: { __type: platform },
    }],
  });
}
