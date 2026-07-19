import { NextResponse } from 'next/server';
import { oauthUserByToken } from '@/lib/db';

export const dynamic = 'force-dynamic';

// UserInfo endpoint. Returns the operator's claims for a valid bearer access token.
export async function GET(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? oauthUserByToken(token) : null;
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  return NextResponse.json({ sub: user.sub, name: user.name, email: user.email, email_verified: true });
}
