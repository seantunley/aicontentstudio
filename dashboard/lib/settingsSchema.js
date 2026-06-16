// Operator-editable, DB-backed runtime settings (the /settings page). Each is read by the dashboard
// and/or the worker at runtime via getSetting(), with the listed default as fallback. This list is
// the WHITELIST the save API honours — nothing outside it can be written. Secrets and anything that
// needs a container restart are NOT here; they're shown read-only as "status" on the page.

export const EDITABLE_TABS = [
  {
    id: 'general',
    label: 'General',
    fields: [
      { key: 'studio_name', label: 'Studio name', type: 'text', default: 'The Studio',
        help: 'The wordmark shown in the cockpit masthead.' },
      { key: 'zar_per_usd', label: 'ZAR per USD', type: 'number', default: '16.28',
        help: 'Exchange rate the cost ledger uses to show Rands. Update as it moves.' },
      { key: 'default_region', label: 'Default region', type: 'text', default: 'South Africa',
        help: 'Region the worker leans on for local policy / suggested products when a brand has none set.' },
    ],
  },
  {
    id: 'generation',
    label: 'Generation & Video',
    fields: [
      { key: 'video_animate', label: 'Grok motion video by default', type: 'bool', default: 'true',
        help: 'On: voiced videos get a real Grok Imagine moving background (slower, richer). Off: the free Ken-Burns slow-zoom of the still (faster).' },
      { key: 'video_captions', label: 'Time-synced captions by default', type: 'bool', default: 'false',
        help: 'On: voiced videos get time-synced caption pills burned in (good for silent autoplay). Off (current default): clean video with no on-screen text.' },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    fields: [
      { key: 'engagement_default_brand', label: 'Default brand for replies', type: 'text', default: '',
        help: 'Brand voice used when drafting replies to inbound messages. Empty = the sole brand, else "unassigned".' },
      { key: 'social_pulse_sources', label: 'Social-pulse sources', type: 'text', default: 'reddit',
        help: 'Comma-separated, for the current-discussion research: reddit, hackernews, polymarket.' },
    ],
  },
];

// flat lookup of key -> {type, default} for the save API to validate against
export const EDITABLE_KEYS = Object.fromEntries(
  EDITABLE_TABS.flatMap((t) => t.fields.map((f) => [f.key, f])),
);
