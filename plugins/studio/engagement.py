"""§3d engagement — read side. The studio PULLS the Chatwoot inbox (Chatwoot's anti-SSRF guard
refuses to push webhooks to a private-LAN address, so the worker polls instead — see worker
._poll_engagement). Stdlib only; degrades to "not configured" until the env is set.

Message types (Chatwoot application API): 0=incoming (the contact), 1=outgoing (us),
2=activity, 3=template. We only care about 0 and 1."""
import json
import os
import urllib.request

_URL = (os.environ.get("CHATWOOT_URL") or "").rstrip("/")
_TOKEN = os.environ.get("CHATWOOT_API_TOKEN") or ""
_ACCT = os.environ.get("CHATWOOT_ACCOUNT_ID") or ""

INCOMING = 0
OUTGOING = 1


def configured():
    return bool(_URL and _TOKEN and _ACCT)


def _get(path, timeout=15):
    req = urllib.request.Request(
        f"{_URL}/api/v1/accounts/{_ACCT}{path}",
        headers={"api_access_token": _TOKEN, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode()
    return json.loads(body) if body else {}


def open_conversations():
    """Open conversations across all channels. Returns a list of {id}."""
    d = _get("/conversations?status=open&assignee_type=all")
    payload = (d.get("data") or {}).get("payload") or d.get("payload") or []
    return [{"id": c.get("id")} for c in payload if c.get("id")]


def last_message(conversation_id):
    """The newest real (incoming/outgoing) message in a conversation, or None.
    Sorted by id so ordering is deterministic regardless of API order."""
    d = _get(f"/conversations/{conversation_id}/messages")
    payload = d.get("payload") or (d.get("data") or {}).get("payload") or []
    msgs = [m for m in payload if (m.get("content") or "").strip() and m.get("message_type") in (INCOMING, OUTGOING)]
    if not msgs:
        return None
    m = sorted(msgs, key=lambda x: x.get("id") or 0)[-1]
    return {"id": m.get("id"), "content": (m.get("content") or "").strip(), "incoming": m.get("message_type") == INCOMING}
