#!/usr/bin/env python3
"""Claude bridge (§ intelligence, Path B) — exposes the HOST's authenticated `claude` CLI (your Claude
subscription) to the studio worker, which runs inside a container and can't invoke the host binary
directly. The hermes container is host-networked, so it reaches this at http://127.0.0.1:4014.

Loopback-only (127.0.0.1) + shared-token. NOT exposed to the LAN. One job: take a prompt, run
`claude -p`, return the text — so the studio's research / writing / fit-check runs on Claude.

  Start:   CLAUDE_BRIDGE_TOKEN=<token> nohup python3 scripts/claude-bridge.py >> studio-data/claude-bridge.log 2>&1 &
  Health:  curl -s http://127.0.0.1:4014/health
"""
import os
import json
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("CLAUDE_BRIDGE_TOKEN", "")
PORT = int(os.environ.get("CLAUDE_BRIDGE_PORT", "4014"))
CLAUDE = os.environ.get("CLAUDE_BIN", "claude")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        self._send(200 if self.path == "/health" else 404, {"ok": self.path == "/health"})

    def do_POST(self):
        if self.path != "/ask":
            return self._send(404, {"error": "not found"})
        if TOKEN and self.headers.get("X-Bridge-Token") != TOKEN:
            return self._send(401, {"error": "unauthorized"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._send(400, {"error": "bad request"})
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return self._send(400, {"error": "empty prompt"})
        timeout = min(int(body.get("timeout") or 180), 600)
        try:
            r = subprocess.run([CLAUDE, "-p", prompt], capture_output=True, text=True, timeout=timeout)
            if r.returncode == 0:
                self._send(200, {"text": r.stdout.strip()})
            else:
                self._send(502, {"error": (r.stderr or "claude error")[:300]})
        except subprocess.TimeoutExpired:
            self._send(504, {"error": "claude timed out"})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)[:200]})

    def log_message(self, *a):  # quiet
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
