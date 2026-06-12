import Link from 'next/link';
import { pipelineCounts, inProgress, recentJobs, costSummary, approvalQueue, publishable, listSuggestions } from '@/lib/db';

export const dynamic = 'force-dynamic';

const short = (id) => (id ? id.slice(0, 8) : '');
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');
const WORK = {
  research_draft: ['queued', 'queued'],
  research_draft_image: ['queued', 'queued · image'],
  research_draft_image_video: ['queued', 'queued · video'],
  processing: ['processing', 'processing'],
  failed: ['failed', 'failed'],
};

function DeskCard({ href, n, lab, tone }) {
  const cls = `desk-card ${n ? `t-${tone}` : 'zero'}`;
  const body = (
    <>
      <span className="go">→</span>
      <div className="n tnum">{n}</div>
      <div className="lab">{lab}</div>
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default function Overview() {
  let pipe = [], work = [], jobs = [], cost = { entries: 0, totalUsd: 0 }, qn = 0, rn = 0, sn = 0, err = null;
  try {
    pipe = pipelineCounts();
    work = inProgress();
    jobs = recentJobs(8);
    cost = costSummary();
    qn = approvalQueue().length;
    rn = publishable().length;
    sn = listSuggestions('new').length;
  } catch (e) { err = String(e?.message || e); }

  if (err) {
    return (<><div className="phead"><h1>The desk</h1></div><div className="panel"><span className="err">DB read failed: {err}</span></div></>);
  }
  const failed = work.filter((j) => j.queued_action === 'failed');
  const dateline = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <div className="phead">
        <div><h1>The desk</h1><div className="lede">Everything moving through the studio — and what&rsquo;s waiting on your call.</div></div>
        <div className="crumbs">{dateline}</div>
      </div>

      {failed.length > 0 && (
        <div className="alert-strip reveal">
          <span className="mark">failed</span>
          <span>{failed.length} job{failed.length === 1 ? '' : 's'} hit an error in the worker.</span>
          <Link href={`/job/${failed[0].id}`}>inspect →</Link>
        </div>
      )}

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Waiting on you</h2><span className="rule" /></div>
        <div className="desk">
          <DeskCard href="/queue" n={qn} lab="Awaiting approval" tone="ember" />
          <DeskCard href="/ready" n={rn} lab="Ready to publish" tone="green" />
          <DeskCard href="/scout" n={sn} lab="Scout ideas" tone="cyan" />
          <DeskCard href="/costs" n={`$${Number(cost.totalUsd).toFixed(2)}`} lab="Spend logged" tone="paper" />
        </div>
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>Pipeline</h2><span className="rule" /></div>
        <div className="pipeline">
          {pipe.map((p) => (
            <div key={p.state} className={`stage ${p.count ? 'live' : ''}`}>
              <div className="n tnum">{p.count}</div><div className="label">{p.state}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal r3">
        <div className="section-head"><span className="idx">03</span><h2>In the works</h2><span className="count">{work.length}</span><span className="rule" /></div>
        {work.length === 0 ? (
          <div className="panel blank">
            <div className="fleuron">❧</div>
            <div className="bt">The workshop is quiet.</div>
            <div className="bd">Start a job from the sidebar, or promote a scout idea.</div>
          </div>
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

      <section className="section reveal r4">
        <div className="section-head"><span className="idx">04</span><h2>Recent jobs</h2><span className="rule" /><Link className="deeplink" href="/jobs">all jobs →</Link></div>
        <div className="panel" style={{ padding: 0 }}>
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
        </div>
      </section>
    </>
  );
}
