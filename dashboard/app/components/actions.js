'use client';
import { useState, useRef } from 'react';
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
  const [withVideo, setWithVideo] = useState(false);
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
    const { ok, data } = await post('/api/jobs/new', { topic, brand, withImage: withImage || withVideo, withVideo, platforms });
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
                <div className="field-row">
                  <label className="check"><input type="checkbox" checked={withImage || withVideo} disabled={withVideo} onChange={(e) => setWithImage(e.target.checked)} /> + image</label>
                  <label className="check"><input type="checkbox" checked={withVideo} onChange={(e) => setWithVideo(e.target.checked)} /> + video <span className="empty" style={{ marginLeft: 4 }}>(branded clip)</span></label>
                </div>
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

export function ScheduleButton({ jobId, channel }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e?.preventDefault();
    if (!when) { ui.toast('Pick a date & time', 'err'); return; }
    setBusy(true);
    const iso = new Date(when).toISOString(); // datetime-local is browser-local -> ISO/UTC
    const { ok, data } = await post('/api/schedule', { jobId, when: iso });
    if (ok) { ui.toast(`Scheduled for ${data.scheduledAt.replace('T', ' ').slice(0, 16)} UTC`); window.location.reload(); return; }
    ui.toast(data.error || 'Schedule failed', 'err'); setBusy(false);
  }
  return (
    <>
      <button className="btn btn--ghost" onClick={() => setOpen(true)}>Schedule</button>
      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-bar"><span className="led" /> schedule</div>
            <div className="modal-body">
              <h3>Schedule this post</h3>
              <p>Hands it to Postiz's queue to post automatically to {channel || 'the connected channel'} at your chosen time.</p>
              <form onSubmit={go} className="field-stack">
                <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                <div className="modal-acts">
                  <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={busy || !when}>{busy ? 'Scheduling…' : 'Schedule'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
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

export function UploadMediaButton({ jobId }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`/api/jobs/${jobId}/media`, { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { ui.toast(`Your ${data.kind} is attached — sized per platform`); window.location.reload(); return; }
      ui.toast(data.error || 'Upload failed', 'err');
    } catch { ui.toast('Upload failed', 'err'); }
    setBusy(false);
    if (ref.current) ref.current.value = '';
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={onPick} />
      <button className="btn btn--ghost" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Uploading…' : '↑ Use your own media'}
      </button>
    </>
  );
}

export function LogoutButton() {
  async function out() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }
  return <button className="btn btn--ghost" onClick={out}>Sign out</button>;
}
