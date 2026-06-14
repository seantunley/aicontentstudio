'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useUI } from './ui';
import { SUPPORTED, PLATFORM_META, PLATFORM_LIMITS, PLATFORM_ICON } from '@/lib/platforms';
import { za } from '@/lib/time';

// Brand logo (24x24 svg path) tinted to the platform colour. Falls back to nothing if unknown.
function PlatformLogo({ platform, size = 14 }) {
  const d = PLATFORM_ICON[platform];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flex: 'none' }}>
      <path d={d} />
    </svg>
  );
}

// A coloured platform chip (brand-badged logo + name) for the approval/preview screens.
export function PlatformChip({ platform }) {
  const m = PLATFORM_META[platform] || { label: platform, color: 'var(--muted)' };
  return (
    <span className="plat">
      <span className="plat-logo" style={{ background: m.color }}><PlatformLogo platform={platform} size={11} /></span>
      <span className="plat-name">{m.label}</span>
    </span>
  );
}

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

// Selectable platform tiles with brand logo chips.
export function PlatformPicker({ selected, onToggle }) {
  return (
    <div className="ptiles">
      {SUPPORTED.map((p) => {
        const m = PLATFORM_META[p] || { label: p, color: '#555' };
        return (
          <button type="button" key={p} className={`ptile ${selected[p] ? 'on' : ''}`} onClick={() => onToggle(p)}>
            <span className="pchip" style={{ background: m.color }}>
              {PLATFORM_ICON[p] ? <PlatformLogo platform={p} size={13} /> : (m.glyph || p[0])}
            </span>
            <span className="ptile-name">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NewJobButton({ block, defaultBrand }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [brand, setBrand] = useState(defaultBrand || '');
  const [withImage, setWithImage] = useState(false);
  const [withVideo, setWithVideo] = useState(false);
  const [withCarousel, setWithCarousel] = useState(false);
  const [slides, setSlides] = useState(4);
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
    if (!platforms.length) { ui.toast('Pick at least one platform', 'err'); return; }
    setBusy(true);
    const { ok, data } = await post('/api/jobs/new', { topic, brand, withImage: withImage || withVideo || withCarousel, withVideo, withCarousel, slides: withCarousel ? slides : undefined, platforms });
    if (ok) { ui.toast('Job queued. Researching in the background.'); window.location.href = '/'; return; }
    ui.toast(data.error || 'Failed to queue', 'err'); setBusy(false);
  }

  return (
    <>
      <button className={`btn btn--primary cta ${block ? 'btn--block' : ''}`} onClick={load}>+ New job</button>
      {open && (
        <Modal bar="commission" onClose={() => setOpen(false)}>
          <h3>Start a new job</h3>
          <p>Researches, then drafts a tailored post for each platform you pick. Optionally adds an image or video. Lands in your approval queue.</p>
          <form onSubmit={submit} className="field-stack">
            <input className="input" autoFocus placeholder="topic, e.g. 'latch tips for newborns'"
                   value={topic} onChange={(e) => setTopic(e.target.value)} />
            <input className="input" placeholder="brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <div>
              <div className="card-foot" style={{ margin: '2px 0 7px' }}>
                PLATFORMS {channels && channels.length ? <span className="dim">· connected are pre-selected</span> : null}
              </div>
              <PlatformPicker selected={selected} onToggle={toggle} />
            </div>
            <div className="field-row">
              <label className="check"><input type="checkbox" checked={withImage || withVideo} disabled={withVideo || withCarousel} onChange={(e) => { setWithImage(e.target.checked); if (e.target.checked) setWithCarousel(false); }} /> + image</label>
              <label className="check"><input type="checkbox" checked={withVideo} disabled={withCarousel} onChange={(e) => { setWithVideo(e.target.checked); if (e.target.checked) setWithCarousel(false); }} /> + video <span className="empty" style={{ marginLeft: 4 }}>(branded clip)</span></label>
              <label className="check"><input type="checkbox" checked={withCarousel} onChange={(e) => { setWithCarousel(e.target.checked); if (e.target.checked) { setWithImage(false); setWithVideo(false); } }} /> + carousel <span className="empty" style={{ marginLeft: 4 }}>(multi-image swipe)</span>
                {withCarousel ? <span style={{ marginLeft: 8 }}><input type="number" className="input" min="2" max="10" value={slides} onChange={(e) => setSlides(e.target.value)} style={{ width: 56, padding: '4px 8px', display: 'inline-block' }} /> slides</span> : null}</label>
            </div>
            <div className="modal-acts">
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={busy || !topic.trim()}>{busy ? 'Queuing…' : 'Start job'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export function ApprovalActions({ jobId, flagged }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function act(kind) {
    if (kind === 'reject') {
      const ok = await ui.confirm({ title: 'Reject this job?', message: 'It moves to Trash. You can restore it for 30 days.', confirmLabel: 'Reject', danger: true, tag: 'reject' });
      if (!ok) return;
    }
    setBusy(true);
    const { ok, data } = await post('/api/' + kind, { jobId });
    if (ok) { ui.toast(kind === 'approve' ? 'Approved. Ready to publish.' : 'Moved to Trash'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  async function review() {
    setBusy(true);
    const { ok, data } = await post('/api/review', { jobId });
    if (ok) { ui.toast(data.flagged ? 'Marked for review later' : 'Review flag cleared'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  return (
    <div className="actions">
      <button className="btn btn--approve" disabled={busy} onClick={() => act('approve')}>Approve</button>
      <button className={`btn btn--review ${flagged ? 'on' : ''}`} disabled={busy} onClick={review}>
        {flagged ? 'Reviewing later ✓' : 'Review later'}
      </button>
      <button className="btn btn--reject" disabled={busy} onClick={() => act('reject')}>Reject</button>
    </div>
  );
}

export function PublishButton({ jobId, channel, brand }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function go() {
    const ok = await ui.confirm({
      title: 'Publish live?',
      message: `Post ${brand ? `for brand "${brand}" ` : ''}to ${channel || 'the connected channel'} right now via Postiz? Check the brand and destination before confirming.`,
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

const _pad = (n) => String(n).padStart(2, '0');
const _fmtDate = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
const _at = (daysAhead, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(h, m, 0, 0); return d; };

export function ScheduleButton({ jobId, channel }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [busy, setBusy] = useState(false);

  function openPicker() {
    const d = _at(1, 9);
    setDate(_fmtDate(d)); setTime('09:00'); setOpen(true);
  }
  const apply = (d) => { setDate(_fmtDate(d)); setTime(`${_pad(d.getHours())}:${_pad(d.getMinutes())}`); };
  const PRESETS = [['Tomorrow 9am', _at(1, 9)], ['Tomorrow 6pm', _at(1, 18)], ['In 3 days', _at(3, 9)], ['Next week', _at(7, 9)]];

  const chosen = date && time ? new Date(`${date}T${time}`) : null;
  const valid = chosen && !isNaN(chosen.getTime());
  const readout = valid
    ? chosen.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

  async function go(e) {
    e?.preventDefault();
    if (!valid) { ui.toast('Pick a date & time', 'err'); return; }
    if (chosen.getTime() < Date.now()) { ui.toast('That time is in the past', 'err'); return; }
    setBusy(true);
    const { ok, data } = await post('/api/schedule', { jobId, when: chosen.toISOString() });
    if (ok) { ui.toast(`Scheduled — ${readout}`); window.location.reload(); return; }
    ui.toast(data.error || 'Schedule failed', 'err'); setBusy(false);
  }

  return (
    <>
      <button className="btn btn--ghost" onClick={openPicker}>Schedule</button>
      {open && (
        <Modal bar="schedule" onClose={() => setOpen(false)}>
          <h3>Schedule this post</h3>
          <p>Hands it to Postiz&apos;s queue to post automatically to {channel || 'the connected channel'} at your chosen time.</p>
          <form onSubmit={go} className="field-stack">
            <div className="sched-presets">
              {PRESETS.map(([label, d]) => (
                <button type="button" key={label} className="chip" onClick={() => apply(d)}>{label}</button>
              ))}
            </div>
            <div className="sched-fields">
              <label className="sched-f"><span>Date</span>
                <input className="input" type="date" value={date} min={_fmtDate(new Date())} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="sched-f"><span>Time</span>
                <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            </div>
            <div className="sched-readout">Posts <b>{readout}</b> <span className="dim">· SAST</span></div>
            <div className="modal-acts">
              <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={busy || !valid}>{busy ? 'Scheduling…' : 'Schedule'}</button>
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
const fmtWhen = (s) => (s ? `${za(s)} SAST` : 'never');

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

// Restore a rejected job from Trash back into the approval queue.
export function RestoreButton({ jobId }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { ok, data } = await post('/api/restore', { jobId });
    if (ok) { ui.toast('Restored to the approval queue'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  return <button className="btn btn--approve btn--sm" disabled={busy} onClick={go}>↩ Restore</button>;
}

// Restore a deleted Vault asset from Trash.
export function MediaRestoreButton({ id }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const { ok, data } = await post('/api/media', { id, action: 'restore' });
    if (ok) { ui.toast('Restored to the Vault'); window.location.reload(); return; }
    ui.toast(data.error || 'Failed', 'err'); setBusy(false);
  }
  return <button className="btn btn--approve btn--sm" disabled={busy} onClick={go}>↩ Restore</button>;
}

// Collapsible approval-queue row. Collapsed: topic, platforms, the post's first line, job id.
// Expanded: the full post, media preview, polish pills, and approve/reject.
// The agent picks ONE angle; this lets the operator switch to any other researched angle and have the
// draft regenerated against the same brief. Shared by the queue card and the job-detail page. The
// "Rewrite with this" action only appears while the job is at the gate (canRedraft) — re-angling a
// published/approved post makes no sense (and the API rejects it).
export function AnglePicker({ jobId, angles, canRedraft }) {
  const ui = useUI();
  const [busy, setBusy] = useState(false);
  const list = angles || [];
  if (!list.length) return null;
  async function useAngle(angle) {
    const ok = await ui.confirm({ title: 'Rewrite with this angle?', message: `The draft will be regenerated through "${angle}", grounded in the same research, then re-land in your queue. Replaces the current copy.`, confirmLabel: 'Rewrite' });
    if (!ok) return;
    setBusy(true);
    const r = await fetch('/api/redraft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, angle }) });
    const d = await r.json();
    if (r.ok) { ui.toast('Re-angling — the post will update shortly'); setTimeout(() => window.location.reload(), 1400); return; }
    ui.toast(d.error || 'Failed', 'err'); setBusy(false);
  }
  return (
    <>
      {list.map((a, i) => (
        <div className={`angle ${canRedraft ? 'angle--pick' : ''}`} key={i}>
          <div><b>{a.name}</b>: {a.hook}</div>
          {canRedraft ? <button className="btn btn--sm" disabled={busy} onClick={() => useAngle(`${a.name}: ${a.hook}`)}>Rewrite with this</button> : null}
        </div>
      ))}
    </>
  );
}

// The research brief behind a queued draft — the "background" that informs approval. Lazy-loaded.
function QueueResearch({ jobId }) {
  const [brief, setBrief] = useState(undefined); // undefined=loading, null=none, obj=loaded
  useEffect(() => {
    let live = true;
    fetch(`/api/brief?jobId=${jobId}`).then((r) => r.json()).then((d) => { if (live) setBrief(d.brief || null); }).catch(() => live && setBrief(null));
    return () => { live = false; };
  }, [jobId]);
  if (brief === undefined) return <div className="qresearch"><div className="empty">Loading research…</div></div>;
  if (!brief || !(brief.facts || brief.angles)) return null;
  return (
    <details className="qresearch">
      <summary>Research behind this post {brief.recency ? <span className="dim">· {brief.recency}</span> : null}</summary>
      {(brief.facts || []).length ? <div className="qr-h">Cited facts</div> : null}
      {(brief.facts || []).map((f, i) => (
        <div className="fact" key={i}>
          <span className="fn">{i + 1}.</span>
          <div className="claim">{f.claim}</div>
          {f.source_url ? <div className="src"><a href={f.source_url} target="_blank" rel="noreferrer">{f.source_url}</a></div> : null}
          {f.snippet ? <div className="snip">&ldquo;{f.snippet}&rdquo;</div> : null}
        </div>
      ))}
      {(brief.angles || []).length ? <div className="qr-h">Angles — switch the post to any of these</div> : null}
      <AnglePicker jobId={jobId} angles={brief.angles} canRedraft />
    </details>
  );
}

// Renders a draft's media: a video, a single image, or a multi-image carousel strip.
export function DraftMedia({ draft }) {
  if (!draft) return null;
  if (draft.video_path) return <video className="draft-img" src={draft.video_path} controls muted playsInline />;
  let imgs = [];
  try { imgs = JSON.parse(draft.images_json || 'null') || []; } catch { imgs = []; }
  if (!imgs.length && draft.image_path) imgs = [{ path: draft.image_path }];
  if (!imgs.length) return null;
  if (imgs.length === 1) return <img className="draft-img" src={imgs[0].path} alt="" />;
  async function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= imgs.length) return;
    const arr = imgs.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await fetch('/api/draft/reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftId: draft.id, images: arr }) }).catch(() => {});
    window.location.reload();
  }
  return (
    <div className="carousel-strip" title={`${imgs.length}-image carousel — use ◀ ▶ to reorder slides`}>
      {imgs.map((m, i) => (
        <div className="carousel-slide" key={i}>
          <img src={m.path} alt={`slide ${i + 1}`} />
          <span className="carousel-n">{i + 1}/{imgs.length}</span>
          {draft.id ? (
            <div className="carousel-move">
              <button onClick={() => move(i, -1)} disabled={i === 0} title="move slide earlier">◀</button>
              <button onClick={() => move(i, 1)} disabled={i === imgs.length - 1} title="move slide later">▶</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// A realistic "as it'll appear on the platform" popup: profile header, media (single / swipeable
// carousel / video), action row, caption. Text-first platforms (X/Bluesky/Threads) put the caption
// above the media; feed platforms (Instagram/Facebook/LinkedIn) below, like the real apps.
export function PostPreview({ draft, handle }) {
  const [open, setOpen] = useState(false);
  const [slide, setSlide] = useState(0);
  if (!draft) return null;
  let imgs = [];
  try { imgs = JSON.parse(draft.images_json || 'null') || []; } catch { imgs = []; }
  if (!imgs.length && draft.image_path) imgs = [{ path: draft.image_path }];
  const plat = draft.platform;
  const meta = PLATFORM_META[plat] || { label: plat, color: '#555' };
  const name = handle && handle !== 'unassigned' ? handle : meta.label;
  const textFirst = ['x', 'bluesky', 'threads', 'mastodon', 'telegram'].includes(plat);
  const n = imgs.length;
  const go = (d) => setSlide((s) => (s + d + n) % n);

  const media = draft.video_path ? (
    <video className="pp-img" src={draft.video_path} controls muted playsInline />
  ) : n ? (
    <div className="pp-media">
      <img className="pp-img" src={imgs[slide].path} alt="" />
      {n > 1 && (
        <>
          <button className="pp-arrow l" onClick={() => go(-1)} aria-label="previous">‹</button>
          <button className="pp-arrow r" onClick={() => go(1)} aria-label="next">›</button>
          <span className="pp-count">{slide + 1}/{n}</span>
          <div className="pp-dotrow">{imgs.map((_, i) => <span key={i} className={`pp-dot ${i === slide ? 'on' : ''}`} />)}</div>
        </>
      )}
    </div>
  ) : null;

  const caption = <div className="pp-caption"><b>{name}</b> {draft.body}</div>;

  return (
    <>
      <button className="btn btn--sm" onClick={() => { setSlide(0); setOpen(true); }}>👁 Preview</button>
      {open && createPortal(
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="pp-wrap" onClick={(e) => e.stopPropagation()}>
            <div className="pp-bar"><PlatformLogo platform={plat} size={14} /> <span>{meta.label} preview</span><button className="pp-x" onClick={() => setOpen(false)}>✕</button></div>
            <div className={`pp-card ${textFirst ? 'pp-text' : 'pp-feed'}`}>
              <div className="pp-head">
                <span className="pp-avatar" style={{ background: meta.color }}>{(name[0] || '?').toUpperCase()}</span>
                <div className="pp-id"><span className="pp-name">{name}</span><span className="pp-handle">{textFirst ? `@${(name || '').toLowerCase().replace(/\s+/g, '')}` : 'Sponsored'}</span></div>
                <span className="pp-more">···</span>
              </div>
              {textFirst ? <>{caption}{media}</> : <>{media}<div className="pp-actions"><span>♡</span><span>💬</span><span>↗</span><span className="pp-save">🔖</span></div>{caption}</>}
              {textFirst && <div className="pp-actions pp-actions--x"><span>💬</span><span>🔁</span><span>♡</span><span>📊</span></div>}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}

// §6a brand-safety verdict on a draft. Green is clean (no badge); amber = review; red = safety hold.
export function SafetyBadge({ safety }) {
  let s = {};
  try { s = JSON.parse(safety || 'null') || {}; } catch { s = {}; }
  if (!s.verdict || s.verdict === 'green') return null;
  const red = s.verdict === 'red';
  return (
    <div className={`safety-flag ${red ? 'red' : 'amber'}`}>
      <b>{red ? '🛑 Safety hold' : '⚠️ Review'}</b>{s.reason ? ` — ${s.reason}` : ''}
    </div>
  );
}

export function QueueItem({ job }) {
  const [open, setOpen] = useState(false);
  const d = job.draft;
  const platforms = (job.target_platforms ? job.target_platforms.split(',') : d ? [d.platform] : [])
    .map((p) => p.trim()).filter(Boolean);
  const lim = d ? PLATFORM_LIMITS[d.platform] : null;
  let flagged = false;
  try { flagged = !!JSON.parse(job.meta || '{}').review_later; } catch {}
  return (
    <div className={`qcard ${open ? 'open' : ''}`}>
      <button type="button" className="qcard-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="qcard-caret">{open ? '▾' : '▸'}</span>
        <div className="qcard-main">
          <div className="qcard-topic">{job.topic}</div>
        </div>
        <div className="qcard-meta">
          {flagged ? <span className="badge badge--review">review later</span> : null}
          {platforms.map((p) => <PlatformChip key={p} platform={p} />)}
          <span className="qcard-id">{job.id.slice(0, 8)}</span>
        </div>
      </button>
      {open && (
        <div className="qcard-body">
          {d ? (
            <>
              <SafetyBadge safety={d.safety_json} />
              <EditableDraft draftId={d.id} body={d.body} limit={lim} />
              <DraftMedia draft={d} />
              <div className="actions" style={{ marginTop: 6 }}><PostPreview draft={d} handle={job.brand} /></div>
              <div className="card-foot" style={lim && d.char_count > lim ? { color: 'var(--red)' } : null}>
                {d.char_count}{lim ? `/${lim}` : ''} chars · angle {d.angle || '—'} · brand {job.brand}
              </div>
              <PostPills polish={d.polish_json} draftId={d.id} />
            </>
          ) : <div className="empty">No draft yet.</div>}
          <QueueResearch jobId={job.id} />
          <div className="qcard-foot">
            <Link className="deeplink" href={`/job/${job.id}`}>Open full job — all drafts, sources & timeline ↗</Link>
          </div>
          <ApprovalActions jobId={job.id} flagged={flagged} />
        </div>
      )}
    </div>
  );
}

// Pills on a post preview showing what each polish skill changed (marketing-psychology + humanizer).
// `polish` is the draft's polish_json string: [{skill, before, after, notes}, ...].
const PILL_KEY = { 'Marketing psychology': 'psych', 'Humanized': 'human' };
export function PostPills({ polish, draftId }) {
  const ui = useUI();
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  let steps = [];
  try { steps = polish ? JSON.parse(polish) : []; } catch { steps = []; }
  if (!steps.length) return null;
  const s = open != null ? steps[open] : null;

  async function revert(i) {
    const skill = steps[i].skill;
    const ok = await ui.confirm({
      title: `Revert before "${skill}"?`,
      message: `This replaces the current post with the version from before the ${skill} pass${i === 0 ? ' (the original draft)' : ''}. Later edits are dropped too.`,
      confirmLabel: 'Revert', danger: true, tag: 'revert',
    });
    if (!ok) return;
    setBusy(true);
    const { ok: done, data } = await post('/api/revert', { draftId, stepIndex: i });
    if (done) { ui.toast('Reverted to the earlier version'); window.location.reload(); return; }
    ui.toast(data.error || 'Revert failed', 'err'); setBusy(false);
  }

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
          {draftId ? (
            <div className="actions" style={{ marginTop: 10 }}>
              <button className="btn btn--sm" disabled={busy} onClick={() => revert(open)}>↩ Revert to “before”</button>
              <span className="card-foot" style={{ margin: 0 }}>restores the pre-{s.skill.toLowerCase()} text</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
