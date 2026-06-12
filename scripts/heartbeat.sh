#!/usr/bin/env bash
# §9b external heartbeat — ping Healthchecks.io, but ONLY while the Hermes container
# is actually running. So if the box dies (cron stops) OR the container crashes
# (this guard fails), the pings stop and Healthchecks raises the external alert.
#
# Driven by host cron (every 5 min). HEALTHCHECK_URL comes from the repo .env.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load HEALTHCHECK_URL from the gitignored .env (not hardcoded here).
set -a
# shellcheck disable=SC1091
[ -f "$DIR/.env" ] && . "$DIR/.env"
set +a

[ -n "${HEALTHCHECK_URL:-}" ] || { echo "$(date -Is) HEALTHCHECK_URL not set — skipping" >&2; exit 0; }

running="$(docker inspect -f '{{.State.Running}}' hermes 2>/dev/null || echo false)"
if [ "$running" != "true" ]; then
    echo "$(date -Is) hermes container not running — withholding ping (lets the alert fire)" >&2
    exit 0
fi

curl -fsS -m 10 "$HEALTHCHECK_URL" >/dev/null
echo "$(date -Is) ping ok"
