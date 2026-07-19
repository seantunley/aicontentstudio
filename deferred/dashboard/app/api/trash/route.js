import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { trashedJobs, trashedMedia, TRASH_TTL_DAYS, getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Trash contents for the top-right Trash modal (session-gated). The retention window is the
// operator-set trash_ttl_days (the worker honours the same value when it purges).
export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let jobs = [], media = [];
  try { jobs = trashedJobs(); } catch {}
  try { media = trashedMedia(); } catch {}
  const ttlDays = parseInt(getSetting('trash_ttl_days'), 10) || TRASH_TTL_DAYS;
  return NextResponse.json({ jobs, media, ttlDays });
}
