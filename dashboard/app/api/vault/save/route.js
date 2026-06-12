import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { uploadMedia } from '@/lib/postiz';
import { addMediaAsset } from '@/lib/db';

// Save an edited canvas (data URL from Polotno) as a NEW Vault asset (uploads to Postiz, catalogues).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const m = /^data:(image\/\w+);base64,(.+)$/s.exec(body.dataUrl || '');
  if (!m) return NextResponse.json({ error: 'bad image data' }, { status: 400 });
  const mime = m[1];
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const buf = Buffer.from(m[2], 'base64');
  try {
    const media = await uploadMedia(buf, `edit_${Date.now()}.${ext}`, mime);
    addMediaAsset({
      kind: 'image', url: media.path, mediaId: media.id, source: 'edited',
      topic: (body.topic || 'edited in Studio Editor').slice(0, 200),
      tags: (body.tags || '').slice(0, 300) || null,
    });
    return NextResponse.json({ ok: true, url: media.path });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
