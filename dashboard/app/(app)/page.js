import Link from 'next/link';
import { pipelineCounts, inProgress, recentJobs, costSummary, approvalQueue, publishable } from '@/lib/db';

export const dynamic = 'force-dynamic';

const short = (id) => (id ? id.slice(0, 8) : '');
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
const WORK = {
  research_draft: ['queued', 'queued'],
  research_draft_image: ['queued', 'queued · image'],
  processing: ['processing', 'processing'],
  failed: ['failed', 'failed'],
};

function Stat({ n, lab }) {
  return <div className="stat"><div className="big tnum">{n}</div><div className="lab">{lab}</div></div>;
}

export default function Overview() {
  let pipe = [], work = [], jobs = [], cost = { entries: 0, totalUsd: 0 }, qn = 0, rn = 0, err = null;
  try {
    pipe = pipelineCounts().slice(0, 7);
    work = inProgress();
    jobs = recentJobs(8);
    cost = costSummary();
    qn = approvalQueue().length;
    rn = publishable().length;
  } catch (e) { err = String(e?.message || e); }

  if (err) {
    return (<><div className="phead"><h1>Overview</h1></div><div className="panel"><span className="err">DB read failed: {err}</span></div></>);
  }
  const published = pipe.find((p) => p.state === 'published')?.count || 0;

  return (
    <>
      <div className="phead">
        <div><h1>Overview</h1><div className="lede">Everything moving through the studio, at a glance.</div></div>
        <div className="crumbs">{when(new Date().toISOString())}</div>
      </div>

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Pipeline</h2><span className="rule" /></div>
        <div className="pipeline">
          {pipe.map((p) => (
            <div key={p.state} className={`stage ${p.count ? 'live' : ''}`}>
              <div className="n tnum">{p.count}</div><div className="label">{p.state}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>In progress</h2><span className="count">{work.length}</span><span className="rule" /></div>
        {work.length === 0 ? (
          <div className="empty">Nothing in the worker right now.</div>
        ) : work.map((j) => {
          const [st, lab] = WORK[j.queued_action] || ['queued', j.queued_action];
          return (
            <div className="work-row" key={j.id}>
              <span className={`dot ${st}`} />
              <span className="wt"><Link href={`/job/${j.id}`}>{j.topic}</Link></span>
              <span className="ws">{lab}</span>
            </div>
          );
        })}
      </section>

      <section className="section reveal r3">
        <div className="section-head"><span className="idx">03</span><h2>Status</h2><span className="rule" /></div>
        <div className="statgrid">
          <Stat n={qn} lab="Awaiting approval" />
          <Stat n={rn} lab="Ready to publish" />
          <Stat n={published} lab="Published" />
          <Stat n={`$${Number(cost.totalUsd).toFixed(2)}`} lab="Spend logged" />
        </div>
      </section>

      <section className="section reveal r4">
        <div className="section-head"><span className="idx">04</span><h2>Recent jobs</h2><span className="rule" /><Link className="deeplink" href="/jobs">all jobs →</Link></div>
        <table className="table">
          <thead><tr><th>ID</th><th>State</th><th>Brand</th><th>Topic</th><th className="hide-sm">Updated</th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="id"><Link className="joblink" href={`/job/${j.id}`}>{short(j.id)}</Link></td>
                <td><span className={`badge badge--${j.state}`}>{j.state}</span></td>
                <td>{j.brand}</td>
                <td><Link className="joblink" href={`/job/${j.id}`}>{j.topic}</Link></td>
                <td className="hide-sm id">{when(j.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
