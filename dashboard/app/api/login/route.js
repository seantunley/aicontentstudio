import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '../../../lib/session';
import { getSetting, getUserByUsername } from '../../../lib/db';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const username = (body.username || '').trim();
  const password = body.password || '';

  let authed = null;

  // 1) Multi-user: a row in the users table (§7a). Active + bcrypt match.
  try {
    const u = getUserByUsername(username);
    if (u && u.active && u.password_hash && bcrypt.compareSync(password, u.password_hash)) {
      authed = { name: u.name || u.username, username: u.username, role: u.role || 'operator' };
    }
  } catch { /* table may not exist yet — fall through to bootstrap */ }

  // 2) Bootstrap operator (env DASH_USER + settings/env hash) — always available so the studio can
  //    never lock itself out, even before any users are added. The bootstrap account is an admin.
  if (!authed) {
    const envUser = process.env.DASH_USER || '';
    let hash = '';
    try { hash = getSetting('dash_password_hash') || ''; } catch {}
    if (!hash) {
      const b64 = process.env.DASH_PASSWORD_HASH_B64 || '';
      hash = b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
    }
    if (envUser && hash && username.toLowerCase() === envUser.toLowerCase() && bcrypt.compareSync(password, hash)) {
      authed = { name: envUser, username: envUser, role: 'admin' };
    }
  }

  if (!authed) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const session = await getSession();
  session.user = authed;
  await session.save();
  return NextResponse.json({ ok: true });
}
