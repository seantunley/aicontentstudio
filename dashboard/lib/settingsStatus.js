// Server-side status for the Settings panel: integration readiness (●/○) + system/worker info +
// a read-only view of the platform-capability registry. Presence-only — secret VALUES are never
// included, just whether each is set.
import Holidays from 'date-holidays';
import { getSetting } from './db';
import { PLATFORM_META, PLATFORM_LIMITS, PLATFORM_IMAGE, PLATFORM_CAPS } from './platforms';
import { CITY_NAMES } from './cities';

// Country list for the region dropdown — from date-holidays (the same source the occasions feature
// already uses), so it's a real, complete list rather than a typed free-text city.
function regionOptions() {
  try {
    const c = new Holidays().getCountries('en');
    return Object.values(c).sort((a, b) => a.localeCompare(b));
  } catch {
    return ['South Africa'];
  }
}

const has = (k) => {
  const v = process.env[k];
  return !!(v && String(v).trim());
};

const dims = (a) => (Array.isArray(a) && a.length === 2 ? `${a[0]}×${a[1]}` : '—');

// The LIVE platform registry the worker publishes to the DB (_registry_json = source of truth from
// registry.py + db.PLATFORM_IMAGE/VIDEO). Falls back to the dashboard's static mirror if the worker
// hasn't run yet. Read-only — shown so the operator can verify the rules without reading code.
function platformRegistry() {
  let reg = null;
  try { const raw = getSetting('_registry_json'); if (raw) reg = JSON.parse(raw); } catch {}
  const keys = reg ? Object.keys(reg) : Object.keys(PLATFORM_LIMITS);
  const rows = keys.map((k) => {
    const meta = PLATFORM_META[k] || { label: k, color: '#888' };
    const r = reg && reg[k];
    if (r) {
      return { key: k, label: meta.label, color: meta.color, captionMax: r.caption_max, mediaMax: r.media_max,
        carousel: !!r.carousel, video: !!r.video, altText: !!r.alt_text, hashtags: !!r.hashtags,
        image: dims(r.image), videoDims: dims(r.video_dims) };
    }
    const caps = PLATFORM_CAPS[k] || {};
    return { key: k, label: meta.label, color: meta.color, captionMax: PLATFORM_LIMITS[k], mediaMax: caps.mediaMax,
      carousel: !!caps.carousel, video: !!caps.video, altText: null, hashtags: null,
      image: dims(PLATFORM_IMAGE[k]), videoDims: '—' };
  });
  return { live: !!reg, rows };
}

export function settingsStatus() {
  const integrations = [
    { label: 'Postiz · publishing', ok: has('POSTIZ_API_KEY'),
      detail: has('POSTIZ_API_KEY') ? 'API key set' : 'no API key',
      extra: has('POSTIZ_JWT_SECRET') ? 'calendar reschedule on' : 'calendar reschedule off' },
    { label: 'Chatwoot · engagement inbox', ok: has('CHATWOOT_API_TOKEN') && has('CHATWOOT_ACCOUNT_ID'),
      detail: has('CHATWOOT_API_TOKEN') ? `account ${process.env.CHATWOOT_ACCOUNT_ID || '?'}` : 'no API token',
      extra: process.env.CHATWOOT_PUBLIC_URL || null },
    { label: 'Mautic · funnels API', ok: has('MAUTIC_API_USER') && has('MAUTIC_API_PASSWORD'),
      detail: has('MAUTIC_API_USER') ? 'native mirror live' : 'API creds missing',
      extra: process.env.MAUTIC_PUBLIC_URL || null },
    { label: 'Typebot · flows', ok: has('TYPEBOT_PUBLIC_URL'),
      detail: has('TYPEBOT_PUBLIC_URL') ? 'embedded' : 'not configured',
      extra: process.env.TYPEBOT_PUBLIC_URL || null },
    { label: 'Telegram · bot', ok: has('TELEGRAM_BOT_TOKEN') && has('TELEGRAM_CHAT_ID'),
      detail: has('TELEGRAM_BOT_TOKEN') ? 'bot token set' : 'no bot token',
      extra: has('TELEGRAM_CHAT_ID') ? 'operator chat linked' : 'chat not linked' },
    { label: 'Studio SSO · OIDC provider', ok: has('STUDIO_OIDC_CLIENT_SECRET') && has('STUDIO_OIDC_PRIVATE_KEY_B64'),
      detail: has('STUDIO_OIDC_CLIENT_SECRET') ? 'signing key + client set' : 'not configured',
      extra: process.env.STUDIO_OIDC_ISSUER || null },
    { label: 'Lead capture · token', ok: has('FUNNEL_CAPTURE_TOKEN'),
      detail: has('FUNNEL_CAPTURE_TOKEN') ? 'Typebot → Mautic capture armed' : 'no capture token',
      extra: null },
    { label: 'Session security', ok: has('SESSION_SECRET'),
      detail: has('SESSION_SECRET') ? 'cookie encryption set' : 'using insecure dev secret',
      extra: process.env.COOKIE_SECURE === 'true' ? 'secure cookies (HTTPS)' : 'cookies over HTTP/LAN' },
  ];

  const workerEnv = [
    { label: 'Publishing mode', controls: 'STUDIO_DRY_RUN — when ON, nothing posts for real (drafts + logs only).',
      where: 'hermes service in compose.yml. Kept OFF the web UI on purpose so live publishing is never one click away.' },
    { label: 'Image & video generation', controls: 'xAI Grok Imagine (image_gen / video_gen) on the SuperGrok subscription.',
      where: 'Hermes config.yaml (image_gen.provider / video.provider).' },
    { label: 'Studio text model', controls: 'STUDIO_TEXT_MODEL / STUDIO_TEXT_PROVIDER — the model the worker drafts with (empty = inherit the chat model).',
      where: 'root .env.' },
    { label: 'Research enrichment', controls: 'OPENROUTER_API_KEY (social-pulse reasoning) and TAVILY_API_KEY (worker web search).',
      where: 'root .env.' },
    { label: 'Voiceover (video)', controls: 'ELEVENLABS_API_KEY — natural TTS when set, else local Piper.',
      where: 'renderer service in compose.yml.' },
  ];

  const system = {
    dbPath: process.env.STUDIO_DB_PATH || '/opt/studio/studio.db',
    knowledgeDir: process.env.KNOWLEDGE_DIR || '/opt/studio/knowledge',
    timezone: 'Africa/Johannesburg (fixed)',
    workerEnv,
  };

  return { integrations, system, registry: platformRegistry(), options: { regions: regionOptions(), cities: CITY_NAMES } };
}
