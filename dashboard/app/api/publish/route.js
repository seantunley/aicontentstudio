import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getJobById, getDraftsFor, markPublished } from '../../../lib/db';
import { findIntegration, createPost } from '../../../lib/postiz';
import { notifyTelegram } from '../../../lib/notify';

// Human-clicked publish: the authenticated operator IS the approval (§7a). Fans out — posts EVERY
// platform draft of an approved job live via Postiz, marks it published, and DMs the operator.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const job = getJobById(body.jobId);
  if (!job) return NextResponse.json({ error: 'no such job' }, { status: 404 });
  if (job.state !== 'approved') return NextResponse.json({ error: `job is '${job.state}', not approved` }, { status: 400 });

  const drafts = getDraftsFor(job.id);
  if (!drafts.length) return NextResponse.json({ error: 'no draft to publish' }, { status: 400 });

  const published = [];
  const failed = [];
  for (const draft of drafts) {
    try {
      const ig = await findIntegration(draft.platform);
      if (!ig) { failed.push(`${draft.platform} (not connected)`); continue; }
      const image = draft.image_id ? { id: draft.image_id, path: draft.image_path } : null;
      const video = draft.video_id ? { id: draft.video_id, path: draft.video_path } : null;
      await createPost(ig.id, draft.body, draft.platform, image, video);
      published.push({ platform: draft.platform, channel: ig.profile, media: video ? 'video' : image ? 'image' : null });
    } catch (e) {
      failed.push(`${draft.platform}: ${String(e?.message || e)}`);
    }
  }
  if (!published.length) {
    return NextResponse.json({ error: `nothing published — ${failed.join('; ')}` }, { status: 502 });
  }

  const where = published.map((p) => p.channel || p.platform).join(', ');
  markPublished(job.id, session.user.name, where);

  const links = published.filter((p) => p.platform === 'bluesky' && p.channel).map((p) => `https://bsky.app/profile/${p.channel}`);
  await notifyTelegram(
    `✅ Published — "${job.topic}" is now live on ${where}.` +
    `${links.length ? `\n${links.join('\n')}` : ''}${failed.length ? `\n(failed: ${failed.join('; ')})` : ''}`,
  );

  return NextResponse.json({ ok: true, channel: where, published: published.map((p) => p.platform), failed, state: 'published' });
}
