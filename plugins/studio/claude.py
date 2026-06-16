"""Studio brain seam (§ intelligence) — route high-value reasoning (research, writing, the fit-check
QA, reporting) through Claude, the strongest model, WITHOUT coupling the studio to one path.

Paths, in priority order (auto picks the first available):
  1. bridge   — POST to a host-side claude-bridge that runs the host's authed `claude` CLI. Uses YOUR
                Claude SUBSCRIPTION (no per-token cost). Config from env CLAUDE_BRIDGE_URL/TOKEN OR the
                DB settings claude_bridge_url/claude_bridge_token (DB = no hermes restart to activate).
  2. claude-cli — shell to a local `claude` (subscription) if present.
  3. claude-api — Anthropic Messages API with ANTHROPIC_API_KEY (metered).
  4. off      — disabled.

STUDIO_BRAIN = auto (default) | bridge | claude-cli | claude-api | off. Everything degrades
gracefully: ask() returns None when nothing is usable, so callers skip and the studio never breaks.
This lives OUTSIDE the Hermes agent loop — the studio's own brain, not the Telegram chat model.
"""
import os
import json
import shutil
import subprocess
import urllib.request

BRAIN = (os.environ.get("STUDIO_BRAIN") or "auto").strip().lower()
CLAUDE_BIN = os.environ.get("CLAUDE_BIN") or "claude"
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY") or ""
CLAUDE_MODEL = os.environ.get("STUDIO_CLAUDE_MODEL") or "claude-sonnet-4-6"


def _setting(key):
    try:
        import db
        return db.get_setting(key)
    except Exception:  # noqa: BLE001
        return None


def _bridge_cfg():
    url = (os.environ.get("CLAUDE_BRIDGE_URL") or _setting("claude_bridge_url") or "").rstrip("/")
    token = os.environ.get("CLAUDE_BRIDGE_TOKEN") or _setting("claude_bridge_token") or ""
    return url, token


def _have_cli():
    return bool(shutil.which(CLAUDE_BIN))


def configured():
    if BRAIN == "off":
        return False
    url, _ = _bridge_cfg()
    if BRAIN == "bridge":
        return bool(url)
    if BRAIN == "claude-cli":
        return _have_cli()
    if BRAIN == "claude-api":
        return bool(ANTHROPIC_KEY)
    return bool(url) or _have_cli() or bool(ANTHROPIC_KEY)  # auto


def mode():
    if not configured():
        return "off"
    url, _ = _bridge_cfg()
    if BRAIN in ("auto", "bridge") and url:
        return "claude-bridge (subscription)"
    if BRAIN in ("auto", "claude-cli") and _have_cli():
        return "claude-cli (subscription)"
    if (BRAIN in ("auto", "claude-api")) and ANTHROPIC_KEY:
        return f"claude-api ({CLAUDE_MODEL})"
    return "off"


def _via_bridge(prompt, timeout):
    url, token = _bridge_cfg()
    if not url:
        return None
    body = json.dumps({"prompt": prompt, "timeout": timeout}).encode()
    req = urllib.request.Request(f"{url}/ask", data=body,
                                 headers={"Content-Type": "application/json", "X-Bridge-Token": token})
    with urllib.request.urlopen(req, timeout=timeout + 15) as resp:
        d = json.loads(resp.read())
    return (d.get("text") or "").strip() or None


def _via_cli(prompt, timeout):
    r = subprocess.run([CLAUDE_BIN, "-p", prompt], capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else None


def _via_api(prompt, timeout):
    body = json.dumps({
        "model": CLAUDE_MODEL, "max_tokens": 1200,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        d = json.loads(resp.read())
    parts = [c.get("text", "") for c in d.get("content", []) if c.get("type") == "text"]
    return ("\n".join(parts).strip() or None)


def draft(prompt, timeout=300):
    """Ask Claude for a JSON object and return it parsed, or None. Used by the worker's Claude-writes
    path — Claude researches + writes the brief + drafts, the worker saves them (§3c still enforced)."""
    out = ask(prompt, timeout=timeout)
    if not out:
        return None
    import re
    m = re.search(r"\{.*\}", out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return None


def ask(prompt, timeout=180):
    """Return Claude's text answer, or None if the brain isn't configured/usable. Never raises."""
    if BRAIN == "off":
        return None
    url, _ = _bridge_cfg()
    if BRAIN in ("auto", "bridge") and url:
        try:
            out = _via_bridge(prompt, timeout)
            if out:
                return out
        except Exception:  # noqa: BLE001
            pass
    if BRAIN in ("auto", "claude-cli") and _have_cli():
        try:
            out = _via_cli(prompt, timeout)
            if out:
                return out
        except Exception:  # noqa: BLE001
            pass
    if BRAIN in ("auto", "claude-api") and ANTHROPIC_KEY:
        try:
            return _via_api(prompt, timeout)
        except Exception:  # noqa: BLE001
            pass
    return None
