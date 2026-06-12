import { listSuggestions, listNiches } from '@/lib/db';
import { SuggestionActions, NicheManager } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

export default function Scout() {
  let ideas = [];
  let niches = [];
  try { ideas = listSuggestions('new'); } catch {}
  try { niches = listNiches(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Scout</h1><div className="lede">Timely ideas the trend scout found for your niches. Promote one to research + draft it, or dismiss it.</div></div>
        <div className="crumbs">{ideas.length} new</div>
      </div>

      <section className="section reveal r1">
        <NicheManager niches={niches} />
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">01</span><h2>Ideas</h2><span className="rule" /></div>
        {ideas.length === 0 ? (
          <div className="panel"><div className="empty">No open ideas. The scout runs on a schedule; add a niche above to give it something to hunt.</div></div>
        ) : (
          <div className="grid">
            {ideas.map((s) => (
              <div className="card reveal" key={s.id}>
                <div className="row-between">
                  <span className={`heat heat--${s.heat || 'warm'}`}>{(s.heat || 'warm')}</span>
                  <span className="card-foot">found {when(s.created_at)}</span>
                </div>
                <div className="card-topic" style={{ marginTop: 6 }}>{s.topic}</div>
                <div className="card-meta">brand {s.brand}{s.source ? ` · via ${s.source}` : ''}</div>
                {s.rationale ? <div className="draft-body">{s.rationale}</div> : null}
                {s.source_url ? <div className="card-foot"><a href={s.source_url} target="_blank" rel="noreferrer">source ↗</a></div> : null}
                <SuggestionActions id={s.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
