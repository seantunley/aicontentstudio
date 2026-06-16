'use client';
import { useState, useMemo } from 'react';
import { useUI } from './ui';

// The full tab list: the editable groups (from the schema) plus three special, mostly read-only tabs.
const SPECIAL = [
  { id: 'integrations', label: 'Integrations & Keys' },
  { id: 'account', label: 'Account' },
  { id: 'system', label: 'System' },
];

function Toggle({ on, onChange, id }) {
  return (
    <button type="button" role="switch" aria-checked={on} id={id}
            className={`tgl ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span className="tgl-knob" />
    </button>
  );
}

function Field({ field, value, onChange }) {
  const isBool = field.type === 'bool';
  return (
    <div className={`set-row ${isBool ? 'set-row--bool' : ''}`}>
      <div className="set-row-main">
        <label className="set-label" htmlFor={`f_${field.key}`}>{field.label}</label>
        {field.help ? <div className="set-help">{field.help}</div> : null}
      </div>
      <div className="set-row-ctrl">
        {isBool ? (
          <Toggle id={`f_${field.key}`} on={value === 'true' || value === true}
                  onChange={(v) => onChange(field.key, v ? 'true' : 'false')} />
        ) : (
          <input id={`f_${field.key}`} className="input"
                 type={field.type === 'number' ? 'number' : 'text'} step="any"
                 value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)} />
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
        <div className="set-grouphead">Storage</div>
        <div className="set-status-detail">Studio database: <span className="kbd">{system.dbPath}</span> (SQLite, WAL mode — shared by the worker and this cockpit).</div>
      </div>
    </>
  );
}

export function SettingsPanel({ tabs, values, integrations, system }) {
  const ui = useUI();
  const allTabs = useMemo(() => [...tabs.map((t) => ({ id: t.id, label: t.label })), ...SPECIAL], [tabs]);
  const [active, setActive] = useState(allTabs[0]?.id);
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
            {t.label}
          </button>
        ))}
      </nav>

      <div className="set-body">
        {editableTab && (
          <div className="panel set-panel">
            <div className="set-grouphead">{editableTab.label}</div>
            <div className="set-fields">
              {editableTab.fields.map((f) => (
                <Field key={f.key} field={f} value={vals[f.key]} onChange={onChange} />
              ))}
            </div>
          </div>
        )}
        {active === 'integrations' && <IntegrationsTab integrations={integrations} />}
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
