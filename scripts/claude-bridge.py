#!/usr/bin/env python3
"""Claude bridge (§ intelligence, Path B) — exposes the HOST's authenticated `claude` CLI (your Claude
subscription) to the studio worker, which runs inside a container and can't invoke the host binary
directly. The hermes container is host-networked, so it reaches this at http://127.0.0.1:4014.

Loopback-only (127.0.0.1) + shared-token. NOT exposed to the LAN. Endpoints:
  POST /ask         {prompt}                     -> {text}    (research / writing / text fit-check)
  POST /ask-vision  {prompt, images:[{b64,media_type}]} -> {text}
                    writes each image to a host temp file and lets `claude` SEE it (Read tool), so the
                    fit-check judges the ACTUAL rendered pixels, not just the build spec. Subscription.

  Start:   CLAUDE_BRIDGE_TOKEN=<token> nohup python3 scripts/claude-bridge.py >> studio-data/claude-bridge.log 2>&1 &
  Health:  curl -s http://127.0.0.1:4014/health
"""
import os
import json
import base64
import tempfile
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("CLAUDE_BRIDGE_TOKEN", "")
PORT = int(os.environ.get("CLAUDE_BRIDGE_PORT", "4014"))
CLAUDE = os.environ.get("CLAUDE_BIN", "claude")

_EXT = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
        "image/webp": ".webp", "image/gif": ".gif"}


def _run_claude(prompt, timeout, allow_read=False, model=None, effort=None):
    """Run `claude --print`. allow_read whitelists the Read tool (so it can open image temp files in
    headless mode without an interactive permission prompt). Because `--allowedTools <tools...>` is
    variadic and would swallow a positional prompt, the vision call passes the prompt via stdin.
    model/effort let the studio choose the brain model (e.g. opus) + reasoning effort. Returns (ok, text)."""
    base = [CLAUDE, "--print"]
    if model:
        base += ["--model", model, "--fallback-model", "sonnet"]
    if effort:
        base += ["--effort", effort]
    if allow_read:
        r = subprocess.run(base + ["--allowedTools", "Read"],
                           input=prompt, capture_output=True, text=True, timeout=timeout)
    else:
        r = subprocess.run(base + [prompt], capture_output=True, text=True, timeout=timeout)
    if r.returncode == 0:
        return True, r.stdout.strip()
    return False, (r.stderr or "claude error")[:300]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return None

    def do_GET(self):
        self._send(200 if self.path == "/health" else 404, {"ok": self.path == "/health"})

    def do_POST(self):
        if self.path not in ("/ask", "/ask-vision"):
            return self._send(404, {"error": "not found"})
        if TOKEN and self.headers.get("X-Bridge-Token") != TOKEN:
            return self._send(401, {"error": "unauthorized"})
        body = self._body()
        if body is None:
            return self._send(400, {"error": "bad request"})
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return self._send(400, {"error": "empty prompt"})
        timeout = min(int(body.get("timeout") or 180), 600)
        model = (body.get("model") or "").strip() or None
        effort = (body.get("effort") or "").strip() or None
        if self.path == "/ask":
            return self._ask(prompt, timeout, model, effort)
        return self._ask_vision(prompt, timeout, body.get("images") or [], model, effort)

    def _ask(self, prompt, timeout, model=None, effort=None):
        try:
            ok, out = _run_claude(prompt, timeout, model=model, effort=effort)
            self._send(200 if ok else 502, {"text": out} if ok else {"error": out})
        except subprocess.TimeoutExpired:
            self._send(504, {"error": "claude timed out"})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)[:200]})

    def _ask_vision(self, prompt, timeout, images, model=None, effort=None):
        if not images:
            return self._send(400, {"error": "no images"})
        paths = []
        try:
            for img in images[:6]:  # cap — a fit-check needs the lead image(s), not a whole album
                raw = base64.b64decode(img.get("b64") or "")
                if not raw:
                    continue
                ext = _EXT.get((img.get("media_type") or "").lower(), ".jpg")
                fd, p = tempfile.mkstemp(prefix="fitcheck-", suffix=ext)
                with os.fdopen(fd, "wb") as f:
                    f.write(raw)
                paths.append(p)
            if not paths:
                return self._send(400, {"error": "no decodable images"})
            full = (prompt + "\n\nThe rendered media is saved as the image file(s) below. Use the Read "
                    "tool to open EACH path, then judge strictly based on what you actually SEE:\n"
                    + "\n".join(paths))
            ok, out = _run_claude(full, timeout, allow_read=True, model=model, effort=effort)
            self._send(200 if ok else 502, {"text": out} if ok else {"error": out})
        except subprocess.TimeoutExpired:
            self._send(504, {"error": "claude timed out"})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)[:200]})
        finally:
            for p in paths:
                try:
                    os.unlink(p)
                except OSError:
                    pass

    def log_message(self, *a):  # quiet
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
