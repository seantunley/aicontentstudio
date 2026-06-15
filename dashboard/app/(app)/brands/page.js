import { listBrands, pillarCoverage } from '@/lib/db';
import { BrandManager } from '@/app/components/brands';

export const dynamic = 'force-dynamic';

export default function Brands() {
  let brands = [];
  const coverage = {};
  try {
    brands = listBrands();
    for (const b of brands) coverage[b.slug] = pillarCoverage(b.slug);
  } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Brands</h1><div className="lede">Each brand&rsquo;s profile shapes how its content sounds and what&rsquo;s safe. Add brands as they exist; jobs without a profile generate on defaults, so nothing waits on this.</div></div>
        <div className="crumbs">{brands.length} {brands.length === 1 ? 'brand' : 'brands'}</div>
      </div>
      <BrandManager brands={brands} coverage={coverage} />
    </>
  );
}
