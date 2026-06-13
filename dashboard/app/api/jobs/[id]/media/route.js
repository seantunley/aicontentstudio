import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { getSession } from '@/lib/session';
import { getJobById, getDraftsFor, setDraftImageById, setDraftVideoById, logEvent, addMediaAsset } from '@/lib/db';
import { uploadMedia } from '@/lib/postiz';
import { PLATFORM_IMAGE } from '@/lib/platforms';

export const dynamic = 'force-dynamic';

// Real-content ingestion (§3e): attach the operator's OWN photo or clip to a job's drafts.
// An image is cropped+sized per platform (subject kept in frame) the same way an AI master is;
// a video is attached as-is. Publishing then uses it like any other attached media.
export async function POST(req, { params }) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const job = getJobById(id);
  if (!job) return NextResponse.json({ error: 'no such job' }, { status: 404 });
  const drafts = getDraftsFor(job.id);
  if (!drafts.length) return NextResponse.json({ error: 'no drafts to attach media to yet' }, { status: 400 });

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
      for (const d of drafts) setDraftVideoById(d.id, media.id, media.path);
      addMediaAsset({ kind: 'video', url: media.path, mediaId: media.id, source: 'uploaded', jobId: job.id, platform: drafts[0]?.platform, topic: job.topic, tags: base.replace(/[._-]+/g, ' ').trim() });
      logEvent(job.id, `operator uploaded own video (${base}), attached to ${drafts.length} draft(s)`);
      return NextResponse.json({ ok: true, kind: 'video', attached: drafts.length });
    }
    if (mime.startsWith('image/')) {
      const done = [];
      for (const d of drafts) {
        const [w, h] = PLATFORM_IMAGE[d.platform] || [1080, 1080];
        // fit:cover + position:attention keeps the salient subject in frame per aspect ratio
        const out = await sharp(buf).rotate().resize(w, h, { fit: 'cover', position: sharp.strategy.attention })
          .jpeg({ quality: 88 }).toBuffer();
        const media = await uploadMedia(out, `${d.platform}_${base}.jpg`, 'image/jpeg');
        setDraftImageById(d.id, media.id, media.path);
        addMediaAsset({ kind: 'image', url: media.path, mediaId: media.id, source: 'uploaded', jobId: job.id, draftId: d.id, platform: d.platform, width: w, height: h, topic: job.topic, tags: base.replace(/[._-]+/g, ' ').trim() });
        done.push(`${d.platform} ${w}x${h}`);
      }
      logEvent(job.id, `operator uploaded own image (${base}), sized + attached: ${done.join(', ')}`);
      return NextResponse.json({ ok: true, kind: 'image', attached: done });
    }
    return NextResponse.json({ error: `unsupported type ${mime || 'unknown'}; upload an image or a video` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
