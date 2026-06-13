import { listOccasions } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';
import { OccasionsManager } from '@/app/components/occasions';

export const dynamic = 'force-dynamic';

export default async function OccasionsPage() {
  const brand = await getActiveBrand();
  let occasions = [];
  try { occasions = listOccasions(brand); } catch {}
  const auto = occasions.filter((o) => o.auto_draft).length;
  return (
    <>
      <div className="phead">
        <div>
          <h1>Occasions</h1>
          <div className="lede">A per-brand calendar of dates that matter — holidays, awareness days, your own anniversaries. Recurring ones recompute every year. Turn on auto-draft and the studio queues a draft ahead of the date; sensitive dates notify you first instead. Nothing posts without your approval.</div>
        </div>
        <div className="crumbs">{occasions.length} occasions · {auto} auto-draft</div>
      </div>
      <OccasionsManager occasions={occasions} brand={brand} />
    </>
  );
}
