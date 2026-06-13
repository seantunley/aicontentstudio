import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/session';
import { ACTIVE_BRAND_COOKIE } from '@/lib/brand';

// Switch the active brand (§1b). slug '' / 'all' clears the scope to all brands.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const slug = (body.slug || '').trim().toLowerCase() || 'all';
  (await cookies()).set(ACTIVE_BRAND_COOKIE, slug, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return NextResponse.json({ ok: true, slug });
}
