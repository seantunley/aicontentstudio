import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getJobById, latestDraft, markPublished } from '../../../lib/db';
import { findIntegration, createPost } from '../../../lib/postiz';
import { notifyTelegram } from '../../../lib/notify';

// Human-clicked publish: the authenticated operator IS the approval (§7a). Posts an approved
// job's draft live via Postiz, then marks it published with an audit trail.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const job = getJobById(body.jobId);
  if (!job) return NextResponse.json({ error: 'no such job' }, { status: 404 });
  if (job.state !== 'approved') return NextResponse.json({ error: `job is '${job.state}', not approved` }, { status: 400 });

  const draft = latestDraft(job.id);
  if (!draft) return NextResponse.json({ error: 'no draft to publish' }, { status: 400 });

  try {
    const ig = await findIntegration(draft.platform);
    if (!ig) return NextResponse.json({ error: `no connected ${draft.platform} channel in Postiz` }, { status: 400 });
    const image = draft.image_id ? { id: draft.image_id, path: draft.image_path } : null;
    await createPost(ig.id, draft.body, draft.platform, image);
    markPublished(job.id, session.user.name, ig.profile);

    const link = draft.platform === 'bluesky' && ig.profile ? `https://bsky.app/profile/${ig.profile}` : '';
    await notifyTelegram(
      `✅ Published — "${job.topic}" is now live on ${ig.profile || draft.platform}` +
      `${image ? ' (with image)' : ''}.${link ? `\n${link}` : ''}`,
    );

    return NextResponse.json({ ok: true, platform: draft.platform, channel: ig.profile, with_image: !!image, state: 'published' });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
