# AI Content Studio — Operator Runbook

How to run and operate the studio day-to-day. (Architecture/intent live in
[`content-studio-plan.md`](./content-studio-plan.md); this is the practical guide.)

## What it is (one breath)

Send a topic (Telegram **or** the cockpit) → **Zingo** researches it (grounded, cited),
writes a platform draft, optionally generates an image → it lands in your **approval
queue** → you review/edit/approve → you **publish** (live to Bluesky via Postiz). The
agent never publishes; publishing is always your hand.

## Surfaces

| Surface | Where | What you do there |
|---|---|---|
| **Telegram (Zingo)** | your bot | Start jobs, ask status, **review the queue** (Approve/Reject/Defer buttons). Get pinged when a draft's ready and when a post goes live. |
| **Cockpit** | `http://172.18.18.101:4008` (login `sean`) | Originate jobs, see the pipeline, edit drafts, **Approve / Publish live**, accounts. |
| **Postiz** | `http://172.18.18.101:4007` | Connected channels, the calendar, scheduling. |

## The flow (states)

`requested → researched → planned → generated → preview → approved → published`

- The **agent stops at `preview`** — that's your approval queue.
- **Approve** (cockpit or Telegram) → `approved` ("Ready to publish").
- **Publish** (cockpit only) → `published` (live on Bluesky).
- **Reject** → `cancelled`. **Defer** → left in the queue.

## Day-to-day

- **Start a job:** Telegram — *"draft a post about X (with an image)"*; or cockpit — **+ New job** (topic, brand, image toggle). Cockpit jobs are processed by the worker (cron, ~2 min) and ping you when ready.
- **Review:** Telegram — *"what's in my approval queue?"* → Zingo lists drafts and shows Approve/Reject/Defer buttons. Cockpit — **Approval queue** tab.
- **Publish:** cockpit **Ready to publish** → **Publish live** (confirms, posts, DMs you the link).

## Running the stack

All from `/home/hermes/aicontentstudio`:

```bash
# Studio (Hermes + cockpit)
docker compose up -d                 # start
docker compose ps                    # status
docker compose logs -f hermes        # agent logs
docker compose restart hermes        # reload after a plugin/persona change
docker compose build dashboard && docker compose up -d dashboard   # rebuild cockpit after UI changes

# Postiz (its own stack)
docker compose --env-file postiz/.env -f postiz/docker-compose.yml up -d
docker compose --env-file postiz/.env -f postiz/docker-compose.yml ps

# Worker (research+draft for cockpit-started jobs) runs via host cron (*/2 min)
./scripts/run-worker.sh              # run a tick manually
tail -f studio-data/worker.log
```

## Where things live

- **Studio code:** `plugins/studio/` (job store, tools, worker, Postiz client). DB: `studio-data/studio.db`.
- **Cockpit:** `dashboard/` (Next.js, console UI).
- **Persona:** `config/SOUL.md` (edit here → `docker compose up -d hermes`).
- **Secrets:** `.env` and `postiz/.env` (gitignored). Hermes's own: `~/.hermes/`.
- **Heartbeat:** `scripts/heartbeat.sh` (host cron) → Healthchecks.io.

## Safety model (don't undo these)

- **Publishing is human-only.** The agent can take a job to `preview` and `approved` (your tap), never `published`.
- **`STUDIO_DRY_RUN=true`** on the gateway — the studio `publish` tool never posts for real; the cockpit's Publish is the live path.
- **Telegram is locked** to your user id (`TELEGRAM_ALLOWED_USERS`).

## Deferred / next

- Brand pack (per-brand voice + safety policy) — needed before on-brand output ships.
- Dashboard auth hardening (MFA/passkey, Tailscale).
- Phase 3 video, Phase 5 trend scout / performance loop.
- Merge `studio-build` → `main` when happy.
