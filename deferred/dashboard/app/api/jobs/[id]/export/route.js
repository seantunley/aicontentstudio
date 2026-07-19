import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { getSession } from '@/lib/session';
import { getJobById, getDraftsFor } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Manual export: download a job's post(s) + media as a zip for posting by hand (offline, or a
// platform we don't auto-publish to). One folder per platform: caption, alt text, hashtags, the
// media files (best-effort download) and their URLs as a fallback.
export async function GET(req, { params }) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const job = getJobById(id);
  if (!job) return NextResponse.json({ error: 'no such job' }, { status: 404 });
  const drafts = getDraftsFor(job.id);
  if (!drafts.length) return NextResponse.json({ error: 'no drafts to export yet' }, { status: 400 });

  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks = [];
  archive.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => { archive.on('end', resolve); archive.on('error', reject); });

  archive.append(
    `AI Content Studio — manual export\n\nTopic: ${job.topic}\nBrand: ${job.brand}\nJob: ${job.id}\n` +
    `Platforms: ${drafts.map((d) => d.platform).join(', ')}\nExported: ${new Date().toISOString()}\n`,
    { name: 'README.txt' },
  );

  const used = {};
  for (const d of drafts) {
    let dir = (d.platform || 'post').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    used[dir] = (used[dir] || 0) + 1;
    if (used[dir] > 1) dir = `${dir}-${used[dir]}`;

    archive.append(d.body || '', { name: `${dir}/caption.txt` });
    if (d.alt_text) archive.append(String(d.alt_text), { name: `${dir}/alt-text.txt` });
    const tags = (d.body || '').match(/#[\p{L}0-9_]+/gu) || [];
    archive.append(
      `platform: ${d.platform}\ncharacters: ${d.char_count}\nangle: ${d.angle || '—'}\n` +
      `hashtags: ${tags.join(' ') || '(none)'}\n`,
      { name: `${dir}/meta.txt` },
    );

    let media = [];
    try { media = JSON.parse(d.images_json || 'null') || []; } catch { media = []; }
    if (!media.length && d.image_path) media = [{ path: d.image_path }];
    if (d.video_path) media = [{ path: d.video_path, video: true }];

    const urls = [];
    let i = 1;
    for (const m of media) {
      if (!m || !m.path) continue;
      urls.push(m.path);
      try {
        const r = await fetch(m.path);
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          const ext = m.video ? 'mp4' : (m.path.split('?')[0].split('.').pop() || 'jpg').slice(0, 4);
          archive.append(buf, { name: `${dir}/media-${i}.${ext}` });
        }
      } catch { /* unreachable media → URLs file still lists it */ }
      i++;
    }
    if (urls.length) archive.append(urls.join('\n') + '\n', { name: `${dir}/media-urls.txt` });
  }

  archive.finalize();
  await finished;
  const zip = Buffer.concat(chunks);
  const fname = `studio-${(job.topic || 'post').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}-${job.id.slice(0, 8)}.zip`;
  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  });
}
