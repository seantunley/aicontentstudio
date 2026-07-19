import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { listCampaigns, campaignDetail, createCampaign, deleteCampaign } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const c = campaignDetail(id);
    return c ? NextResponse.json(c) : NextResponse.json({ error: 'no such campaign' }, { status: 404 });
  }
  const brand = await getActiveBrand();
  return NextResponse.json({ campaigns: listCampaigns(brand), brand: brand || null });
}

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    if (body.action === 'delete') return NextResponse.json(deleteCampaign(body.id));
    const brand = body.brand || (await getActiveBrand()) || 'unassigned';
    return NextResponse.json(createCampaign({ ...body, brand, who: session.user.name }));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
