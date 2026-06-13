import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { requestReplyDraft, getReplyDraft } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';

export const dynamic = 'force-dynamic';

// POST: queue an AI reply-draft for a conversation (the worker drafts it with brand-safety, §6a).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!body.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  const brand = (await getActiveBrand()) || 'unassigned';
  return NextResponse.json(requestReplyDraft(body.conversationId, brand, body.incoming || ''));
}

// GET: poll the latest reply-draft for a conversation (the composer fills in when status=drafted).
export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('conversationId');
  if (!id) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
  return NextResponse.json({ draft: getReplyDraft(id) });
}
