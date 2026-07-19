import { NextResponse } from 'next/server';
import { requestReplyDraft, getReplyDraft, listBrands } from '@/lib/db';

export const dynamic = 'force-dynamic';

// §3d proactive drafting — generic inbound hook: POST a message_created-shaped payload here and it
// queues an on-brand reply-draft (the worker fills it in; the operator still reviews + sends — §4a).
// NOTE: this is NOT how Chatwoot reaches us today. Chatwoot's anti-SSRF guard refuses to POST to a
// private-LAN address, so the worker PULLS the inbox instead (see studio worker._poll_engagement).
// This endpoint stays for external automations or a future public/Tailscale deployment where an
// inbound webhook can actually reach the studio. No session (a webhook can't carry the cookie) —
// a shared secret in ?token= must match CHATWOOT_WEBHOOK_TOKEN.

const SECRET = process.env.CHATWOOT_WEBHOOK_TOKEN || '';

function authed(req) {
  if (!SECRET) return false; // unconfigured = closed, not open
  const t = new URL(req.url).searchParams.get('token') || req.headers.get('x-studio-webhook-token') || '';
  return t === SECRET;
}

// Which brand voice to draft in. Engagement runs against a single Chatwoot account today, so:
// explicit override → the sole brand if there's exactly one → unassigned (generic safe voice).
function pickBrand() {
  const env = (process.env.CHATWOOT_DEFAULT_BRAND || '').trim();
  if (env) return env;
  try { const bs = listBrands(); if (bs.length === 1) return bs[0].slug; } catch { /* ignore */ }
  return 'unassigned';
}

const isIncoming = (mt) => mt === 'incoming' || mt === 0;

export async function POST(req) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  // We only act on a real inbound message from a contact. Everything else is acknowledged and ignored
  // (Chatwoot retries non-2xx, so we always 200 the events we choose not to handle).
  if (body?.event !== 'message_created') return NextResponse.json({ ok: true, ignored: 'event' });
  if (!isIncoming(body.message_type)) return NextResponse.json({ ok: true, ignored: 'not-incoming' });
  if (body.private) return NextResponse.json({ ok: true, ignored: 'private-note' });

  const content = (body.content || '').trim();
  if (!content) return NextResponse.json({ ok: true, ignored: 'no-text' }); // attachment-only etc.

  const conversationId = body.conversation?.id ?? body.conversation_id;
  if (!conversationId) return NextResponse.json({ ok: true, ignored: 'no-conversation' });

  // De-dupe bursts: if a draft for this conversation is already queued and not yet drafted, skip —
  // the worker will pick it up. (Once drafted/sent, a fresh inbound supersedes with a new draft.)
  const existing = getReplyDraft(conversationId);
  if (existing && existing.status === 'requested') {
    return NextResponse.json({ ok: true, deduped: true, conversationId });
  }

  const r = requestReplyDraft(conversationId, pickBrand(), content);
  return NextResponse.json({ ok: true, queued: true, conversationId, id: r.id });
}

// Token-gated health probe — lets us confirm the route is live and the secret matches.
export async function GET(req) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, ready: true });
}
