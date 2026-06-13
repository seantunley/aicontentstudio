import { approvalQueue } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';
import { QueueItem } from '@/app/components/actions';

export const dynamic = 'force-dynamic';

export default async function Queue() {
  const brand = await getActiveBrand();
  let q = [];
  try { q = approvalQueue(brand); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Approval queue</h1><div className="lede">The gate. Nothing ships without your yes. Tap a post to expand it, edit the copy on its job page, then approve.</div></div>
        <div className="crumbs">{q.length} waiting</div>
      </div>
      {q.length === 0 ? (
        <div className="panel blank reveal">
          <div className="fleuron">❧</div>
          <div className="bt">Nothing awaits your judgment.</div>
          <div className="bd">When research and drafting finish, proofs land here for your call.</div>
        </div>
      ) : (
        <div className="qlist reveal">
          {q.map((j) => <QueueItem key={j.id} job={j} />)}
        </div>
      )}
    </>
  );
}
