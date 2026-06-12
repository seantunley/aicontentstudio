/** @type {import('next').NextConfig} */
export default {
  // better-sqlite3 is a native module — keep it out of the bundle, load at runtime.
  serverExternalPackages: ['better-sqlite3'],
};
