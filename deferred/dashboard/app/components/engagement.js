'use client';
import { useState, useEffect, useRef } from 'react';
import { useUI } from './ui';
import { za } from '@/lib/time';

const STATUSES = [['open', 'Open'], ['pending', 'Pending'], ['resolved', 'Resolved']];

// Platform tabs (shown even when empty). Colourful brand chips; white glyph on the brand colour.
const PLATFORMS = [
  { key: 'telegram',  label: 'Telegram',  color: '#229ED9', mark: <path fill="#fff" d="M21 4 3 11l5 1.7L17 7l-7 7.2.3 4.3 2.6-2.4L18 20z" /> },
  { key: 'instagram', label: 'Instagram', color: '#E4405F', mark: <g fill="none" stroke="#fff" strokeWidth="2"><rect x="4.5" y="4.5" width="15" height="15" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.6" cy="7.4" r="0.4" fill="#fff" /></g> },
  { key: 'facebook',  label: 'Facebook',  color: '#1877F2', mark: <path fill="#fff" d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.3-1.4 1.5-1.4h1.3V5.5c-.6-.1-1.4-.2-2.3-.2-2.3 0-3.8 1.4-3.8 3.9v1.9H7.6V14h2.3v7z" /> },
  { key: 'whatsapp',  label: 'WhatsApp',  color: '#25D366', mark: <g fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"><path d="M4.5 19.5 5.8 16A7 7 0 1 1 8.5 18.4z" /></g> },
  { key: 'youtube',   label: 'YouTube',   color: '#FF0000', mark: <path fill="#fff" d="M10 8.5v7l6-3.5z" /> },
  { key: 'x',         label: 'X',         color: '#1DA1F2', mark: <path stroke="#fff" strokeWidth="2.4" strokeLinecap="round" d="M5.5 5.5l13 13M18.5 5.5l-13 13" /> },
  { key: 'tiktok',    label: 'TikTok',    color: '#FE2C55', mark: <path fill="#fff" d="M14 4c.4 2.4 1.9 3.9 4.3 4.1v2.6c-1.6 0-3-.5-4.3-1.4v5.2a4.8 4.8 0 1 1-4.8-4.8c.3 0 .6 0 .9.1v2.7a2.1 2.1 0 1 0 1.5 2V4z" /> },
  { key: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2', mark: <g fill="#fff"><rect x="5" y="9.5" width="2.6" height="9" /><circle cx="6.3" cy="6.4" r="1.5" /><path d="M10 9.5h2.5v1.3c.5-.8 1.5-1.5 2.9-1.5 2.3 0 3.6 1.4 3.6 4.2v4.5h-2.6V14c0-1.2-.5-2-1.6-2s-1.7.8-1.7 2v4.5H10z" /></g> },
  { key: 'web',       label: 'Web',       color: '#6b7280', mark: <g fill="none" stroke="#fff" strokeWidth="1.8"><circle cx="12" cy="12" r="7.5" /><path d="M4.5 12h15M12 4.5c2.5 2.5 2.5 12.5 0 15M12 4.5c-2.5 2.5-2.5 12.5 0 15" /></g> },
];
const PLAT = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]));

function channelToPlatform(ch) {
  const c = (ch || '').toLowerCase();
  if (c.includes('telegram')) return 'telegram';
  if (c.includes('instagram')) return 'instagram';
  if (c.includes('facebook') || c.includes('messenger')) return 'facebook';
  if (c.includes('whatsapp')) return 'whatsapp';
  if (c.includes('twitter') || c === 'x') return 'x';
  if (c.includes('youtube')) return 'youtube';
  if (c.includes('tiktok')) return 'tiktok';
  if (c.includes('linkedin')) return 'linkedin';
  return 'web';
}

function PlatChip({ k, size = 22 }) {
  const p = PLAT[k] || PLAT.web;
  return (
    <span className="eng-ico" style={{ background: p.color, width: size, height: size }} title={p.label}>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>{p.mark}</svg>
    </span>
  );
}

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
  const [tab, setTab] = useState('all');           // active platform tab
  const [counts, setCounts] = useState({});        // per-platform OPEN unread (stable tab order/badges)
  const [openTotal, setOpenTotal] = useState(0);
  const [data, setData] = useState(undefined);     // {configured, ui, conversations}
  const [sel, setSel] = useState(null);
  const [thread, setThread] = useState(undefined);
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

  // Tab order + badges reflect the OPEN backlog (the actionable unread), NOT the current status
  // filter — so clicking Resolved/Pending no longer reshuffles the tabs or makes everything look done.
  useEffect(() => {
    let live = true;
    fetch('/api/engagement?status=open').then((r) => r.json()).then((d) => {
      if (!live) return;
      const by = {}; let total = 0;
      for (const c of (d.conversations || [])) { const k = channelToPlatform(c.channel); by[k] = (by[k] || 0) + (c.unread || 0); total += (c.unread || 0); }
      setCounts(by); setOpenTotal(total);
    }).catch(() => {});
    return () => { live = false; };
  }, [status]);

  async function openConversation(c) {
    setSel(c); setThread(undefined); setText(''); setDrafting(false); clearInterval(pollRef.current);
    const r = await fetch(`/api/engagement/messages?id=${c.id}`);
    const d = await r.json();
    setThread(d.messages || []);
    try {
      const dd = await fetch(`/api/engagement/draft?conversationId=${c.id}`).then((x) => x.json());
      if (dd.draft?.status === 'drafted' && dd.draft.draft) setText(dd.draft.draft);
    } catch { /* ignore */ }
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
      } else if (tries > 50) {
        clearInterval(pollRef.current); setDrafting(false);
        ui.toast('Still drafting — reopen this conversation in a moment to grab it', 'err');
      }
    }, 3000);
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await fetch('/api/engagement/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sel.id, content: text }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { ui.toast(d.error || 'Send failed', 'err'); return; }
    ui.toast('Reply sent'); setText('');
    openConversation(sel);
  }

  if (data && data.configured === false) {
    return (<><div className="perf-bar" /><SetupCard ui={cwUrl} /></>);
  }

  const conversations = data?.conversations || [];
  // Tab order + badges come from `counts` (the OPEN backlog) — stable regardless of the status filter.
  const orderedPlatforms = [...PLATFORMS].sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0));
  const shown = tab === 'all' ? conversations : conversations.filter((c) => channelToPlatform(c.channel) === tab);

  return (
    <>
      {/* platform tabs — combined "All" first, then platforms ordered by most unread */}
      <div className="eng-tabs">
        <button className={`eng-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          <span className="eng-ico eng-ico--all" title="All platforms"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg></span>
          All{openTotal ? <span className="eng-tab-badge">{openTotal}</span> : null}
        </button>
        {orderedPlatforms.map((p) => (
          <button key={p.key} className={`eng-tab ${tab === p.key ? 'active' : ''}`} onClick={() => setTab(p.key)}>
            <PlatChip k={p.key} size={20} />
            {p.label}{counts[p.key] ? <span className="eng-tab-badge">{counts[p.key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="perf-bar">
        <div className="kb-views">{STATUSES.map(([v, l]) => <button key={v} className={`kb-view ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>{l}</button>)}</div>
        <a className="btn btn--sm" href={cwUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Open Chatwoot ↗</a>
      </div>

      {data === undefined ? <div className="empty" style={{ padding: 40 }}>Loading inbox…</div> : (
        <div className="kb-split">
          <div className="kb-list">
            {shown.length === 0 ? (
              <div className="panel blank" style={{ gridColumn: '1 / -1' }}>
                <div className="fleuron">❧</div>
                <div className="bt">No {status} {tab === 'all' ? 'conversations' : `${PLAT[tab]?.label} messages`}.</div>
                <div className="bd">{tab === 'all' ? 'Comments & DMs from connected channels land here.' : `Connect ${PLAT[tab]?.label} in Chatwoot and its messages appear here.`}</div>
              </div>
            ) : shown.map((c) => (
              <button key={c.id} className={`kb-item ${sel?.id === c.id ? 'on' : ''} ${c.unread ? 'kb-item--unread' : ''}`} onClick={() => openConversation(c)}>
                <div className="eng-row-top">
                  <PlatChip k={channelToPlatform(c.channel)} size={20} />
                  <span className="eng-contact">{c.contact}</span>
                  {c.unread ? <span className="eng-dot" title={`${c.unread} unread`} /> : null}
                  <span className="eng-time">{c.ts ? za(c.ts) : ''}</span>
                </div>
                <div className="kb-item-snip">{c.last || '—'}</div>
              </button>
            ))}
          </div>

          <div className="kb-read panel">
            {!sel ? <div className="empty">Select a conversation.</div> : (
              <>
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><PlatChip k={channelToPlatform(sel.channel)} size={20} /><b>{sel.contact}</b></span>
                  {sel.ts ? <span className="eng-time">{za(sel.ts)}</span> : null}
                </div>
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
