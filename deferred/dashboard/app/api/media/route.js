import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { setMediaTags, softDeleteMedia, restoreMedia } from '@/lib/db';

// Vault asset: edit tags (default), or delete/restore (action).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    if (body.action === 'delete') return NextResponse.json(softDeleteMedia(body.id));
    if (body.action === 'restore') return NextResponse.json(restoreMedia(body.id));
    return NextResponse.json(setMediaTags(body.id, (body.tags || '').trim()));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
