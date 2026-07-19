import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { addNiche, removeNiche } from '@/lib/db';

// Manage scout niches (what the trend scout looks for).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    if (body.action === 'add') {
      const query = (body.query || '').trim();
      if (!query) return NextResponse.json({ error: 'a niche/topic area is required' }, { status: 400 });
      return NextResponse.json(addNiche(body.brand || '', query));
    }
    if (body.action === 'remove') {
      if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      return NextResponse.json(removeNiche(Number(body.id)));
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
