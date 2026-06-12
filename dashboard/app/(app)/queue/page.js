import Link from 'next/link';
import { approvalQueue, DRAFT_LIMITS } from '@/lib/db';
import { ApprovalActions } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');

export default function Queue() {
  let q = [];
  try { q = approvalQueue(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Approval queue</h1><div className="lede">The gate. Nothing ships without your yes — open a job to edit the copy, approve to ready it for publishing.</div></div>
        <div className="crumbs">{q.length} waiting</div>
      </div>
      {q.length === 0 ? (
        <div className="panel blank reveal">
          <div className="fleuron">❧</div>
          <div className="bt">Nothing awaits your judgment.</div>
          <div className="bd">When research and drafting finish, proofs land here for your call.</div>
        </div>
      ) : (
        <div className="grid">
          {q.map((j) => {
            const lim = j.draft ? DRAFT_LIMITS[j.draft.platform] : null;
            return (
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
                    <div className="card-foot" style={lim && j.draft.char_count > lim ? { color: 'var(--red)' } : null}>
                      {j.draft.char_count}{lim ? `/${lim}` : ''} chars · angle {j.draft.angle || '—'} · <Link href={`/job/${j.id}`}>open to edit →</Link>
                    </div>
                  </>
                ) : <div className="empty">No draft yet.</div>}
                <ApprovalActions jobId={j.id} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
