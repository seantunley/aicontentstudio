import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { CLIENT_ID, clientOk, redirectOk, randomToken, operatorClaims } from '@/lib/oidc';
import { oauthSaveCode } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Authorization endpoint. If the operator is logged into the studio, issue a one-time code and bounce
// back to the client. If not, send them to the studio login and resume this exact request afterwards.
export async function GET(req) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const clientId = p.get('client_id');
  const redirectUri = p.get('redirect_uri');
  const state = p.get('state') || '';

  // validate client + redirect BEFORE doing anything that could leak (no open redirect)
  if (clientId !== CLIENT_ID) return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
  if (!redirectUri || !redirectOk(redirectUri)) return NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 });
  if (p.get('response_type') !== 'code') return NextResponse.json({ error: 'unsupported_response_type' }, { status: 400 });

  const session = await getSession();
  if (!session.user) {
    // Relative redirect so the browser resolves it against the real public host it requested
    // (behind the container, url.origin is the internal 0.0.0.0:3000 — unreachable).
    const next = encodeURIComponent(url.pathname + url.search);
    return new NextResponse(null, { status: 302, headers: { Location: `/login?next=${next}` } });
  }

  const c = operatorClaims(session.user);
  const code = randomToken();
  oauthSaveCode(code, {
    clientId, redirectUri, sub: c.sub, email: c.email, name: c.name,
    nonce: p.get('nonce') || null,
    codeChallenge: p.get('code_challenge_method') === 'S256' ? p.get('code_challenge') : null,
  });

  const back = new URL(redirectUri);
  back.searchParams.set('code', code);
  if (state) back.searchParams.set('state', state);
  return NextResponse.redirect(back);
}
