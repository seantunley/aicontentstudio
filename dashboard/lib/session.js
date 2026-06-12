// Vetted session handling via iron-session (encrypted, signed http-only cookie).
// Single-operator login for the §7a cockpit; MFA/passkey/step-up are the later hardening pass.
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

const options = {
  password: process.env.SESSION_SECRET || 'insecure-dev-secret-please-set-SESSION_SECRET-32chars',
  cookieName: 'studio_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true', // false over HTTP/LAN; true behind HTTPS/Tailscale
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  },
};

export async function getSession() {
  return getIronSession(await cookies(), options);
}
