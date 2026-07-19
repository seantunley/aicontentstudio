import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { listContacts, shapeContact } from '@/lib/mautic';

export const dynamic = 'force-dynamic';

// Session-gated contact search for the Funnels page (client search box).
export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const search = url.searchParams.get('search') || '';
  const start = Number(url.searchParams.get('start') || 0);
  try {
    const { total, contacts } = await listContacts({ limit: 30, start, search });
    return NextResponse.json({ total, contacts: contacts.map(shapeContact) });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'lookup failed' }, { status: 502 });
  }
}
