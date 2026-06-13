'use client';
import { useState } from 'react';
import { useUI } from './ui';

const BLANK = { slug: '', name: '', region: '', audience: '', voice: '', safety: '', pillars: '', sensitive: '' };

async function post(body) {
  const r = await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

export function BrandManager({ brands }) {
  const ui = useUI();
  const [editing, setEditing] = useState(null); // brand object or null
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e?.preventDefault();
    if (!editing.name?.trim()) { ui.toast('Name is required', 'err'); return; }
    setBusy(true);
    const { ok, data } = await post(editing);
    if (ok) { ui.toast('Brand saved'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  async function del(slug) {
    const ok = await ui.confirm({ title: 'Delete this brand?', message: 'Jobs keep their brand label, but the profile is removed.', confirmLabel: 'Delete', danger: true, tag: 'delete' });
    if (!ok) return;
    const { ok: done, data } = await post({ action: 'delete', slug });
    if (done) { ui.toast('Deleted'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err');
  }
  const set = (k) => (e) => setEditing((b) => ({ ...b, [k]: e.target.value }));

  return (
    <>
      <div className="actions" style={{ marginBottom: 16 }}>
        <button className="btn btn--primary" onClick={() => setEditing({ ...BLANK })}>+ New brand</button>
        <span className="card-foot" style={{ margin: 0 }}>Profiles are optional. A job with no matching brand profile generates exactly as it does today.</span>
      </div>

      {brands.length === 0 ? (
        <div className="panel blank">
          <div className="fleuron">❧</div>
          <div className="bt">No brands yet.</div>
          <div className="bd">Add one whenever you like — voice, region and safety notes shape that brand&rsquo;s output. Fill in only what you know; the rest can wait.</div>
        </div>
      ) : (
        <div className="grid">
          {brands.map((b) => (
            <div className="card" key={b.slug}>
              <div className="row-between">
                <div className="card-topic" style={{ margin: 0 }}>{b.name}</div>
                <span className="badge">{b.slug}</span>
              </div>
              <div className="card-meta">{[b.region, b.audience].filter(Boolean).join(' · ') || 'no region/audience set'}</div>
              {b.voice ? <div className="card-foot" style={{ margin: '0 0 4px' }}>voice: {b.voice.slice(0, 90)}{b.voice.length > 90 ? '…' : ''}</div> : null}
              {b.pillars ? <div className="card-foot" style={{ margin: 0 }}>pillars: {b.pillars.slice(0, 90)}</div> : null}
              <div className="actions">
                <button className="btn btn--sm" onClick={() => setEditing({ ...BLANK, ...b })}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(b.slug)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-bar"><span className="led" /> {editing.slug ? `edit · ${editing.slug}` : 'new brand'}</div>
            <div className="modal-body">
              <h3>{editing.slug ? 'Edit brand' : 'New brand'}</h3>
              <p>Everything except the name is optional. Fill in what exists; leave the rest blank and the brand still works on defaults.</p>
              <form onSubmit={save} className="field-stack">
                <input className="input" placeholder="name *" value={editing.name} onChange={set('name')} autoFocus />
                <div className="field-row">
                  <input className="input" style={{ flex: 1 }} placeholder="region / audience country (e.g. South Africa)" value={editing.region} onChange={set('region')} />
                  <input className="input" style={{ flex: 1 }} placeholder="audience (who they are)" value={editing.audience} onChange={set('audience')} />
                </div>
                <textarea className="ta" rows={3} placeholder="voice rules — tone, do's & don'ts, sign-off" value={editing.voice} onChange={set('voice')} />
                <textarea className="ta" rows={3} placeholder="brand-safety notes — red lines, tone rules, anything to never do" value={editing.safety} onChange={set('safety')} />
                <textarea className="ta" rows={2} placeholder="content pillars — recurring themes, one per line" value={editing.pillars} onChange={set('pillars')} />
                <input className="input" placeholder="sensitive topics/occasions (notify-first) — optional" value={editing.sensitive} onChange={set('sensitive')} />
                <div className="modal-acts">
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save brand'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
