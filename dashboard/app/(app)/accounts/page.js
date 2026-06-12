import Link from 'next/link';
import { listIntegrations } from '@/lib/postiz';
import { costSummary } from '@/lib/db';

export const dynamic = 'force-dynamic';
const POSTIZ_UI = 'http://172.18.18.101:4007';

export default async function Accounts() {
  const channels = await listIntegrations(); // null = unreachable
  let cost = { entries: 0, totalUsd: 0 };
  try { cost = costSummary(); } catch {}
  const down = channels ? channels.filter((c) => c.disabled).length : 0;

  return (
    <>
      <div className="phead">
        <div><h1>Accounts</h1><div className="lede">Connected channels and their health. Publishing credentials live in Postiz — never here.</div></div>
        <div className="crumbs">{channels ? `${channels.length} connected${down ? ` · ${down} disabled` : ''}` : 'postiz unreachable'}</div>
      </div>

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Channels</h2><span className="rule" /><a className="deeplink" href={POSTIZ_UI} target="_blank" rel="noreferrer">open Postiz →</a></div>
        {channels === null ? (
          <div className="panel"><span className="err">Postiz API unreachable — connection health unknown.</span></div>
        ) : channels.length === 0 ? (
          <div className="panel blank">
            <div className="fleuron">❧</div>
            <div className="bt">No channels connected.</div>
            <div className="bd">Connect your accounts in Postiz; they appear here with their health.</div>
          </div>
        ) : (
          <div className="accts">
            {channels.map((c) => (
              <div className="acct" key={c.id}>
                {c.picture ? <img src={c.picture} alt="" /> : null}
                <div><div className="ah">{c.name}</div><div className="ap">{c.identifier}{c.profile ? ` · ${c.profile}` : ''}</div></div>
                <span className="ok" style={c.disabled ? { background: 'var(--red)', boxShadow: '0 0 6px var(--red)' } : null} title={c.disabled ? 'disabled — reconnect in Postiz' : 'healthy'} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>Spend</h2><span className="rule" /><Link className="deeplink" href="/costs">full ledger →</Link></div>
        <div className="statgrid">
          <div className="stat"><div className="big tnum">${Number(cost.totalUsd).toFixed(2)}</div><div className="lab">Total spend</div></div>
          <div className="stat"><div className="big tnum">{cost.entries}</div><div className="lab">API calls logged</div></div>
        </div>
      </section>

      <section className="section reveal r3">
        <div className="section-head"><span className="idx">03</span><h2>Calendar</h2><span className="rule" /></div>
        <div className="panel">
          <div className="lede" style={{ marginBottom: 12 }}>Scheduling and the content calendar live in Postiz — the studio hands approved work to its queue.</div>
          <a className="btn btn--primary" href={POSTIZ_UI} target="_blank" rel="noreferrer">Open Postiz calendar →</a>
        </div>
      </section>
    </>
  );
}
