import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { reorderDraftImages } from '@/lib/db';

// Persist a new carousel slide order for a draft (first slide becomes the primary image).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!body.draftId || !Array.isArray(body.images)) return NextResponse.json({ error: 'draftId and images required' }, { status: 400 });
  try {
    return NextResponse.json(reorderDraftImages(body.draftId, body.images));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
