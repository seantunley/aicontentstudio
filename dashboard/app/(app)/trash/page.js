import { trashedJobs, trashedMedia, TRASH_TTL_DAYS } from '@/lib/db';
import { RestoreButton, MediaRestoreButton } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
const daysLeft = (iso) => {
  if (!iso) return TRASH_TTL_DAYS;
  const gone = (Date.now() - new Date(iso).getTime()) / 86400000;
  return Math.max(0, Math.ceil(TRASH_TTL_DAYS - gone));
};

export default function Trash() {
  let jobs = [], media = [];
  try { jobs = trashedJobs(); } catch {}
  try { media = trashedMedia(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Trash</h1><div className="lede">Rejected posts and deleted media. Restore anything within {TRASH_TTL_DAYS} days; after that it&rsquo;s purged automatically.</div></div>
        <div className="crumbs">{jobs.length + media.length} items</div>
      </div>

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Rejected posts</h2><span className="count">{jobs.length}</span><span className="rule" /></div>
        {jobs.length === 0 ? <div className="empty">No rejected posts in Trash.</div> : (
          <div className="qlist">
            {jobs.map((j) => (
              <div className="qcard" key={j.id}>
                <div className="qcard-head" style={{ cursor: 'default' }}>
                  <div className="qcard-main">
                    <div className="qcard-topic">{j.topic}</div>
                    <div className="qcard-title">trashed {when(j.updated_at)} · {daysLeft(j.updated_at)} days left · {j.id.slice(0, 8)}</div>
                  </div>
                  <div className="qcard-meta"><RestoreButton jobId={j.id} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>Deleted media</h2><span className="count">{media.length}</span><span className="rule" /></div>
        {media.length === 0 ? <div className="empty">No deleted media in Trash.</div> : (
          <div className="vault-grid">
            {media.map((a) => (
              <div className="vault-tile" key={a.id}>
                <div className="vault-media">
                  {a.kind === 'video'
                    ? <video src={a.url} muted playsInline preload="metadata" />
                    : <img src={a.url} alt="" loading="lazy" />}
                  <span className="vault-kind">{daysLeft(a.deleted_at)}d left</span>
                </div>
                <div className="vault-meta">
                  <div className="vault-topic" title={a.topic || ''}>{a.topic || '—'}</div>
                  <div className="actions" style={{ marginTop: 8 }}><MediaRestoreButton id={a.id} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
