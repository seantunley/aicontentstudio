'use client';
import { useState, useMemo, useEffect } from 'react';
import { useUI } from './ui';
import { EDITABLE_TABS } from '@/lib/settingsSchema';

// The full tab list: the editable groups (from the schema) plus three special, mostly read-only tabs.
const SPECIAL = [
  { id: 'integrations', label: 'Integrations & Keys' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'account', label: 'Account' },
  { id: 'system', label: 'System' },
];

const yn = (b) => (b ? <span className="reg-yes">✓</span> : <span className="dim">·</span>);

function PlatformsTab({ registry }) {
  const rows = registry?.rows || [];
  return (
    <div className="panel set-panel">
      <div className="set-grouphead">Platform capability registry</div>
      <p className="set-blurb">
        Read-only — the per-platform rules the studio validates every draft against.{' '}
        {registry?.live
          ? 'These are the live values the worker published (source of truth).'
          : 'Showing the dashboard mirror — run the worker once to display the live values.'}{' '}
        To change them, edit <span className="kbd">registry.py</span> / <span className="kbd">db.py</span>: they mirror real platform limits, so a wrong value here would break posting.
      </p>
      {rows.length === 0 ? <div className="empty">No registry data.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr>
              <th>Platform</th>
              <th style={{ textAlign: 'right' }}>Caption max</th>
              <th style={{ textAlign: 'right' }}>Album max</th>
              <th>Carousel</th><th>Video</th><th>Alt-text</th>
              <th className="hide-sm">Image</th><th className="hide-sm">Video size</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><span className="reg-dot" style={{ background: r.color }} />{r.label}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{typeof r.captionMax === 'number' ? r.captionMax.toLocaleString() : (r.captionMax ?? '—')}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{r.mediaMax ?? '—'}</td>
                  <td>{yn(r.carousel)}</td>
                  <td>{yn(r.video)}</td>
                  <td>{r.altText == null ? <span className="dim">?</span> : yn(r.altText)}</td>
                  <td className="hide-sm id">{r.image}</td>
                  <td className="hide-sm id">{r.videoDims}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, id }) {
  return (
    <button type="button" role="switch" aria-checked={on} id={id}
            className={`tgl ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="tgl-knob" />
    </button>
  );
}

// Resolve a select/multiselect's options: static field.options, or a dynamic list keyed by optionsKey
// (e.g. the country list). Each option normalises to { value, label }.
function optList(field, options) {
  const raw = field.options || (options && options[field.optionsKey]) || [];
  return raw.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

function Field({ field, value, onChange, options }) {
  const isBool = field.type === 'bool';
  const lbl = <><label className="set-label" htmlFor={`f_${field.key}`}>{field.label}</label>{field.help ? <div className="set-help">{field.help}</div> : null}</>;

  if (field.type === 'textarea') {
    return (
      <div className="set-row set-row--stack">
        <div className="set-row-main">{lbl}</div>
        <textarea id={`f_${field.key}`} className="ta" rows={3} value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)} />
      </div>
    );
  }

  if (field.type === 'multiselect') {
    const opts = optList(field, options);
    const set = new Set(String(value || '').split(',').map((s) => s.trim()).filter(Boolean));
    const toggle = (v) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); onChange(field.key, [...n].join(',')); };
    return (
      <div className="set-row set-row--stack">
        <div className="set-row-main">{lbl}</div>
        <div className="set-checks">
          {opts.map((o) => (
            <label key={o.value} className="check"><input type="checkbox" checked={set.has(o.value)} onChange={() => toggle(o.value)} /> {o.label}</label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`set-row ${isBool ? 'set-row--bool' : ''}`}>
      <div className="set-row-main">{lbl}</div>
      <div className="set-row-ctrl">
        {isBool ? (
          <Toggle id={`f_${field.key}`} on={value === 'true' || value === true} onChange={(v) => onChange(field.key, v ? 'true' : 'false')} />
        ) : field.type === 'select' ? (
          <select id={`f_${field.key}`} className="input set-select" value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)}>
            {!optList(field, options).some((o) => o.value === (value ?? '')) && <option value={value ?? ''}>{value || '— select —'}</option>}
            {optList(field, options).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input id={`f_${field.key}`} className="input" type={field.type === 'number' ? 'number' : 'text'} step="any" value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)} />
        )}
      </div>
    </div>
  );
}

function StatusDot({ ok }) {
  return <span className={`sdot ${ok ? 'on' : 'off'}`} title={ok ? 'configured' : 'not set'} />;
}

function AccountTab() {
  const ui = useUI();
  const [cur, setCur] = useState('');
  const [nx, setNx] = useState('');
  const [cf, setCf] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (nx.length < 8) { ui.toast('New password must be at least 8 characters.', 'err'); return; }
    if (nx !== cf) { ui.toast('New passwords do not match.', 'err'); return; }
    setBusy(true);
    const r = await fetch('/api/account/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: cur, next: nx }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { ui.toast('Password changed.'); setCur(''); setNx(''); setCf(''); }
    else ui.toast(d.error || 'Failed to change password.', 'err');
  }

  return (
    <div className="panel set-panel">
      <div className="set-grouphead">Operator password</div>
      <p className="set-blurb">Single-operator login for the cockpit. The new password is bcrypt-hashed and stored in the studio database; the plaintext is never saved, and your username comes from the environment.</p>
      <form onSubmit={save} className="field-stack" style={{ maxWidth: 420 }}>
        <input className="input" type="password" placeholder="current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        <input className="input" type="password" placeholder="new password (min 8 chars)" value={nx} onChange={(e) => setNx(e.target.value)} autoComplete="new-password" />
        <input className="input" type="password" placeholder="confirm new password" value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="new-password" />
        <div className="modal-acts" style={{ marginTop: 2 }}>
          <button type="submit" className="btn btn--primary" disabled={busy || !cur || !nx}>{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </div>
  );
}

function IntegrationsTab({ integrations }) {
  return (
    <div className="panel set-panel">
      <div className="set-grouphead">Engines &amp; connections</div>
      <p className="set-blurb">Status of the services wired into the studio. <strong>No secret values are shown here</strong> — they live in the gitignored <span className="kbd">.env</span> files and are edited there, then the relevant container is restarted.</p>
      <div className="set-status-list">
        {integrations.map((it) => (
          <div className="set-status" key={it.label}>
            <StatusDot ok={it.ok} />
            <div className="set-status-main">
              <div className="set-status-name">{it.label}</div>
              <div className="set-status-detail">
                {it.detail}{it.extra ? <span className="dim"> · {it.extra}</span> : null}
              </div>
            </div>
            <span className={`badge ${it.ok ? 'badge--approved' : 'badge--failed'}`}>{it.ok ? 'connected' : 'not set'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemTab({ system }) {
  return (
    <>
      <div className="panel set-panel">
        <div className="set-grouphead">Publishing safety</div>
        <p className="set-blurb">
          Dry-run is controlled by <span className="kbd">STUDIO_DRY_RUN</span> in <span className="kbd">compose.yml</span>, not from this page — deliberately, so live posting is never a single web click. To go live, set it to <span className="kbd">false</span> and restart the hermes container.
        </p>
      </div>
      <div className="panel set-panel">
        <div className="set-grouphead">Worker &amp; generation (set in the environment)</div>
        <p className="set-blurb">These run inside the worker and renderer containers, so they&rsquo;re shown for reference rather than edited here.</p>
        <div className="set-status-list">
          {system.workerEnv.map((w) => (
            <div className="set-ref" key={w.label}>
              <div className="set-status-name">{w.label}</div>
              <div className="set-status-detail">{w.controls}</div>
              <div className="set-where">↳ {w.where}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel set-panel">
        <div className="set-grouphead">Storage &amp; environment</div>
        <div className="set-status-detail" style={{ marginBottom: 6 }}>Studio database: <span className="kbd">{system.dbPath}</span> (SQLite, WAL — shared by the worker and this cockpit).</div>
        <div className="set-status-detail" style={{ marginBottom: 6 }}>Knowledge base: <span className="kbd">{system.knowledgeDir}</span></div>
        <div className="set-status-detail">Display timezone: <span className="kbd">{system.timezone}</span> — fixed; per-operator timezone is a future enhancement.</div>
      </div>
    </>
  );
}

function UsersTab({ me }) {
  const ui = useUI();
  const [users, setUsers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: '', name: '', email: '', password: '', role: 'operator' });
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/users').then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault(); setBusy(true);
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json(); setBusy(false);
    if (r.ok) { ui.toast('Operator added'); setForm({ username: '', name: '', email: '', password: '', role: 'operator' }); setAdding(false); load(); }
    else ui.toast(d.error || 'Failed', 'err');
  }
  async function patch(id, body, msg) {
    const r = await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { ui.toast(msg || 'Updated'); load(); } else ui.toast((await r.json().catch(() => ({}))).error || 'Failed', 'err');
  }
  async function del(u) {
    const ok = await ui.confirm({ title: `Remove ${u.username}?`, message: 'They lose access immediately.', danger: true, confirmLabel: 'Remove', tag: 'delete' });
    if (!ok) return;
    const r = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    if (r.ok) { ui.toast('Removed'); load(); }
  }
  function resetPw(u) {
    const pw = typeof window !== 'undefined' ? window.prompt(`New password for ${u.username} (min 8 chars):`) : '';
    if (!pw) return;
    if (pw.length < 8) { ui.toast('Too short (min 8)', 'err'); return; }
    patch(u.id, { password: pw }, 'Password reset');
  }

  return (
    <div className="panel set-panel">
      <div className="set-grouphead">Operators</div>
      <p className="set-blurb">Everyone who can sign in. <strong>Admins</strong> manage users + worker/system settings; <strong>operators</strong> run the desk. Your bootstrap login always works as a fallback, so you can&rsquo;t lock yourself out.</p>
      {users === null ? <div className="empty">Loading…</div> : (
        <div className="set-status-list">
          {users.length === 0 ? <div className="empty" style={{ marginBottom: 10 }}>No added operators yet — just your bootstrap login.</div> : users.map((u) => (
            <div className="set-status" key={u.id}>
              <span className="av" style={{ width: 26, height: 26 }}>{(u.name || u.username)[0].toUpperCase()}</span>
              <div className="set-status-main">
                <div className="set-status-name">{u.name || u.username} {me?.username === u.username ? <span className="dim">· you</span> : null} {!u.active ? <span className="badge badge--failed">disabled</span> : null}</div>
                <div className="set-status-detail">@{u.username}{u.email ? ` · ${u.email}` : ''} · {u.role}</div>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                <button className="btn btn--sm" onClick={() => patch(u.id, { role: u.role === 'admin' ? 'operator' : 'admin' }, 'Role changed')}>{u.role === 'admin' ? '→ operator' : '→ admin'}</button>
                <button className="btn btn--sm" onClick={() => resetPw(u)}>Reset pw</button>
                <button className="btn btn--sm" onClick={() => patch(u.id, { active: u.active ? 0 : 1 }, u.active ? 'Disabled' : 'Enabled')}>{u.active ? 'Disable' : 'Enable'}</button>
                <button className="btn btn--ghost btn--sm" onClick={() => del(u)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <form onSubmit={add} className="field-stack" style={{ marginTop: 14, maxWidth: 440 }}>
          <input className="input" placeholder="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" autoFocus />
          <div className="field-row">
            <input className="input" style={{ flex: 1 }} placeholder="display name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" style={{ flex: 1 }} placeholder="email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <input className="input" type="password" placeholder="password (min 8 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          <label className="check"><input type="checkbox" checked={form.role === 'admin'} onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'operator' })} /> Admin (manage users + system settings)</label>
          <div className="modal-acts">
            <button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={busy || !form.username || !form.password}>{busy ? 'Adding…' : 'Add operator'}</button>
          </div>
        </form>
      ) : <div className="actions" style={{ marginTop: 12 }}><button className="btn btn--primary btn--sm" onClick={() => setAdding(true)}>+ Add operator</button></div>}
    </div>
  );
}

export function SettingsPanel({ tabs, values, integrations, system, registry, me, options, initialTab }) {
  const ui = useUI();
  const allTabs = useMemo(() => {
    const special = [...SPECIAL];
    if (me?.role === 'admin') special.splice(2, 0, { id: 'users', label: 'Users' }); // after Platforms
    return [...tabs.map((t) => ({ id: t.id, label: t.label, tier: t.tier })), ...special];
  }, [tabs, me]);
  const [active, setActive] = useState(initialTab || allTabs[0]?.id);
  const [vals, setVals] = useState(values);
  const [baseline, setBaseline] = useState(values);
  const [busy, setBusy] = useState(false);

  const onChange = (key, v) => setVals((s) => ({ ...s, [key]: v }));
  const dirtyKeys = useMemo(
    () => Object.keys(vals).filter((k) => String(vals[k] ?? '') !== String(baseline[k] ?? '')),
    [vals, baseline],
  );
  const dirty = dirtyKeys.length > 0;

  async function save() {
    setBusy(true);
    const patch = Object.fromEntries(dirtyKeys.map((k) => [k, vals[k]]));
    const r = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      const merged = { ...vals, ...(d.values || {}) };
      setVals(merged); setBaseline(merged);
      ui.toast(`Saved ${d.saved?.length || dirtyKeys.length} setting${(d.saved?.length || 1) === 1 ? '' : 's'}.`);
    } else ui.toast(d.error || 'Failed to save.', 'err');
  }
  function reset() { setVals(baseline); }

  const editableTab = tabs.find((t) => t.id === active);

  return (
    <div className="set-wrap">
      <nav className="set-tabs">
        {allTabs.map((t) => (
          <button key={t.id} className={`set-tab ${active === t.id ? 'active' : ''}`} onClick={() => setActive(t.id)}>
            {t.label}{t.tier === 'admin' ? <span className="set-tab-tag">admin</span> : null}
          </button>
        ))}
      </nav>

      <div className="set-body">
        {editableTab && (
          <div className="panel set-panel">
            <div className="set-grouphead">{editableTab.label}</div>
            <div className="set-fields">
              {editableTab.fields.map((f) => (
                <Field key={f.key} field={f} value={vals[f.key]} onChange={onChange} options={options} />
              ))}
            </div>
          </div>
        )}
        {active === 'integrations' && <IntegrationsTab integrations={integrations} />}
        {active === 'platforms' && <PlatformsTab registry={registry} />}
        {active === 'users' && <UsersTab me={me} />}
        {active === 'account' && <AccountTab />}
        {active === 'system' && <SystemTab system={system} />}
      </div>

      {dirty && editableTab && (
        <div className="set-savebar">
          <span className="set-savemsg">{dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}</span>
          <div className="actions">
            <button className="btn btn--ghost" onClick={reset} disabled={busy}>Discard</button>
            <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// The Settings panel as a top-right modal. Fetches everything (values + status) in one call when opened.
export function SettingsModal({ open, onClose, initialTab }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) { setData(null); setErr(null); return; }
    let live = true;
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d.error) setErr(d.error); else setData(d);
    }).catch(() => { if (live) setErr('Failed to load settings'); });
    return () => { live = false; };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-bar"><span className="led" /> settings
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body modal-body--scroll">
          {err ? <div className="empty" style={{ padding: 24 }}>{err}</div>
            : !data ? <div className="empty" style={{ padding: 48 }}>Loading settings…</div>
            : <SettingsPanel tabs={EDITABLE_TABS} values={data.values} integrations={data.integrations} system={data.system} registry={data.registry} me={data.me} options={data.options} initialTab={initialTab} />}
        </div>
      </div>
    </div>
  );
}
