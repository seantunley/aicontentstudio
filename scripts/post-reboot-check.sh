#!/usr/bin/env bash
# Post-reboot / post-maintenance health check for the studio stack.
# Read-only. Compares running containers against studio-data/reboot-baseline.txt
# and verifies the host-side pieces (tunnel, Constance's Telegram poll, Nancy, bridge, worker).
# Usage: ./scripts/post-reboot-check.sh   (run once the box is back up)
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DOCKER() { sg docker -c "$*"; }
ok=0; warn=0
pass(){ printf '  ✅ %s\n' "$1"; ok=$((ok+1)); }
bad(){  printf '  ⚠️  %s\n' "$1"; warn=$((warn+1)); }

echo "== host =="
echo "  kernel: $(uname -r)   uptime: $(uptime -p)"

echo "== containers vs baseline =="
BASE=studio-data/reboot-baseline.txt
if [ -f "$BASE" ]; then
  DOCKER "docker ps --format '{{.Names}}'" 2>/dev/null | sort > /tmp/now-containers.txt
  missing=$(comm -23 "$BASE" /tmp/now-containers.txt)
  extra=$(comm -13 "$BASE" /tmp/now-containers.txt)
  if [ -z "$missing" ]; then pass "all $(wc -l < "$BASE") baseline containers running"
  else bad "MISSING containers:"; echo "$missing" | sed 's/^/       - /'; fi
  [ -n "$extra" ] && { echo "  (extra, not in baseline):"; echo "$extra" | sed 's/^/       + /'; }
else
  bad "no baseline file ($BASE) — skipping comparison"
fi

echo "== restarting/unhealthy containers =="
bads=$(DOCKER "docker ps --filter 'status=restarting' --format '{{.Names}}'" 2>/dev/null)
unhealthy=$(DOCKER "docker ps --format '{{.Names}} {{.Status}}'" 2>/dev/null | grep -i 'unhealthy' || true)
[ -z "$bads" ] && [ -z "$unhealthy" ] && pass "none restarting/unhealthy" || { [ -n "$bads" ] && bad "restarting: $bads"; [ -n "$unhealthy" ] && bad "unhealthy: $unhealthy"; }

echo "== Cloudflare tunnel =="
pgrep -x cloudflared >/dev/null && pass "cloudflared running" || bad "cloudflared NOT running (watchdog fires within 3min, or run scripts/tunnel-watch.sh)"
code=$(curl -s -m 12 -o /dev/null -w '%{http_code}' https://console.tunleyinternational.com/ 2>/dev/null)
[ "$code" = "302" ] || [ "$code" = "200" ] && pass "console URL reachable (HTTP $code)" || bad "console URL returned HTTP $code"

echo "== Constance (Hermes Telegram poll) =="
DOCKER "docker inspect hermes --format '{{.State.Running}}'" 2>/dev/null | grep -q true && pass "hermes container up" || bad "hermes container DOWN"
GWPID=$(DOCKER "docker exec hermes sh -lc 'pgrep -f \"hermes gateway run\" | head -1'" 2>/dev/null | tr -d '\r')
if [ -n "$GWPID" ]; then
  # look for an established connection to a Telegram DC (149.154.x / 91.108.x)
  tgest=$(DOCKER "docker exec hermes sh -lc 'cat /proc/${GWPID}/net/tcp 2>/dev/null'" 2>/dev/null | python3 -c '
import sys
def ip4(h):
    b=[int(h[i:i+2],16) for i in (6,4,2,0)]; return ".".join(map(str,b))
print(sum(1 for l in sys.stdin for p in [l.split()] if len(p)>=4 and p[3]=="01" and ip4(p[2].split(":")[0]).startswith(("149.154","91.108"))))' 2>/dev/null)
  [ "${tgest:-0}" -gt 0 ] && pass "Telegram poll connected (Constance live)" || bad "no Telegram DC connection yet (Hermes may still be booting — recheck in ~3min)"
else
  bad "gateway process not found yet (Hermes still booting?)"
fi

echo "== host processes =="
pgrep -f 'nancy_bot.py' >/dev/null && pass "Nancy bot running" || bad "Nancy bot NOT running (@reboot cron should start it)"
pgrep -f 'claude-bridge.py' >/dev/null && pass "Claude bridge running" || bad "Claude bridge NOT running (@reboot cron should start it)"

echo "== worker (cron-driven, only logs when it has a job) =="
crontab -l 2>/dev/null | grep -q 'run-worker.sh' && pass "worker cron present (*/2min)" || bad "worker cron MISSING"
[ -x scripts/run-worker.sh ] && pass "run-worker.sh executable" || bad "run-worker.sh missing/not executable"

echo
echo "RESULT: $ok ok, $warn warning(s)."
[ "$warn" -eq 0 ] && echo "All green. ✅" || echo "Review warnings above. Most 'booting' warnings clear within ~3-5 min on this 1-vCPU box."
