'use client';
import { useState, useRef } from 'react';
import { useUI } from './ui';
import { KnowledgeGraph } from './KnowledgeGraph';

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

const BLANK_NOTE = { title: '', tags: '', body: '' };

export function KnowledgeBrowser({ notes, stats }) {
  const ui = useUI();
  const [list] = useState(notes);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = showing list; array = search hits
  const [open, setOpen] = useState(null); // { title, body }
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'graph'
  const [graph, setGraph] = useState(null); // null = not loaded
  const [editing, setEditing] = useState(null); // new-note draft or null
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
    if (r.ok) { setOpen(d); setView('list'); } else ui.toast(d.error || 'Failed to open', 'err');
  }
  async function showGraph() {
    setView('graph');
    if (graph === null) {
      try { const r = await fetch('/api/knowledge/graph'); setGraph(await r.json()); }
      catch { setGraph({ nodes: [], links: [] }); }
    }
  }
  async function onUpload(e) {
    const files = e.target.files;
    if (!files?.length) return;
    setBusy(true);
    const fd = new FormData();
    for (const f of files) fd.append('file', f);
    try {
      const r = await fetch('/api/knowledge/import', { method: 'POST', body: fd });
      const d = await r.json();
      if (r.ok) {
        const bits = [];
        if (d.notes) bits.push(`${d.notes} note${d.notes > 1 ? 's' : ''}`);
        if (d.chatgpt) bits.push(`ChatGPT: ${d.chatgpt.added} new, ${d.chatgpt.updated} updated, ${d.chatgpt.skipped} skipped`);
        if (d.errors?.length) bits.push(`${d.errors.length} skipped`);
        ui.toast(`Imported — ${bits.join(' · ') || 'nothing new'}`);
        setTimeout(() => window.location.reload(), 1300);
      } else ui.toast(d.error || 'Import failed', 'err');
    } catch { ui.toast('Import failed', 'err'); }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }
  async function saveNote(e) {
    e?.preventDefault();
    if (!editing.title.trim()) { ui.toast('Title is required', 'err'); return; }
    if (!editing.body.trim()) { ui.toast('Note body is empty', 'err'); return; }
    setBusy(true);
    const r = await fetch('/api/knowledge/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    const d = await r.json();
    if (r.ok) { ui.toast('Note saved to the knowledge base'); setTimeout(() => window.location.reload(), 900); return; }
    ui.toast(d.error || 'Failed', 'err'); setBusy(false);
  }
  const setF = (k) => (e) => setEditing((b) => ({ ...b, [k]: e.target.value }));

  const shown = results !== null ? results : list;
  return (
    <>
      <div className="kb-bar">
        <form onSubmit={search} style={{ flex: '1 1 240px', display: 'flex', gap: 8 }}>
          <input className="input" placeholder="search the knowledge base…" value={q}
                 onChange={(e) => { setQ(e.target.value); if (!e.target.value) setResults(null); }} />
          <button className="btn" type="submit">Search</button>
        </form>
        <div className="kb-views">
          <button className={`kb-view ${view === 'list' ? 'on' : ''}`} onClick={() => setView('list')}>List</button>
          <button className={`kb-view ${view === 'graph' ? 'on' : ''}`} onClick={showGraph}>Graph</button>
        </div>
        <button className="btn" onClick={() => setEditing({ ...BLANK_NOTE })}>+ New note</button>
        <input ref={fileRef} type="file" accept=".json,.md,.markdown,.txt,.text,application/json,text/markdown,text/plain" multiple style={{ display: 'none' }} onChange={onUpload} />
        <button className="btn btn--primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Working…' : '↑ Import files'}
        </button>
      </div>
      <div className="card-foot" style={{ marginBottom: 14 }}>
        {stats.total} notes ({stats.chatgpt} from ChatGPT). Add knowledge three ways: <b>write a note</b>, <b>import files</b> (markdown/text, or a ChatGPT <b>conversations.json</b> export), or drop markdown straight into the knowledge folder. Hermes draws on all of it when drafting.
      </div>

      {view === 'graph' ? (
        graph === null ? <div className="empty" style={{ padding: 40 }}>Building the map…</div>
          : <KnowledgeGraph data={graph} onOpen={openNote} />
      ) : (
        <div className="kb-split">
          <div className="kb-list">
            {shown.length === 0 ? (
              <div className="panel blank"><div className="fleuron">❧</div><div className="bt">{results !== null ? 'No matches.' : 'Empty knowledge base.'}</div><div className="bd">Write a note, import your ChatGPT history, or drop markdown into the knowledge folder.</div></div>
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
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-bar"><span className="led" /> new note</div>
            <div className="modal-body">
              <h3>New note</h3>
              <p>Write anything you want Hermes to know — a fact, a style guide, a reference. It&rsquo;s saved as markdown and indexed into the knowledge base.</p>
              <form onSubmit={saveNote} className="field-stack">
                <input className="input" placeholder="title *" value={editing.title} onChange={setF('title')} autoFocus />
                <input className="input" placeholder="tags (comma-separated, optional) — e.g. reference, style" value={editing.tags} onChange={setF('tags')} />
                <textarea className="ta" rows={12} placeholder="note body (markdown)…" value={editing.body} onChange={setF('body')} style={{ fontFamily: 'var(--mono)', fontSize: 13 }} />
                <div className="modal-acts">
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save note'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
