'use client';
import { useState } from 'react';
import { za } from '@/lib/time';

// Minimal markdown render — headings, bullet lists, **bold**, paragraphs. Enough to read playbook notes.
function MD({ text }) {
  const bold = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
  const out = [];
  let list = [];
  const flush = (k) => { if (list.length) { out.push(<ul className="learn-ul" key={`u${k}`}>{list.map((li, j) => <li key={j}>{bold(li)}</li>)}</ul>); list = []; } };
  (text || '').split('\n').forEach((ln, i) => {
    if (ln.startsWith('### ')) { flush(i); out.push(<h4 key={i}>{ln.slice(4)}</h4>); }
    else if (ln.startsWith('## ')) { flush(i); out.push(<h3 key={i}>{ln.slice(3)}</h3>); }
    else if (ln.startsWith('# ')) { flush(i); out.push(<h2 key={i}>{ln.slice(2)}</h2>); }
    else if (ln.startsWith('- ')) { list.push(ln.slice(2)); }
    else if (!ln.trim()) { flush(i); }
    else { flush(i); out.push(<p key={i}>{bold(ln)}</p>); }
  });
  flush('end');
  return <div className="kb-doc">{out}</div>;
}

export function LearningsView({ feedback = [], playbook = [] }) {
  const [tab, setTab] = useState('feedback');
  return (
    <>
      <div className="vault-tabs" style={{ marginBottom: 16, width: 'fit-content' }}>
        <button className={`vault-tab ${tab === 'feedback' ? 'on' : ''}`} onClick={() => setTab('feedback')}>Feedback ({feedback.length})</button>
        <button className={`vault-tab ${tab === 'playbook' ? 'on' : ''}`} onClick={() => setTab('playbook')}>Playbook ({playbook.length})</button>
      </div>

      {tab === 'feedback' ? (
        feedback.length === 0 ? (
          <div className="panel"><div className="empty">Nothing captured yet. When you rewrite a draft in the queue or reject one, it lands here — and shapes future drafts automatically.</div></div>
        ) : (
          <div className="panel">
            {feedback.map((l) => (
              <div className="learn" key={l.id}>
                <div className="learn-head">
                  <span className={`learn-kind learn-kind--${l.kind}`}>{l.kind === 'edit' ? 'you rewrote' : 'you rejected'}</span>
                  {l.platform ? <span className="card-foot" style={{ margin: 0 }}>{l.platform}</span> : null}
                  <span className="card-foot" style={{ margin: 0, marginLeft: 'auto' }}>{za(l.created_at)}</span>
                </div>
                {l.topic ? <div className="learn-topic">{l.topic}</div> : null}
                {l.kind === 'edit' ? (
                  <>
                    <div className="learn-row learn-before"><span className="learn-tag">AI</span> {l.before}</div>
                    <div className="learn-row learn-after"><span className="learn-tag">you</span> {l.after}</div>
                  </>
                ) : (
                  <div className="learn-row learn-before"><span className="learn-tag">cut</span> {l.before}</div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        playbook.length === 0 ? (
          <div className="panel"><div className="empty">No playbook yet. Curated principles — knowledge notes tagged “playbook” — show up here for you and the bots to draw on.</div></div>
        ) : (
          playbook.map((n) => (
            <div className="panel" key={n.rel} style={{ marginBottom: 16 }}>
              <MD text={n.body} />
            </div>
          ))
        )
      )}
    </>
  );
}
