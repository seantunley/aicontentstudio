import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { upsertBrand, deleteBrand, setSetting } from '@/lib/db';

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    if (body.action === 'delete') return NextResponse.json(deleteBrand(body.slug));
    const res = upsertBrand(body);
    // reference photos are stored per brand as a setting the worker reads (brand_ref_images:<slug>)
    if (res?.slug && typeof body.ref_images === 'string') {
      const urls = body.ref_images.split(/[\n,]+/).map((s) => s.trim()).filter((u) => /^https?:\/\//i.test(u));
      setSetting('brand_ref_images:' + res.slug, JSON.stringify(urls));
    }
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
