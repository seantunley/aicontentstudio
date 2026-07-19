#!/usr/bin/env bash
# Cloudflare tunnel watchdog — keep the `studio` tunnel alive.
#
# Why this exists: cloudflared was only ever started from an `@reboot` cron line.
# On 2026-07-09 it auto-updated itself to a new version and shut down to apply it;
# with no reboot since, nothing restarted it and the public URL was dead for ~10 days.
# This covers every failure mode that `@reboot` misses: auto-update self-kill, crash,
# and (redundantly) post-reboot. Driven by host cron.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLOUDFLARED=/home/hermes/.local/bin/cloudflared
LOG="$DIR/studio-data/cloudflared.log"
MATCH='cloudflared tunnel run studio'

# Already running? Nothing to do. (pgrep excludes its own PID; the bash wrapper
# running this script does not contain MATCH in its cmdline, so no false positive.)
if pgrep -f "$MATCH" >/dev/null 2>&1; then
    exit 0
fi

# Down — relaunch, fully detached (new session) so cron's shell exit can't SIGHUP it.
echo "$(date -Is) tunnel down — relaunching" >> "$LOG"
setsid "$CLOUDFLARED" tunnel run studio >> "$LOG" 2>&1 < /dev/null &

# Give it a moment, then confirm and alert the operator that a restart happened.
sleep 8
if pgrep -f "$MATCH" >/dev/null 2>&1; then
    STATUS="✅ restarted"
else
    STATUS="❌ relaunch FAILED — check cloudflared.log"
fi
echo "$(date -Is) $STATUS" >> "$LOG"

# Telegram heads-up (creds in the gitignored repo .env), same pattern as disk-watch.sh.
TOK=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2)
CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' "$DIR/.env" 2>/dev/null | cut -d= -f2)
if [ -n "${TOK:-}" ] && [ -n "${CHAT:-}" ]; then
  MSG="Cloudflare tunnel was down — watchdog ${STATUS}. Studio URL should be back."
  curl -s -o /dev/null --data-urlencode "chat_id=${CHAT}" --data-urlencode "text=${MSG}" \
    "https://api.telegram.org/bot${TOK}/sendMessage" || true
fi
