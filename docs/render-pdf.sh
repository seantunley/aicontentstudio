#!/usr/bin/env bash
# Render docs/clone-guide.html -> docs/clone-guide.pdf using the studio-renderer's
# bundled Chromium (Remotion's chrome-headless-shell). No host PDF tooling needed.
# Usage:  bash docs/render-pdf.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="docs/clone-guide.html"
OUT="docs/clone-guide.pdf"
C="studio-renderer"
CHROME="/app/node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"

docker cp "$SRC" "$C:/tmp/clone-guide.html"
docker exec "$C" "$CHROME" \
  --headless --no-sandbox --disable-gpu \
  --no-pdf-header-footer --run-all-compositor-stages-before-draw \
  --virtual-time-budget=8000 \
  --print-to-pdf=/tmp/clone-guide.pdf \
  "file:///tmp/clone-guide.html"
docker cp "$C:/tmp/clone-guide.pdf" "$OUT"
echo "wrote $OUT"
