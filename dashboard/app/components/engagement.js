'use client';
import { useState, useEffect, useRef } from 'react';
import { useUI } from './ui';

const STATUSES = [['open', 'Open'], ['pending', 'Pending'], ['resolved', 'Resolved']];

function SetupCard({ ui }) {
  return (
    <div className="panel" style={{ maxWidth: 720 }}>
      <div className="qr-h" style={{ marginTop: 0 }}>Chatwoot engine is running — finish the hook-up</div>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>
        The engagement engine (Chatwoot) is live on this box. To mirror its inbox in here and let the studio draft gated replies, do this once:
      </p>
      <ol className="eng-steps">
        <li>Open <a href={ui} target="_blank" rel="noreferrer">{ui}</a> and create your operator account (first sign-up becomes admin).</li>
        <li>Connect a production channel (Instagram / Facebook / X / Telegram / WhatsApp) — its DMs &amp; comments then flow in.</li>
        <li>Profile → <b>Access Token</b>; note your <b>Account ID</b> (the number in <code>/app/accounts/&lt;id&gt;</code>).</li>
        <li>Set <code>CHATWOOT_API_TOKEN</code> + <code>CHATWOOT_ACCOUNT_ID</code> in the stack <code>.env</code> and restart the dashboard.</li>
      </ol>
      <div className="actions"><a className="btn btn--primary" href={ui} target="_blank" rel="noreferrer">Open Chatwoot ↗</a></div>
    </div>
  );
}

export function EngagementInbox() {
  const ui = useUI();
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(undefined);     // {configured, ui, conversations}
  const [sel, setSel] = useState(null);            // selected conversation
  const [thread, setThread] = useState(undefined); // messages | undefined(loading) | []
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const pollRef = useRef(null);
  const cwUrl = data?.ui || 'http://172.18.18.101:4009';

  useEffect(() => {
    let live = true;
    setData(undefined); setSel(null); setThread(undefined);
    fetch(`/api/engagement?status=${status}`).then((r) => r.json()).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData({ configured: false }); });
    return () => { live = false; };
  }, [status]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function openConversation(c) {
    setSel(c); setThread(undefined); setText(''); setDrafting(false); clearInterval(pollRef.current);
    const r = await fetch(`/api/engagement/messages?id=${c.id}`);
    const d = await r.json();
    setThread(d.messages || []);
  }

  function lastIncoming() {
    const ms = (thread || []).filter((m) => m.incoming);
    return ms.length ? ms[ms.length - 1].content : (sel?.last || '');
  }

  async function draftWithAI() {
    setDrafting(true);
    await fetch('/api/engagement/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: sel.id, incoming: lastIncoming() }) });
    let tries = 0;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      tries += 1;
      const d = await fetch(`/api/engagement/draft?conversationId=${sel.id}`).then((r) => r.json()).catch(() => ({}));
      const st = d.draft?.status;
      if (st === 'drafted' || st === 'error') {
        clearInterval(pollRef.current); setDrafting(false);
        setText(d.draft.draft || ''); ui.toast('Draft ready — review before sending');
      } else if (tries > 16) { clearInterval(pollRef.current); setDrafting(false); ui.toast('Draft is taking a while — try again', 'err'); }
    }, 2500);
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch('/api/engagement/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sel.id, content: text }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { ui.toast(d.error || 'Send failed', 'err'); return; }
    ui.toast('Reply sent'); setText('');
    openConversation(sel); // refresh the thread
  }

  if (data && data.configured === false) {
    return (<><div className="perf-bar" /><SetupCard ui={cwUrl} /></>);
  }

  return (
    <>
      <div className="perf-bar">
        <div className="kb-views">{STATUSES.map(([v, l]) => <button key={v} className={`kb-view ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>{l}</button>)}</div>
        <a className="btn btn--sm" href={cwUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Open Chatwoot ↗</a>
      </div>

      {data === undefined ? <div className="empty" style={{ padding: 40 }}>Loading inbox…</div> : (
        <div className="kb-split">
          <div className="kb-list">
            {!data.conversations || data.conversations.length === 0 ? (
              <div className="panel blank" style={{ gridColumn: '1 / -1' }}><div className="fleuron">❧</div><div className="bt">No {status} conversations.</div><div className="bd">Comments &amp; DMs from connected channels land here.</div></div>
            ) : data.conversations.map((c) => (
              <button key={c.id} className={`kb-item ${sel?.id === c.id ? 'on' : ''}`} onClick={() => openConversation(c)}>
                <div className="eng-who"><span className="eng-contact">{c.contact}</span>{c.channel ? <span className="occ-badge">{c.channel}</span> : null}{c.unread ? <span className="occ-badge occ-sensitive">{c.unread}</span> : null}</div>
                <div className="kb-item-snip">{c.last || '—'}</div>
              </button>
            ))}
          </div>

          <div className="kb-read panel">
            {!sel ? <div className="empty">Select a conversation.</div> : (
              <>
                <div className="row-between" style={{ marginBottom: 10 }}><b>{sel.contact}</b>{sel.channel ? <span className="occ-badge">{sel.channel}</span> : null}</div>
                <div className="eng-thread">
                  {thread === undefined ? <div className="empty">Loading…</div>
                    : thread.length === 0 ? <div className="empty">No messages.</div>
                    : thread.map((m) => (
                      <div key={m.id} className={`eng-msg ${m.incoming ? 'in' : 'out'}`}>
                        <div className="eng-msg-who">{m.sender}</div>
                        <div className="eng-bubble">{m.content}</div>
                      </div>
                    ))}
                </div>
                <div className="eng-compose">
                  <textarea className="ta" rows={3} placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} />
                  <div className="actions">
                    <button className="btn" disabled={drafting} onClick={draftWithAI}>{drafting ? 'Drafting…' : '✦ Draft with AI'}</button>
                    <button className="btn btn--primary" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send reply'}</button>
                  </div>
                  <div className="card-foot" style={{ margin: 0 }}>AI drafts on-brand and safe; you review and send. Nothing goes out automatically.</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
