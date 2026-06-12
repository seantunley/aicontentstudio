import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '../../../lib/session';

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const username = (body.username || '').trim();
  const password = body.password || '';
  const user = process.env.DASH_USER || '';
  // The bcrypt hash is stored base64-encoded so its '$' chars don't break compose interpolation.
  const hashB64 = process.env.DASH_PASSWORD_HASH_B64 || '';
  const hash = hashB64 ? Buffer.from(hashB64, 'base64').toString('utf8') : '';

  const ok = !!user && !!hash && username === user && bcrypt.compareSync(password, hash);
  if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  const session = await getSession();
  session.user = { name: user };
  await session.save();
  return NextResponse.json({ ok: true });
}
