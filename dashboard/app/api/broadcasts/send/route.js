import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { tgConfigured, tgBroadcast } from '@/lib/telegram';
import { saveBroadcast } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Send a Telegram broadcast. Audience: "test" (just the operator) or "list" (pasted chat ids).
// WhatsApp is not wired yet (needs a Meta WhatsApp Business account).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const channel = body.channel || 'telegram';
  if (channel !== 'telegram') return NextResponse.json({ error: 'Only Telegram is wired so far (WhatsApp needs a Meta Business account).' }, { status: 400 });
  if (!tgConfigured()) return NextResponse.json({ error: 'Telegram bot token not configured.' }, { status: 503 });

  const message = (body.message || '').trim();
  if (!message) return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });

  // resolve recipients
  let recipients = [];
  let audienceDesc = '';
  if (body.audience === 'test') {
    const me = process.env.TELEGRAM_CHAT_ID || '';
    if (!me) return NextResponse.json({ error: 'No operator chat id configured.' }, { status: 400 });
    recipients = [me]; audienceDesc = 'test (operator)';
  } else {
    recipients = String(body.chatIds || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    audienceDesc = `pasted list (${recipients.length})`;
  }
  // de-dupe
  recipients = [...new Set(recipients)];
  if (recipients.length === 0) return NextResponse.json({ error: 'No recipients.' }, { status: 400 });
  if (recipients.length > 5000) return NextResponse.json({ error: 'Too many recipients for one send (max 5000).' }, { status: 400 });

  const { sent, failed, errors } = await tgBroadcast(recipients, message);
  const status = failed === 0 ? 'sent' : (sent === 0 ? 'failed' : 'partial');
  const id = saveBroadcast({
    channel, audience: audienceDesc, message, total: recipients.length,
    sent, failed, status, detail: errors.length ? errors.join(' | ') : null,
  });

  return NextResponse.json({ ok: true, id, total: recipients.length, sent, failed, errors });
}
