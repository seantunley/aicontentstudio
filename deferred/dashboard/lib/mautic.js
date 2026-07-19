// Server-side Mautic REST client. The studio drives Mautic via its API so the Funnels area renders
// in the studio's own editorial-noir UI — the operator never sees Mautic's login or chrome (that's
// the SSO-by-API approach). Heavy visual authoring (campaign canvas, email designer) stays in the
// Mautic UI as an "advanced" escape hatch; everything here is the day-to-day data surface.
//
// Auth: HTTP Basic with the admin user (api_enable_basic_auth). Creds live in the gitignored .env.
const BASE = (process.env.MAUTIC_API_URL || 'http://host.docker.internal:4010').replace(/\/$/, '');
const USER = process.env.MAUTIC_API_USER || '';
const PASS = process.env.MAUTIC_API_PASSWORD || '';

export function mauticConfigured() {
  return !!(USER && PASS);
}

function authHeader() {
  return 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
}

async function api(path, { method = 'GET', body } = {}) {
  if (!mauticConfigured()) throw new Error('Mautic API not configured');
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) {
    const msg = data?.errors?.[0]?.message || data?.error?.message || `Mautic API ${r.status}`;
    throw new Error(msg);
  }
  return data;
}

// Mautic returns objects keyed by id; normalise to arrays for rendering.
const toArray = (obj) => (obj && typeof obj === 'object' ? Object.values(obj) : []);

// Trim Mautic's verbose contact object to what the studio UI needs.
export function shapeContact(c) {
  const f = c.fields?.all || {};
  return {
    id: c.id,
    email: f.email || '',
    name: [f.firstname, f.lastname].filter(Boolean).join(' '),
    phone: f.phone || '',
    points: c.points ?? 0,
    lastActive: c.lastActive || c.dateModified || null,
    tags: (c.tags || []).map((t) => t.tag || t).filter(Boolean),
  };
}

// --- reads ---
export async function listContacts({ limit = 30, start = 0, search = '' } = {}) {
  const q = new URLSearchParams({ limit: String(limit), start: String(start), orderBy: 'last_active', orderByDir: 'DESC' });
  if (search) q.set('search', search);
  const d = await api(`/contacts?${q.toString()}`);
  return { total: Number(d.total || 0), contacts: toArray(d.contacts) };
}

export async function getContact(id) {
  const d = await api(`/contacts/${id}`);
  return d.contact || null;
}

export async function getContactActivity(id, limit = 25) {
  // Activity timeline (events: form submits, email opens, page hits, etc.)
  try {
    const d = await api(`/contacts/${id}/activity?limit=${limit}`);
    return toArray(d.events).length ? toArray(d.events) : (d.events || []);
  } catch { return []; }
}

export async function listSegments() {
  const d = await api('/segments?limit=200');
  return toArray(d.lists);
}

export async function listEmails() {
  const d = await api('/emails?limit=200');
  return toArray(d.emails);
}

export async function listCampaigns() {
  const d = await api('/campaigns?limit=200');
  return toArray(d.campaigns);
}

// Top-line counts for the Funnels overview.
export async function funnelSummary() {
  const [c, s, e, cp] = await Promise.all([
    api('/contacts?limit=1').then((d) => Number(d.total || 0)).catch(() => 0),
    api('/segments?limit=1').then((d) => Number(d.total || 0)).catch(() => 0),
    api('/emails?limit=1').then((d) => Number(d.total || 0)).catch(() => 0),
    api('/campaigns?limit=1').then((d) => Number(d.total || 0)).catch(() => 0),
  ]);
  return { contacts: c, segments: s, emails: e, campaigns: cp };
}

// --- writes ---
// Create or update a contact by email (Mautic dedupes on unique email). Used by the capture endpoint.
export async function upsertContact(fields) {
  const d = await api('/contacts/new', { method: 'POST', body: fields });
  return d.contact || null;
}

export async function addContactToSegment(contactId, segmentId) {
  return api(`/segments/${segmentId}/contact/${contactId}/add`, { method: 'POST' });
}

export async function addContactToCampaign(contactId, campaignId) {
  return api(`/campaigns/${campaignId}/contact/${contactId}/add`, { method: 'POST' });
}
