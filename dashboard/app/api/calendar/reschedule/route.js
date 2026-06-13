import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { reschedulePost } from '@/lib/postiz';

// Drag-to-reschedule: move a Postiz post to a new time (internal PUT /posts/:id/date).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!body.id || !body.date) return NextResponse.json({ error: 'id and date required' }, { status: 400 });
  try {
    await reschedulePost(body.id, new Date(body.date).toISOString());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
