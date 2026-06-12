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
