'use client';
import { useState, useEffect } from 'react';
import { useUI, Tooltip, InfoDot } from './ui';

const BLANK = { slug: '', name: '', region: '', audience: '', voice: '', safety: '', pillars: '', sensitive: '', channels: '' };

async function post(body) {
  const r = await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

// §7e content-pillar coverage: the pillars the brand has defined, each tagged with how many live
// jobs serve it — so gaps (a pillar at 0) are visible at a glance. Pillars seen on jobs but no
// longer in the brand's list trail after, marked. Nothing renders until pillars are defined.
function PillarCoverage({ pillars, cov }) {
  const defined = (pillars || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const counts = Object.fromEntries((cov || []).map((c) => [c.pillar, c.n]));
  if (!defined.length && !(cov || []).length) return null;
  const rows = defined.map((p) => ({ p, n: counts[p] || 0, extra: false }));
  for (const c of cov || []) if (!defined.includes(c.pillar)) rows.push({ p: c.pillar, n: c.n, extra: true });
  return (
    <div className="card-foot pillar-cov" style={{ margin: '2px 0 0' }}>
      pillars
      {rows.map(({ p, n, extra }) => (
        <Tooltip key={p} className={`pillar-chip ${n === 0 ? 'pillar-chip--gap' : ''} ${extra ? 'pillar-chip--extra' : ''}`}
              text={extra ? 'Made, but no longer in this brand’s pillar list.' : n === 0 ? 'A defined pillar with nothing made yet — a coverage gap.' : `${n} live ${n === 1 ? 'piece' : 'pieces'} serve this pillar.`}>
          {p} · {n}
        </Tooltip>
      ))}
    </div>
  );
}

export function BrandManager({ brands, coverage = {} }) {
  const ui = useUI();
  const [editing, setEditing] = useState(null); // brand object or null
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState(null); // connected Postiz channels (null = not loaded)

  useEffect(() => {
    if (editing && accounts === null) {
      fetch('/api/channels').then((r) => r.json()).then((d) => setAccounts(d.channels || [])).catch(() => setAccounts([]));
    }
  }, [editing, accounts]);

  const selectedChannels = (editing?.channels || '').split(',').map((s) => s.trim()).filter(Boolean);
  const toggleChannel = (id) => setEditing((b) => {
    const set = new Set((b.channels || '').split(',').map((s) => s.trim()).filter(Boolean));
    set.has(id) ? set.delete(id) : set.add(id);
    return { ...b, channels: [...set].join(',') };
  });

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
              <PillarCoverage pillars={b.pillars} cov={coverage[b.slug]} />
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
                <label className="card-foot" style={{ margin: '2px 0 4px', display: 'block' }}>Voice<InfoDot tip="How this brand sounds — tone, do's & don'ts, sign-off. Steers every draft's wording." /></label>
                <textarea className="ta" rows={3} placeholder="voice rules — tone, do's & don'ts, sign-off" value={editing.voice} onChange={set('voice')} />
                <label className="card-foot" style={{ margin: '6px 0 4px', display: 'block' }}>Safety<InfoDot tip="Red lines the studio must never cross for this brand — flags or holds anything that breaks them." /></label>
                <textarea className="ta" rows={3} placeholder="brand-safety notes — red lines, tone rules, anything to never do" value={editing.safety} onChange={set('safety')} />
                <label className="card-foot" style={{ margin: '6px 0 4px', display: 'block' }}>Pillars<InfoDot tip="Recurring themes this brand posts about, one per line. Drive coverage tracking and the scout." /></label>
                <textarea className="ta" rows={2} placeholder="content pillars — recurring themes, one per line" value={editing.pillars} onChange={set('pillars')} />
                <label className="card-foot" style={{ margin: '6px 0 4px', display: 'block' }}>Sensitive topics<InfoDot tip="Dates/topics that should notify you first rather than auto-draft (e.g. tragedies, anniversaries)." /></label>
                <input className="input" placeholder="sensitive topics/occasions (notify-first) — optional" value={editing.sensitive} onChange={set('sensitive')} />
                <div>
                  <div className="card-foot" style={{ margin: '2px 0 6px' }}>
                    ACCOUNTS THIS BRAND MAY POST TO (§1b)<InfoDot tip="Restrict this brand to specific connected accounts. Leave all unticked = any connected account." />{selectedChannels.length ? <span className="dim"> · {selectedChannels.length} selected</span> : null}
                  </div>
                  {accounts === null ? <span className="empty">loading channels…</span>
                    : accounts.length === 0 ? <span className="empty">No channels connected in Postiz.</span>
                    : <div className="field-row">{accounts.map((c) => (
                        <label key={c.id} className="check"><input type="checkbox" checked={selectedChannels.includes(c.id)} onChange={() => toggleChannel(c.id)} /> {c.platform} · {c.handle}</label>
                      ))}</div>}
                  <div className="card-foot" style={{ marginTop: 5 }}>Empty = no restriction (any connected account). Set them and this brand can ONLY post to these accounts.</div>
                </div>
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
