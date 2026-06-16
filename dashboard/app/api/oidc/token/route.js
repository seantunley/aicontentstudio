import { NextResponse } from 'next/server';
import { clientOk, randomToken, pkceOk, signIdToken } from '@/lib/oidc';
import { oauthConsumeCode, oauthSaveToken } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Token endpoint. Exchanges a one-time code (with client auth + PKCE) for an access token and a
// signed OIDC id_token.
export async function POST(req) {
  let body = {};
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) body = await req.json().catch(() => ({}));
  else { try { const f = await req.formData(); body = Object.fromEntries(f.entries()); } catch {} }

  // client auth: HTTP Basic or POST body
  let clientId = body.client_id, clientSecret = body.client_secret;
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    const [u, s] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':');
    clientId = clientId || decodeURIComponent(u || '');
    clientSecret = clientSecret || decodeURIComponent(s || '');
  }
  if (!clientOk(clientId, clientSecret)) return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
  if (body.grant_type !== 'authorization_code') return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });

  const rec = oauthConsumeCode(body.code, clientId, body.redirect_uri);
  if (!rec) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  if (!pkceOk(rec.codeChallenge, body.code_verifier)) return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });

  const accessToken = randomToken();
  oauthSaveToken(accessToken, { sub: rec.sub, email: rec.email, name: rec.name });
  const idToken = await signIdToken({ sub: rec.sub, email: rec.email, name: rec.name, nonce: rec.nonce });

  return NextResponse.json({
    access_token: accessToken,
    id_token: idToken,
    token_type: 'Bearer',
    expires_in: 300,
    scope: body.scope || 'openid email profile',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
