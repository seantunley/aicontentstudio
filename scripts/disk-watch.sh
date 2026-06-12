#!/usr/bin/env bash
# Disk-space watch (§9b) — alert the operator on Telegram before the disk fills, and clear stale
# render scraps (§9a retention: keep masters, drop derived variants). Run by cron (hourly).
set -euo pipefail
cd /home/hermes/aicontentstudio

THRESHOLD=${DISK_THRESHOLD:-90}
CACHE=/home/hermes/.hermes/cache/images

# Retention: remove DERIVED per-platform image variants (master_WxH.jpg) older than 7 days.
# Masters and originals are left intact.
if [ -d "$CACHE" ]; then
  find "$CACHE" -type f -regextype posix-extended -regex '.*_[0-9]+x[0-9]+\.jpg' -mtime +7 -delete 2>/dev/null || true
fi

USE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
echo "$(date -u +%FT%TZ) disk ${USE}% (threshold ${THRESHOLD}%)"
[ "${USE:-0}" -lt "$THRESHOLD" ] && exit 0

# Over threshold -> alert via Telegram (creds in the repo .env)
TOK=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env 2>/dev/null | cut -d= -f2)
CHAT=$(grep -E '^TELEGRAM_CHAT_ID=' .env 2>/dev/null | cut -d= -f2)
if [ -n "${TOK:-}" ] && [ -n "${CHAT:-}" ]; then
  MSG="⚠️ Studio disk at ${USE}% (threshold ${THRESHOLD}%). Clear old renders/masters or add space before publishing stalls."
  curl -s -o /dev/null --data-urlencode "chat_id=${CHAT}" --data-urlencode "text=${MSG}" \
    "https://api.telegram.org/bot${TOK}/sendMessage" || true
fi
