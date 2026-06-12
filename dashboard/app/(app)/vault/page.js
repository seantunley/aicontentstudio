import { listMedia, mediaCounts } from '@/lib/db';
import { VaultGrid } from '@/app/components/vault';

export const dynamic = 'force-dynamic';

export default function Vault() {
  let items = [];
  let counts = { image: 0, video: 0, total: 0 };
  try { items = listMedia(); } catch {}
  try { counts = mediaCounts(); } catch {}
  return (
    <>
      <div className="phead">
        <div>
          <h1>The Vault</h1>
          <div className="lede">Every image and video the studio has made or you&apos;ve uploaded — tagged and searchable, ready to reuse.</div>
        </div>
        <div className="crumbs">{counts.image} images · {counts.video} videos</div>
      </div>
      <VaultGrid items={items} />
    </>
  );
}
