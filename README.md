# AI Content Studio

A personal, single-operator content studio: research → generate → human-approve → publish, across multiple brands, controlled via Telegram. Self-hosted and local-first.

**Full spec:** [`content-studio-plan.md`](./content-studio-plan.md) — read it for architecture, decisions, and rationale. This README is the kickoff brief; the plan is the source of truth.

---

## TL;DR architecture

Three peer services on one shared studio database, in one Docker Compose stack, on a host I control:

- **Hermes Agent** — the brain: conversation (Telegram), orchestration, memory, registered tools. Runs headless.
- **Postiz** (self-hosted) — scheduling, publishing, the calendar, and holds platform OAuth tokens.
- **Custom dashboard** (Next.js) — the cockpit: approval queue, job status, previews, cost ledger. Built from the outset, grows panel-by-panel.

Generation (image/video/LLM/voice) runs on **cloud APIs via an aggregator** (swappable). Storage is **local**. Access: **Telegram** for the agent, **Tailscale** for the private dashboard. No public ports.

**Non-negotiables (see plan §2, §4, §4a, §6a):**
- **Not "AI slop"** (plan §2, Principle 0) — voice (brand memory), taste (human gate), substance (factual integrity + angles that say something). Fewer/better over volume; an empty slot beats a hollow post. The system gets to clean/on-brand/accurate; *insight is the operator's job at the gate*.
- **Ask, don't assume** (plan §13) — never silently guess on credentials, brand targeting, destructive/irreversible actions, ambiguous requirements, or invented values. Confirm before anything consequential; trivial reversible details just get noted.
- The **publish action is hard-gated in code** — requires a confirmation token minted by a human approval tap. No model output can mint one.
- Untrusted/fetched content (web, comments, DMs) is treated as **data, never instructions**.
- The agent **never holds platform credentials** — Postiz does.
- Per-brand **brand-safety policy** + **factual-integrity** (grounded, cited, verified; nothing ships ungrounded). The breastfeeding brand is the strictest.

---

## Build approach

Built hands-on with **Claude Code in the terminal on the host** (plan §13): it writes/edits files, runs `docker compose up`, reads errors, iterates in place. Incremental bring-up — one service at a time, prove each before layering the next.

> When starting a Claude Code session: *"Read content-studio-plan.md, then let's build the Phase 0 spine."*

---

## Phase 0 — Spine (start here)

Goal: **text a topic to the bot → it logs a job → it replies in persona.** Nothing publishes yet.

1. **Host + access:** provision the box; install Docker + Compose; set up Tailscale for private access.
2. **Install Claude Code** on the host (first build step).
3. **Secrets hygiene:** create `.env` (gitignored — see below); never commit tokens/keys.
4. **Compose skeleton:** Postgres (studio DB) + one Hermes agent + Telegram gateway.
5. **Job store + state machine:** `requested → researched → planned → generated → preview → approved → published`.
6. **Build in from the start (trivial now, painful later):**
   - **Dry-run mode** (plan §4) — route publishes to a test target / skip the final call.
   - **Hard-gated publish tool** (plan §4a) — token-from-approval, enforced outside the model.
   - **Heartbeat + auto-restart** (plan §9b) — external uptime ping; `restart: unless-stopped`.
   - **Cost ledger** (plan §10) — log every API call's cost per job/brand.
7. **Verify:** Telegram allowlist locked to my user ID; bot replies; job logged; dry-run proven.

Then: Phase 1 (research + text + thin dashboard + Postiz publish to Bluesky). See plan §8.

---

## Repo hygiene

Create `.gitignore` **before** any build files land:

```gitignore
.env
.env.*
*.key
*.pem
secrets/
**/credentials*.json
__pycache__/
node_modules/
.DS_Store
```

The plan and this README are safe to commit (no secrets). Tokens, API keys, and platform OAuth credentials live only in `.env` / the secrets store on the box — never in git.

---

## Open decisions before/early in build (plan §12)

- Host location (power/connectivity vs. cost; POPIA data-residency for customer media).
- The other 5 brands — each needs a brand profile + safety policy (breastfeeding is the template).
- Generation-model aggregator (Replicate / fal.ai / Atlas Cloud).
- Bot persona (name, tone), quiet-hours window.
- Per-brand deployment topology (consolidated / isolated / hybrid).

---

*Spec version: v0.18. This README tracks the plan — update both together.*
