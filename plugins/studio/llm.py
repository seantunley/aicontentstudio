"""Studio-side LLM invocation — the model seam.

All Studio/worker text generation (research, drafting, polish, safety, vision tagging, scout,
reply-drafting) goes through `run_z` so it can run on a DIFFERENT model than the conversational
Telegram agent. Set the STUDIO_TEXT_MODEL env var to give the Studio its own (e.g. pricier) text
model; leave it unset to inherit Hermes' default model — i.e. identical to today's behaviour.

Only headless `hermes -z` Studio work picks this up. The conversational agent (the gateway, on
whatever platform — Telegram, etc.) keeps using the gateway's configured model and is unaffected.
"""
import os
import subprocess


def _model_args():
    m = (os.environ.get("STUDIO_TEXT_MODEL") or "").strip()
    if not m:
        return []
    args = ["-m", m]
    prov = (os.environ.get("STUDIO_TEXT_PROVIDER") or "").strip()
    if prov:  # e.g. 'openrouter' so a slug like 'anthropic/claude-sonnet-4.6' resolves there
        args += ["--provider", prov]
    return args


def run_z(prompt, timeout=120, **kw):
    """One-shot Studio generation. Returns the CompletedProcess (capture_output + text by default),
    so callers read r.stdout / r.returncode and handle TimeoutExpired exactly as before."""
    kw.setdefault("capture_output", True)
    kw.setdefault("text", True)
    # -m before -z so the model flag isn't swallowed as the -z prompt value.
    return subprocess.run(["hermes", *_model_args(), "-z", prompt], timeout=timeout, **kw)
