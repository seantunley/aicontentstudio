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
      { key: 'default_region', label: 'Default region', type: 'select', optionsKey: 'regions', default: 'South Africa',
        help: 'Country the worker leans on for local policy / suggested products when a brand has none set.' },
      { key: 'zar_per_usd', label: 'ZAR per USD', type: 'number', default: '16.28',
        help: 'Exchange rate the cost ledger uses to show Rands. Update as it moves.' },
      { key: 'weather_location', label: 'Weather location', type: 'select', optionsKey: 'cities', default: 'Johannesburg',
        help: 'City shown in the top-bar weather widget. Pick from the list (each has built-in coordinates, so it always resolves).' },
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
      { key: 'carousel_default_slides', label: 'Default carousel slides', type: 'number', default: '4',
        help: 'How many slides a carousel gets when the request doesn’t specify (clamped 2–10).' },
      { key: 'video_max_seconds', label: 'Max video length (seconds)', type: 'number', default: '15',
        help: 'Upper bound on generated video duration. The default length setting sits within this cap.' },
    ],
  },
  {
    id: 'pipeline',
    label: 'Content pipeline',
    fields: [
      { key: 'claude_writes', label: 'Claude writes the posts', type: 'bool', default: 'true',
        help: 'On: Claude (your subscription, via the brain seam) does the research + brief + drafts; images/video stay on Grok/fal. Off (or if the brain is unconfigured): the standard pipeline. Falls back automatically if Claude can’t ground a brief.' },
      { key: 'polish_enabled', label: 'Polish drafts before review', type: 'bool', default: 'true',
        help: 'Run the marketing-psychology + humanizer passes on each draft before it reaches the approval gate.' },
      { key: 'social_pulse_enabled', label: 'Ground research in current social discussion', type: 'bool', default: 'true',
        help: 'Pull the last-30-days social pulse (on-topic only) into the worker’s research. Off = web research only.' },
      { key: 'social_pulse_sources', label: 'Social-pulse sources', type: 'multiselect', default: 'reddit',
        options: [
          { value: 'reddit', label: 'Reddit' },
          { value: 'hackernews', label: 'Hacker News' },
          { value: 'polymarket', label: 'Polymarket' },
          { value: 'github', label: 'GitHub' },
        ],
        help: 'Which current-discussion sources the worker pulls into research (via the last30days skill). Tick more than just Reddit to widen the pulse.' },
      { key: 'recent_learnings_count', label: 'Operator feedback fed to drafting', type: 'number', default: '6',
        help: 'How many of your most recent edits/rejections per brand the worker feeds back into drafting to learn your voice.' },
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
    id: 'scout',
    label: 'Scout & Discovery',
    fields: [
      { key: 'scout_ideas_per_niche', label: 'Ideas per niche', type: 'number', default: '5',
        help: 'How many specific trend ideas the scout suggests per niche each run.' },
      { key: 'scout_horizon_days', label: 'Freshness window (days)', type: 'number', default: '14',
        help: 'Scout prefers things surfacing within this many days over evergreen topics.' },
      { key: 'scout_timeout', label: 'Scout run timeout (seconds)', type: 'number', default: '300',
        help: 'Max time the scout spends per niche before stopping. Falls back to the STUDIO_SCOUT_TIMEOUT env if unset.' },
    ],
  },
  {
    id: 'retention',
    label: 'Trash & retention',
    fields: [
      { key: 'trash_ttl_days', label: 'Trash retention (days)', type: 'number', default: '30',
        help: 'Rejected posts and deleted media are hard-deleted this many days after they hit the trash.' },
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
