import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { mintAuthToken } from '@/lib/postiz';

export const dynamic = 'force-dynamic';

const POSTIZ_PUBLIC = (process.env.POSTIZ_PUBLIC_URL || 'https://studio-postiz.tunleyinternational.com').replace(/\/$/, '');
const COOKIE_DOMAIN = process.env.STUDIO_COOKIE_DOMAIN || '.tunleyinternational.com';

// SSO into Postiz. The operator is already authenticated to the cockpit (its own session + Cloudflare
// Access), so mint Postiz's `auth` JWT (HS256 over the user id, signed with Postiz's JWT_SECRET) and
// hand it to the browser as a cookie scoped to the shared parent domain. Postiz auto-authenticates on
// the redirect — no second login. If Postiz isn't configured, fall back to opening its own login.
export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.redirect(new URL('/login', req.url));
  let token;
  try {
    token = mintAuthToken();
  } catch {
    return NextResponse.redirect(POSTIZ_PUBLIC);
  }
  const res = NextResponse.redirect(POSTIZ_PUBLIC);
  res.cookies.set('auth', token, {
    domain: COOKIE_DOMAIN,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}
