// Server-side status for the Settings panel: integration readiness (●/○) + system/worker info.
// Presence-only — secret VALUES are never included, just whether each is set.
const has = (k) => {
  const v = process.env[k];
  return !!(v && String(v).trim());
};

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

  return { integrations, system };
}
