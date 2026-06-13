import Link from 'next/link';
import { scheduledJobs } from '@/lib/db';
import { PlatformChip } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : 'unscheduled');

export default function Upcoming() {
  let r = [];
  try { r = scheduledJobs(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Upcoming</h1><div className="lede">Handed to Postiz&rsquo;s queue. These post themselves at their slot.</div></div>
        <div className="crumbs">{r.length} scheduled</div>
      </div>
      {r.length === 0 ? (
        <div className="panel blank reveal">
          <div className="fleuron">❧</div>
          <div className="bt">No press runs booked.</div>
          <div className="bd">Approve a job, then choose Schedule instead of Publish.</div>
        </div>
      ) : (
        <div className="grid">
          {r.map((j) => (
            <div className="card reveal" key={j.id}>
              <div className="row-between" style={{ marginBottom: 7 }}>
                <span className="badge badge--scheduled">{when(j.scheduled_at)} UTC</span>
                {j.draft ? <PlatformChip platform={j.scheduled_to || j.draft.platform} /> : <span />}
              </div>
              <div className="card-topic"><Link href={`/job/${j.id}`}>{j.topic}</Link></div>
              <div className="card-meta">{short(j.id)} · brand {j.brand}</div>
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
