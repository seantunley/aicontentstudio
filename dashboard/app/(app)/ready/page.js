import Link from 'next/link';
import { publishable } from '@/lib/db';
import { PublishButton, ScheduleButton } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');

export default function Ready() {
  let r = [];
  try { r = publishable(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Ready to publish</h1><div className="lede">Approved and cleared the gate. Publish live now, or hand it to Postiz&rsquo;s queue for later.</div></div>
        <div className="crumbs">{r.length} approved</div>
      </div>
      {r.length === 0 ? (
        <div className="panel blank reveal">
          <div className="fleuron">❧</div>
          <div className="bt">Nothing cleared for press.</div>
          <div className="bd">Approve something in the queue and it lands here, ready to go out.</div>
        </div>
      ) : (
        <div className="grid">
          {r.map((j) => (
            <div className="card reveal" key={j.id}>
              <div className="row-between" style={{ marginBottom: 7 }}>
                {j.draft ? <span className="plat">{j.draft.platform}</span> : <span />}
                <span className="card-foot" style={{ margin: 0 }}>{short(j.id)} · {j.brand}</span>
              </div>
              <div className="card-topic"><Link href={`/job/${j.id}`}>{j.topic}</Link></div>
              {j.draft ? (
                <>
                  <div className="draft-body">{j.draft.body}</div>
                  {j.draft.video_path
                    ? <video className="draft-img" src={j.draft.video_path} controls muted playsInline />
                    : j.draft.image_path ? <img className="draft-img" src={j.draft.image_path} alt="" /> : null}
                  <div className="card-foot">{j.draft.char_count} chars{j.draft.video_id ? ' · with video' : j.draft.image_id ? ' · with image' : ''}</div>
                  <div className="actions">
                    <PublishButton jobId={j.id} channel={j.draft.platform} />
                    <ScheduleButton jobId={j.id} channel={j.draft.platform} />
                  </div>
                </>
              ) : <div className="empty">No draft to publish.</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
