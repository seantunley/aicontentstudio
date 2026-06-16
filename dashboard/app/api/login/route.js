import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '../../../lib/session';
import { getSetting } from '../../../lib/db';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const username = (body.username || '').trim();
  const password = body.password || '';
  const user = process.env.DASH_USER || '';
  // Prefer the operator's self-changed hash (stored in the settings table via /api/account/password);
  // fall back to the bootstrap env hash. Env is base64-encoded so its '$' chars survive compose interpolation.
  let hash = '';
  try { hash = getSetting('dash_password_hash') || ''; } catch {}
  if (!hash) {
    const hashB64 = process.env.DASH_PASSWORD_HASH_B64 || '';
    hash = hashB64 ? Buffer.from(hashB64, 'base64').toString('utf8') : '';
  }

  const ok = !!user && !!hash && username === user && bcrypt.compareSync(password, hash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const session = await getSession();
  session.user = { name: user };
  await session.save();
  return NextResponse.json({ ok: true });
}
