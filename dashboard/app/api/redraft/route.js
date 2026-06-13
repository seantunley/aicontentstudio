import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { requestRedraft } from '@/lib/db';

// Re-angle a previewed job: the operator picked a different angle from the brief; the worker rewrites
// the drafts in place (grounded in the same research) and re-lands them in the queue.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    return NextResponse.json(requestRedraft(body.jobId, body.angle));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
