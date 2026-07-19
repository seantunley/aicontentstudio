import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { listConversations, chatwootConfigured, CHATWOOT_UI } from '@/lib/chatwoot';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const status = new URL(req.url).searchParams.get('status') || 'open';
  return NextResponse.json({
    configured: chatwootConfigured(),
    ui: CHATWOOT_UI,
    conversations: await listConversations(status),
  });
}
