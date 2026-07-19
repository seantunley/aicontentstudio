// Two-way loop: DM the operator on Telegram (as the bot) when something happens —
// e.g. a post goes live. Uses the Telegram Bot API directly. Best-effort: never throws.
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';

export async function notifyTelegram(text) {
  if (!TOKEN || !CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text }),
    });
  } catch {
    /* best effort — a failed notification never breaks the publish */
  }
}
