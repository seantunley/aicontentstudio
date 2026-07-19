'use client';
import { useState } from 'react';
import Link from 'next/link';

function relTime(s) {
  if (!s) return '—';
  const d = new Date(s); const diff = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return '—';
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function FunnelContacts({ initial = [], total = 0 }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(total);

  async function search(e) {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await fetch(`/api/funnels/contacts?search=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (r.ok) { setRows(d.contacts || []); setCount(d.total ?? (d.contacts || []).length); }
    } catch {}
    setBusy(false);
  }

  return (
    <>
      <form className="field-row" onSubmit={search} style={{ marginBottom: 12 }}>
        <input className="input" style={{ flex: '1 1 280px', maxWidth: 380 }} placeholder="search contacts — name, email, phone…"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn--sm" type="submit" disabled={busy}>{busy ? '…' : 'Search'}</button>
        {q && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setQ(''); setRows(initial); setCount(total); }}>Clear</button>}
      </form>

      {rows.length === 0 ? (
        <div className="empty" style={{ padding: 8 }}>No contacts {q ? 'match that search' : 'yet — they arrive as funnels capture leads'}.</div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th className="hide-sm">Phone</th><th>Tags</th><th style={{ textAlign: 'right' }}>Score</th><th className="hide-sm">Last active</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link className="joblink" href={`/funnels/contact/${c.id}`}>{c.name || `#${c.id}`}</Link></td>
                  <td className="id">{c.email || '—'}</td>
                  <td className="hide-sm id">{c.phone || '—'}</td>
                  <td>{c.tags?.length ? c.tags.slice(0, 3).map((t) => <span key={t} className="badge" style={{ marginRight: 4 }}>{t}</span>) : <span className="dim">—</span>}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{c.points}</td>
                  <td className="hide-sm id">{relTime(c.lastActive)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card-foot" style={{ marginTop: 8 }}>{count} contact{count === 1 ? '' : 's'} total</div>
    </>
  );
}
