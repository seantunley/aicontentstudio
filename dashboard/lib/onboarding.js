// Onboarding / "performance readiness" state — what a new operator still needs to set up to get
// optimal output. Read-only, computed server-side from studio.db + env. NON-BLOCKING by design and
// NEVER throws: a failed read just marks that one step undone so The Desk always renders.
import { listBrands, getBrandBySlug, getSetting, getSettingBool, recentJobs } from './db';
import { listNotes } from './knowledge';

const has = (v) => !!(v && String(v).trim());
const hasEnv = (k) => has(process.env[k]);

export function onboardingState(activeBrandSlug = null) {
  let brands = [];
  try { brands = listBrands() || []; } catch { brands = []; }
  let brand = null;
  try { brand = (activeBrandSlug && getBrandBySlug(activeBrandSlug)) || brands[0] || null; } catch { brand = null; }

  const setting = (k) => { try { return getSetting(k); } catch { return null; } };

  let refImages = false;
  if (brand) {
    try {
      const raw = setting('brand_ref_images:' + brand.slug);
      if (raw) {
        const arr = JSON.parse(raw);
        refImages = Array.isArray(arr) && arr.some((u) => typeof u === 'string' && u.startsWith('http'));
      }
    } catch { refImages = false; }
  }

  let knowledge = false;
  try { knowledge = (listNotes() || []).length > 0; } catch { knowledge = false; }

  let firstPiece = false;
  try { firstPiece = (recentJobs(1) || []).length > 0; } catch { firstPiece = false; }

  // weight = how much this input moves output quality (voice / reference photos / Telegram weigh most)
  const steps = [
    { key: 'telegram',  label: 'Connect Telegram',                 done: hasEnv('TELEGRAM_BOT_TOKEN') && hasEnv('TELEGRAM_ALLOWED_USERS'), weight: 3, href: '/onboarding', hint: 'Your control surface — chat to Constance & Nancy.' },
    { key: 'basics',    label: 'Studio basics & region',           done: has(setting('studio_name')) && has(setting('default_region')),    weight: 1, href: '/settings', hint: 'Name, region, timezone, currency.' },
    { key: 'brand',     label: 'Create your first brand',          done: brands.length > 0,                                               weight: 2, href: '/brands',   hint: 'The profile that shapes every draft.' },
    { key: 'voice',     label: 'Define the brand voice',           done: has(brand?.voice),                                               weight: 3, href: '/brands',   hint: 'Tone & do’s/don’ts — the biggest quality lever.' },
    { key: 'pillars',   label: 'Add content pillars',              done: has(brand?.pillars),                                             weight: 1, href: '/brands',   hint: 'Recurring themes to draw from.' },
    { key: 'channels',  label: 'Connect a publishing channel',     done: has(brand?.channels),                                            weight: 1, href: '/brands',   hint: 'Which platforms this brand may post to.' },
    { key: 'refimages', label: 'Add reference product photos',     done: refImages,                                                       weight: 3, href: '/onboarding', hint: 'Real photos so AI media looks like your product.' },
    { key: 'knowledge', label: 'Add brand knowledge',             done: knowledge,                                                       weight: 1, href: '/knowledge', hint: 'Docs that ground content in facts.' },
    { key: 'first',     label: 'Create & approve your first piece', done: firstPiece,                                                     weight: 1, href: '/jobs',     hint: 'Prove the pipeline end-to-end.' },
  ];

  const total = steps.reduce((s, x) => s + x.weight, 0);
  const earned = steps.reduce((s, x) => s + (x.done ? x.weight : 0), 0);
  const pct = total ? Math.round((earned / total) * 100) : 0;
  const missing = steps.filter((s) => !s.done).sort((a, b) => b.weight - a.weight);

  let dismissed = false, welcomed = false;
  try { dismissed = getSettingBool('onboarding_dismissed', false); } catch { dismissed = false; }
  try { welcomed = getSettingBool('onboarding_welcomed', false); } catch { welcomed = false; }

  return {
    pct,
    steps,
    biggestGain: missing[0]?.key || null,
    dismissed,
    welcomed,
    complete: pct === 100,
    brandName: brand?.name || null,
  };
}
