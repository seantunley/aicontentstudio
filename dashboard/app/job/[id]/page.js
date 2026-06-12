import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getJobById, getBrief, getDraftsFor, getEvents } from '../../../lib/db';
import { getSession } from '../../../lib/session';
import { ApprovalActions, PublishButton, EditableDraft, LogoutButton } from '../../ui';

export const dynamic = 'force-dynamic';

const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

export default async function JobPage({ params }) {
  const session = await getSession();
  if (!session.user) redirect('/login');
  const { id } = await params;

  const job = getJobById(id);
  if (!job) {
    return (
      <main className="wrap">
        <p><Link href="/">← back to cockpit</Link></p>
        <div className="panel"><span className="empty">No job matching {id}.</span></div>
      </main>
    );
  }
  const brief = getBrief(job.id);
  const drafts = getDraftsFor(job.id);
  const events = getEvents(job.id);
  const latestPlatform = drafts.length ? drafts[drafts.length - 1].platform : null;

  return (
    <main className="wrap">
      <header className="top">
        <h1><Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Studio Cockpit</Link></h1>
        <span className="sub">job {job.id.slice(0, 8)}</span>
        <span className="session-bar">{session.user.name} <LogoutButton /></span>
      </header>

      <section className="panel">
        <div className="topic" style={{ fontSize: 18 }}>{job.topic}</div>
        <div className="meta">
          <span className={`badge ${job.state}`}>{job.state}</span> · brand {job.brand} · via {job.source} · {when(job.created_at)}
        </div>
        {job.state === 'preview' && <ApprovalActions jobId={job.id} />}
        {job.state === 'approved' && <PublishButton jobId={job.id} channel={latestPlatform} />}
      </section>

      <section className="panel">
        <h2>Drafts</h2>
        {drafts.length === 0 ? (
          <div className="empty">No drafts yet.</div>
        ) : (
          drafts.map((d) => (
            <div className="card" key={d.id} style={{ marginBottom: 10 }}>
              <div className="meta">{d.platform} · angle {d.angle || '—'} · {d.char_count} chars</div>
              <EditableDraft draftId={d.id} body={d.body} limit={300} />
            </div>
          ))
        )}
      </section>

      <section className="panel">
        <h2>Brief</h2>
        {!brief ? (
          <div className="empty">No research brief for this job.</div>
        ) : (
          <>
            {brief.recency ? <div className="meta">{brief.recency}</div> : null}
            <h3 className="sub" style={{ margin: '10px 0 6px' }}>Cited facts</h3>
            {(brief.facts || []).map((f, i) => (
              <div className="card" key={i} style={{ marginBottom: 8 }}>
                <div>{f.claim}</div>
                <div className="chars">
                  <a href={f.source_url} target="_blank" rel="noreferrer">{f.source_url}</a>
                </div>
                <div className="chars">&ldquo;{f.snippet}&rdquo;</div>
              </div>
            ))}
            <h3 className="sub" style={{ margin: '12px 0 6px' }}>Angles</h3>
            {(brief.angles || []).map((a, i) => (
              <div className="card" key={i} style={{ marginBottom: 8 }}><strong>{a.name}</strong> — {a.hook}</div>
            ))}
            {brief.unverified && brief.unverified.length > 0 ? (
              <>
                <h3 className="sub" style={{ margin: '12px 0 6px' }}>Couldn&rsquo;t verify</h3>
                <ul style={{ margin: 0 }}>{brief.unverified.map((u, i) => <li key={i} className="chars">{u}</li>)}</ul>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="panel">
        <h2>Timeline</h2>
        <table>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td className="mono hide-sm">{when(e.at)}</td>
                <td>{e.from_state || e.to_state ? `${e.from_state || '·'} → ${e.to_state || '·'}` : ''}</td>
                <td><span className="badge">{e.actor}</span></td>
                <td>{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
