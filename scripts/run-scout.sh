#!/usr/bin/env bash
# Trend-scout tick (§3b) — find timely ideas for each enabled niche, record as suggestions.
# Driven by host cron (e.g. daily). The scout's own lockfile prevents overlap.
set -euo pipefail
cd /home/hermes/aicontentstudio
docker compose exec -T hermes python /opt/data/plugins/studio/scout.py --once
