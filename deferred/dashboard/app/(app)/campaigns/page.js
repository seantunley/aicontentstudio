import { listCampaigns } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';
import { CampaignsManager } from '@/app/components/campaigns';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const brand = await getActiveBrand();
  let campaigns = [];
  try { campaigns = listCampaigns(brand); } catch {}
  return (
    <>
      <div className="phead">
        <div>
          <h1>Campaigns</h1>
          <div className="lede">Brand marketing runs in arcs, not single posts. A campaign fans one theme into a coordinated set of pieces — each runs through the normal pipeline and lands in your approval queue together, so you review the whole arc as a set.</div>
        </div>
        <div className="crumbs">{campaigns.length} campaigns</div>
      </div>
      <CampaignsManager campaigns={campaigns} brand={brand} />
    </>
  );
}
