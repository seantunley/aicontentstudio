'use client';
import { useState, useEffect, useCallback } from 'react';
import { PLATFORM_META, PLATFORM_ICON } from '@/lib/platforms';
import { useUI } from './ui';

const POSTIZ_UI = 'http://172.18.18.101:4007';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

function monthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // back to Monday
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}

function Logo({ platform }) {
  const d = PLATFORM_ICON[platform];
  const m = PLATFORM_META[platform] || { color: 'var(--muted)' };
  return <span className="cal-dot" style={{ background: m.color }}>{d ? <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><path d={d} /></svg> : null}</span>;
}

export function Calendar() {
  const ui = useUI();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [drag, setDrag] = useState(null);   // post being dragged
  const [over, setOver] = useState(null);    // day key hovered
  const grid = monthGrid(cursor);

  const load = useCallback(async () => {
    const start = grid[0]; const end = new Date(grid[41]); end.setHours(23, 59, 59, 999);
    try {
      const r = await fetch(`/api/calendar?start=${start.toISOString()}&end=${end.toISOString()}`);
      const d = await r.json();
      if (!r.ok) { setStatus('down'); return; }
      setPosts(d.posts || []); setStatus('ok');
    } catch { setStatus('down'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const byDay = {};
  for (const p of posts) (byDay[ymd(new Date(p.date))] = byDay[ymd(new Date(p.date))] || []).push(p);
  Object.values(byDay).forEach((l) => l.sort((a, b) => new Date(a.date) - new Date(b.date)));

  const today = ymd(new Date());
  const move = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const canMove = (p) => p.state !== 'published';

  async function drop(cell) {
    const p = drag; setDrag(null); setOver(null);
    if (!p) return;
    const orig = new Date(p.date);
    const target = new Date(cell); target.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
    if (ymd(target) === ymd(orig)) return; // same day, nothing to do
    // optimistic
    setPosts((list) => list.map((x) => (x.id === p.id ? { ...x, date: target.toISOString() } : x)));
    const r = await fetch('/api/calendar/reschedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, date: target.toISOString() }),
    });
    if (r.ok) { ui.toast(`Moved to ${target.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })} ${hhmm(target)}`); load(); }
    else { const d = await r.json().catch(() => ({})); ui.toast(d.error || 'Reschedule failed', 'err'); load(); }
  }

  return (
    <div className="cal">
      <div className="cal-bar">
        <div className="cal-nav">
          <button className="btn btn--sm" onClick={() => move(-1)}>‹</button>
          <button className="btn btn--sm" onClick={() => setCursor(() => { const d = new Date(); d.setDate(1); return d; })}>Today</button>
          <button className="btn btn--sm" onClick={() => move(1)}>›</button>
          <span className="cal-title">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
        </div>
        <div className="cal-meta">
          <span className={`cal-status cal-status--${status}`}>{status === 'down' ? 'Postiz unreachable' : status === 'loading' ? 'loading…' : 'live · drag to reschedule · refreshes each minute'}</span>
          <a className="deeplink" href={POSTIZ_UI} target="_blank" rel="noreferrer">open Postiz ↗</a>
        </div>
      </div>
      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {grid.map((d) => {
          const key = ymd(d);
          const items = byDay[key] || [];
          const muted = d.getMonth() !== cursor.getMonth();
          return (
            <div key={key} className={`cal-cell ${muted ? 'off' : ''} ${key === today ? 'today' : ''} ${over === key ? 'drop-target' : ''}`}
                 onDragOver={drag ? (e) => { e.preventDefault(); setOver(key); } : undefined}
                 onDragLeave={() => setOver((o) => (o === key ? null : o))}
                 onDrop={drag ? () => drop(d) : undefined}>
              <div className="cal-daynum">{d.getDate()}</div>
              <div className="cal-posts">
                {items.map((p) => (
                  <div key={p.id} className={`cal-post st-${p.state} ${drag?.id === p.id ? 'dragging' : ''} ${canMove(p) ? '' : 'locked'}`}
                       draggable={canMove(p)}
                       onDragStart={canMove(p) ? () => setDrag(p) : undefined}
                       onDragEnd={() => { setDrag(null); setOver(null); }}
                       onClick={() => window.open(p.releaseURL || POSTIZ_UI, '_blank')}
                       title={`${hhmm(new Date(p.date))} · ${p.account || p.platform || ''}${canMove(p) ? ' · drag to move' : ' · published (locked)'}\n${p.content}`}>
                    <Logo platform={p.platform} />
                    <span className="cal-time">{hhmm(new Date(p.date))}</span>
                    <span className="cal-snip">{p.content}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        <span><i className="st-dot st-queue" /> scheduled (drag to move)</span>
        <span><i className="st-dot st-published" /> published (locked)</span>
        <span><i className="st-dot st-error" /> error</span>
        <span className="dim">changes sync to Postiz; moves made in Postiz appear here within a minute.</span>
      </div>
    </div>
  );
}
