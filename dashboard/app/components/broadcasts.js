'use client';
import { useState } from 'react';
import { useUI, Tooltip } from './ui';

export function BroadcastComposer() {
  const ui = useUI();
  const [audience, setAudience] = useState('test');
  const [chatIds, setChatIds] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!message.trim()) { ui.toast('Write a message first.', 'err'); return; }
    if (audience === 'list' && !chatIds.trim()) { ui.toast('Paste at least one chat id.', 'err'); return; }
    const recips = audience === 'test' ? 'yourself' : `${chatIds.split(/[\s,]+/).filter(Boolean).length} recipient(s)`;
    const ok = await ui.confirm({ title: 'Send this broadcast?', message: `Telegram → ${recips}. This sends immediately.`, confirmLabel: 'Send', tag: 'broadcast' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/broadcasts/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'telegram', audience, chatIds, message }),
      });
      const d = await r.json();
      if (r.ok) {
        ui.toast(`Sent ${d.sent}/${d.total}${d.failed ? `, ${d.failed} failed` : ''}.`);
        setMessage(''); setTimeout(() => window.location.reload(), 900);
      } else ui.toast(d.error || 'Send failed.', 'err');
    } catch { ui.toast('Network error.', 'err'); }
    setBusy(false);
  }

  return (
    <div className="panel set-panel">
      <div className="field-row" style={{ marginBottom: 10 }}>
        <Tooltip className="badge badge--approved" text="Broadcasts go out over Telegram — the connected channel.">Telegram</Tooltip>
        <Tooltip className="badge" text="Not yet available — needs a connected Meta WhatsApp Business account." style={{ opacity: 0.6 }}>WhatsApp · soon</Tooltip>
      </div>

      <div className="card-foot" style={{ margin: '0 0 6px' }}>AUDIENCE</div>
      <div className="field-row" style={{ marginBottom: 10 }}>
        <label className="check"><input type="radio" name="aud" checked={audience === 'test'} onChange={() => setAudience('test')} /> Test (send to me)</label>
        <label className="check"><input type="radio" name="aud" checked={audience === 'list'} onChange={() => setAudience('list')} /> Paste chat IDs</label>
      </div>
      {audience === 'list' && (
        <textarea className="ta" rows={3} placeholder="Telegram chat IDs — comma, space or newline separated"
                  value={chatIds} onChange={(e) => setChatIds(e.target.value)} style={{ marginBottom: 10 }} />
      )}

      <div className="card-foot" style={{ margin: '0 0 6px' }}>MESSAGE</div>
      <textarea className="ta" rows={5} placeholder="Your broadcast message…" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="actions">
        <button className="btn btn--primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send broadcast'}</button>
        <span className="card-foot" style={{ margin: 0 }}>{message.length} chars</span>
      </div>
    </div>
  );
}
