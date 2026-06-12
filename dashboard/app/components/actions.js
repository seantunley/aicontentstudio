'use client';
import { useState } from 'react';
import { useUI } from './ui';

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

export function NewJobButton({ block }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [brand, setBrand] = useState('');
  const [withImage, setWithImage] = useState(false);
  const [channels, setChannels] = useState(null); // null = loading
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);

  async function load() {
    setOpen(true);
    if (channels) return;
    try {
      const r = await fetch('/api/channels');
      const d = await r.json();
      const chans = d.channels || [];
      setChannels(chans);
      const sel = {};
      chans.forEach((c) => { sel[c.platform] = true; }); // default: all connected selected
      setSelected(sel);
    } catch { setChannels([]); }
  }
  const toggle = (p) => setSelected((s) => ({ ...s, [p]: !s[p] }));

  async function submit(e) {
    e?.preventDefault();
    if (!topic.trim()) return;
    const platforms = Object.keys(selected).filter((p) => selected[p]);
    if (channels && channels.length && !platforms.length) { ui.toast('Pick at least one platform', 'err'); return; }
    setBusy(true);
    const { ok, data } = await post('/api/jobs/new', { topic, brand, withImage, platforms });
    if (ok) { ui.toast('Job queued — researching in the background'); window.location.href = '/'; return; }
    ui.toast(data.error || 'Failed to queue', 'err'); setBusy(false);
  }

  return (
    <>
      <button className={`btn btn--primary cta ${block ? 'btn--block' : ''}`} onClick={load}>+ New job</button>
      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-bar"><span className="led" /> commission</div>
            <div className="modal-body">
              <h3>Start a new job</h3>
              <p>Researches, drafts a tailored post for each platform you pick, optionally generates an image, then lands in your queue.</p>
              <form onSubmit={submit} className="field-stack">
                <input className="input" autoFocus placeholder="topic — e.g. 'latch tips for newborns'"
                       value={topic} onChange={(e) => setTopic(e.target.value)} />
                <input className="input" placeholder="brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
                <div>
                  <div className="card-foot" style={{ margin: '2px 0 7px' }}>PLATFORMS</div>
                  {channels === null ? (
                    <span className="empty">loading channels…</span>
                  ) : channels.length === 0 ? (
                    <span className="empty">No channels connected in Postiz yet.</span>
                  ) : (
                    <div className="field-row">
                      {channels.map((c) => (
                        <label key={c.platform} className="check">
                          <input type="checkbox" checked={!!selected[c.platform]} onChange={() => toggle(c.platform)} /> {c.platform}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <label className="check"><input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} /> + image</label>
                <div className="modal-acts">
                  <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={busy || !topic.trim()}>{busy ? 'Queuing…' : 'Start job'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ApprovalActions({ jobId }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function act(kind) {
    if (kind === 'reject') {
      const ok = await ui.confirm({ title: 'Reject this job?', message: 'It will be cancelled and leave the queue.', confirmLabel: 'Reject', danger: true, tag: 'reject' });
      if (!ok) return;
    }
    setBusy(true);
    const { ok, data } = await post('/api/' + kind, { jobId });
    if (ok) { ui.toast(kind === 'approve' ? 'Approved — ready to publish' : 'Rejected'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  return (
    <div className="actions">
      <button className="btn btn--approve" disabled={busy} onClick={() => act('approve')}>Approve</button>
      <button className="btn btn--reject" disabled={busy} onClick={() => act('reject')}>Reject</button>
    </div>
  );
}

export function PublishButton({ jobId, channel }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function go() {
    const ok = await ui.confirm({
      title: 'Publish live?',
      message: `This posts publicly to ${channel || 'the connected channel'} right now via Postiz.`,
      confirmLabel: 'Publish live', tag: 'publish',
    });
    if (!ok) return;
    setBusy(true);
    const { ok: done, data } = await post('/api/publish', { jobId });
    if (done) { ui.toast(`Published to ${data.channel || 'channel'}${data.with_image ? ' (with image)' : ''}`); window.location.reload(); return; }
    ui.toast(data.error || 'Publish failed', 'err'); setBusy(false);
  }
  return <div className="actions"><button className="btn btn--primary" disabled={busy} onClick={go}>{busy ? 'Publishing…' : 'Publish live'}</button></div>;
}

export function RetryButton({ jobId }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { ok, data } = await post('/api/jobs/retry', { jobId });
    if (ok) { ui.toast('Re-queued'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  return <button className="btn" disabled={busy} onClick={go}>Retry</button>;
}

export function EditableDraft({ draftId, body, limit }) {
  const ui = useUI();
  const [text, setText] = useState(body);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { ok, data } = await post('/api/draft', { draftId, text });
    if (ok) { ui.toast('Draft saved'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  if (!editing) {
    return (
      <>
        <div className="draft-body">{body}</div>
        <div className="actions"><button className="btn" onClick={() => setEditing(true)}>Edit</button></div>
      </>
    );
  }
  const over = limit && text.length > limit;
  return (
    <>
      <textarea className="ta" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="card-foot" style={over ? { color: 'var(--red)' } : null}>{text.length}{limit ? '/' + limit : ''} chars</div>
      <div className="actions">
        <button className="btn btn--primary" disabled={busy || over} onClick={save}>Save</button>
        <button className="btn btn--ghost" onClick={() => { setText(body); setEditing(false); }}>Cancel</button>
      </div>
    </>
  );
}

export function LogoutButton() {
  async function out() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }
  return <button className="btn btn--ghost" onClick={out}>Sign out</button>;
}
