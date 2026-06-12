#!/usr/bin/env bash
# Studio worker tick — process any dashboard-queued jobs (research + draft) once.
# Driven by host cron every couple of minutes. The worker's own lockfile prevents overlap.
set -euo pipefail
cd /home/hermes/aicontentstudio
docker compose exec -T hermes python /opt/data/plugins/studio/worker.py --once
