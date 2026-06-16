import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { trashedJobs, trashedMedia, TRASH_TTL_DAYS } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Trash contents for the top-right Trash modal (session-gated).
export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let jobs = [], media = [];
  try { jobs = trashedJobs(); } catch {}
  try { media = trashedMedia(); } catch {}
  return NextResponse.json({ jobs, media, ttlDays: TRASH_TTL_DAYS });
}
