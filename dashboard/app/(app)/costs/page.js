import Link from 'next/link';
import { costSummary, costThisMonth, costByBrand, costByOperation, recentCosts } from '@/lib/db';

export const dynamic = 'force-dynamic';
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
const usd = (n) => `$${Number(n || 0).toFixed(4).replace(/0{1,2}$/, '')}`;
const usd2 = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function Costs() {
  let total = { entries: 0, totalUsd: 0 }, month = { entries: 0, totalUsd: 0 };
  let brands = [], ops = [], recent = [];
  try {
    total = costSummary();
    month = costThisMonth();
    brands = costByBrand();
    ops = costByOperation();
    recent = recentCosts(40);
  } catch {}
  const maxBrand = Math.max(...brands.map((b) => b.total), 0.0001);
  const maxOp = Math.max(...ops.map((o) => o.total), 0.0001);

  return (
    <>
      <div className="phead">
        <div><h1>Cost ledger</h1><div className="lede">Every API call, attributed per job and per brand — what each published piece actually cost.</div></div>
        <div className="crumbs">{total.entries} entries</div>
      </div>

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Spend</h2><span className="rule" /></div>
        <div className="statgrid">
          <div className="stat"><div className="big tnum">{usd2(total.totalUsd)}</div><div className="lab">All time</div></div>
          <div className="stat"><div className="big tnum">{usd2(month.totalUsd)}</div><div className="lab">This month</div></div>
          <div className="stat"><div className="big tnum">{total.entries}</div><div className="lab">API calls logged</div></div>
        </div>
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>By brand</h2><span className="rule" /></div>
        <div className="panel">
          {brands.length === 0 ? <div className="empty">Fills once generation runs.</div> : brands.map((b) => (
            <div className="bar-row" key={b.brand || '—'}>
              <span>{b.brand || 'unattributed'}</span>
              <span className="bv">{usd2(b.total)}</span>
              <span className="bar"><i style={{ width: `${Math.max(2, (b.total / maxBrand) * 100)}%` }} /></span>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal r3">
        <div className="section-head"><span className="idx">03</span><h2>By operation</h2><span className="rule" /></div>
        <div className="panel">
          {ops.length === 0 ? <div className="empty">Fills once generation runs.</div> : ops.map((o, i) => (
            <div className="bar-row" key={i}>
              <span>{o.operation || '—'} <span className="dim">· {o.provider || '—'}</span></span>
              <span className="bv">{usd2(o.total)}</span>
              <span className="bar"><i style={{ width: `${Math.max(2, (o.total / maxOp) * 100)}%` }} /></span>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal r4">
        <div className="section-head"><span className="idx">04</span><h2>Recent entries</h2><span className="rule" /></div>
        <div className="panel" style={{ padding: 0 }}>
          {recent.length === 0 ? <div className="empty" style={{ padding: 16 }}>No entries yet — costs log as generation runs.</div> : (
            <table className="table">
              <thead><tr><th>When</th><th>Brand</th><th>Operation</th><th className="hide-sm">Model</th><th>Job</th><th style={{ textAlign: 'right' }}>Cost</th></tr></thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td className="id">{when(c.at)}</td>
                    <td>{c.brand || '—'}</td>
                    <td className="id">{c.operation || '—'}</td>
                    <td className="hide-sm id">{c.model || '—'}</td>
                    <td>{c.job_id ? <Link className="joblink" href={`/job/${c.job_id}`}>{c.topic || c.job_id.slice(0, 8)}</Link> : <span className="dim">—</span>}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{usd(c.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
