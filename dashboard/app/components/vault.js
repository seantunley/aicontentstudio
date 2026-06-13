'use client';
import { useState, useMemo } from 'react';
import { useUI } from './ui';

export function VaultGrid({ items }) {
  const ui = useUI();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [list, setList] = useState(items);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false;
      if (!needle) return true;
      return `${a.tags || ''} ${a.topic || ''} ${a.platform || ''} ${a.source || ''}`.toLowerCase().includes(needle);
    });
  }, [list, q, kind]);

  async function saveTags(id, tags) {
    const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, tags }) });
    if (r.ok) { setList((l) => l.map((a) => (a.id === id ? { ...a, tags } : a))); ui.toast('Tags saved'); }
    else ui.toast('Failed to save tags', 'err');
  }

  async function del(id) {
    const ok = await ui.confirm({ title: 'Delete this asset?', message: 'It moves to Trash. You can restore it for 30 days.', confirmLabel: 'Delete', danger: true, tag: 'delete' });
    if (!ok) return;
    const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'delete' }) });
    if (r.ok) { setList((l) => l.filter((a) => a.id !== id)); ui.toast('Moved to Trash'); }
    else ui.toast('Failed to delete', 'err');
  }

  return (
    <>
      <div className="vault-bar">
        <input className="input" placeholder="search by tag, topic, platform…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="vault-tabs">
          {['all', 'image', 'video'].map((k) => (
            <button key={k} className={`vault-tab ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k + 's'}</button>
          ))}
        </div>
        <span className="card-foot">{filtered.length} asset{filtered.length === 1 ? '' : 's'}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="panel"><div className="empty">{q ? 'No assets match your search.' : 'Nothing in the Vault yet. Generate or upload media and it lands here.'}</div></div>
      ) : (
        <div className="vault-grid">
          {filtered.map((a) => <VaultTile key={a.id} a={a} onSave={saveTags} onDelete={del} />)}
        </div>
      )}
    </>
  );
}

function VaultTile({ a, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState(a.tags || '');
  const tagList = (a.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  return (
    <div className="vault-tile">
      <div className="vault-media">
        {a.kind === 'video'
          ? <video src={a.url} muted playsInline preload="metadata" />
          : <img src={a.url} alt={a.tags || a.topic || ''} loading="lazy" />}
        <span className={`vault-kind vault-kind--${a.kind}`}>{a.kind === 'video' ? '▶ video' : 'image'}</span>
        <button className="vault-del" title="Delete (moves to Trash)" onClick={() => onDelete(a.id)}>✕</button>
      </div>
      <div className="vault-meta">
        <div className="row-between">
          <div className="vault-topic" title={a.topic || ''}>{a.topic || '—'}</div>
          {a.kind === 'image' && (
            <a className="btn btn--ghost btn--sm" href={`/editor?src=${encodeURIComponent(a.url)}&topic=${encodeURIComponent(a.topic || '')}`}>Edit</a>
          )}
        </div>
        <div className="card-foot">{a.source}{a.platform ? ` · ${a.platform}` : ''}{a.width ? ` · ${a.width}×${a.height}` : ''}</div>
        {editing ? (
          <div className="vault-tagedit">
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated, tags" autoFocus />
            <div className="actions" style={{ marginTop: 6 }}>
              <button className="btn btn--primary btn--sm" onClick={() => { onSave(a.id, tags); setEditing(false); }}>Save</button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setTags(a.tags || ''); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="vault-tags" onClick={() => setEditing(true)} title="click to edit tags">
            {tagList.map((t, i) => <span key={i} className="vtag">{t}</span>)}
            {!tagList.length && <span className="vtag vtag--add">auto-tagging… · click to add</span>}
          </div>
        )}
      </div>
    </div>
  );
}
