// Studio = the single sign-on identity provider (§SSO). A minimal, standards-compliant OIDC
// authorization-code provider for trusted FIRST-PARTY clients on the LAN (currently Typebot's
// "Sign in with Studio"). The operator logs into the studio once; embedded apps delegate auth here
// and auto-provision the account by email — no separate logins anywhere.
//
// Deliberately minimal: one configured client, opaque one-time codes + short-lived access tokens
// (stored in lib/db oauth_grants), RS256-signed id_tokens via `jose`, strict redirect_uri allowlist,
// and PKCE (S256) support. Not a general multi-tenant IdP — extend the client registry if needed.
import * as jose from 'jose';
import crypto from 'crypto';

export const ISSUER = process.env.STUDIO_OIDC_ISSUER || 'http://172.18.18.101:4008/api/oidc';
export const CLIENT_ID = process.env.STUDIO_OIDC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.STUDIO_OIDC_CLIENT_SECRET || '';
const REDIRECT_URIS = (process.env.STUDIO_OIDC_REDIRECT_URIS || '').split(',').map((s) => s.trim()).filter(Boolean);
const KID = 'studio-key-1';

function privatePem() {
  const b64 = process.env.STUDIO_OIDC_PRIVATE_KEY_B64 || '';
  return b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
}

let _priv = null, _jwk = null;
async function privateKey() {
  if (!_priv) _priv = await jose.importPKCS8(privatePem(), 'RS256');
  return _priv;
}
// Public JWK for the JWKS endpoint (derived from the private PEM).
export async function publicJwk() {
  if (!_jwk) {
    const pub = crypto.createPublicKey(privatePem());
    _jwk = { ...(await jose.exportJWK(pub)), kid: KID, use: 'sig', alg: 'RS256' };
  }
  return _jwk;
}

export const configured = () => !!(CLIENT_ID && CLIENT_SECRET && privatePem());

// constant-time client-secret check
export function clientOk(id, secret) {
  if (!CLIENT_ID || id !== CLIENT_ID) return false;
  const a = Buffer.from(String(secret || ''));
  const b = Buffer.from(CLIENT_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const redirectOk = (uri) => REDIRECT_URIS.includes(uri);
export const randomToken = () => crypto.randomBytes(32).toString('hex');

// PKCE S256 verification: base64url(sha256(verifier)) === challenge
export function pkceOk(challenge, verifier) {
  if (!challenge) return true; // no PKCE was used
  if (!verifier) return false;
  const h = crypto.createHash('sha256').update(verifier).digest('base64url');
  return h === challenge;
}

export async function signIdToken({ sub, email, name, nonce }) {
  const payload = { email, email_verified: true, name };
  if (nonce) payload.nonce = nonce;
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(ISSUER).setSubject(sub).setAudience(CLIENT_ID)
    .setIssuedAt().setExpirationTime('5m')
    .sign(await privateKey());
}

// The single operator's identity claims. sub is stable; email maps the app account (Typebot's admin
// is this same email, so SSO lands in the existing workspace rather than making a new one).
export function operatorClaims(sessionUser) {
  const name = sessionUser?.name || 'operator';
  return {
    sub: process.env.STUDIO_OIDC_SUB || name,
    name,
    email: process.env.OPERATOR_EMAIL || `${name}@studio.local`,
  };
}

export function discovery() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    grant_types_supported: ['authorization_code'],
    claims_supported: ['sub', 'email', 'email_verified', 'name'],
    code_challenge_methods_supported: ['S256'],
  };
}
