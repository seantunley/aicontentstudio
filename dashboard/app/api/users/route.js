import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';
import { listUsers, createUser, getUserByUsername } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function admin() {
  const s = await getSession();
  return s.user && s.user.role === 'admin' ? s : null;
}

// List operators (admin only). Also returns the caller so the UI can mark "you".
export async function GET() {
  const s = await admin();
  if (!s) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ users: listUsers(), me: s.user });
}

// Add an operator (admin only).
export async function POST(req) {
  const s = await admin();
  if (!s) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const username = String(b.username || '').trim().toLowerCase();
  const password = b.password || '';
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return NextResponse.json({ error: 'Username: 3–32 chars, letters/numbers/. _ -' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  if (getUserByUsername(username)) return NextResponse.json({ error: 'That username is taken' }, { status: 409 });
  const role = b.role === 'admin' ? 'admin' : 'operator';
  const id = createUser({ username, passwordHash: bcrypt.hashSync(password, 10), name: b.name || '', email: b.email || '', role });
  return NextResponse.json({ ok: true, id });
}
