import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { allSettings, setSetting } from '@/lib/db';
import { EDITABLE_TABS, EDITABLE_KEYS } from '@/lib/settingsSchema';
import { settingsStatus } from '@/lib/settingsStatus';

export const dynamic = 'force-dynamic';

// Build the current value map: stored value if present, else the schema default. Only ever
// returns keys that are in the editable whitelist — secrets (e.g. the password hash) live in the
// same table but are never surfaced here.
function currentValues() {
  const stored = allSettings();
  const out = {};
  for (const t of EDITABLE_TABS) {
    for (const f of t.fields) {
      out[f.key] = stored[f.key] != null ? stored[f.key] : f.default;
    }
  }
  return out;
}

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Everything the modal needs in one call: editable values + integration/system status.
  return NextResponse.json({ values: currentValues(), ...settingsStatus() });
}

// Coerce/validate a single field by its declared type. Returns the canonical string to store, or
// throws on an invalid value so the operator gets a clear error instead of garbage in the DB.
function coerce(field, raw) {
  if (field.type === 'bool') {
    return ['1', 'true', 'yes', 'on', true].includes(typeof raw === 'string' ? raw.toLowerCase() : raw) ? 'true' : 'false';
  }
  if (field.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number`);
    return String(n);
  }
  return raw == null ? '' : String(raw).trim();
}

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const updates = body && typeof body === 'object' ? body : {};

  const saved = [];
  try {
    for (const [key, raw] of Object.entries(updates)) {
      const field = EDITABLE_KEYS[key];
      if (!field) continue; // silently ignore anything not whitelisted (defends against injected keys)
      setSetting(key, coerce(field, raw));
      saved.push(key);
    }
  } catch (e) {
    return NextResponse.json({ error: e.message || 'invalid value' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, saved, values: currentValues() });
}
