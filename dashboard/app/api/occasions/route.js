import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { listOccasions, upsertOccasion, deleteOccasion } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const brand = await getActiveBrand();
  return NextResponse.json({ occasions: listOccasions(brand), brand: brand || null });
}

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    if (body.action === 'delete') return NextResponse.json(deleteOccasion(body.id));
    const id = upsertOccasion(body);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
