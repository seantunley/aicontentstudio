import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMessages } from '@/lib/chatwoot';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  return NextResponse.json({ messages: await getMessages(id) });
}
