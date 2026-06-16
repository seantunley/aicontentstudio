/** @type {import('next').NextConfig} */
export default {
  // better-sqlite3 is a native module — keep it out of the bundle, load at runtime.
  serverExternalPackages: ['better-sqlite3'],
  // OIDC discovery: clients fetch the SPEC path `${issuer}/.well-known/openid-configuration`, but
  // Next's app router can't route a `.well-known` folder — so rewrite it to the real route handler.
  async rewrites() {
    return [
      { source: '/api/oidc/.well-known/openid-configuration', destination: '/api/oidc/openid-configuration' },
    ];
  },
  // The image editor (Filerobot/konva) renders client-side only.
  reactStrictMode: false,
  webpack: (config) => {
    // konva ships a node entry that require()s the native 'canvas' package for server-side
    // rendering. The Studio Editor is browser-only (dynamic import, ssr:false), so we don't
    // need it — alias 'canvas' to false so webpack stops trying to resolve it during build.
    config.resolve.alias = { ...(config.resolve.alias || {}), canvas: false };
    return config;
  },
};
