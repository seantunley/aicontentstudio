import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pipelineCounts, recentJobs, approvalQueue, publishable, costSummary } from '../lib/db';
import { getSession } from '../lib/session';
import { ApprovalActions, PublishButton, NewJobForm, LogoutButton } from './ui';

export const dynamic = 'force-dynamic'; // always read fresh from the DB

export default async function Home() {
  const session = await getSession();
  if (!session.user) redirect('/login');

  let pipe = [], jobs = [], queue = [], ready = [], cost = { entries: 0, totalUsd: 0 }, err = null;
  try {
    pipe = pipelineCounts();
    jobs = recentJobs(30);
    queue = approvalQueue();
    ready = publishable();
    cost = costSummary();
  } catch (e) {
    err = String(e && e.message ? e.message : e);
  }

  if (err) {
    return (
      <main className="wrap">
        <header className="top"><h1>Studio Cockpit</h1></header>
        <div className="panel"><span className="empty">Could not read the studio DB: {err}</span></div>
      </main>
    );
  }

  const short = (id) => (id ? id.slice(0, 8) : '');
  const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

  return (
    <main className="wrap">
      <header className="top">
        <h1>Studio Cockpit</h1>
        <span className="sub">approval queue, pipeline &amp; cost ledger</span>
        <span className="session-bar">{session.user.name} <LogoutButton /></span>
      </header>

      <section className="panel">
        <h2>Start a new job</h2>
        <NewJobForm />
        <div className="chars" style={{ marginTop: 8 }}>Researches + drafts in the background, then lands in the approval queue.</div>
      </section>

      <section className="panel">
        <h2>Pipeline</h2>
        <div className="pipe">
          {pipe.map((p) => (
            <div className="step" key={p.state}>
              <div className="n">{p.count}</div>
              <div className="s">{p.state}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Approval queue ({queue.length})</h2>
        {queue.length === 0 ? (
          <div className="empty">Nothing waiting on approval.</div>
        ) : (
          <div className="cards">
            {queue.map((j) => (
              <div className="card" key={j.id}>
                <div className="topic">{j.topic}</div>
                <div className="meta">
                  <span className="mono">{short(j.id)}</span> · brand {j.brand}
                  {j.draft ? ` · ${j.draft.platform}` : ''}
                </div>
                {j.draft ? (
                  <>
                    <div className="draft">{j.draft.body}</div>
                    <div className="chars">{j.draft.char_count} chars · angle: {j.draft.angle || '—'}</div>
                  </>
                ) : (
                  <div className="empty">No draft yet.</div>
                )}
                <ApprovalActions jobId={j.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Ready to publish ({ready.length})</h2>
        {ready.length === 0 ? (
          <div className="empty">No approved jobs waiting to publish.</div>
        ) : (
          <div className="cards">
            {ready.map((j) => (
              <div className="card" key={j.id}>
                <div className="topic">{j.topic}</div>
                <div className="meta">
                  <span className="mono">{short(j.id)}</span> · brand {j.brand}
                  {j.draft ? ` · ${j.draft.platform}` : ''}
                </div>
                {j.draft ? (
                  <>
                    <div className="draft">{j.draft.body}</div>
                    <div className="chars">{j.draft.char_count} chars</div>
                    <PublishButton jobId={j.id} channel={j.draft.platform} />
                  </>
                ) : (
                  <div className="empty">No draft to publish.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Cost ledger</h2>
        <div className="empty">
          {cost.entries} entries · ${Number(cost.totalUsd).toFixed(4)} total
          {cost.entries === 0 ? ' (fills once generation runs)' : ''}
        </div>
      </section>

      <section className="panel">
        <h2>Recent jobs</h2>
        <table>
          <thead>
            <tr><th>ID</th><th>State</th><th>Brand</th><th>Topic</th><th className="hide-sm">Updated</th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="mono"><Link className="joblink" href={`/job/${j.id}`}>{short(j.id)}</Link></td>
                <td><span className={`badge ${j.state}`}>{j.state}</span></td>
                <td>{j.brand}</td>
                <td><Link className="joblink" href={`/job/${j.id}`}>{j.topic}</Link></td>
                <td className="hide-sm mono">{when(j.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
