import Link from 'next/link';
import { scheduledJobs } from '@/lib/db';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : 'unscheduled');

export default function Upcoming() {
  let r = [];
  try { r = scheduledJobs(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Upcoming</h1><div className="lede">Scheduled posts handed to Postiz&apos;s queue. They post automatically at their time.</div></div>
        <div className="crumbs">{r.length} scheduled</div>
      </div>
      {r.length === 0 ? (
        <div className="panel"><div className="empty">Nothing scheduled. Approve a job, then choose Schedule instead of Publish.</div></div>
      ) : (
        <div className="grid">
          {r.map((j) => (
            <div className="card reveal" key={j.id}>
              <div className="card-foot" style={{ color: 'var(--accent)' }}>🗓 {when(j.scheduled_at)} UTC{j.scheduled_to ? ` · ${j.scheduled_to}` : ''}</div>
              <div className="card-topic" style={{ marginTop: 4 }}><Link href={`/job/${j.id}`}>{j.topic}</Link></div>
              <div className="card-meta">{short(j.id)} · brand {j.brand}{j.draft ? ` · ${j.draft.platform}` : ''}</div>
              {j.draft ? (
                <>
                  <div className="draft-body">{j.draft.body}</div>
                  {j.draft.video_path
                    ? <video className="draft-img" src={j.draft.video_path} controls muted playsInline />
                    : j.draft.image_path ? <img className="draft-img" src={j.draft.image_path} alt="" /> : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
