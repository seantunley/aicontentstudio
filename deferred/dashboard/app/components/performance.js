'use client';
import { useState, useEffect } from 'react';
import { PlatformChip } from './actions';

const RANGES = [7, 30, 90];

function Spark({ data }) {
  const pts = (data || []).map((d) => Number(d.total) || 0);
  if (pts.length < 2) return null;
  const w = 120, h = 26;
  const max = Math.max(...pts), min = Math.min(...pts), range = (max - min) || 1;
  const poly = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${(h - 2) - ((v - min) / range) * (h - 4)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={poly} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PerformancePanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let live = true;
    setData(undefined);
    fetch(`/api/performance?days=${days}`).then((r) => r.json()).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData({ channels: [] }); });
    return () => { live = false; };
  }, [days]);

  return (
    <>
      <div className="perf-bar">
        <div className="kb-views">{RANGES.map((r) => <button key={r} className={`kb-view ${days === r ? 'on' : ''}`} onClick={() => setDays(r)}>{r}d</button>)}</div>
        <span className="card-foot" style={{ margin: 0 }}>
          Postiz reports analytics for Instagram, Facebook, YouTube, LinkedIn, TikTok, Threads &amp; Pinterest. <b>Bluesky isn&rsquo;t supported by Postiz</b>, so it shows no metrics. As data accrues it feeds the voice flywheel, recycling &amp; posting-time tuning.
        </span>
      </div>

      {data === undefined ? <div className="empty" style={{ padding: 40 }}>Loading performance…</div>
        : data.channels === null ? <div className="panel blank"><div className="fleuron">❧</div><div className="bt">Postiz unreachable.</div><div className="bd">Can&rsquo;t load analytics right now — check the Postiz service.</div></div>
        : data.channels.length === 0 ? <div className="panel blank"><div className="fleuron">❧</div><div className="bt">No connected channels.</div><div className="bd">Connect accounts in Postiz and they&rsquo;ll appear here.</div></div>
        : (
          <div className="perf-list">
            {data.channels.map((c) => (
              <div className="perf-card" key={c.id}>
                <div className="perf-head"><PlatformChip platform={c.platform} /><span className="perf-name">{c.name}</span></div>
                {c.metrics && c.metrics.length ? (
                  <div className="perf-metrics">
                    {c.metrics.map((m, i) => {
                      const d = m.data || [];
                      const last = d.length ? d[d.length - 1].total : null;
                      const chg = m.percentageChange;
                      return (
                        <div className="perf-metric" key={i}>
                          <div className="pm-label">{m.label}</div>
                          <div className="pm-val">{last == null ? '—' : Number(last).toLocaleString()}
                            {typeof chg === 'number' && chg ? <span className={`pm-chg ${chg < 0 ? 'down' : 'up'}`}>{chg < 0 ? '▾' : '▴'}{Math.abs(chg)}%</span> : null}
                          </div>
                          <Spark data={d} />
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="perf-empty">{c.reports ? `No activity in the last ${data.days} days.` : `Postiz doesn’t report analytics for ${c.platform} — connect a supported platform to see performance here.`}</div>}
              </div>
            ))}
          </div>
        )}
    </>
  );
}
