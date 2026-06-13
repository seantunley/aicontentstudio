'use client';
import { useState, useEffect, useCallback } from 'react';
import { PLATFORM_META, PLATFORM_ICON } from '@/lib/platforms';

const POSTIZ_UI = 'http://172.18.18.101:4007';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Monday-start 6-week grid covering the given month.
function monthGrid(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  const dow = (first.getDay() + 6) % 7; // 0 = Monday
  start.setDate(first.getDate() - dow);
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}

function Logo({ platform }) {
  const d = PLATFORM_ICON[platform];
  const m = PLATFORM_META[platform] || { color: 'var(--muted)' };
  return (
    <span className="cal-dot" style={{ background: m.color }}>
      {d ? <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><path d={d} /></svg> : null}
    </span>
  );
}

export function Calendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ok | down
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

  // group posts by day (YYYY-MM-DD, local)
  const byDay = {};
  for (const p of posts) {
    const key = ymd(new Date(p.date));
    (byDay[key] = byDay[key] || []).push(p);
  }
  Object.values(byDay).forEach((list) => list.sort((a, b) => new Date(a.date) - new Date(b.date)));

  const today = ymd(new Date());
  const move = (delta) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

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
          <span className={`cal-status cal-status--${status}`}>{status === 'down' ? 'Postiz unreachable' : status === 'loading' ? 'loading…' : 'live · refreshes each minute'}</span>
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
            <div key={key} className={`cal-cell ${muted ? 'off' : ''} ${key === today ? 'today' : ''}`}>
              <div className="cal-daynum">{d.getDate()}</div>
              <div className="cal-posts">
                {items.map((p) => (
                  <a key={p.id} className={`cal-post st-${p.state}`} href={p.releaseURL || POSTIZ_UI} target="_blank" rel="noreferrer"
                     title={`${new Date(p.date).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })} · ${p.account || p.platform || ''}\n${p.content}`}>
                    <Logo platform={p.platform} />
                    <span className="cal-time">{new Date(p.date).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="cal-snip">{p.content}</span>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        <span><i className="st-dot st-queue" /> scheduled</span>
        <span><i className="st-dot st-published" /> published</span>
        <span><i className="st-dot st-error" /> error</span>
        <span className="dim">drag-to-reschedule lands in a later phase; for now, move posts in Postiz and they refresh here.</span>
      </div>
    </div>
  );
}
