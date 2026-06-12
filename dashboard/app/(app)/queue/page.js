import Link from 'next/link';
import { approvalQueue } from '@/lib/db';
import { ApprovalActions } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');

export default function Queue() {
  let q = [];
  try { q = approvalQueue(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Approval queue</h1><div className="lede">Drafts waiting on your call. Open a job to edit; approve to ready it for publishing.</div></div>
        <div className="crumbs">{q.length} waiting</div>
      </div>
      {q.length === 0 ? (
        <div className="panel"><div className="empty">Nothing waiting on approval. Start a job from the sidebar.</div></div>
      ) : (
        <div className="grid">
          {q.map((j) => (
            <div className="card reveal" key={j.id}>
              <div className="card-topic"><Link href={`/job/${j.id}`}>{j.topic}</Link></div>
              <div className="card-meta">{short(j.id)} · brand {j.brand}{j.draft ? ` · ${j.draft.platform}` : ''}</div>
              {j.draft ? (
                <>
                  <div className="draft-body">{j.draft.body}</div>
                  {j.draft.image_path ? <img className="draft-img" src={j.draft.image_path} alt="" /> : null}
                  <div className="card-foot">{j.draft.char_count} chars · angle {j.draft.angle || '—'}</div>
                </>
              ) : <div className="empty">No draft yet.</div>}
              <ApprovalActions jobId={j.id} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
