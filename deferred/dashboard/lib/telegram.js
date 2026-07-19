// Telegram Bot API send client for broadcasts. Uses the studio bot token. Honours rate limits
// (sleeps between sends, retries once on 429 with the API's retry_after). Best-effort per recipient:
// returns a per-chat {ok,error} so a broadcast can tally sent/failed and resume later.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

export const tgConfigured = () => !!TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Validate the bot token (and surface the bot's @username for the UI).
export async function tgGetMe() {
  if (!TOKEN) return { ok: false, error: 'no token' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`);
    const d = await r.json();
    return d.ok ? { ok: true, username: d.result?.username, name: d.result?.first_name } : { ok: false, error: d.description };
  } catch (e) { return { ok: false, error: e.message }; }
}

export async function tgSend(chatId, text, { retry = true } = {}) {
  if (!TOKEN) return { ok: false, error: 'no token' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    });
    const d = await r.json();
    if (d.ok) return { ok: true };
    // 429: respect Telegram's retry_after once
    if (r.status === 429 && retry) {
      const wait = (d.parameters?.retry_after || 1) * 1000;
      await sleep(Math.min(wait, 10000));
      return tgSend(chatId, text, { retry: false });
    }
    return { ok: false, error: d.description || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Send `text` to many chat ids, rate-limited (~20/sec). Returns {sent, failed, errors[]}.
export async function tgBroadcast(chatIds, text, { onProgress } = {}) {
  let sent = 0, failed = 0; const errors = [];
  for (let i = 0; i < chatIds.length; i++) {
    const res = await tgSend(chatIds[i], text);
    if (res.ok) sent++; else { failed++; if (errors.length < 10) errors.push(`${chatIds[i]}: ${res.error}`); }
    if (onProgress) onProgress(i + 1, sent, failed);
    if (i < chatIds.length - 1) await sleep(50); // ~20 msg/sec, well under Telegram's ceiling
  }
  return { sent, failed, errors };
}
