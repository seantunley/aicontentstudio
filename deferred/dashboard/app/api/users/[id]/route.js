import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';
import { getUserById, updateUser, deleteUser } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function admin() {
  const s = await getSession();
  return s.user && s.user.role === 'admin' ? s : null;
}

// Edit an operator (admin): name/email/role/active and/or reset password.
export async function PATCH(req, { params }) {
  const s = await admin();
  if (!s) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  const u = getUserById(Number(id));
  if (!u) return NextResponse.json({ error: 'no such user' }, { status: 404 });
  let b;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const fields = {};
  if (typeof b.name === 'string') fields.name = b.name;
  if (typeof b.email === 'string') fields.email = b.email;
  if (b.role === 'admin' || b.role === 'operator') fields.role = b.role;
  if (b.active === 0 || b.active === 1 || typeof b.active === 'boolean') fields.active = b.active ? 1 : 0;
  if (b.password) {
    if (String(b.password).length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    fields.password_hash = bcrypt.hashSync(b.password, 10);
  }
  updateUser(Number(id), fields);
  return NextResponse.json({ ok: true });
}

// Remove an operator (admin). The bootstrap env operator isn't in this table, so it can't be deleted.
export async function DELETE(req, { params }) {
  const s = await admin();
  if (!s) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { id } = await params;
  deleteUser(Number(id));
  return NextResponse.json({ ok: true });
}
