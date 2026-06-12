'use client';
import { useState } from 'react';
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';

// MIT-licensed, no key / no watermark / no usage limit (replaces Polotno's paid SDK).
// Edits a Vault image and saves the result back as a new Vault asset via /api/vault/save.

// On-brand dark palette ("The Desk"). Unknown keys are ignored by Filerobot, known ones
// pull the editor chrome into the studio's ink + brass theme.
const THEME = {
  palette: {
    'bg-primary': '#0f0d0a',
    'bg-primary-active': '#1a1611',
    'bg-secondary': '#14110d',
    'bg-stateless': '#1a1611',
    'accent-primary': '#e3a73f',
    'accent-primary-active': '#ffc35e',
    'accent-stateless': '#e3a73f',
    'icons-primary': '#ece3d0',
    'icons-secondary': '#b3a88f',
    'borders-primary': '#272117',
    'borders-secondary': '#372f21',
    'borders-strong': '#524a3a',
    'txt-primary': '#ece3d0',
    'txt-secondary': '#b3a88f',
    'txt-secondary-invert': '#14110d',
    'light-shadow': 'rgba(0,0,0,0.5)',
    warning: '#ef6450',
  },
  typography: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif" },
};

export default function ImageEditor({ src, topic }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  // No source = nothing to edit (the only entry point is the Vault's "Edit" button).
  if (!src) {
    return (
      <div className="editor-root">
        <div className="editor-bar">
          <a className="btn btn--ghost" href="/vault">← Vault</a>
          <span className="editor-title">Studio Editor</span>
          <span />
        </div>
        <div className="editor-canvas" style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
          <div className="blank">
            <div className="fleuron">❧</div>
            <div className="bt">No image to edit.</div>
            <div className="bd">Open an image from the Vault and choose Edit.</div>
          </div>
        </div>
      </div>
    );
  }

  // Same-origin proxy so the canvas isn't CORS-tainted by cross-origin Postiz media (breaks export).
  const source = `/api/img?u=${encodeURIComponent(src)}`;

  async function onSave(edited) {
    setErr('');
    setSaving(true);
    try {
      const dataUrl = edited?.imageBase64;
      if (!dataUrl) throw new Error('editor returned no image');
      const r = await fetch('/api/vault/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, topic }),
      });
      if (r.ok) { setDone(true); setTimeout(() => { window.location.href = '/vault'; }, 700); return; }
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `save failed (${r.status})`);
    } catch (e) {
      setErr(String(e?.message || e));
      setSaving(false);
    }
  }

  return (
    <div className="editor-root">
      <div className="editor-bar">
        <a className="btn btn--ghost" href="/vault">← Vault</a>
        <span className="editor-title">
          Studio Editor{topic ? ` — ${topic}` : ''}
          {done ? '  ·  saved ✓' : saving ? '  ·  saving…' : ''}
          {err ? <span className="err" style={{ marginLeft: 10 }}>{err}</span> : null}
        </span>
        <span className="card-foot" style={{ margin: 0 }}>Save ↗ in the toolbar</span>
      </div>
      <div className="editor-canvas">
        <FilerobotImageEditor
          source={source}
          onSave={onSave}
          onClose={() => { window.location.href = '/vault'; }}
          // Skip Filerobot's "download / pick format" modal — save straight to the Vault as PNG.
          onBeforeSave={() => false}
          defaultSavedImageType="png"
          savingPixelRatio={1}
          previewPixelRatio={1}
          theme={THEME}
          tabsIds={[TABS.ADJUST, TABS.ANNOTATE, TABS.WATERMARK, TABS.FINETUNE, TABS.FILTERS, TABS.RESIZE]}
          defaultTabId={TABS.ANNOTATE}
          defaultToolId={TOOLS.TEXT}
          Text={{ text: 'Your text…', fontFamily: "'IBM Plex Sans', sans-serif" }}
          annotationsCommon={{ fill: '#e3a73f' }}
        />
      </div>
    </div>
  );
}
