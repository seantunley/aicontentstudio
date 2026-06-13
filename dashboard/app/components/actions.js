'use client';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUI } from './ui';
import { SUPPORTED, PLATFORM_META, PLATFORM_LIMITS } from '@/lib/platforms';

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

// Modal rendered via a portal to <body> so it always centres on screen — never trapped inside a
// transformed/animated ancestor (which is what made the in-card popups "get lost").
function Modal({ bar, danger, onClose, children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-bar ${danger ? 'danger' : ''}`}><span className="led" /> {bar}</div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// Selectable platform tiles with brand icon chips.
function PlatformPicker({ selected, onToggle }) {
  return (
    <div className="ptiles">
      {SUPPORTED.map((p) => {
        const m = PLATFORM_META[p] || { label: p, color: '#555', glyph: p[0] };
        return (
          <button type="button" key={p} className={`ptile ${selected[p] ? 'on' : ''}`} onClick={() => onToggle(p)}>
            <span className="pchip" style={{ background: m.color }}>{m.glyph}</span>
            <span className="ptile-name">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
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
    if (ok) { ui.toast('Job queued. Researching in the background.'); window.location.href = '/'; return; }
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
                <input className="input" autoFocus placeholder="topic, e.g. 'latch tips for newborns'"
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
    if (ok) { ui.toast(kind === 'approve' ? 'Approved. Ready to publish.' : 'Rejected'); window.location.reload(); return; }
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
        <Modal bar="schedule" onClose={() => setOpen(false)}>
          <h3>Schedule this post</h3>
          <p>Hands it to Postiz&apos;s queue to post automatically to {channel || 'the connected channel'} at your chosen time.</p>
          <form onSubmit={go} className="field-stack">
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            <div className="modal-acts">
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={busy || !when}>{busy ? 'Scheduling…' : 'Schedule'}</button>
            </div>
          </form>
        </Modal>
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
      if (r.ok) { ui.toast(`Your ${data.kind} is attached, sized per platform`); window.location.reload(); return; }
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

export function RunScoutButton() {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { ok, data } = await post('/api/scout/run', {});
    if (ok) ui.toast('Scout queued. New ideas land within about 2 min.');
    else ui.toast(data.error || 'Failed', 'err');
    setBusy(false);
  }
  return <button className="btn btn--ghost btn--sm" disabled={busy} onClick={go}>{busy ? 'Queuing…' : '⟳ Run scout now'}</button>;
}

export function SuggestionActions({ id }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({});
  const [withImage, setWithImage] = useState(false);
  const [withVideo, setWithVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = (p) => setSel((s) => ({ ...s, [p]: !s[p] }));

  async function promote() {
    setBusy(true);
    const platforms = Object.keys(sel).filter((p) => sel[p]);
    const { ok, data } = await post('/api/suggestions', { id, action: 'promote', platforms, withImage: withImage || withVideo, withVideo });
    if (ok) { ui.toast('Promoted. Researching now.'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  async function dismiss() {
    const ok = await ui.confirm({ title: 'Dismiss this idea?', message: 'It leaves your ideas list.', confirmLabel: 'Dismiss', danger: true, tag: 'dismiss' });
    if (!ok) return;
    setBusy(true);
    const { ok: done, data } = await post('/api/suggestions', { id, action: 'dismiss' });
    if (done) { ui.toast('Dismissed'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }

  return (
    <>
      <div className="actions">
        <button className="btn btn--approve" onClick={() => setOpen(true)}>Promote to job</button>
        <button className="btn btn--ghost" onClick={dismiss}>Dismiss</button>
      </div>
      {open && (
        <Modal bar="promote" onClose={() => setOpen(false)}>
          <h3>Promote to a job</h3>
          <p>Researches and drafts this idea. Pick the platforms. Tick <b>YouTube</b> for a long-form post. Leave all off to use your connected channels. <span className="dim">(Drafting works for any platform; publishing needs it connected in Postiz.)</span></p>
          <PlatformPicker selected={sel} onToggle={toggle} />
          <div className="field-row" style={{ marginTop: 12 }}>
            <label className="check"><input type="checkbox" checked={withImage || withVideo} disabled={withVideo} onChange={(e) => setWithImage(e.target.checked)} /> + image</label>
            <label className="check"><input type="checkbox" checked={withVideo} onChange={(e) => setWithVideo(e.target.checked)} /> + video</label>
          </div>
          <div className="modal-acts">
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn--primary" disabled={busy} onClick={promote}>{busy ? 'Promoting…' : 'Promote'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

const DOW = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];
const fmtWhen = (s) => (s ? s.replace('T', ' ').slice(0, 16) + ' UTC' : 'never');

export function ScoutSchedule({ schedule }) {
  const ui = useUI();
  const [days, setDays] = useState(new Set((schedule?.days || '').split(',').filter(Boolean)));
  const [time, setTime] = useState(`${String(schedule?.hour ?? 7).padStart(2, '0')}:${String(schedule?.minute ?? 0).padStart(2, '0')}`);
  const [enabled, setEnabled] = useState(!!schedule?.enabled);
  const [busy, setBusy] = useState(false);
  const toggleDay = (d) => setDays((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });

  async function save() {
    setBusy(true);
    const [h, m] = time.split(':').map(Number);
    const dayList = DOW.map(([d]) => d).filter((d) => days.has(d));
    const { ok, data } = await post('/api/scout/schedule', { days: dayList, hour: h, minute: m, enabled: enabled && dayList.length > 0 });
    if (ok) { ui.toast('Scout schedule saved'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }

  const nextRun = (() => {
    const sel = DOW.map(([d]) => Number(d)).filter((d) => days.has(String(d)));
    if (!enabled || !sel.length) return 'paused';
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    for (let ahead = 0; ahead < 8; ahead++) {
      const dt = new Date(now); dt.setDate(now.getDate() + ahead); dt.setHours(h, m, 0, 0);
      const iso = dt.getDay() === 0 ? 7 : dt.getDay();
      if (sel.includes(iso) && dt >= now) return `${DOW.find(([d]) => Number(d) === iso)[1]} ${time}`;
    }
    return '—';
  })();

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="card-foot">AUTO-SCOUT SCHEDULE</div>
        <div className="actions" style={{ margin: 0 }}>
          <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> enabled</label>
          <RunScoutButton />
        </div>
      </div>
      <div className="dow">
        {DOW.map(([d, label]) => (
          <button type="button" key={d} className={`dow-pill ${days.has(d) ? 'on' : ''}`} onClick={() => toggleDay(d)}>{label}</button>
        ))}
      </div>
      <div className="row-between" style={{ marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
        <label className="sched-time">at <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 'auto' }} /> <span className="dim">SAST</span></label>
        <button className="btn btn--primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save schedule'}</button>
      </div>
      <div className="card-foot" style={{ marginTop: 12 }}>Next run: <b style={{ color: 'var(--text)' }}>{nextRun}</b> · last run {fmtWhen(schedule?.last_run_at)}</div>
    </div>
  );
}

export function NicheManager({ niches }) {
  const ui = useUI();
  const [brand, setBrand] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  async function add(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    const { ok, data } = await post('/api/niches', { action: 'add', brand, query });
    if (ok) { ui.toast('Niche added'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  async function remove(id) {
    const { ok, data } = await post('/api/niches', { action: 'remove', id });
    if (ok) { window.location.reload(); return; }
    ui.toast(data.error || 'Failed to remove', 'err');
  }
  return (
    <div className="card">
      <div className="card-foot" style={{ marginBottom: 8 }}>SCOUT NICHES · what the scout looks for</div>
      {niches.length === 0 ? <div className="empty" style={{ marginBottom: 10 }}>No niches yet. Add one and the scout will hunt ideas for it.</div> : (
        <div className="field-stack" style={{ marginBottom: 12 }}>
          {niches.map((n) => (
            <div key={n.id} className="row-between">
              <span><b>{n.brand}</b> · {n.query}</span>
              <button className="btn btn--ghost btn--sm" onClick={() => remove(n.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={add} className="field-row">
        <input className="input" style={{ flex: '0 1 140px' }} placeholder="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        <input className="input" style={{ flex: '1 1 200px' }} placeholder="niche / topic area, e.g. 'newborn sleep'" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={busy || !query.trim()}>Add</button>
      </form>
    </div>
  );
}

export function LogoutButton() {
  async function out() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }
  return <button className="btn btn--ghost" onClick={out}>Sign out</button>;
}

// Collapsible approval-queue row. Collapsed: topic, platforms, the post's first line, job id.
// Expanded: the full post, media preview, polish pills, and approve/reject.
export function QueueItem({ job }) {
  const [open, setOpen] = useState(false);
  const d = job.draft;
  const platforms = (job.target_platforms ? job.target_platforms.split(',') : d ? [d.platform] : [])
    .map((p) => p.trim()).filter(Boolean);
  const firstLine = d?.body ? (d.body.split('\n').map((s) => s.trim()).find(Boolean) || '') : '';
  const lim = d ? PLATFORM_LIMITS[d.platform] : null;
  return (
    <div className={`qcard ${open ? 'open' : ''}`}>
      <button type="button" className="qcard-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="qcard-caret">{open ? '▾' : '▸'}</span>
        <div className="qcard-main">
          <div className="qcard-topic">{job.topic}</div>
          {firstLine ? <div className="qcard-title">{firstLine}</div> : null}
        </div>
        <div className="qcard-meta">
          {platforms.map((p) => <span key={p} className="plat">{p}</span>)}
          <span className="qcard-id">{job.id.slice(0, 8)}</span>
        </div>
      </button>
      {open && (
        <div className="qcard-body">
          {d ? (
            <>
              <div className="draft-body">{d.body}</div>
              {d.video_path
                ? <video className="draft-img" src={d.video_path} controls muted playsInline />
                : d.image_path ? <img className="draft-img" src={d.image_path} alt="" /> : null}
              <div className="card-foot" style={lim && d.char_count > lim ? { color: 'var(--red)' } : null}>
                {d.char_count}{lim ? `/${lim}` : ''} chars · angle {d.angle || '—'} · brand {job.brand}
              </div>
              <PostPills polish={d.polish_json} />
            </>
          ) : <div className="empty">No draft yet.</div>}
          <ApprovalActions jobId={job.id} />
        </div>
      )}
    </div>
  );
}

// Pills on a post preview showing what each polish skill changed (marketing-psychology + humanizer).
// `polish` is the draft's polish_json string: [{skill, before, after, notes}, ...].
const PILL_KEY = { 'Marketing psychology': 'psych', 'Humanized': 'human' };
export function PostPills({ polish }) {
  const [open, setOpen] = useState(null);
  let steps = [];
  try { steps = polish ? JSON.parse(polish) : []; } catch { steps = []; }
  if (!steps.length) return null;
  const s = open != null ? steps[open] : null;
  return (
    <div className="pills">
      <div className="pills-row">
        <span className="pills-lab">edited by</span>
        {steps.map((st, i) => (
          <button key={i} type="button" className={`pill pill--${PILL_KEY[st.skill] || 'x'} ${open === i ? 'on' : ''}`}
                  onClick={() => setOpen(open === i ? null : i)}>
            {st.skill}
          </button>
        ))}
      </div>
      {s && (
        <div className="pill-panel">
          <div className="pill-note">{s.notes || 'Rewritten to fit the skill.'}</div>
          <div className="pill-diff">
            <div className="pd-col pd-before"><span className="pd-lab">before</span><span className="pd-text">{s.before}</span></div>
            <div className="pd-col pd-after"><span className="pd-lab">after</span><span className="pd-text">{s.after}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
