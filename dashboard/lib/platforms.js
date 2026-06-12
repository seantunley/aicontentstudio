// Mirror of plugins/studio/db.py PLATFORM_IMAGE — primary image frame per platform.
// Used to size operator-uploaded photos the same way AI master images are derived.
export const PLATFORM_IMAGE = {
  bluesky: [1080, 1080],
  x: [1600, 900],
  instagram: [1080, 1350],
  facebook: [1080, 1350],
  telegram: [1080, 1080],
  vk: [1080, 1080],
  linkedin: [1200, 1200],
  youtube: [1280, 720],
  tiktok: [1080, 1920],
};

// All platforms the studio can draft for (publish needs the channel connected in Postiz).
export const SUPPORTED = Object.keys(PLATFORM_IMAGE);

// Display metadata for platform picker chips (brand colour + a compact glyph).
export const PLATFORM_META = {
  bluesky: { label: 'Bluesky', color: '#1185fe', glyph: '🦋' },
  x: { label: 'X', color: '#000000', glyph: '𝕏' },
  instagram: { label: 'Instagram', color: '#E1306C', glyph: 'IG' },
  facebook: { label: 'Facebook', color: '#1877F2', glyph: 'f' },
  telegram: { label: 'Telegram', color: '#26A5E4', glyph: '✈' },
  vk: { label: 'VK', color: '#0077FF', glyph: 'VK' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', glyph: 'in' },
  youtube: { label: 'YouTube', color: '#FF0000', glyph: '▶' },
  tiktok: { label: 'TikTok', color: '#111111', glyph: '♪' },
};
