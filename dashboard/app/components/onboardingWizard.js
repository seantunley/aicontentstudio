'use client';
import { useState } from 'react';
import Link from 'next/link';

const slugify = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const STEPS = [
  { key: 'telegram', title: 'Connect Telegram',     sub: 'Your control surface — where you talk to Constance & Nancy.' },
  { key: 'basics',   title: 'Studio basics',         sub: 'Name your studio and set the region it writes for.' },
  { key: 'identity', title: 'Your brand',            sub: 'Who it is and who it talks to.' },
  { key: 'voice',    title: 'Brand voice',           sub: 'The single biggest lever on output quality.' },
  { key: 'pillars',  title: 'Pillars & guardrails',  sub: 'What it posts about, and what it must never do.' },
  { key: 'photos',   title: 'Reference photos',      sub: 'Real product images so AI media looks like the real thing.' },
  { key: 'done',     title: 'You’re set up',         sub: 'A couple of finishing touches and you’re producing.' },
];

export default function OnboardingWizard({ initialBrand, telegramConnected, studioName, region: region0 }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const [studio, setStudio] = useState({ studio_name: studioName || '', default_region: region0 || '' });
  const b0 = initialBrand || {};
  const [brand, setBrand] = useState({
    slug: b0.slug || '', name: b0.name || '', region: b0.region || region0 || '', audience: b0.audience || '',
    voice: b0.voice || '', safety: b0.safety || '', pillars: b0.pillars || '', sensitive: b0.sensitive || '', channels: b0.channels || '',
  });
  const [refs, setRefs] = useState('');

  const ss = (k) => (e) => setStudio((x) => ({ ...x, [k]: e.target.value }));
  const bs = (k) => (e) => setBrand((x) => ({ ...x, [k]: e.target.value }));

  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `save failed (${r.status})`); }
    return r.json();
  };

  // Each save is best-effort & non-blocking: empty steps just skip without erroring.
  const savers = {
    basics: () => post('/api/settings', { studio_name: studio.studio_name, default_region: studio.default_region }),
    pillars: async () => {
      if (!brand.name.trim()) return; // no brand yet — nothing to save
      const slug = brand.slug || slugify(brand.name);
      const res = await post('/api/brands', { ...brand, slug });
      setBrand((x) => ({ ...x, slug: res?.slug || slug }));
    },
    photos: async () => {
      const slug = brand.slug || (brand.name.trim() ? slugify(brand.name) : '');
      if (!slug) return;
      const urls = refs.split('\n').map((s) => s.trim()).filter((u) => /^https?:\/\//.test(u));
      await post('/api/onboarding', { refImages: { slug, urls } });
    },
  };

  const advance = async () => {
    setErr(null);
    const saver = savers[STEPS[step].key];
    try {
      if (saver) { setSaving(true); await saver(); }
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    } catch (e) { setErr(String(e.message || e)); }
    finally { setSaving(false); }
  };
  const back = () => { setErr(null); setStep((s) => Math.max(0, s - 1)); };
  const finish = () => { post('/api/onboarding', { welcomed: true }).catch(() => {}); };

  const meta = STEPS[step];
  const brass = 'var(--accent)';
  const last = step === STEPS.length - 1;

  return (
    <section className="section reveal">
      <div className="panel" style={{ borderColor: 'var(--line-2)', maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? brass : 'var(--line)' }} />
          ))}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', letterSpacing: '.06em' }}>STEP {step + 1} / {STEPS.length}</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 20, margin: '2px 0' }}>{meta.title}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{meta.sub}</div>

        <div style={{ display: 'grid', gap: 10 }}>
          {meta.key === 'telegram' && (
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              {telegramConnected ? (
                <div style={{ color: brass }}>✓ Telegram is connected for this studio — message your bot and Constance will answer.</div>
              ) : (
                <>
                  Telegram isn’t linked to your account yet. To connect:
                  <ol style={{ margin: '8px 0 0 18px' }}>
                    <li>Open Telegram, message <b>@userinfobot</b> — it replies with your numeric <b>ID</b>.</li>
                    <li>Give that ID to your studio admin to add to <code>TELEGRAM_ALLOWED_USERS</code>; they restart the bots.</li>
                    <li>Message your studio bot — Constance should greet you.</li>
                  </ol>
                  <div style={{ marginTop: 8, color: 'var(--faint)' }}>(Self-serve pairing comes later; for now an admin makes the change.)</div>
                </>
              )}
            </div>
          )}

          {meta.key === 'basics' && (
            <>
              <input className="input" placeholder="Studio name" value={studio.studio_name} onChange={ss('studio_name')} />
              <input className="input" placeholder="Default region (e.g. South Africa)" value={studio.default_region} onChange={ss('default_region')} />
            </>
          )}

          {meta.key === 'identity' && (
            <>
              <input className="input" placeholder="Brand name *" value={brand.name} onChange={bs('name')} />
              <input className="input" placeholder="Region / audience country (e.g. South Africa)" value={brand.region} onChange={bs('region')} />
              <textarea className="ta" rows={2} placeholder="Audience — who they are" value={brand.audience} onChange={bs('audience')} />
            </>
          )}

          {meta.key === 'voice' && (
            <>
              <textarea className="ta" rows={4} placeholder="Voice — tone, do's & don'ts, words to avoid, sign-off" value={brand.voice} onChange={bs('voice')} />
              <textarea className="ta" rows={3} placeholder="Brand-safety — red lines, anything to never say or do" value={brand.safety} onChange={bs('safety')} />
            </>
          )}

          {meta.key === 'pillars' && (
            <>
              <textarea className="ta" rows={3} placeholder="Content pillars — recurring themes, one per line" value={brand.pillars} onChange={bs('pillars')} />
              <input className="input" placeholder="Sensitive topics (notify-first) — optional" value={brand.sensitive} onChange={bs('sensitive')} />
              <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>Publishing channels are set per-brand on the Brands page once your accounts are connected.</div>
            </>
          )}

          {meta.key === 'photos' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                Paste 1–3 public image URLs of your real product (one per line). The studio conditions AI media on these so launch images look like the actual thing — not a generic stand-in.
              </div>
              <textarea className="ta" rows={4} placeholder={'https://…/product-front.jpg\nhttps://…/product-side.jpg'} value={refs} onChange={(e) => setRefs(e.target.value)} />
              <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>Must be public <code>https://</code> links the studio can fetch. (Direct upload comes later.)</div>
            </>
          )}

          {meta.key === 'done' && (
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              That’s the core set-up. Two optional boosters:
              <ul style={{ margin: '8px 0 0 18px' }}>
                <li><Link href="/knowledge" style={{ color: brass }}>Add brand knowledge</Link> — drop in docs/notes so content is grounded in real facts.</li>
                <li><Link href="/jobs" style={{ color: brass }}>Create your first piece</Link> — or just tell Constance on Telegram what you want.</li>
              </ul>
              <div style={{ marginTop: 12 }}>The studio also learns your voice automatically from every edit and rejection — it sharpens as you use it.</div>
            </div>
          )}
        </div>

        {err && <div className="err" style={{ marginTop: 12, fontSize: 12.5 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <button
            onClick={back}
            disabled={step === 0 || saving}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, color: step === 0 ? 'var(--faint)' : 'var(--muted)', background: 'none', border: 'none', cursor: step === 0 ? 'default' : 'pointer' }}
          >
            ← Back
          </button>
          {last ? (
            <Link href="/" onClick={finish} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--bg)', background: brass, padding: '7px 16px', borderRadius: 7, fontWeight: 600 }}>
              Finish →
            </Link>
          ) : (
            <button
              onClick={advance}
              disabled={saving}
              style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--bg)', background: brass, padding: '7px 16px', borderRadius: 7, border: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              {saving ? 'Saving…' : 'Continue →'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
