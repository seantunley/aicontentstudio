import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session';
import { createAndQueueJob } from '../../../../lib/db';

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const topic = (body.topic || '').trim();
  if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 });
  const platforms = Array.isArray(body.platforms) ? body.platforms.filter(Boolean) : [];
  try {
    return NextResponse.json(createAndQueueJob(topic, (body.brand || '').trim(), session.user.name, !!body.withImage || !!body.withVideo || !!body.withCarousel, platforms, !!body.withVideo, !!body.withCarousel, body.slides));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
