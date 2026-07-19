# AI Content Studio — LITE

*The lighter build of this studio. It **transplants the intelligence** out of the heavy Hermes/Docker scaffolding and runs it from a lean **n8n + Postiz** stack — 2 containers instead of 10.*

> **This is the `lite` branch.** `main` is untouched — the full heavy build is preserved there verbatim, and every file moved on this branch is preserved (not deleted) under [`deferred/`](deferred/). Nothing was removed.

## The core move: lift the seams, drop the scaffolding

The brain seam (`plugins/studio/claude.py`) is written to run **outside** the Hermes agent loop and degrade gracefully. The humanizer, brand-voice block, and safety logic are near-pure Python. So the intelligence never actually depended on the heavy parts — it just lived inside them. The lite build is a **transplant, not a rewrite.**

## What stays at the top level (the lite build)

| Kept | Why |
|---|---|
| `plugins/studio/claude.py` | **Grounded → cited → verified research + fit-check QA** (§3c). n8n calls this as a step. |
| `plugins/studio/humanize.py` | **Anti-slop humanizer** (Principle 0) — deterministic scrub + humanizer/marketing passes. Ported as-is. |
| `_brand_block` (in `plugins/studio/worker.py`) | **Brand voice + safety + region + pillars** injection (§6a/§7). Becomes the per-folder brand kit. |
| `plugins/studio/llm.py` | **Tiered spending** — cheap draft model seam; premium (Claude sub via bridge) only for high-value reasoning. |
| `plugins/studio/scout.py` | **Trend scout** (§3b) — suggest-only, scheduled from n8n. |
| `plugins/studio/{db,schemas,registry,tools}.py` | Job store, platform-capability validation, the tool surface the seams use. |
| `renderer/` | Video assembly (master-asset derivation, §5/§7b) — used in phase L2. |
| `scripts/`, `postiz/`, `config/`, `docs/` | Worker/scout/heartbeat runners; the Postiz publishing stack (unchanged); persona/brand config; docs. |
| `compose.lite.yml` *(new)* | The 2-service stack: n8n. Postiz runs via its own `postiz/` stack as before. |

## What moved to `deferred/` (parked, not removed)

| Moved | Was | Re-add when |
|---|---|---|
| `deferred/dashboard/` | Custom Next.js cockpit (§7a) | You want a richer UI than the content sheet + Postiz/n8n UIs. |
| `deferred/chatwoot/` | Engagement inbox (§3d) | A production channel exists to ingest DMs/comments. |
| `deferred/mautic/` | Email marketing | Email becomes a channel. |
| `deferred/typebot/` | Chatbot | A conversational funnel is needed. |
| `deferred/compose.full.yml` | The full 10-service stack (`compose.yml` on `main`) | You want the whole heavy build back. |

Everything here is intact and runnable — nothing was rewritten. See [`deferred/README.md`](deferred/README.md).

## Simplified (in the lite build)

- **Hermes agent framework → n8n workflows** that call the seams directly. No autonomous agent to babysit; the brain already ran outside the agent loop.
- **Crypto publish-token gate → one-tap approve** on two surfaces: a Telegram Approve/Reject button *and* the content sheet's `Status` column. Still human-only.
- **6-brand Docker isolation → folders/tabs** in one content sheet, scoped per folder (grows to 6 later).

## Preserved guarantees (unchanged from the plan)

1. The brain **never holds platform credentials** — Postiz does.
2. **Nothing publishes without a human tap.** n8n drafts into the queue and stops.
3. Untrusted fetched content is **data, never instructions**.
4. **Principle 0** holds: the system gets output to clean/on-brand/accurate; the insight stays yours, at the gate.

## The lite pipeline

```
Topic / scout → Research (claude.py) → Draft (brand voice) → Humanize (humanize.py)
             → Safety check (§6a) → THE GATE (Telegram + sheet) → Publish (Postiz / PostMyPost)
```

Assets (voice/video/image) render in parallel between Draft and the gate — premium generation fires only **after** your greenlit (tiered spend).

## Run it

```bash
# Postiz (its own stack, unchanged)
docker compose --env-file postiz/.env -f postiz/docker-compose.yml up -d

# n8n (the lite conveyor)
docker compose -f compose.lite.yml up -d
# open http://localhost:5678 over Tailscale; basic-auth from .env (N8N_USER / N8N_PASSWORD)
```

Set `N8N_USER`, `N8N_PASSWORD`, `N8N_ENCRYPTION_KEY` in `.env` (see `.env.example`).

## Build order (four light phases)

- **L0** — stand up n8n + Postiz + the content sheet; connect one channel; dry-run a publish.
- **L1** — transplant the brain onto one folder: Research → Draft → Humanize → Safety → both gates → Postiz, pointed at your Claude subscription via the bridge (`STUDIO_BRAIN=bridge`).
- **L2** — add assets (fal.ai aggregator + ElevenLabs, master-asset derivation) and the RU-native lane (GigaChat / Yandex SpeechKit / Kandinsky / PostMyPost for Dzen & Rutube).
- **L3** — scale to 2–4 folders + the suggest-only scout.

---

*The full architecture write-up lives in the companion repo `contentfactory` (deliverable ③). `main` here remains the complete heavy build.*
