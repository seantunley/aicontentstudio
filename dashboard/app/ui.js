'use client';
import { useState } from 'react';

export function ApprovalActions({ jobId }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function act(kind) {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/' + kind, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (r.ok) { window.location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || 'failed');
    } catch { setMsg('network error'); }
    setBusy(false);
  }
  return (
    <div className="actions">
      <button className="btn approve" disabled={busy} onClick={() => act('approve')}>Approve</button>
      <button className="btn reject" disabled={busy} onClick={() => act('reject')}>Reject</button>
      {msg && <span className="err">{msg}</span>}
    </div>
  );
}

export function EditableDraft({ draftId, body, limit }) {
  const [text, setText] = useState(body);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function save() {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, text }),
      });
      if (r.ok) { window.location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || 'failed');
    } catch { setMsg('network error'); }
    setBusy(false);
  }
  if (!editing) {
    return (
      <>
        <div className="draft">{body}</div>
        <div className="actions"><button className="btn" onClick={() => setEditing(true)}>Edit</button></div>
      </>
    );
  }
  const over = limit && text.length > limit;
  return (
    <>
      <textarea className="ta" value={text} onChange={(e) => setText(e.target.value)} rows={5} />
      <div className="chars" style={over ? { color: '#f85149' } : null}>{text.length}{limit ? '/' + limit : ''} chars</div>
      <div className="actions">
        <button className="btn primary" style={{ width: 'auto' }} disabled={busy || over} onClick={save}>Save</button>
        <button className="btn" onClick={() => { setText(body); setEditing(false); setMsg(''); }}>Cancel</button>
        {msg && <span className="err">{msg}</span>}
      </div>
    </>
  );
}

export function PublishButton({ jobId, channel }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function go() {
    if (!confirm(`Publish this LIVE to ${channel || 'the connected channel'}? It posts publicly now.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (r.ok) { window.location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || 'failed');
    } catch { setMsg('network error'); }
    setBusy(false);
  }
  return (
    <div className="actions">
      <button className="btn primary" style={{ width: 'auto' }} disabled={busy} onClick={go}>
        {busy ? 'Publishing…' : 'Publish live'}
      </button>
      {msg && <span className="err">{msg}</span>}
    </div>
  );
}

export function NewJobForm() {
  const [topic, setTopic] = useState('');
  const [brand, setBrand] = useState('');
  const [withImage, setWithImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (!topic.trim()) return;
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/jobs/new', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, brand, withImage }),
      });
      if (r.ok) { window.location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      setMsg(d.error || 'failed');
    } catch { setMsg('network error'); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input className="inp" style={{ flex: '2 1 260px', margin: 0 }}
             placeholder="topic — e.g. 'latch tips for newborns'" value={topic} onChange={(e) => setTopic(e.target.value)} />
      <input className="inp" style={{ flex: '1 1 120px', margin: 0 }}
             placeholder="brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
        <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} /> image
      </label>
      <button className="btn primary" style={{ width: 'auto' }} disabled={busy} type="submit">
        {busy ? 'Queuing…' : 'Start job'}
      </button>
      {msg && <span className="err">{msg}</span>}
    </form>
  );
}

export function LogoutButton() {
  async function out() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  }
  return <button className="btn" onClick={out}>Sign out</button>;
}
