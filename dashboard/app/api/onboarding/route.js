import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { setSetting } from '@/lib/db';

// Persist onboarding panel state (dismiss / welcome acknowledged). Operator-only, like other mutating
// routes. Both are simple flags read back by lib/onboarding.js.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (body.dismiss) setSetting('onboarding_dismissed', '1');
  if (body.welcomed) setSetting('onboarding_welcomed', '1');
  // Per-brand reference product photos (consumed by the worker at brand_ref_images:<slug>). Not in the
  // settings whitelist (dynamic key), so saved here. Only public http(s) URLs the worker can fetch.
  if (body.refImages && body.refImages.slug) {
    const slug = String(body.refImages.slug).trim().toLowerCase();
    const urls = Array.isArray(body.refImages.urls)
      ? body.refImages.urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u.trim())).map((u) => u.trim())
      : [];
    if (slug) setSetting('brand_ref_images:' + slug, JSON.stringify(urls));
  }
  return NextResponse.json({ ok: true });
}
