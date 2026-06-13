'use client';
import { useState } from 'react';
import { useUI } from './ui';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; // 0=Mon..6=Sun
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NTH = [{ v: 1, l: '1st' }, { v: 2, l: '2nd' }, { v: 3, l: '3rd' }, { v: 4, l: '4th' }, { v: -1, l: 'Last' }];

function parseRule(raw) { try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; } }
function ruleText(raw) {
  const r = parseRule(raw);
  if (r.type === 'fixed') return `${MONTHS[r.month - 1]} ${r.day}`;
  if (r.type === 'nth_weekday') return `${(NTH.find((n) => n.v === r.n) || {}).l || r.n} ${WEEKDAYS[r.weekday]} of ${MONTHS[r.month - 1]}`;
  return '—';
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-ZA', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function countdown(days) {
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 21) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

const BLANK = { brand: 'all', name: '', region: '', lead_days: 14, sensitive: 0, auto_draft: 0, mode: 'fixed', month: 1, day: 1, n: 2, weekday: 6 };

export function OccasionsManager({ occasions, brand }) {
  const ui = useUI();
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function post(body) {
    const r = await fetch('/api/occasions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }
  async function patch(o, changes) {
    const { ok, data } = await post({ id: o.id, brand: o.brand, name: o.name, rule: o.rule, region: o.region, lead_days: o.lead_days, sensitive: o.sensitive, auto_draft: o.auto_draft, enabled: o.enabled, ...changes });
    if (ok) window.location.reload(); else ui.toast(data.error || 'Failed', 'err');
  }
  async function del(o) {
    const ok = await ui.confirm({ title: `Delete "${o.name}"?`, message: 'It will stop appearing on the occasions calendar.', confirmLabel: 'Delete', danger: true, tag: 'delete' });
    if (!ok) return;
    const { ok: done, data } = await post({ action: 'delete', id: o.id });
    if (done) { ui.toast('Deleted'); window.location.reload(); } else ui.toast(data.error || 'Failed', 'err');
  }
  function openNew() {
    setEditing({ ...BLANK, brand: brand || 'all' });
  }
  function openEdit(o) {
    const r = parseRule(o.rule);
    setEditing({
      id: o.id, brand: o.brand, name: o.name, region: o.region || '', lead_days: o.lead_days ?? 14,
      sensitive: o.sensitive, auto_draft: o.auto_draft, enabled: o.enabled,
      mode: r.type === 'nth_weekday' ? 'nth' : 'fixed',
      month: r.month || 1, day: r.day || 1, n: r.n || 2, weekday: r.weekday ?? 6,
    });
  }
  async function save(e) {
    e?.preventDefault();
    if (!editing.name?.trim()) { ui.toast('Name is required', 'err'); return; }
    const rule = editing.mode === 'nth'
      ? { type: 'nth_weekday', month: Number(editing.month), weekday: Number(editing.weekday), n: Number(editing.n) }
      : { type: 'fixed', month: Number(editing.month), day: Number(editing.day) };
    setBusy(true);
    const { ok, data } = await post({ id: editing.id, brand: editing.brand, name: editing.name.trim(), rule, region: editing.region, lead_days: Number(editing.lead_days) || 14, sensitive: editing.sensitive ? 1 : 0, auto_draft: editing.auto_draft ? 1 : 0, enabled: 1 });
    if (ok) { ui.toast('Occasion saved'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  const set = (k) => (e) => setEditing((o) => ({ ...o, [k]: e.target.value }));
  const tog = (k) => () => setEditing((o) => ({ ...o, [k]: o[k] ? 0 : 1 }));

  return (
    <>
      <div className="actions" style={{ marginBottom: 16 }}>
        <button className="btn btn--primary" onClick={openNew}>+ Add occasion</button>
        <span className="card-foot" style={{ margin: 0 }}>
          {brand ? <>Showing <b>{brand}</b>’s occasions + shared ones. </> : 'Showing all occasions across brands. '}
          Turn on <b>auto-draft</b> to have a draft queued ahead of a date; <b>sensitive</b> ones notify you first instead.
        </span>
      </div>

      {occasions.length === 0 ? (
        <div className="panel blank"><div className="fleuron">❧</div><div className="bt">No occasions.</div><div className="bd">Add one, or the recurring built-ins seed automatically on the next worker run.</div></div>
      ) : (
        <div className="occ-list">
          {occasions.map((o) => (
            <div className={`occ-row ${o.auto_draft ? 'on' : ''}`} key={o.id}>
              <div className="occ-when">
                <div className="occ-date">{fmtDate(o.next_date)}</div>
                <div className="occ-count">{countdown(o.days_until)}</div>
              </div>
              <div className="occ-main">
                <div className="occ-name">
                  {o.name}
                  {o.sensitive ? <span className="occ-badge occ-sensitive">sensitive</span> : null}
                  {o.region ? <span className="occ-badge occ-region">{o.region}</span> : null}
                  {o.brand && o.brand !== 'all' ? <span className="occ-badge">{o.brand}</span> : <span className="occ-badge occ-all">all brands</span>}
                  {o.source === 'builtin' ? <span className="occ-badge occ-builtin">built-in</span> : null}
                </div>
                <div className="occ-rule">{ruleText(o.rule)} · {o.auto_draft ? `auto-drafts ${o.lead_days}d ahead` : 'calendar only'}</div>
              </div>
              <div className="occ-acts">
                <button className={`occ-toggle ${o.auto_draft ? 'is-on' : ''}`} onClick={() => patch(o, { auto_draft: o.auto_draft ? 0 : 1 })} title="Auto-draft ahead of this date">
                  {o.auto_draft ? '◉ auto-draft' : '○ auto-draft'}
                </button>
                <button className={`occ-toggle ${o.sensitive ? 'is-warn' : ''}`} onClick={() => patch(o, { sensitive: o.sensitive ? 0 : 1 })} title="Notify first instead of auto-drafting">
                  {o.sensitive ? '◉ sensitive' : '○ sensitive'}
                </button>
                <button className="btn btn--sm" onClick={() => openEdit(o)}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(o)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-bar"><span className="led" /> {editing.id ? 'edit occasion' : 'new occasion'}</div>
            <div className="modal-body">
              <h3>{editing.id ? 'Edit occasion' : 'New occasion'}</h3>
              <form onSubmit={save} className="field-stack">
                <input className="input" placeholder="name * (e.g. Mother's Day, our launch day)" value={editing.name} onChange={set('name')} autoFocus />

                <div className="field-row">
                  <label className="occ-field">
                    <span>Applies to</span>
                    <select className="input" value={editing.brand} onChange={set('brand')}>
                      <option value="all">All brands</option>
                      {brand ? <option value={brand}>{brand} only</option> : null}
                    </select>
                  </label>
                  <label className="occ-field">
                    <span>When</span>
                    <select className="input" value={editing.mode} onChange={set('mode')}>
                      <option value="fixed">A fixed date</option>
                      <option value="nth">A recurring weekday</option>
                    </select>
                  </label>
                </div>

                {editing.mode === 'fixed' ? (
                  <div className="field-row">
                    <label className="occ-field"><span>Month</span>
                      <select className="input" value={editing.month} onChange={set('month')}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
                    </label>
                    <label className="occ-field"><span>Day</span>
                      <input className="input" type="number" min="1" max="31" value={editing.day} onChange={set('day')} />
                    </label>
                  </div>
                ) : (
                  <div className="field-row">
                    <label className="occ-field"><span>Which</span>
                      <select className="input" value={editing.n} onChange={set('n')}>{NTH.map((n) => <option key={n.v} value={n.v}>{n.l}</option>)}</select>
                    </label>
                    <label className="occ-field"><span>Weekday</span>
                      <select className="input" value={editing.weekday} onChange={set('weekday')}>{WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}</select>
                    </label>
                    <label className="occ-field"><span>Of</span>
                      <select className="input" value={editing.month} onChange={set('month')}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
                    </label>
                  </div>
                )}

                <div className="field-row">
                  <label className="occ-field"><span>Lead time (days ahead to draft)</span>
                    <input className="input" type="number" min="1" max="120" value={editing.lead_days} onChange={set('lead_days')} />
                  </label>
                  <label className="occ-field"><span>Region (optional)</span>
                    <input className="input" placeholder="e.g. ZA" value={editing.region} onChange={set('region')} />
                  </label>
                </div>

                <label className="check"><input type="checkbox" checked={!!editing.auto_draft} onChange={tog('auto_draft')} /> Auto-draft ahead of this date (lands in the approval queue — never auto-posts)</label>
                <label className="check"><input type="checkbox" checked={!!editing.sensitive} onChange={tog('sensitive')} /> Sensitive — notify me first instead of auto-drafting</label>

                <div className="modal-acts">
                  <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save occasion'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
