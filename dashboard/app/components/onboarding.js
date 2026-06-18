'use client';
import { useState } from 'react';
import Link from 'next/link';

// Non-blocking "get studio-ready" panel on The Desk. Doubles as the first-run welcome (until the
// operator acknowledges it) and a live readiness checklist that deep-links each step to its page.
// Hidden once dismissed or 100% complete. State is computed server-side (lib/onboarding.js).
export default function OnboardingPanel({ state }) {
  const [hidden, setHidden] = useState(false);
  const [welcomed, setWelcomed] = useState(state?.welcomed ?? true);

  if (!state || state.dismissed || state.complete || hidden) return null;

  const ping = (body) => {
    try {
      fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { /* best-effort */ }
  };
  const dismiss = () => { setHidden(true); ping({ dismiss: true }); };
  const ackWelcome = () => { setWelcomed(true); ping({ welcomed: true }); };

  const brass = 'var(--accent)';

  return (
    <section className="section reveal" aria-label="Studio setup">
      <div className="panel" style={{ borderColor: 'var(--line-2)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>
            {welcomed ? 'Get your studio performance-ready' : 'Welcome to your studio'}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: brass }}>{state.pct}% ready</div>
        </div>

        {!welcomed && (
          <div style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 2px', maxWidth: '66ch', lineHeight: 1.5 }}>
            This is The Desk. You set the direction; the studio researches, drafts, polishes and fact-checks the work; you approve. The steps below sharpen the output — none of them block you, they just make the studio sound like you and look like your product.
            <div style={{ marginTop: 9 }}>
              <button
                onClick={ackWelcome}
                style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: '4px 11px', border: '1px solid var(--line-2)', background: 'var(--accent-bg)', color: brass, borderRadius: 6, cursor: 'pointer' }}
              >
                Got it →
              </button>
            </div>
          </div>
        )}

        <div style={{ height: 4, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', margin: '13px 0 14px' }}>
          <div style={{ width: `${state.pct}%`, height: '100%', background: brass, transition: 'width .4s ease' }} />
        </div>

        <div style={{ display: 'grid', gap: 2 }}>
          {state.steps.map((s) => {
            const flag = s.key === state.biggestGain;
            return (
              <Link
                key={s.key}
                href={s.href}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', color: 'inherit', borderBottom: '1px solid var(--line)' }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 13, width: 16, textAlign: 'center', color: s.done ? brass : 'var(--faint)' }}>
                  {s.done ? '✓' : '○'}
                </span>
                <span style={{ fontSize: 13, color: s.done ? 'var(--muted)' : 'inherit', textDecoration: s.done ? 'line-through' : 'none' }}>
                  {s.label}
                </span>
                {flag && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.06em', color: brass, border: `1px solid ${brass}`, borderRadius: 10, padding: '1px 7px', marginLeft: 4 }}>
                    BIGGEST GAIN
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', maxWidth: '42ch', textAlign: 'right' }}>
                  {!s.done ? s.hint : ''}
                </span>
              </Link>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 11 }}>
          <button
            onClick={dismiss}
            style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Dismiss setup
          </button>
        </div>
      </div>
    </section>
  );
}
