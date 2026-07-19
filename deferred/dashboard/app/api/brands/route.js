import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { upsertBrand, deleteBrand } from '@/lib/db';

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    if (body.action === 'delete') return NextResponse.json(deleteBrand(body.slug));
    return NextResponse.json(upsertBrand(body));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
