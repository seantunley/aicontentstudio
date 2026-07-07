'use client';
import { useEffect, useRef, useState } from 'react';

// Node colours by kind. Warm brass for the brand's own voice (the core), cool slate for imported
// history, sand for free notes, dim stone for tag hubs. Green/red stay reserved for approve/reject.
const GROUP = {
  voice: { color: '#e3a73f', label: 'Brand voice' },
  history: { color: '#6f86a8', label: 'ChatGPT history' },
  note: { color: '#caa46a', label: 'Notes' },
  tag: { color: '#8a7d5f', label: 'Tags' },
};
const ORDER = ['voice', 'history', 'note', 'tag'];

export function KnowledgeGraph({ data, onOpen }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sim = useRef({ nodes: [], links: [], scale: 1, tx: 0, ty: 0, alpha: 0 });
  const drag = useRef(null);
  const hoverRef = useRef(null);
  const neighborsRef = useRef(new Set());
  const kickRef = useRef(null);
  const [hoverTitle, setHoverTitle] = useState(null);
  const [ready, setReady] = useState(false);

  // Build the simulation model whenever the data changes.
  useEffect(() => {
    const s = sim.current;
    const W = wrapRef.current?.clientWidth || 900;
    const H = wrapRef.current?.clientHeight || 560;
    const byId = new Map();
    s.nodes = (data?.nodes || []).map((n, i) => {
      const angle = i * 2.399963; // golden-angle spiral seed (deterministic)
      const rad = 24 + Math.sqrt(i) * 20;
      const node = {
        ...n, x: W / 2 + Math.cos(angle) * rad, y: H / 2 + Math.sin(angle) * rad, vx: 0, vy: 0,
        r: n.group === 'tag' ? 3.5 + Math.min(7, (n.degree || 0) * 0.8) : 4.5 + Math.min(8, (n.degree || 0) * 1.1),
      };
      byId.set(n.id, node);
      return node;
    });
    s.links = (data?.links || []).map((l) => ({ ...l, s: byId.get(l.source), t: byId.get(l.target) })).filter((l) => l.s && l.t);
    s.scale = 1; s.tx = 0; s.ty = 0; s.alpha = 1;
    hoverRef.current = null; neighborsRef.current = new Set();
    setReady(s.nodes.length > 0);
    kickRef.current?.(); // if the loop had idle-stopped, new data needs to re-settle
  }, [data]);

  // Force simulation + canvas render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !wrapRef.current) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = null, running = false;

    const resize = () => {
      const W = wrapRef.current.clientWidth, H = wrapRef.current.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrapRef.current);

    const draw = () => {
      const s = sim.current;
      const W = canvas.width / dpr, H = canvas.height / dpr;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      ctx.translate(s.tx, s.ty); ctx.scale(s.scale, s.scale);
      const hv = hoverRef.current, nb = neighborsRef.current;

      for (const l of s.links) {
        const active = hv && (l.s.id === hv || l.t.id === hv);
        ctx.strokeStyle = active ? 'rgba(227,167,63,0.6)' : (l.kind === 'tag' ? 'rgba(138,125,95,0.13)' : 'rgba(150,140,115,0.22)');
        ctx.lineWidth = (active ? 1.4 : (l.kind === 'tag' ? 0.6 : 0.9)) / s.scale;
        ctx.setLineDash(l.kind === 'tag' ? [3 / s.scale, 3 / s.scale] : []);
        ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke();
      }
      ctx.setLineDash([]);

      for (const n of s.nodes) {
        const g = GROUP[n.group] || GROUP.note;
        const dim = hv && hv !== n.id && !nb.has(n.id);
        ctx.globalAlpha = dim ? 0.22 : 1;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.group === 'tag') { ctx.fillStyle = '#16120d'; ctx.fill(); ctx.lineWidth = 1 / s.scale; ctx.strokeStyle = g.color; ctx.stroke(); }
        else { ctx.fillStyle = g.color; ctx.fill(); }
        if (n.id === hv) { ctx.lineWidth = 2 / s.scale; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }

      ctx.font = `${11 / s.scale}px ui-monospace, SFMono-Regular, monospace`;
      ctx.textBaseline = 'middle';
      for (const n of s.nodes) {
        const isHub = n.group === 'tag';
        const show = (isHub && s.scale > 0.55) || n.id === hv || nb.has(n.id);
        if (!show || (hv && hv !== n.id && !nb.has(n.id))) continue;
        ctx.fillStyle = n.id === hv ? '#f6edd6' : (isHub ? '#b9a98c' : '#d3c5a3');
        const label = n.title.length > 36 ? `${n.title.slice(0, 34)}…` : n.title;
        ctx.fillText(label, n.x + n.r + 4 / s.scale, n.y);
      }
      ctx.restore();
    };

    const tick = () => {
      const s = sim.current;
      const W = canvas.width / dpr, H = canvas.height / dpr;
      const { nodes, links } = s;
      if (s.alpha > 0.02) {
        // Repulsion via a uniform spatial grid — O(n) instead of O(n^2), so hundreds of
        // nodes (e.g. an imported ChatGPT history) no longer freeze the browser tab. Each
        // node is pushed only by others within ~one cell; distant nodes are ignored (the
        // centering + link forces still hold the layout together).
        const k = 100, cell = 130, R2 = cell * cell;
        const grid = new Map();
        for (const n of nodes) {
          const gk = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`;
          let arr = grid.get(gk); if (!arr) { arr = []; grid.set(gk, arr); }
          arr.push(n);
        }
        let seed = 1;
        for (const a of nodes) {
          const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
          for (let gx = cx - 1; gx <= cx + 1; gx++) {
            for (let gy = cy - 1; gy <= cy + 1; gy++) {
              const arr = grid.get(`${gx},${gy}`);
              if (!arr) continue;
              for (const b of arr) {
                if (b === a) continue;
                let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
                if (d2 > R2) continue;
                if (d2 < 0.01) { seed = (seed * 9301 + 49297) % 233280; dx = seed / 233280 - 0.5; dy = 0.5; d2 = dx * dx + dy * dy; }
                const d = Math.sqrt(d2), f = (k * k) / d2;
                a.vx += (dx / d) * f; a.vy += (dy / d) * f; // force applied to `a` only; `b` gets its own turn
              }
            }
          }
        }
        for (const l of links) {
          const L = l.kind === 'tag' ? 46 : 64;
          let dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - L) * 0.03;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy;
        }
        for (const n of nodes) { n.vx += (W / 2 - n.x) * 0.016; n.vy += (H / 2 - n.y) * 0.016; }
        for (const n of nodes) {
          if (drag.current && drag.current.node === n) { n.vx = 0; n.vy = 0; continue; }
          n.vx *= 0.82; n.vy *= 0.82;
          n.x += n.vx * s.alpha; n.y += n.vy * s.alpha;
        }
        s.alpha *= 0.985;
      }
      draw();
      // Idle-stop: once the layout settles (and no node is being dragged) we stop requesting
      // frames — no permanent 60fps redraw burning the main thread. Any interaction calls
      // kick() to resume. This is what keeps a few-hundred-node graph smooth once it rests.
      if (s.alpha > 0.02 || (drag.current && drag.current.node)) raf = requestAnimationFrame(tick);
      else { running = false; raf = null; }
    };
    const kick = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
    kickRef.current = kick;
    kick();

    // ---- interaction ----
    const toWorld = (e) => {
      const rect = canvas.getBoundingClientRect();
      const s = sim.current;
      return { x: (e.clientX - rect.left - s.tx) / s.scale, y: (e.clientY - rect.top - s.ty) / s.scale };
    };
    const nodeAt = (p) => {
      const s = sim.current;
      for (let i = s.nodes.length - 1; i >= 0; i--) {
        const n = s.nodes[i], dx = n.x - p.x, dy = n.y - p.y;
        if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
      }
      return null;
    };
    const setHover = (n) => {
      const id = n ? n.id : null;
      if (hoverRef.current === id) return;
      hoverRef.current = id;
      const nb = new Set();
      if (id) for (const l of sim.current.links) { if (l.s.id === id) nb.add(l.t.id); else if (l.t.id === id) nb.add(l.s.id); }
      neighborsRef.current = nb;
      setHoverTitle(n ? (n.group === 'tag' ? n.title : n.title) : null);
      kick();
    };

    const onDown = (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      const p = toWorld(e), n = nodeAt(p);
      drag.current = n ? { node: n, moved: false, sx: e.clientX, sy: e.clientY }
        : { pan: true, moved: false, lx: e.clientX, ly: e.clientY };
      kick();
    };
    const onMove = (e) => {
      const d = drag.current;
      if (!d) { setHover(nodeAt(toWorld(e))); return; }
      if (d.node) {
        const p = toWorld(e); d.node.x = p.x; d.node.y = p.y;
        if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
        sim.current.alpha = Math.max(sim.current.alpha, 0.25);
      } else {
        sim.current.tx += e.clientX - d.lx; sim.current.ty += e.clientY - d.ly;
        d.lx = e.clientX; d.ly = e.clientY; d.moved = true;
      }
      kick();
    };
    const onUp = (e) => {
      const d = drag.current; drag.current = null;
      if (d && d.node && !d.moved && d.node.group !== 'tag') onOpen?.(d.node.id);
    };
    const onLeave = () => { if (!drag.current) setHover(null); };
    const onWheel = (e) => {
      e.preventDefault();
      const s = sim.current, rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.max(0.25, Math.min(4, s.scale * factor));
      s.tx = mx - (mx - s.tx) * (ns / s.scale);
      s.ty = my - (my - s.ty) * (ns / s.scale);
      s.scale = ns;
      kick();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (raf) cancelAnimationFrame(raf); kickRef.current = null; ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [ready, onOpen]);

  const reheat = () => { sim.current.alpha = 1; kickRef.current?.(); };
  const present = ORDER.filter((g) => (data?.nodes || []).some((n) => n.group === g));

  if (!data || !data.nodes?.length) {
    return (
      <div className="panel blank" style={{ minHeight: '40vh' }}>
        <div className="fleuron">❧</div>
        <div className="bt">Nothing to graph yet.</div>
        <div className="bd">Add a note, drop in markdown, or import your ChatGPT history. As notes share tags and link to each other, the map fills in.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="kb-graph-legend">
        {present.map((g) => (
          <span key={g} className="kb-leg"><i style={{ background: g === 'tag' ? 'transparent' : GROUP[g].color, borderColor: GROUP[g].color }} />{GROUP[g].label}</span>
        ))}
        <span className="kb-graph-hint">{data.counts?.notes || 0} notes · {data.counts?.tags || 0} tags · {data.counts?.edges || 0} links · drag to move · scroll to zoom · click a note to open</span>
        <button className="btn btn--sm" onClick={reheat}>Re-layout</button>
      </div>
      <div className="kb-graph-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="kb-graph-canvas" />
        {hoverTitle ? <div className="kb-graph-tip">{hoverTitle}</div> : null}
        {data.dropped ? <div className="kb-graph-drop">showing first {data.counts.notes} notes ({data.dropped} more not drawn)</div> : null}
      </div>
    </div>
  );
}
