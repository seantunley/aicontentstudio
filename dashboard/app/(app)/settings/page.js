import { allSettings } from '@/lib/db';
import { EDITABLE_TABS } from '@/lib/settingsSchema';
import { SettingsPanel } from '@/app/components/settings';

export const dynamic = 'force-dynamic';

// Is an env var set to a non-empty value? Used only to show ●/○ — values are never sent to the client.
const has = (k) => {
  const v = process.env[k];
  return !!(v && String(v).trim());
};

export default function Settings() {
  // Current editable values: stored value, else schema default.
  let stored = {};
  try { stored = allSettings(); } catch {}
  const values = {};
  for (const t of EDITABLE_TABS) {
    for (const f of t.fields) values[f.key] = stored[f.key] != null ? stored[f.key] : f.default;
  }

  // Integration readiness the dashboard can actually see (its own container env). Non-secret
  // descriptors (public URLs, account ids) are shown; secrets are reduced to "set / not set".
  const integrations = [
    { label: 'Postiz (publishing)', ok: has('POSTIZ_API_KEY'),
      detail: has('POSTIZ_API_KEY') ? 'API key set' : 'no API key',
      extra: has('POSTIZ_JWT_SECRET') ? 'calendar drag-reschedule enabled' : 'calendar reschedule off (no JWT secret)' },
    { label: 'Chatwoot (engagement)', ok: has('CHATWOOT_API_TOKEN') && has('CHATWOOT_ACCOUNT_ID'),
      detail: has('CHATWOOT_API_TOKEN') ? `account ${process.env.CHATWOOT_ACCOUNT_ID || '?'}` : 'no API token',
      extra: process.env.CHATWOOT_PUBLIC_URL || null },
    { label: 'Mautic (funnels)', ok: has('MAUTIC_PUBLIC_URL'),
      detail: has('MAUTIC_PUBLIC_URL') ? 'embedded' : 'not configured',
      extra: process.env.MAUTIC_PUBLIC_URL || null },
    { label: 'Telegram (operator DMs)', ok: has('TELEGRAM_BOT_TOKEN') && has('TELEGRAM_CHAT_ID'),
      detail: has('TELEGRAM_BOT_TOKEN') ? 'bot token set' : 'no bot token',
      extra: has('TELEGRAM_CHAT_ID') ? 'chat linked' : 'chat not linked' },
    { label: 'Session security', ok: has('SESSION_SECRET'),
      detail: has('SESSION_SECRET') ? 'cookie encryption set' : 'using insecure dev secret',
      extra: process.env.COOKIE_SECURE === 'true' ? 'secure cookies (HTTPS)' : 'cookies over HTTP/LAN' },
  ];

  // Worker/renderer-side config lives in those containers' env, not the dashboard's — so this is
  // a reference list (what each controls + where it's set), not live status.
  const workerEnv = [
    { label: 'Publishing mode', controls: 'STUDIO_DRY_RUN — when ON, nothing posts for real (drafts + logs only).',
      where: 'hermes service in compose.yml. Kept OFF the web UI on purpose so live publishing is never one click away.' },
    { label: 'Image & video generation', controls: 'xAI Grok Imagine (image_gen / video_gen), on the SuperGrok subscription.',
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
    workerEnv,
  };

  return (
    <>
      <div className="phead">
        <div>
          <h1>Settings</h1>
          <div className="lede">The studio&rsquo;s control panel. Editable options save instantly and take effect on the next run — no restart. Secrets and keys are shown as status only; they live in the gitignored <span className="kbd">.env</span> files, never here.</div>
        </div>
        <div className="crumbs">operator control</div>
      </div>
      <SettingsPanel tabs={EDITABLE_TABS} values={values} integrations={integrations} system={system} />
    </>
  );
}
