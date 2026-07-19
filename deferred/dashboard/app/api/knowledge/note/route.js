import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { writeNote } from '@/lib/knowledge';

// Create a note straight from the dashboard -> markdown in the shared KB (Basic Memory indexes it).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    const r = writeNote({ title: body.title, body: body.body, tags: body.tags });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
