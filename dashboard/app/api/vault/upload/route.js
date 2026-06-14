import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getSession } from '@/lib/session';
import { addMediaAsset } from '@/lib/db';
import { uploadMedia } from '@/lib/postiz';

export const dynamic = 'force-dynamic';

// Upload the operator's OWN media straight into the Vault (no job/draft context). Images are
// auto-rotated, capped at 2048px on the long edge, and re-encoded to JPEG; videos go up as-is.
// Lands as source='uploaded'; the worker's vision pass auto-tags images shortly after.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'bad upload' }, { status: 400 }); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'no file provided' }, { status: 400 });

  const mime = file.type || '';
  const base = (file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (mime.startsWith('video/')) {
      const media = await uploadMedia(buf, base, mime);
      const item = addMediaAsset({ kind: 'video', url: media.path, mediaId: media.id, source: 'uploaded' });
      return NextResponse.json({ ok: true, item });
    }
    if (mime.startsWith('image/')) {
      // No platform target in the Vault — keep the original framing, just normalise + cap size.
      const { data, info } = await sharp(buf).rotate()
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
      const media = await uploadMedia(data, `${base.replace(/\.[^.]+$/, '')}.jpg`, 'image/jpeg');
      const item = addMediaAsset({ kind: 'image', url: media.path, mediaId: media.id, source: 'uploaded', width: info.width, height: info.height });
      return NextResponse.json({ ok: true, item });
    }
    return NextResponse.json({ error: `unsupported type ${mime || 'unknown'}; upload an image or a video` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
