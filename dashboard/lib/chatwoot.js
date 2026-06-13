// Chatwoot client (§3d engagement engine). The studio reads the omnichannel inbox + posts replies
// through Chatwoot's application API. Config via env; until a token + account id are set (created in
// the Chatwoot UI), everything degrades gracefully so the dashboard still renders.
const URL = (process.env.CHATWOOT_URL || 'http://host.docker.internal:4009').replace(/\/$/, ''); // server-side API calls
const TOKEN = process.env.CHATWOOT_API_TOKEN || '';
const ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID || '';

// Browser-reachable URL for "Open Chatwoot" links — the operator's browser can't reach
// host.docker.internal, so this is the LAN address (defaults to the box's LAN IP, like the cockpit).
export const CHATWOOT_UI = (process.env.CHATWOOT_PUBLIC_URL || 'http://172.18.18.101:4009').replace(/\/$/, '');
export function chatwootConfigured() { return !!(TOKEN && ACCOUNT); }

async function cw(path, opts = {}) {
  const r = await fetch(`${URL}/api/v1/accounts/${ACCOUNT}${path}`, {
    ...opts,
    headers: { api_access_token: TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(`Chatwoot HTTP ${r.status}: ${(await r.text()).slice(0, 150)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : {};
}

// Open/pending conversations across all connected channels. null = not configured; [] = none/error.
export async function listConversations(status = 'open') {
  if (!chatwootConfigured()) return null;
  try {
    const d = await cw(`/conversations?status=${encodeURIComponent(status)}&assignee_type=all`);
    const payload = d?.data?.payload || d?.payload || [];
    return payload.map((c) => {
      const last = c.messages?.[c.messages.length - 1] || c.last_non_activity_message || {};
      return {
        id: c.id,
        status: c.status,
        contact: c.meta?.sender?.name || c.meta?.sender?.email || 'someone',
        channel: (c.meta?.channel || c.inbox?.channel_type || '').replace('Channel::', ''),
        last: (last.content || '').slice(0, 200),
        unread: c.unread_count || 0,
        ts: c.last_activity_at || c.timestamp || null,
      };
    });
  } catch {
    return [];
  }
}

// Full message thread for one conversation (incoming + outgoing only; activity events filtered out).
export async function getMessages(conversationId) {
  if (!chatwootConfigured()) return null;
  try {
    const d = await cw(`/conversations/${conversationId}/messages`);
    const payload = d?.payload || d?.data?.payload || [];
    return payload
      .filter((m) => m.content && (m.message_type === 0 || m.message_type === 1))
      .map((m) => ({
        id: m.id,
        content: m.content,
        incoming: m.message_type === 0,
        sender: m.sender?.name || (m.message_type === 0 ? 'them' : 'you'),
        ts: m.created_at || null,
      }));
  } catch {
    return [];
  }
}

export async function conversationCount(status = 'open') {
  const list = await listConversations(status);
  return Array.isArray(list) ? list.length : 0;
}

// Post a reply into a conversation (outgoing). Used once the agent's drafted reply passes the gate.
export async function sendReply(conversationId, content) {
  if (!chatwootConfigured()) throw new Error('Chatwoot is not configured');
  return cw(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, message_type: 'outgoing' }),
  });
}
