'use client';
import { useState, useEffect } from 'react';

const STATUSES = [['open', 'Open'], ['pending', 'Pending'], ['resolved', 'Resolved']];

export function EngagementInbox() {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let live = true;
    setData(undefined);
    fetch(`/api/engagement?status=${status}`).then((r) => r.json()).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData({ configured: false }); });
    return () => { live = false; };
  }, [status]);

  const ui = data?.ui || 'http://172.18.18.101:4009';

  if (data && data.configured === false) {
    return (
      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="kb-h" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>Chatwoot engine is running — finish the hook-up</div>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
          The engagement engine (Chatwoot) is live on this box. To pull its conversations in here and let the studio draft gated replies, do this once:
        </p>
        <ol className="eng-steps">
          <li>Open <a href={ui} target="_blank" rel="noreferrer">{ui}</a> and create your operator account (first sign-up becomes the admin).</li>
          <li>In Chatwoot, connect a production channel (Instagram / Facebook / X / Telegram / WhatsApp) — that platform&rsquo;s DMs &amp; comments then flow into its inbox.</li>
          <li>Profile → <b>Access Token</b>: copy it. Note your <b>Account ID</b> (the number in the dashboard URL, <code>/app/accounts/&lt;id&gt;</code>).</li>
          <li>Set <code>CHATWOOT_API_TOKEN</code> and <code>CHATWOOT_ACCOUNT_ID</code> in the stack <code>.env</code> and restart the dashboard.</li>
        </ol>
        <p style={{ color: 'var(--faint)', fontSize: 12 }}>Until then, triage lives in the Chatwoot UI itself. Bluesky (test-only) isn&rsquo;t a Chatwoot channel and isn&rsquo;t needed in production.</p>
        <div className="actions"><a className="btn btn--primary" href={ui} target="_blank" rel="noreferrer">Open Chatwoot ↗</a></div>
      </div>
    );
  }

  return (
    <>
      <div className="perf-bar">
        <div className="kb-views">{STATUSES.map(([v, l]) => <button key={v} className={`kb-view ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>{l}</button>)}</div>
        <a className="btn btn--sm" href={ui} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Open Chatwoot ↗</a>
      </div>
      {data === undefined ? <div className="empty" style={{ padding: 40 }}>Loading inbox…</div>
        : !data.conversations || data.conversations.length === 0 ? (
          <div className="panel blank"><div className="fleuron">❧</div><div className="bt">No {status} conversations.</div><div className="bd">Replies, comments and DMs from your connected channels land here. Connect a channel in Chatwoot to start the flow.</div></div>
        ) : (
          <div className="eng-list">
            {data.conversations.map((c) => (
              <a className="eng-row" key={c.id} href={`${ui}/app/accounts/${''}`} target="_blank" rel="noreferrer">
                <div className="eng-who">
                  <span className="eng-contact">{c.contact}</span>
                  {c.channel ? <span className="occ-badge">{c.channel}</span> : null}
                  {c.unread ? <span className="occ-badge occ-sensitive">{c.unread} new</span> : null}
                </div>
                <div className="eng-last">{c.last || '—'}</div>
              </a>
            ))}
          </div>
        )}
    </>
  );
}
