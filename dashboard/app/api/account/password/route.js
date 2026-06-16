import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';
import { getSetting, setSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The operator password. The bootstrap hash comes from env (DASH_PASSWORD_HASH_B64, base64'd so its
// '$' chars survive compose interpolation). Once the operator changes it here, the new hash is stored
// in the settings table under `dash_password_hash` and the login route prefers that. The plaintext is
// never stored; the hash key is deliberately NOT in the editable whitelist, so /api/settings can't read it.
const HASH_KEY = 'dash_password_hash';

function currentHash() {
  const dbHash = getSetting(HASH_KEY);
  if (dbHash) return dbHash;
  const b64 = process.env.DASH_PASSWORD_HASH_B64 || '';
  return b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
}

export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const current = body.current || '';
  const next = body.next || '';
  if (next.length < 8) return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });

  const hash = currentHash();
  if (!hash || !bcrypt.compareSync(current, hash)) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
  }

  setSetting(HASH_KEY, bcrypt.hashSync(next, 10));
  return NextResponse.json({ ok: true });
}
