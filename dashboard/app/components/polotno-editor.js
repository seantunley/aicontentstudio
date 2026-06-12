'use client';
import { useEffect, useState } from 'react';
import { PolotnoContainer, SidePanelWrap, WorkspaceWrap } from 'polotno';
import { Toolbar } from 'polotno/toolbar/toolbar';
import { SidePanel } from 'polotno/side-panel';
import { Workspace } from 'polotno/canvas/workspace';
import { ZoomButtons } from 'polotno/toolbar/zoom-buttons';
import { PagesTimeline } from 'polotno/pages-timeline';
import { createStore } from 'polotno/model/store';
import 'polotno/polotno.blueprint.css';

// Polotno needs an API key (https://polotno.com/cabinet). The public demo key is fine for
// local use (shows a small credit); set NEXT_PUBLIC_POLOTNO_KEY to a purchased key for production.
const KEY = process.env.NEXT_PUBLIC_POLOTNO_KEY || 'nFA5H9elEytDyPyvKL7T';
// Local, non-commercial use only (operator confirmed). For any commercial/shipped use, obtain a
// Polotno license key (polotno.com/cabinet) and this flag is the legitimate way to hide the credit.
const store = createStore({ key: KEY, showCredit: false });

export default function PolotnoEditor({ src, topic }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    store.clear();
    const page = store.addPage();
    if (!src) { store.setSize(1080, 1080); return; }
    const proxied = `/api/img?u=${encodeURIComponent(src)}`;
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth || 1080;
      const h = img.naturalHeight || 1080;
      store.setSize(w, h);
      page.addElement({ type: 'image', src: proxied, x: 0, y: 0, width: w, height: h, selectable: true });
    };
    img.onerror = () => store.setSize(1080, 1080);
    img.src = proxied;
  }, [src]);

  async function saveToVault() {
    setSaving(true);
    try {
      const dataUrl = await store.toDataURL({ mimeType: 'image/png', pixelRatio: 1 });
      const r = await fetch('/api/vault/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, topic }),
      });
      if (r.ok) { setDone(true); setTimeout(() => { window.location.href = '/vault'; }, 800); }
      else { const d = await r.json().catch(() => ({})); alert('Save failed: ' + (d.error || r.status)); setSaving(false); }
    } catch (e) {
      alert('Export failed: ' + (e?.message || e));
      setSaving(false);
    }
  }

  return (
    <div className="editor-root">
      <div className="editor-bar">
        <a className="btn btn--ghost" href="/vault">← Vault</a>
        <span className="editor-title">Studio Editor{topic ? ` — ${topic}` : ''}</span>
        <button className="btn btn--primary" onClick={saveToVault} disabled={saving || done}>
          {done ? 'Saved ✓' : saving ? 'Saving…' : 'Save to Vault'}
        </button>
      </div>
      <div className="editor-canvas">
        <PolotnoContainer style={{ width: '100%', height: '100%' }}>
          <SidePanelWrap><SidePanel store={store} /></SidePanelWrap>
          <WorkspaceWrap>
            <Toolbar store={store} />
            <Workspace store={store} />
            <ZoomButtons store={store} />
            <PagesTimeline store={store} />
          </WorkspaceWrap>
        </PolotnoContainer>
      </div>
    </div>
  );
}
