import Link from 'next/link';
import { publishable } from '@/lib/db';
import { PublishButton } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');

export default function Ready() {
  let r = [];
  try { r = publishable(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Ready to publish</h1><div className="lede">Approved jobs. Publish posts live to the connected channel via Postiz.</div></div>
        <div className="crumbs">{r.length} approved</div>
      </div>
      {r.length === 0 ? (
        <div className="panel"><div className="empty">No approved jobs waiting. Approve something from the queue first.</div></div>
      ) : (
        <div className="grid">
          {r.map((j) => (
            <div className="card reveal" key={j.id}>
              <div className="card-topic"><Link href={`/job/${j.id}`}>{j.topic}</Link></div>
              <div className="card-meta">{short(j.id)} · brand {j.brand}{j.draft ? ` · ${j.draft.platform}` : ''}</div>
              {j.draft ? (
                <>
                  <div className="draft-body">{j.draft.body}</div>
                  {j.draft.video_path
                    ? <video className="draft-img" src={j.draft.video_path} controls muted playsInline />
                    : j.draft.image_path ? <img className="draft-img" src={j.draft.image_path} alt="" /> : null}
                  <div className="card-foot">{j.draft.char_count} chars{j.draft.video_id ? ' · with video' : j.draft.image_id ? ' · with image' : ''}</div>
                  <PublishButton jobId={j.id} channel={j.draft.platform} />
                </>
              ) : <div className="empty">No draft to publish.</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
