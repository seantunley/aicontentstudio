import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { sendReply } from '@/lib/chatwoot';
import { markReplyDraftSent } from '@/lib/db';

// The operator's reviewed reply is sent to the conversation via Chatwoot (the human gate, §4a).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  if (!body.id || !body.content?.trim()) return NextResponse.json({ error: 'id and content required' }, { status: 400 });
  try {
    await sendReply(body.id, body.content.trim());
    markReplyDraftSent(body.id); // lifecycle: requested → drafted → sent
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
