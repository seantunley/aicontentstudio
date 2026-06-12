import Link from 'next/link';
import { getJobById, getBrief, getDraftsFor, getEvents } from '@/lib/db';
import { ApprovalActions, PublishButton, EditableDraft, RetryButton, UploadMediaButton } from '@/app/components/actions';

export const dynamic = 'force-dynamic';
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

export default async function JobPage({ params }) {
  const { id } = await params;
  const job = getJobById(id);
  if (!job) {
    return (<><div className="phead"><div><h1>Job</h1><div className="crumbs"><Link href="/jobs">← all jobs</Link></div></div></div>
      <div className="panel"><span className="empty">No job matching {id}.</span></div></>);
  }
  const brief = getBrief(job.id);
  const drafts = getDraftsFor(job.id);
  const events = getEvents(job.id);
  const latestPlatform = drafts.length ? drafts[drafts.length - 1].platform : null;

  return (
    <>
      <div className="phead">
        <div>
          <div className="crumbs"><Link href="/jobs">all jobs</Link> / {job.id.slice(0, 8)}</div>
          <h1 style={{ marginTop: 6 }}>{job.topic}</h1>
        </div>
        <span className={`badge badge--${job.state}`}>{job.state}</span>
      </div>

      <section className="section reveal r1">
        <div className="card">
          <div className="card-meta">brand {job.brand} · via {job.source} · created {when(job.created_at)}{job.queued_action ? ` · worker: ${job.queued_action}` : ''}</div>
          {job.state === 'preview' && <ApprovalActions jobId={job.id} />}
          {job.state === 'approved' && <PublishButton jobId={job.id} channel={latestPlatform} />}
          {job.queued_action === 'failed' && <div className="actions"><RetryButton jobId={job.id} /></div>}
        </div>
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">01</span><h2>Drafts</h2><span className="rule" />{drafts.length ? <UploadMediaButton jobId={job.id} /> : null}</div>
        {drafts.length === 0 ? <div className="empty">No drafts yet.</div> : drafts.map((d) => (
          <div className="card" key={d.id} style={{ marginBottom: 10 }}>
            <div className="card-meta">{d.platform} · angle {d.angle || '—'} · {d.char_count} chars{d.video_id ? ' · video' : d.image_id ? ' · image' : ''}</div>
            <EditableDraft draftId={d.id} body={d.body} limit={300} />
            {d.image_path ? <img className="draft-img" src={d.image_path} alt="" /> : null}
            {d.video_path ? <video className="draft-img" src={d.video_path} controls muted playsInline /> : null}
          </div>
        ))}
      </section>

      <section className="section reveal r3">
        <div className="section-head"><span className="idx">02</span><h2>Brief</h2><span className="rule" /></div>
        {!brief ? <div className="empty">No research brief for this job.</div> : (
          <div className="panel">
            {brief.recency ? <div className="card-meta">{brief.recency}</div> : null}
            <div className="section-head" style={{ marginTop: 6 }}><h2>Cited facts</h2><span className="rule" /></div>
            {(brief.facts || []).map((f, i) => (
              <div className="fact" key={i}>
                <div className="claim">{f.claim}</div>
                <div className="src"><a href={f.source_url} target="_blank" rel="noreferrer">{f.source_url}</a></div>
                <div className="snip">{f.snippet}</div>
              </div>
            ))}
            <div className="section-head" style={{ marginTop: 12 }}><h2>Angles</h2><span className="rule" /></div>
            {(brief.angles || []).map((a, i) => (<div className="angle" key={i}><b>{a.name}</b> — {a.hook}</div>))}
            {brief.unverified && brief.unverified.length > 0 ? (
              <>
                <div className="section-head" style={{ marginTop: 12 }}><h2>Couldn&rsquo;t verify</h2><span className="rule" /></div>
                {brief.unverified.map((u, i) => <div className="snip" key={i} style={{ marginBottom: 6 }}>{u}</div>)}
              </>
            ) : null}
          </div>
        )}
      </section>

      <section className="section reveal r4">
        <div className="section-head"><span className="idx">03</span><h2>Timeline</h2><span className="rule" /></div>
        <div className="panel">
          {events.map((e, i) => (
            <div className="tl-row" key={i}>
              <span className="t hide-sm">{when(e.at)}</span>
              <span className="t">{e.from_state || e.to_state ? `${e.from_state || '·'} → ${e.to_state || '·'}` : ''}</span>
              <span><span className="badge">{e.actor}</span></span>
              <span className="d">{e.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
