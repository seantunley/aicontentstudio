import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { setMediaTags } from '@/lib/db';

// Edit an asset's content tags (Vault search).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    return NextResponse.json(setMediaTags(body.id, (body.tags || '').trim()));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
