import { listLearnings } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';
import { za } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function Learnings() {
  const brand = await getActiveBrand();
  let items = [];
  try { items = listLearnings(brand); } catch {}
  return (
    <>
      <div className="phead">
        <div>
          <h1>Learnings</h1>
          <div className="lede">What the Studio has learned from your edits and rejections{brand ? ` for ${brand}` : ''} — fed back into every new draft so it matches your voice and avoids what you turned down.</div>
        </div>
        <div className="crumbs">{items.length} signal{items.length === 1 ? '' : 's'}</div>
      </div>
      {items.length === 0 ? (
        <div className="panel"><div className="empty">Nothing captured yet. When you rewrite a draft in the queue or reject one, it lands here — and shapes future drafts automatically.</div></div>
      ) : (
        <div className="panel">
          {items.map((l) => (
            <div className="learn" key={l.id}>
              <div className="learn-head">
                <span className={`learn-kind learn-kind--${l.kind}`}>{l.kind === 'edit' ? 'you rewrote' : 'you rejected'}</span>
                {l.platform ? <span className="card-foot" style={{ margin: 0 }}>{l.platform}</span> : null}
                <span className="card-foot" style={{ margin: 0, marginLeft: 'auto' }}>{za(l.created_at)}</span>
              </div>
              {l.topic ? <div className="learn-topic">{l.topic}</div> : null}
              {l.kind === 'edit' ? (
                <>
                  <div className="learn-row learn-before"><span className="learn-tag">AI</span> {l.before}</div>
                  <div className="learn-row learn-after"><span className="learn-tag">you</span> {l.after}</div>
                </>
              ) : (
                <div className="learn-row learn-before"><span className="learn-tag">cut</span> {l.before}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
