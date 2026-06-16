// Operator-editable, DB-backed runtime settings (the /settings page). Each is read at runtime by the
// dashboard and/or the worker via getSetting(), with the listed default as fallback. This list is the
// WHITELIST the save API honours — nothing outside it can be written. Secrets and anything needing a
// container restart are NOT here; they're shown read-only as status on the page.
//
// `tier: 'admin'` marks settings a platform admin tunes rarely (shown in the Advanced tab). Field
// types: text | number | bool | textarea.

export const EDITABLE_TABS = [
  {
    id: 'general',
    label: 'General',
    fields: [
      { key: 'studio_name', label: 'Studio name', type: 'text', default: 'The Studio',
        help: 'The wordmark shown in the cockpit masthead.' },
      { key: 'operator_email', label: 'Operator email', type: 'text', default: '',
        help: 'Your identity for single sign-on — embedded apps (Typebot) provision your account under this email. Empty falls back to the OPERATOR_EMAIL env.' },
      { key: 'default_region', label: 'Default region', type: 'text', default: 'South Africa',
        help: 'Region the worker leans on for local policy / suggested products when a brand has none set.' },
      { key: 'zar_per_usd', label: 'ZAR per USD', type: 'number', default: '16.28',
        help: 'Exchange rate the cost ledger uses to show Rands. Update as it moves.' },
    ],
  },
  {
    id: 'generation',
    label: 'Generation & Media',
    fields: [
      { key: 'video_animate', label: 'Grok motion video by default', type: 'bool', default: 'true',
        help: 'On: voiced videos get a real Grok Imagine moving background (slower, richer). Off: the free Ken-Burns slow-zoom of the still.' },
      { key: 'video_captions', label: 'Time-synced captions by default', type: 'bool', default: 'false',
        help: 'On: voiced videos get caption pills burned in (good for silent autoplay). Off: clean video, no on-screen text.' },
      { key: 'video_default_seconds', label: 'Default video length (seconds)', type: 'number', default: '6',
        help: 'Default duration for a generated short when the request does not specify one (4–15).' },
      { key: 'image_art_direction', label: 'Default image art-direction', type: 'textarea', default: '',
        help: 'Extra house style appended to every image prompt (look, lighting, palette, mood). Empty = the worker’s built-in “polished, professional” default.' },
    ],
  },
  {
    id: 'pipeline',
    label: 'Content pipeline',
    fields: [
      { key: 'polish_enabled', label: 'Polish drafts before review', type: 'bool', default: 'true',
        help: 'Run the marketing-psychology + humanizer passes on each draft before it reaches the approval gate.' },
      { key: 'social_pulse_enabled', label: 'Ground research in current social discussion', type: 'bool', default: 'true',
        help: 'Pull the last-30-days social pulse (on-topic only) into the worker’s research. Off = web research only.' },
      { key: 'social_pulse_sources', label: 'Social-pulse sources', type: 'text', default: 'reddit',
        help: 'Comma-separated, for the current-discussion research: reddit, hackernews, polymarket.' },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    fields: [
      { key: 'engagement_default_brand', label: 'Default brand for replies', type: 'text', default: '',
        help: 'Brand voice used when drafting replies to inbound messages. Empty = the sole brand, else "unassigned".' },
      { key: 'engagement_autodraft', label: 'Auto-draft inbound replies', type: 'bool', default: 'true',
        help: 'On: the worker polls Chatwoot and drafts on-brand replies for new inbound messages (you still send every reply).' },
    ],
  },
  {
    id: 'worker',
    label: 'Worker & jobs',
    tier: 'admin',
    fields: [
      { key: 'worker_run_timeout', label: 'Job run timeout (seconds)', type: 'number', default: '1500',
        help: 'Max time one research+draft pass may run before it’s treated as timed out. Default 1500 (25 min).' },
      { key: 'worker_max_attempts', label: 'Max job attempts', type: 'number', default: '3',
        help: 'Resumable-loop cap: after this many passes a partial job is left for review rather than retried forever.' },
      { key: 'worker_lock_stale', label: 'Stale-lock timeout (seconds)', type: 'number', default: '2700',
        help: 'A worker lock older than this self-heals (assumes the holder crashed). Default 2700 (45 min).' },
    ],
  },
];

// flat lookup of key -> {type, default, ...} for the save API to validate against
export const EDITABLE_KEYS = Object.fromEntries(
  EDITABLE_TABS.flatMap((t) => t.fields.map((f) => [f.key, f])),
);
