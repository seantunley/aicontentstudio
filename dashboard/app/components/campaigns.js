'use client';
import { useState } from 'react';
import { useUI } from './ui';
import { PlatformPicker } from './actions';

const BLANK = { name: '', theme: '', pieces: '', withImage: false };
const STATE_LABEL = { requested: 'queued', researched: 'researching', planned: 'drafting', generated: 'drafting', preview: 'in queue', approved: 'approved', scheduled: 'scheduled', published: 'published', cancelled: 'removed' };

export function CampaignsManager({ campaigns, brand }) {
  const ui = useUI();
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState({}); // id -> pieces

  async function create(e) {
    e?.preventDefault();
    if (!editing.name.trim()) { ui.toast('Name is required', 'err'); return; }
    const pieces = editing.pieces.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!pieces.length) { ui.toast('Add at least one piece (one per line)', 'err'); return; }
    setBusy(true);
    const platforms = Object.keys(selected).filter((p) => selected[p]);
    const r = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editing.name, theme: editing.theme, pieces, platforms, withImage: editing.withImage }) });
    const d = await r.json();
    if (r.ok) { ui.toast(`Campaign created — ${d.pieces} pieces queued`); window.location.reload(); return; }
    ui.toast(d.error || 'Failed', 'err'); setBusy(false);
  }
  async function toggleOpen(id) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!detail[id]) {
      const r = await fetch(`/api/campaigns?id=${id}`);
      const d = await r.json();
      if (r.ok) setDetail((m) => ({ ...m, [id]: d.pieces || [] }));
    }
  }
  async function del(c) {
    const ok = await ui.confirm({ title: `Delete "${c.name}"?`, message: 'Unpublished pieces move to Trash; published ones stay live.', confirmLabel: 'Delete', danger: true, tag: 'delete' });
    if (!ok) return;
    const r = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: c.id }) });
    if (r.ok) { ui.toast('Deleted'); window.location.reload(); } else ui.toast('Failed', 'err');
  }
  const set = (k) => (e) => setEditing((c) => ({ ...c, [k]: e.target.value }));

  return (
    <>
      <div className="actions" style={{ marginBottom: 16 }}>
        <button className="btn btn--primary" onClick={() => { setEditing({ ...BLANK }); setSelected({}); }}>+ New campaign</button>
        <span className="card-foot" style={{ margin: 0 }}>One theme, a coordinated set of posts. Each piece runs through the normal pipeline and lands in your approval queue — review the arc as a set.</span>
      </div>

      {campaigns.length === 0 ? (
        <div className="panel blank"><div className="fleuron">❧</div><div className="bt">No campaigns yet.</div><div className="bd">A campaign fans one idea into several coordinated posts — a launch week, an awareness series, a product arc.</div></div>
      ) : (
        <div className="camp-list">
          {campaigns.map((c) => (
            <div className={`camp-card ${openId === c.id ? 'open' : ''}`} key={c.id}>
              <div className="camp-head">
                <button type="button" className="camp-main" onClick={() => toggleOpen(c.id)}>
                  <span className="qcard-caret">{openId === c.id ? '▾' : '▸'}</span>
                  <span>
                    <span className="camp-name">{c.name}</span>
                    {c.theme ? <span className="camp-theme">{c.theme.slice(0, 90)}{c.theme.length > 90 ? '…' : ''}</span> : null}
                  </span>
                </button>
                <div className="camp-meta">
                  {c.brand && c.brand !== 'unassigned' ? <span className="badge">{c.brand}</span> : null}
                  <span className="camp-prog">{c.ready}/{c.total} ready{c.published ? ` · ${c.published} live` : ''}</span>
                  <button className="btn btn--ghost btn--sm" onClick={() => del(c)}>✕</button>
                </div>
              </div>
              {openId === c.id && (
                <div className="camp-body">
                  {!detail[c.id] ? <div className="empty">Loading pieces…</div>
                    : detail[c.id].map((p, i) => (
                      <div className="camp-piece" key={p.id}>
                        <span className="camp-piece-n">{i + 1}</span>
                        <span className="camp-piece-topic">{p.topic}</span>
                        <span className={`camp-piece-state s-${p.state}`}>{p.queued_action === 'processing' ? 'working…' : STATE_LABEL[p.state] || p.state}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-bar"><span className="led" /> new campaign{brand ? ` · ${brand}` : ''}</div>
            <div className="modal-body">
              <h3>New campaign</h3>
              <p>One theme, several coordinated posts. List each post on its own line — each becomes a draft in your queue, tagged to this campaign.</p>
              <form onSubmit={create} className="field-stack">
                <input className="input" placeholder="campaign name * (e.g. Winter launch week)" value={editing.name} onChange={set('name')} autoFocus />
                <textarea className="ta" rows={2} placeholder="shared theme / brief — the idea the whole arc rotates around" value={editing.theme} onChange={set('theme')} />
                <div>
                  <div className="card-foot" style={{ margin: '2px 0 6px' }}>THE ARC — one post per line</div>
                  <textarea className="ta" rows={6} placeholder={'Day 1 — tease the launch\nDay 2 — the problem it solves\nDay 3 — how it works\nLaunch day — it\'s live'} value={editing.pieces} onChange={set('pieces')} style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} />
                </div>
                <div>
                  <div className="card-foot" style={{ margin: '2px 0 6px' }}>PLATFORMS (applies to every piece)</div>
                  <PlatformPicker selected={selected} onToggle={(p) => setSelected((s) => ({ ...s, [p]: !s[p] }))} />
                </div>
                <label className="check"><input type="checkbox" checked={editing.withImage} onChange={(e) => setEditing((c) => ({ ...c, withImage: e.target.checked }))} /> Generate an image for each piece</label>
                <div className="modal-acts">
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Creating…' : 'Create campaign'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
