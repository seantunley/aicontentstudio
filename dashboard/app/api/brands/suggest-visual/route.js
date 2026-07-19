import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSetting } from '@/lib/db';

// § Suggest a brand's VISUAL identity from its existing voice/pillars/audience. Asks Claude-brain via the
// host bridge when reachable (subscription, no per-token cost); ALWAYS falls back to a tasteful, archetype-
// and voice-derived suggestion so the button never dead-ends. The operator reviews/tweaks before saving —
// nothing is written here.

// Must mirror the dropdown in components/brands.js exactly, or a suggested archetype won't select.
const ARCHETYPES = ['The Innocent', 'The Sage', 'The Explorer', 'The Rebel', 'The Magician', 'The Hero',
  'The Lover', 'The Jester', 'The Everyman', 'The Caregiver', 'The Ruler', 'The Creator'];

// Curated per-archetype starting points (colour psychology). palette = {primary,secondary,accent,bg}.
const ARCH = {
  'The Innocent':  { palette: { primary: '#7FB3D5', secondary: '#FBEEE6', accent: '#F5B841', bg: '#FCFBF7' }, mood: 'clean, light, optimistic', art: 'Bright, airy natural light; simple honest compositions with lots of negative space; soft pastels; never dark, heavy or cynical.' },
  'The Sage':      { palette: { primary: '#37516B', secondary: '#DCE3E8', accent: '#B9975B', bg: '#F5F6F4' }, mood: 'calm, considered, trustworthy', art: 'Measured editorial compositions; soft even light; muted blues and warm neutrals; clear, uncluttered space; never chaotic or flashy.' },
  'The Explorer':  { palette: { primary: '#3E6E5B', secondary: '#E4D8C4', accent: '#E07A3F', bg: '#F6F2EA' }, mood: 'adventurous, earthy, open', art: 'Wide natural scenes and candid movement; golden daylight; earthy greens and warm sand; real texture; never staged or studio-slick.' },
  'The Rebel':     { palette: { primary: '#1A1A1A', secondary: '#E63946', accent: '#F4D35E', bg: '#0E0E0E' }, mood: 'bold, raw, defiant', art: 'High-contrast and gritty; hard shadows; a single hot accent against near-black; candid attitude; never soft or corporate.' },
  'The Magician':  { palette: { primary: '#4B2E83', secondary: '#C9B7E8', accent: '#E8B84B', bg: '#14101F' }, mood: 'mystical, elevated, transformative', art: 'Dramatic directional light; deep purples and midnight tones; a hint of glow; a sense of before→after; never mundane or flat.' },
  'The Hero':      { palette: { primary: '#17408B', secondary: '#E8ECF2', accent: '#E4572E', bg: '#0F1420' }, mood: 'bold, determined, energetic', art: 'Dynamic low angles and strong directional light; confident blues with a decisive accent; motion and effort; never passive or timid.' },
  'The Lover':     { palette: { primary: '#B23A48', secondary: '#F3D9DC', accent: '#D98E73', bg: '#FBF3F1' }, mood: 'warm, intimate, tender', art: 'Soft warm light and shallow focus; close human moments; rich reds and blush tones; tactile detail; never clinical or cold.' },
  'The Jester':    { palette: { primary: '#FF6B6B', secondary: '#4ECDC4', accent: '#FFD93D', bg: '#FFFBF0' }, mood: 'playful, bright, fun', art: 'Bold saturated colour and cheeky compositions; bright even light; energy and surprise; never serious or muted.' },
  'The Everyman':  { palette: { primary: '#5B7553', secondary: '#EDE6D8', accent: '#D98E4B', bg: '#F7F4EE' }, mood: 'friendly, honest, down-to-earth', art: 'Real, unposed people in everyday settings; natural daylight; warm approachable neutrals; nothing aspirational-fake or glossy.' },
  'The Caregiver': { palette: { primary: '#C97C6B', secondary: '#F4E4D6', accent: '#7FA99B', bg: '#FBF6F1' }, mood: 'warm, tender, reassuring', art: 'Soft natural daylight and gentle, close human moments; warm blush and calming sage tones; real unposed people; nothing clinical, harsh or fear-inducing.' },
  'The Ruler':     { palette: { primary: '#1C2733', secondary: '#C9A24B', accent: '#8A7B57', bg: '#0E141B' }, mood: 'premium, refined, authoritative', art: 'Elegant, symmetrical compositions; controlled dramatic light; deep navy and gold; luxe materials; never cluttered or casual.' },
  'The Creator':   { palette: { primary: '#E76F51', secondary: '#2A9D8F', accent: '#E9C46A', bg: '#FBF8F2' }, mood: 'imaginative, expressive, crafted', art: 'Bold, artful compositions and colour blocking; interesting texture and making-of detail; a confident palette; never generic or templated.' },
};
const NEUTRAL = { palette: { primary: '#2E3A46', secondary: '#E7E3DB', accent: '#C08A3E', bg: '#14171A' }, mood: 'warm, editorial, considered', art: 'Natural directional light; clean editorial compositions with generous negative space; a warm brass accent; real texture over gloss; never stock-photo perfection or AI-slick.' };

// Keyword → archetype, used only when the brand has no archetype set yet.
const GUESS = [
  [/nurtur|\bcare\b|caregiv|support|gentle|non-?judg|comfort|reassur|warm|mother|parent|family/i, 'The Caregiver'],
  [/evidence|scien|expert|guide|explain|knowledge|research|inform|teach|educat/i, 'The Sage'],
  [/adventure|explor|outdoor|journey|travel|wild|trail/i, 'The Explorer'],
  [/premium|luxur|elegant|exclusive|refined|prestige/i, 'The Ruler'],
  [/\bfun\b|playful|humou?r|witty|cheeky|quirky/i, 'The Jester'],
  [/creat|craft|design|imagin|artist|maker/i, 'The Creator'],
  [/\blove\b|intimate|romance|sensual|tender/i, 'The Lover'],
  [/\bhero\b|\bwin\b|achieve|strong|bold|conquer|perform/i, 'The Hero'],
  [/everyday|down-?to-?earth|relatable|honest|real people|approachable/i, 'The Everyman'],
  [/rebel|disrupt|challenge the|break the|unconventional|edgy/i, 'The Rebel'],
  [/magic|transform|wonder|mystic|enchant/i, 'The Magician'],
  [/\bpure\b|simple|clean|innocent|optimis|wholesome/i, 'The Innocent'],
];

const HEX = /^#[0-9a-fA-F]{6}$/;

function guessArchetype(brand) {
  if (brand.archetype && ARCHETYPES.includes(brand.archetype)) return brand.archetype;
  const hay = `${brand.voice || ''} ${brand.pillars || ''} ${brand.audience || ''} ${brand.name || ''}`;
  for (const [re, a] of GUESS) if (re.test(hay)) return a;
  return null;
}

function heuristic(brand) {
  const a = guessArchetype(brand);
  const base = (a && ARCH[a]) || NEUTRAL;
  return { palette: { ...base.palette }, archetype: a || '', visual_mood: base.mood, art_direction: base.art };
}

function bridgeCfg() {
  let url = (process.env.CLAUDE_BRIDGE_URL || getSetting('claude_bridge_url', '') || '').trim().replace(/\/+$/, '');
  // Settings store the worker's loopback URL; from a container that must go through the host gateway.
  url = url.replace(/\/\/(127\.0\.0\.1|localhost)(:|\/|$)/, '//host.docker.internal$2');
  const token = (process.env.CLAUDE_BRIDGE_TOKEN || getSetting('claude_bridge_token', '') || '').trim();
  return { url, token };
}

async function askBrain(prompt, timeoutMs = 70000) {
  const { url, token } = bridgeCfg();
  if (!url) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${url}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': token },
      body: JSON.stringify({ prompt, timeout: Math.round(timeoutMs / 1000) - 5, model: getSetting('studio_brain_model', 'opus'), effort: 'medium' }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => ({}));
    return (d.text || '').trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseSuggestion(text) {
  if (!text) return null;
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  return obj;
}

// Merge the model's proposal onto the heuristic so the result is ALWAYS complete + valid.
function normalise(raw, fallback) {
  const out = { palette: { ...fallback.palette }, archetype: fallback.archetype, visual_mood: fallback.visual_mood, art_direction: fallback.art_direction };
  if (raw && typeof raw === 'object') {
    const p = raw.palette || {};
    for (const k of ['primary', 'secondary', 'accent', 'bg']) {
      if (typeof p[k] === 'string' && HEX.test(p[k].trim())) out.palette[k] = p[k].trim().toLowerCase();
    }
    if (typeof raw.archetype === 'string' && ARCHETYPES.includes(raw.archetype.trim())) out.archetype = raw.archetype.trim();
    if (typeof raw.visual_mood === 'string' && raw.visual_mood.trim()) out.visual_mood = raw.visual_mood.trim().slice(0, 90);
    if (typeof raw.art_direction === 'string' && raw.art_direction.trim()) out.art_direction = raw.art_direction.trim().slice(0, 700);
  }
  return out;
}

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const brand = {
    name: (b.name || '').toString().slice(0, 200),
    region: (b.region || '').toString().slice(0, 300),
    audience: (b.audience || '').toString().slice(0, 800),
    voice: (b.voice || '').toString().slice(0, 2000),
    pillars: (b.pillars || '').toString().slice(0, 800),
    archetype: (b.archetype || '').toString(),
  };
  if (!brand.name && !brand.voice && !brand.audience) {
    return NextResponse.json({ error: 'Add a name and some voice/audience first — the suggestion reads those.' }, { status: 400 });
  }

  const fallback = heuristic(brand);

  const prompt = [
    'You are a senior brand art director. From the brand below, propose ONE cohesive VISUAL identity.',
    'Return ONLY minified JSON (no prose, no code fences) with EXACTLY these keys:',
    '{"palette":{"primary":"#RRGGBB","secondary":"#RRGGBB","accent":"#RRGGBB","bg":"#RRGGBB"},"archetype":"<one of the list>","visual_mood":"<3-6 word phrase>","art_direction":"<2-3 sentences: lighting, composition, photography-vs-illustration, and what to NEVER show>"}',
    `archetype MUST be exactly one of: ${ARCHETYPES.join(', ')}.`,
    'Colours: real hex, good contrast; bg is a page/background tone; accent is a single strong highlight; suit the audience and topic (e.g. a maternal-health brand should feel warm and reassuring, never clinical or alarming).',
    'Keep it grounded and non-generic — reflect THIS brand\'s voice, not stock defaults.',
    '',
    `name: ${brand.name || '(unnamed)'}`,
    `region/audience: ${brand.region}`,
    `audience: ${brand.audience}`,
    `voice: ${brand.voice}`,
    `pillars: ${brand.pillars}`,
  ].join('\n');

  const text = await askBrain(prompt);
  const parsed = parseSuggestion(text);
  const source = parsed ? 'brain' : 'fallback';
  const suggestion = normalise(parsed, fallback);

  return NextResponse.json({ ok: true, suggestion, source });
}
