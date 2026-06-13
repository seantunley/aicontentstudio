import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getJobById, getDraftsFor, markScheduled } from '@/lib/db';
import { findIntegration, createPost } from '@/lib/postiz';
import { notifyTelegram } from '@/lib/notify';

// Human-clicked SCHEDULE: hand every platform draft of an approved job to Postiz's queue for a
// future time (type=schedule). Same human gate as publish; the job moves approved -> scheduled.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const job = getJobById(body.jobId);
  if (!job) return NextResponse.json({ error: 'no such job' }, { status: 404 });
  if (job.state !== 'approved') return NextResponse.json({ error: `job is '${job.state}', not approved` }, { status: 400 });

  const when = new Date(body.when);
  if (isNaN(when.getTime())) return NextResponse.json({ error: 'invalid date/time' }, { status: 400 });
  if (when.getTime() < Date.now() + 60 * 1000) return NextResponse.json({ error: 'pick a time at least a minute out' }, { status: 400 });
  const whenISO = when.toISOString();

  const drafts = getDraftsFor(job.id);
  if (!drafts.length) return NextResponse.json({ error: 'no draft to schedule' }, { status: 400 });

  const scheduled = [];
  const failed = [];
  for (const draft of drafts) {
    try {
      const ig = await findIntegration(draft.platform);
      if (!ig) { failed.push(`${draft.platform} (not connected)`); continue; }
      const image = draft.image_id ? { id: draft.image_id, path: draft.image_path } : null;
      const video = draft.video_id ? { id: draft.video_id, path: draft.video_path } : null;
      await createPost(ig.id, draft.body, draft.platform, image, video, { when: 'schedule', date: whenISO });
      scheduled.push({ platform: draft.platform, channel: ig.profile });
    } catch (e) {
      failed.push(`${draft.platform}: ${String(e?.message || e)}`);
    }
  }
  if (!scheduled.length) {
    return NextResponse.json({ error: `nothing scheduled: ${failed.join('; ')}` }, { status: 502 });
  }

  const where = scheduled.map((p) => p.channel || p.platform).join(', ');
  markScheduled(job.id, session.user.name, whenISO, where);

  await notifyTelegram(
    `🗓 Scheduled. "${job.topic}" will post to ${where} at ${whenISO.replace('T', ' ').slice(0, 16)} UTC.` +
    `${failed.length ? `\n(failed: ${failed.join('; ')})` : ''}`,
  );

  return NextResponse.json({ ok: true, channel: where, scheduledAt: whenISO, scheduled: scheduled.map((p) => p.platform), failed, state: 'scheduled' });
}
