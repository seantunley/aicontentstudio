import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getJobById, getDraftsFor, markPublished, getBrandBySlug } from '../../../lib/db';
import { findIntegration, createPost, listIntegrations } from '../../../lib/postiz';
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

  // §1b hard boundary: if the job's brand owns specific accounts, publish ONLY to those — a brand
  // can never post to another brand's page. Resolve the brand's channel ids to live integrations.
  let brandIntegrations = null; // null = brand has no restriction; [] or [...] = restricted set
  const brand = getBrandBySlug(job.brand);
  const brandChannelIds = (brand?.channels || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (brandChannelIds.length) {
    const all = (await listIntegrations()) || [];
    brandIntegrations = all.filter((i) => brandChannelIds.includes(i.id) && !i.disabled);
  }

  const published = [];
  const failed = [];
  for (const draft of drafts) {
    try {
      let ig;
      if (brandIntegrations !== null) {
        ig = brandIntegrations.find((i) => i.identifier === draft.platform);
        if (!ig) { failed.push(`${draft.platform} (brand "${job.brand}" has no ${draft.platform} account assigned)`); continue; }
      } else {
        ig = await findIntegration(draft.platform);
        if (!ig) { failed.push(`${draft.platform} (not connected)`); continue; }
      }
      let images;
      try { images = JSON.parse(draft.images_json || 'null'); } catch { images = null; }
      if (!Array.isArray(images) || !images.length) images = draft.image_id ? [{ id: draft.image_id, path: draft.image_path }] : [];
      const video = draft.video_id ? { id: draft.video_id, path: draft.video_path } : null;
      await createPost(ig.id, draft.body, draft.platform, images, video);
      published.push({ platform: draft.platform, channel: ig.profile || ig.name, media: video ? 'video' : images.length > 1 ? `carousel(${images.length})` : images.length ? 'image' : null });
    } catch (e) {
      failed.push(`${draft.platform}: ${String(e?.message || e)}`);
    }
  }
  if (!published.length) {
    await notifyTelegram(`⚠️ Publish FAILED for "${job.topic}" after retries: ${failed.join('; ')}. It stays in Ready to publish; try again.`);
    return NextResponse.json({ error: `nothing published: ${failed.join('; ')}` }, { status: 502 });
  }

  const where = published.map((p) => p.channel || p.platform).join(', ');
  markPublished(job.id, session.user.name, where);

  const links = published.filter((p) => p.platform === 'bluesky' && p.channel).map((p) => `https://bsky.app/profile/${p.channel}`);
  await notifyTelegram(
    `✅ Published. "${job.topic}" is now live on ${where}.` +
    `${links.length ? `\n${links.join('\n')}` : ''}${failed.length ? `\n(failed: ${failed.join('; ')})` : ''}`,
  );

  return NextResponse.json({ ok: true, channel: where, published: published.map((p) => p.platform), failed, state: 'published' });
}
