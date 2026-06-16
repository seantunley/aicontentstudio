"""Studio brain seam (§ intelligence) — route high-value reasoning (creative direction, the fit-check
QA) through Claude, the strongest model, WITHOUT coupling the studio to one path:

  STUDIO_BRAIN = auto (default) | claude-cli | claude-api | off
    - claude-cli : shell to the `claude` CLI in headless print mode — uses YOUR Claude subscription
                   (the operator runs `claude login` once in the container). No per-token cost.
    - claude-api : Anthropic Messages API with ANTHROPIC_API_KEY (metered).
    - auto       : CLI if `claude` is on PATH, else API if a key is set, else disabled.
    - off        : disabled.

Everything degrades gracefully: if the brain isn't configured/usable, ask() returns None and callers
skip (the studio never breaks because Claude isn't wired yet). This lives OUTSIDE the Hermes agent
loop — it's the studio's own brain, not the Telegram chat model.
"""
import os
import json
import shutil
import subprocess
import urllib.request

BRAIN = (os.environ.get("STUDIO_BRAIN") or "auto").strip().lower()
CLAUDE_BIN = os.environ.get("CLAUDE_BIN") or "claude"
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY") or ""
# Default to a current, balanced model for QA/judgment; override with STUDIO_CLAUDE_MODEL.
CLAUDE_MODEL = os.environ.get("STUDIO_CLAUDE_MODEL") or "claude-sonnet-4-6"


def _have_cli():
    return bool(shutil.which(CLAUDE_BIN))


def configured():
    if BRAIN == "off":
        return False
    if BRAIN == "claude-cli":
        return _have_cli()
    if BRAIN == "claude-api":
        return bool(ANTHROPIC_KEY)
    # auto
    return _have_cli() or bool(ANTHROPIC_KEY)


def mode():
    """Which path ask() will actually take — for logging in the build trace."""
    if not configured():
        return "off"
    if BRAIN in ("auto", "claude-cli") and _have_cli():
        return "claude-cli (subscription)"
    if (BRAIN in ("auto", "claude-api")) and ANTHROPIC_KEY:
        return f"claude-api ({CLAUDE_MODEL})"
    return "off"


def _via_cli(prompt, timeout):
    # Headless print mode — uses the operator's logged-in subscription. Text in, text out.
    r = subprocess.run([CLAUDE_BIN, "-p", prompt], capture_output=True, text=True, timeout=timeout)
    return r.stdout.strip() if r.returncode == 0 and r.stdout.strip() else None


def _via_api(prompt, timeout):
    body = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": 500,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        d = json.loads(resp.read())
    parts = [c.get("text", "") for c in d.get("content", []) if c.get("type") == "text"]
    return ("\n".join(parts).strip() or None)


def ask(prompt, timeout=120):
    """Return Claude's text answer, or None if the brain isn't configured/usable. Never raises."""
    if BRAIN == "off":
        return None
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
