'use client';
import { useState, useRef } from 'react';
import { useUI } from './ui';

// Minimal markdown render — headings, code fences, blockquotes, paragraphs. Enough to read notes.
function Markdown({ text }) {
  const out = [];
  const lines = (text || '').split('\n');
  let code = null;
  let para = [];
  const flush = (i) => { if (para.length) { out.push(<p key={`p${i}`}>{para.join('\n')}</p>); para = []; } };
  lines.forEach((ln, i) => {
    if (ln.startsWith('```')) {
      if (code === null) { flush(i); code = []; }
      else { out.push(<pre key={`c${i}`}>{code.join('\n')}</pre>); code = null; }
      return;
    }
    if (code !== null) { code.push(ln); return; }
    if (ln.startsWith('### ')) { flush(i); out.push(<h4 key={i}>{ln.slice(4)}</h4>); }
    else if (ln.startsWith('## ')) { flush(i); out.push(<h3 key={i}>{ln.slice(3)}</h3>); }
    else if (ln.startsWith('# ')) { flush(i); out.push(<h2 key={i}>{ln.slice(2)}</h2>); }
    else if (ln.startsWith('> ')) { flush(i); out.push(<blockquote key={i}>{ln.slice(2)}</blockquote>); }
    else if (!ln.trim()) { flush(i); }
    else para.push(ln);
  });
  flush('end');
  if (code) out.push(<pre key="cend">{code.join('\n')}</pre>);
  return <div className="kb-doc">{out}</div>;
}

export function KnowledgeBrowser({ notes, stats }) {
  const ui = useUI();
  const [list, setList] = useState(notes);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = showing list; array = search hits
  const [open, setOpen] = useState(null); // { title, body }
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function search(e) {
    e?.preventDefault();
    if (!q.trim()) { setResults(null); return; }
    const r = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    setResults(d.hits || []);
  }
  async function openNote(rel) {
    const r = await fetch(`/api/knowledge/search?open=${encodeURIComponent(rel)}`);
    const d = await r.json();
    if (r.ok) setOpen(d); else ui.toast(d.error || 'Failed to open', 'err');
  }
  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch('/api/knowledge/import', { method: 'POST', body: fd });
      const d = await r.json();
      if (r.ok) { ui.toast(`Imported: ${d.added} new, ${d.updated} updated, ${d.skipped} skipped`); setTimeout(() => window.location.reload(), 1200); }
      else ui.toast(d.error || 'Import failed', 'err');
    } catch { ui.toast('Import failed', 'err'); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  const shown = results !== null ? results : list;
  return (
    <>
      <div className="kb-bar">
        <form onSubmit={search} style={{ flex: '1 1 280px', display: 'flex', gap: 8 }}>
          <input className="input" placeholder="search the knowledge base…" value={q}
                 onChange={(e) => { setQ(e.target.value); if (!e.target.value) setResults(null); }} />
          <button className="btn" type="submit">Search</button>
        </form>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onUpload} />
        <button className="btn btn--primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Importing…' : '↑ Import ChatGPT export'}
        </button>
      </div>
      <div className="card-foot" style={{ marginBottom: 14 }}>
        {stats.total} notes ({stats.chatgpt} from ChatGPT) · upload <b>conversations.json</b> from your export (Settings → Data Controls → Export, then unzip). Re-import anytime; only new/changed chats are added.
      </div>

      <div className="kb-split">
        <div className="kb-list">
          {shown.length === 0 ? (
            <div className="panel blank"><div className="fleuron">❧</div><div className="bt">{results !== null ? 'No matches.' : 'Empty knowledge base.'}</div><div className="bd">Import your ChatGPT history or drop markdown into the knowledge folder.</div></div>
          ) : shown.map((n) => (
            <button key={n.rel} className={`kb-item ${open?.rel === n.rel ? 'on' : ''}`} onClick={() => openNote(n.rel)}>
              <div className="kb-item-title">{n.title}</div>
              {n.snippet ? <div className="kb-item-snip">…{n.snippet}…</div> : <div className="kb-item-meta">{n.source || 'note'}</div>}
            </button>
          ))}
        </div>
        <div className="kb-read panel">
          {open ? <><h2 style={{ marginTop: 0 }}>{open.title}</h2><Markdown text={open.body} /></>
                : <div className="empty">Select a note to read it.</div>}
        </div>
      </div>
    </>
  );
}
