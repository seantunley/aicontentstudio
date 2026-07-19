import { PerformancePanel } from '@/app/components/performance';

export const dynamic = 'force-dynamic';

export default function Performance() {
  return (
    <>
      <div className="phead">
        <div>
          <h1>Performance</h1>
          <div className="lede">What actually landed. Engagement pulled back from Postiz per channel — where results start teaching the studio what resonated, not just what you approved. As data accrues it feeds the voice flywheel, evergreen recycling and posting-time tuning.</div>
        </div>
      </div>
      <PerformancePanel />
    </>
  );
}
