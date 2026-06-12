import { listIntegrations } from '@/lib/postiz';
import { costSummary } from '@/lib/db';

export const dynamic = 'force-dynamic';
const POSTIZ_UI = 'http://172.18.18.101:4007';

export default async function Accounts() {
  const channels = await listIntegrations(); // null = unreachable
  let cost = { entries: 0, totalUsd: 0 };
  try { cost = costSummary(); } catch {}

  return (
    <>
      <div className="phead">
        <div><h1>Accounts</h1><div className="lede">Connected channels, spend, and the publishing calendar.</div></div>
      </div>

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Channels</h2><span className="rule" /><a className="deeplink" href={POSTIZ_UI} target="_blank" rel="noreferrer">open Postiz →</a></div>
        {channels === null ? (
          <div className="panel"><span className="err">Postiz API unreachable.</span></div>
        ) : channels.length === 0 ? (
          <div className="panel"><div className="empty">No channels connected. Add one in Postiz.</div></div>
        ) : (
          <div className="accts">
            {channels.map((c) => (
              <div className="acct" key={c.id}>
                {c.picture ? <img src={c.picture} alt="" /> : null}
                <div><div className="ah">{c.name}</div><div className="ap">{c.identifier}{c.profile ? ` · ${c.profile}` : ''}</div></div>
                <span className="ok" style={c.disabled ? { background: 'var(--red)', boxShadow: '0 0 6px var(--red)' } : null} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>Cost ledger</h2><span className="rule" /></div>
        <div className="statgrid">
          <div className="stat"><div className="big tnum">${Number(cost.totalUsd).toFixed(2)}</div><div className="lab">Total spend</div></div>
          <div className="stat"><div className="big tnum">{cost.entries}</div><div className="lab">API calls logged</div></div>
        </div>
        {cost.entries === 0 ? <div className="empty" style={{ marginTop: 10 }}>Fills once generation runs (text / image API costs).</div> : null}
      </section>

      <section className="section reveal r3">
        <div className="section-head"><span className="idx">03</span><h2>Calendar</h2><span className="rule" /></div>
        <div className="panel">
          <div className="lede" style={{ marginBottom: 12 }}>Scheduling and the content calendar live in Postiz.</div>
          <a className="btn btn--primary" href={POSTIZ_UI} target="_blank" rel="noreferrer">Open Postiz calendar →</a>
        </div>
      </section>
    </>
  );
}
