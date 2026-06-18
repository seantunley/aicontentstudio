import Link from 'next/link';
import { costSummary, costThisMonth, costByBrand, costByOperation, recentCosts } from '@/lib/db';
import { zar, zarRate } from '@/lib/money';
import { za } from '@/lib/time';
import { Tooltip } from '@/app/components/ui';

export const dynamic = 'force-dynamic';
const when = (s) => za(s);

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
        <div><h1>Cost ledger</h1><div className="lede">Every API call, attributed per job and per brand, so you can see what each published piece cost.</div></div>
        <Tooltip className="crumbs" text="Total logged API calls, and the USD→ZAR rate used to show Rands (set in Settings → General).">{total.entries} entries · R{zarRate().toFixed(2)}/$</Tooltip>
      </div>

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Spend</h2><span className="rule" /></div>
        <div className="statgrid">
          <Tooltip as="div" className="stat" text="Total spend across every API call the studio has ever made (research, writing, images, video).">
            <div className="big tnum">{zar(total.totalUsd)}</div><div className="lab">All time</div></Tooltip>
          <Tooltip as="div" className="stat" text="Spend since the start of the current calendar month.">
            <div className="big tnum">{zar(month.totalUsd)}</div><div className="lab">This month</div></Tooltip>
          <Tooltip as="div" className="stat" text="How many individual API calls have been costed and recorded.">
            <div className="big tnum">{total.entries}</div><div className="lab">API calls logged</div></Tooltip>
        </div>
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>By brand</h2><span className="rule" /></div>
        <div className="panel">
          {brands.length === 0 ? <div className="empty">Fills once generation runs.</div> : brands.map((b) => (
            <div className="bar-row" key={b.brand || '—'}>
              <span>{b.brand || 'unattributed'}</span>
              <span className="bv">{zar(b.total)}</span>
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
              <span className="bv">{zar(o.total)}</span>
              <span className="bar"><i style={{ width: `${Math.max(2, (o.total / maxOp) * 100)}%` }} /></span>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal r4">
        <div className="section-head"><span className="idx">04</span><h2>Recent entries</h2><span className="rule" /></div>
        <div className="panel" style={{ padding: 0 }}>
          {recent.length === 0 ? <div className="empty" style={{ padding: 16 }}>No entries yet. Costs log as generation runs.</div> : (
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
                    <td className="num" style={{ textAlign: 'right' }}>{zar(c.cost_usd, 4)}</td>
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
