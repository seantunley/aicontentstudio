# AI Content Studio — Planning Document

*Draft v0.20 — a personal, single-operator system for researching topics and producing + publishing content across platforms, controlled via Telegram. Runs multiple brands; deployment topology is variable. This is a living document; add to it freely.*

*Changes since v0.19: brand context as a hard boundary (§1b) — one active brand at a time; accounts/data/memory/safety/occasions all scope to it; code-enforced at the tool layer (consolidated) or physical (isolated); visible active brand + publish-time brand/destination confirmation. Prevents wrong-brand misfires and cross-brand drift.*
*Changes in v0.19: occasions calendar (§7g) — special-occasion automation (recurring rule-based built-ins, manual dates, country-holiday research; region-aware per brand; auto-draft by default with a notify-first carve-out for sensitive occasions); upgrades the old §7e known-dates bullet. Phase 5.*
*Changes in v0.18: added the "ask, don't assume" build rule (§13) — never silently guess on consequential/irreversible/ambiguous things during the build; confirm first.*
*Changes in v0.17: anti-slop commitment (Principle 0).*
*Changes in v0.16: dashboard auth. v0.15: mobile-friendly. v0.14: performance loop. v0.13: resilience. v0.12: dashboard custom + from outset. v0.11: build workflow. v0.10: injection defence. v0.9: workflow audit. v0.8: deployment. v0.7: variable deployment. v0.6: multi-brand. v0.5: factual integrity. v0.4: trend scout. v0.3: Postiz + models. v0.2: Hermes.*

---

## 1. What this is

Not a social network. It's an **AI content studio with a Telegram remote control**. You send it a topic or idea, it researches, produces platform-specific assets (text, images, video, captions, thumbnails), shows you previews, takes your feedback, and publishes — automatically where allowed, with a manual hand-off where the platform requires it.

**Scope:** Built for *my own businesses only* — one operator, **6 brands** (see §1a). No external user accounts, no billing, no public app-store review. It uses my own logged-in accounts and runs on a single small server or local machine.

**Status:** Planning phase. Not building yet.

---

## 1a. Multi-brand, variable deployment (6 businesses, one operator)

Six brands, and I may run them together or separately — possibly **one agent per business, not all on one platform**. So topology is a *late-bound choice*, not baked into the architecture:

- **A brand = a portable "brand pack"** — a self-contained bundle: profile (voice + visual), safety policy (§6a), connected accounts, trend-scout watchlist (§3b), and its own memory/data store. Liftable to another host without code changes.
- **The runtime is one shared template** — identical code, parameterised by which pack(s) it loads.
- **Topology = deployment choice:**
  - *Consolidated:* one instance runs all six packs, scoped by brand.
  - *Isolated:* six instances, one pack each (own Hermes, own data, own accounts) — clean separation, independent, can live on different hosts, easy to hand off or sell a brand.
  - *Hybrid:* group some, isolate others. Can start consolidated and peel a brand onto its own box later — the pack just moves.

### The discipline that makes this work
**One codebase deployed N times — never six hand-built systems that drift.** If the code diverges, every improvement has to be done six times. As long as only config + data differ, an engine improvement reaches every brand at once.

### Why isolated fits Hermes
Hermes is built as a persistent per-server agent with its own personality, memory, and skills, so **one agent per brand is its natural shape** — and it removes the voice cross-contamination worry by construction. Cost: six of everything to host/patch, vs. one cheaper consolidated instance with a shared blast radius. "Variable" lets me decide this **per brand**.

### Consequences
- **Dashboard:** can be one cockpit that connects to multiple instances (oversight even across hosts) or per-instance.
- **Scheduler can vary per brand:** self-hosted Postiz for brands I keep close; Zernio's cloud API (§7d, held in reserve) suits a brand I might hand to a client or run hands-off.

**Primary brand:** breastfeeding-support — the most safety-demanding (§6a); build it as the template.

---

## 1b. Brand context as a hard boundary

With multiple brands, the worst failure is not a bad post — it's the **right post on the wrong brand's account** (e.g. breastfeeding content landing on another business's page). Hard to undo, instantly erodes trust. So brand context is a **hard, code-enforced boundary**, not a convenience toggle.

### The model
At any moment I am operating *inside exactly one brand*. Everything scopes to it:
- social accounts I can reach,
- settings,
- history,
- memory / knowledge,
- safety policy (§6a),
- occasions calendar (§7g).

While in a brand's context I cannot see or touch another brand's accounts or data. **Switching is a deliberate act, never accidental.** This kills both failure modes: **drift** (one brand's voice/knowledge bleeding into another) and **misfire** (posting to the wrong page).

### Enforcement depends on topology (§1a)
- **Isolated topology (per-brand agent):** sandboxing is *free and absolute* — brands are separate processes that can't see each other's data or accounts. Nothing to "switch"; I just talk to a different agent. The boundary is physical, not a setting that can be misconfigured. **Strongest version — a point in favour of isolating.**
- **Consolidated topology (one instance, many brands):** switching is a built feature, and the scope MUST be enforced **in code at the tool layer**, not left to the model. Every account lookup, history query, memory retrieval, and publish call is filtered by the **active brand ID outside the model**, so even a confused or prompt-injected agent *physically cannot* reach another brand's accounts. Same philosophy as the publish gate (§4a): don't trust the model to behave — make misbehaviour impossible.

### Robustness details
- **Active brand is always explicit and visible** — shown in the dashboard header; the bot states it ("you're in Breastfeeding"). I'm never guessing which context I'm in.
- **Switching is a deliberate command** — an intentional action with clear confirmation of the new context.
- **Publish-time confirmation includes brand + destinations** — "post to *Breastfeeding* → Instagram + Bluesky?" — so the wrong-page misfire has a second catch right before it happens (ties into the approval gate, §4a).

### Sequencing
Relevant the moment more than one brand exists (Phase 1 onward). The visible-active-brand indicator and publish-time brand/destination confirmation are cheap and should come early; full code-level scoping matters most in the consolidated topology.

### Open decisions
- Which topology per brand (§1a) — isolating is the strongest sandbox; decide which brands warrant it.
- Switch mechanism in Telegram (a command, separate chats per brand, or a default brand) — overlaps the existing §12 "per-brand context switching" item.

---

## 2. Guiding principles

### Principle 0 — not "AI slop" (the overriding commitment)
This must not be generic AI content slapped together. Slop comes from three things, and each has a built-in antidote:
- **No voice** (sounds like every other AI) → the **brand-memory layer** (§7) makes output sound like *me*, per brand.
- **Volume without taste** (publish everything the machine makes) → the **human approval gate** filters the machine's volume through my judgment; nothing ships unseen.
- **Fabricated or hollow filler** (made-up facts, engagement bait, says nothing) → the **factual-integrity rules** (§3c) ground everything in sources, and angles must *say something* (§3c: distinct takes, not three rewordings).

**The honest boundary:** the system reliably prevents the *obvious* failures — off-brand voice, hallucinated facts, spammy cadence — getting output to *clean, on-brand, accurate, well-made*. It cannot manufacture *insightful* on its own. The point of view, the angle worth having, the substance — that's **me**, at the gate and in what I greenlight. This is a tool that makes a discerning human scale, not a replacement for the discernment. Rubber-stamp the gate and it's slop regardless of architecture; treat it as real editorial judgment and the architecture makes that judgment scale.

**Build biases that follow:**
- **Fewer, better over high volume** — an empty slot beats a hollow post; never fill a slot just because it's there.
- **"Rejected as generic" is a first-class learning signal** (§7), not just a thumbs-down.
- **An angle must say something** — the §3c "distinct angles" bar is an anti-slop rule, enforced.
- **For the breastfeeding brand especially:** vague, reassuring health-adjacent mush isn't just bland, it's a trust failure — worse than posting nothing.

### Three goals in tension
Three goals — **secure**, **streamlined**, **high quality** — that pull against each other. They're reconciled by one core architectural idea:

> **A single source of truth per content idea, gated by my approval, with everything cheap-and-fast upstream and premium-and-polished only downstream of my "yes."**

This means: drafts and research run on fast, cheap models; the expensive, high-quality generation only happens for content I've already greenlit; and one master asset is derived into all platform variants rather than generated six separate times.

---

## 2a. Orchestration: Hermes Agent

The control/orchestration layer is **Hermes Agent** (open-source autonomous agent framework, Nous Research, released Feb 2026, MIT-licensed) rather than a visual workflow tool like n8n. It fits this project because it natively bundles things we'd otherwise hand-assemble:

- **Persistent personal agent on my own server** — local-first, all data stays on my machine, no telemetry. Pairs with the local-storage requirement (§9a).
- **Built-in memory** — short-term conversation context + long-term vector-store retrieval. This *is* the brand-memory plumbing (§7).
- **Personality from config** — its system prompt is assembled from personality files + memory + skills + context, which is exactly the persona model (§3a).
- **Multi-agent orchestration** (v0.6.0+) — an orchestrator decomposes a task and spawns specialist workers. Maps to research / planning / asset agents under one roof.
- **Multi-platform gateway** — Telegram, Discord, Slack, etc. from one process. Telegram is the entry point.

### The key division of responsibility
Hermes is the **brain, conversation, orchestrator, and memory**. Deterministic heavy lifting (video render, subject-aware crop, platform uploads) does **not** live in agent reasoning — it lives in **registered tools**: typed Python functions the agent routes to. The agent decides *what* and *when*; tools reliably handle *how*. Never let the LLM improvise an API call to my accounts.

### What I give up vs n8n
n8n's library of pre-built connectors and deterministic visual flows. Acceptable here, because this project's value is research judgment, conversation, memory, and self-improvement — the agentic model is the better match.

### Caveats
- **Young framework** (≈4 months old). Strong traction, but expect API churn — build expecting moving parts.
- **Autonomy raises the stakes on guardrails** (see §3a, §4): an agent that can read the web *and* call a publish tool is a prime prompt-injection target. The publish action must be hard-gated behind explicit human approval, implemented so the agent literally cannot publish without confirmation.
- **Provider choice:** supports choosing the LLM, so I can use a strong cloud model for quality while keeping storage local. Not forced onto local models.

---

## 2c. Deployment architecture (fast, local, accessible)

### One stack, co-located not merged
Everything runs in **one Docker Compose stack** on a single box: `docker compose up`, several containers talking over the local network. **Hermes and Postiz are co-located but stay separate services** — Hermes is the brain, Postiz is a tool it calls over Postiz's local API. Not merged. Postiz keeps holding the platform OAuth tokens and doing the posting, so the agent never touches publishing credentials — a security boundary gained for free. Don't share Postiz's DB schema; integrate via its API.

### Fast
The control plane (chat, approvals, status, job state, media) is all local on one machine reading local disk → the interactive loop feels instant. Slow work (generation, renders) runs async in the background and pings me when done; it never blocks the conversation. **Key:** "local storage" ≠ "local models." Cloud generation APIs are *faster* and need no GPU; local models would be slower and need a serious GPU. So storage + orchestration are local, generation calls out — local models stay a future *privacy* toggle, not a speed one.

### Local
Own always-on box — a mini PC / NUC / small home server is plenty if generation is cloud. GPU box only if I later insist on local models. Always-on because Postiz runs the posting queue.

### Accessible (without exposing the box)
- **Telegram** reaches the agent from anywhere — Telegram's servers relay to the bot, no open port.
- **Dashboard on Tailscale** (private mesh) — open it from phone/laptop anywhere, no public URL to find.

### Per-component isolation (multi-brand)
Isolation is per *component*, not all-or-nothing. Run **per-brand Hermes agents** (Hermes likes one-agent-per-context), but **one shared Postiz** (it handles multiple accounts natively — no need for six) and **one shared dashboard**. Cloud generation is shared across all. Sensible default topology: per-brand agents + shared Postiz + shared dashboard + shared cloud generation, on one always-on box (spread across boxes later if a brand must move). Same compose file; what differs is how many agent containers come up.

---

## 3. Pipeline architecture

The flow, left to right:

1. **Telegram control** — I send topics; I approve. *(my touchpoint)*
2. **Research & intelligence** — web search + brand memory → a brief with angles and hooks. *(AI)*
3. **Content planning** — turns the brief into per-platform scripts, captions, hashtags. *(AI)*
4. **Asset generation** — images, video, captions, thumbnails, each in the right format. *(AI)*
5. **Preview & feedback** — I approve, edit, or send it back to regenerate. *(my approval gate)*
6. **Multi-platform publishing** — IG, FB, YouTube, Bluesky, VK, etc. *(my touchpoint)*

A **feedback loop** runs from stage 5 back into generation (stage 4): rejections and edits trigger revision. A job moves through states: `requested → researched → planned → generated → preview → approved → published`.

**Two entry points feed this same pipeline:** (1) *reactive* — I send a topic via Telegram; (2) *proactive* — the trend scout discovers a topic on a schedule (§3b). Everything downstream of the entry point is identical.

---

## 3a. The Telegram assistant (conversational, with personality)

The bot is not a command vending machine — it's a **studio manager I talk to**. It has a designed personality and holds genuine two-way conversations about what's happening: where things stand, what's waiting, what went wrong, and clarifying questions when my request is ambiguous.

### How it works
Built on **Hermes Agent** (§2a): plain-English Telegram messages drive **tools wired into the studio** — query job state, check renders, pull analytics, start/pause jobs, schedule. Hermes handles the conversation, persona, and routing; the studio actions are registered as its tools. ("Where's the meal prep one at?" → state lookup → narrated answer, not a rigid `/status`.)

### Personality
A persona definition (essentially a system prompt) fixing tone, proactivity, and how much it banters vs. stays terse. Working voice: warm, dry, competent, low-ceremony. Tunable; can be named. Consistency is what makes it feel like a colleague.

### Two-way
- **Reactive:** I ask, it answers.
- **Proactive (the valuable half):** it initiates — morning summaries, "research done, want the angles?", clarifying questions instead of guessing wrong, and flagging problems (e.g. a failed upload) before I discover them. Telegram lets a bot message me anytime.
- **Quiet hours:** a do-not-disturb window (configurable) during which proactive pings are held and batched into the morning summary — with an **urgent-only override** (system down, publish failure on a time-sensitive post, red-flag engagement per §3d).

### Memory
- **Conversational thread** (short-term) so "run with it" resolves correctly — Hermes provides this.
- **Job database as ground truth** so it never invents a status. The conversation is the interface; the DB is the truth.

### Guardrail (non-negotiable)
Personality must never weaken the approval gate. The bot can research, draft, prepare, and tee things up — but **publishing always needs my explicit yes**. With an autonomous agent this is load-bearing: the **publish tool must be hard-gated** so the agent *cannot* publish without my confirmation — not a step it can choose to skip. This also defends against prompt injection: since research reads web pages, scraped content is treated strictly as *data, never as commands*. Even a successful injection can't publish, because the gate sits underneath. Personality lives on top of the safety floor, never through it.

---

## 3b. Trend scout (scheduled discovery & ideation)

A proactive, recurring job that researches what's trending in my topics and brings ideas *to* me — the second entry point into the pipeline (§3). **Naming note:** this is the *discovery* scheduler; Postiz (§7d) is the *posting* scheduler. Different jobs.

### How it works
1. **Topic watchlist** — themes, keywords, competitors, and sources I define (RSS, subreddits, news, YouTube/Google trending, X).
2. **Scheduled scan** — on a cadence (e.g. each morning) the scout scans those sources using the agent's existing research tools.
3. **Score + rank + cap** — raw "trending" is mostly noise, so each candidate is scored on **relevance** (to my niche), **novelty** (dedup against the job DB + memory so it never re-pitches something I covered), **timeliness**, and **brand-safety**. Output is a tight shortlist (~5), not fifty links. A scout that floods me gets muted. Shortlisted items are researched to the §3c standard (grounded, cited, verified) before they're pitched.

### Suggest and/or create (tiered)
- **Default = suggest.** The Hermes bot (§3a) pings a short morning digest — "5 trending angles, here's the take on each" — and I tap the ones worth pursuing. Cheap (cheap model scans + ranks); keeps me in the loop before real spend.
- **Greenlit = create.** Selected items flow straight into research → plan → generate and land in the **same approval queue** as everything else.
- **Optional auto-draft** for high-confidence or recurring categories I trust, skipping the suggest step.
- **Nothing skips the gate.** The scout proposes; it never publishes.

### Timeliness
Trends decay, so a hot item is flagged urgent and **fast-tracked to a near-term Postiz slot** rather than dropped in the evergreen queue where it'd go stale.

### Guardrails
The scout reads a lot of open web → that content is strictly **data, never instructions** (injection defence). The brand-safety filter + my approval gate keep a bad trend from becoming a bad post.

### Cost
Recurring scans must stay cheap — cheap model for scan/rank; premium generation only for items I greenlight. Same tiered-spending principle as §6.

---

## 3c. Research & factual integrity

The research layer must do proper research, propose a few distinct angles, present them clearly and concisely with sources — and **never make anything up**. Applies to both entry points (sent topics and the trend scout, §3b).

### Grounded, not recalled
The model never answers from training memory. It searches → fetches the actual sources → reads → writes **only from what's in front of it**. This single discipline removes most hallucination.

### Every fact is cited
Claims are extracted as structured triples — *claim + source URL + supporting snippet*. Anything not tied to a real source doesn't enter the brief as fact; it's dropped or explicitly flagged **unverified**. No naked assertions.

### Verification pass
A second model step re-reads each claim against its cited source ("does this source actually say this?"). Failing claims are cut. Cheap insurance against mis-summary or drift.

### Corroboration & source quality
- A fact confirmed by 2–3 independent reputable sources = solid; single-source = flagged.
- Conflicting sources are **surfaced**, not silently averaged.
- Favour primary/reputable sources over SEO spam/forums; note the date (trends go stale).

### Fact / framing separation
Verified sourced facts are one layer; **angles** are a creative layer on top. Brand voice decides *how* it's said and *which* angle — it can never change *what* is claimed. This stops the persuasive layer from inventing a stat to make a hook land.

### A few distinct angles
From the grounded facts, propose ~3 genuinely different takes (e.g. contrarian / explanatory / practical), each with its hook, the supporting facts, and their sources — not three rewordings.

### The brief (clear & concise)
Scannable: topic → key verified facts (each cited) → 2–3 angles (hook + supporting facts + sources) → explicit "couldn't verify" section → date/recency.

### Honest caveat
No LLM is *guaranteed* by instruction alone to never err. What this architecture delivers is stronger and more truthful: **every factual claim is traceable to a source I can click and check.** The approval gate is the final backstop because the sources sit next to each claim — verifying is a glance, not an investigation. Operational definition of "never make anything up": *nothing ships that isn't grounded in a source I've been shown.*

---

## 3d. Engagement layer (comments & DMs)

Publishing generates replies; the system must handle what comes back, not just what goes out. The agent monitors comments/DMs and **triages**:

**Source decision (13 Jun 2026):** Postiz has **no** inbox/engagement API (verified — only `webhookUrl` + providers' internal `commentPost`; it's a publisher, not an inbox). The chosen engagement source is **Chatwoot** — free, MIT-licensed, self-hosted omnichannel inbox that ingests DMs *and* comments/mentions from the production platforms (Instagram, Facebook, X, Telegram, WhatsApp, LINE) and exposes a full API the studio reads from + posts gated replies into. (Bluesky is test-only and not a production target, so Chatwoot's lack of Bluesky support is moot; if it ever mattered, AT-Proto `listNotifications` is free + open and can be bridged in via Chatwoot's API channel.) **Sequencing:** stand Chatwoot up alongside Postiz only once a production platform account exists to connect — like the performance loop, it has no source to ingest until then. Mixpost was rejected: its engagement inbox is Pro-only and unreleased.

The triage tiers:

- **Routine** (thanks, emoji, simple praise) → summarised in the digest; optionally auto-like where supported.
- **Questions worth answering** → the agent drafts an on-brand reply that goes through the **same approval gate** as posts (one-tap approve in Telegram).
- **Red-flag** → escalated to me immediately (urgent override, §3a).

### Brand-safety applies to replies too
Replies follow the brand's safety policy (§6a). For the **breastfeeding brand** this is critical: repliers include vulnerable, struggling, postpartum parents, sometimes asking medical questions. Rules: the agent **never gives medical advice in a reply** — drafts point to general info + "please speak to your IBCLC/doctor"; anything suggesting a parent or infant in difficulty or distress is a red-flag escalation to me, not an auto-draft. Tone rules (supportive, never shaming) apply with full force.

### Scope control
Start with **triage-and-notify only** (no drafted replies) and add reply-drafting per brand once trusted. Volume cap on notifications — engagement summaries belong in the digest, not as one ping per comment.

### Built (v1 — 13 Jun 2026)
- **Chatwoot engine** stood up (own stack, pinned v4.14.2) on :4009 — see [[engagement-layer]].
- **Native inbox mirror** in the studio (Desk-styled, like the Postiz calendar): `/engagement` is a two-pane inbox — conversation list (open/pending/resolved) + message thread + reply composer — backed by Chatwoot's API (`lib/chatwoot.js`, `/api/engagement[/messages|/reply]`). Two-way: the operator's reviewed reply posts back via Chatwoot.
- **Gated AI reply-drafting:** "✦ Draft with AI" → a `reply_drafts` request → `worker._process_reply_drafts` drafts an on-brand reply via `hermes -z` with the brand voice + safety block (never medical advice, gentle on distress) → composer fills it in → operator edits + Sends. Never auto-sends (the human gate, §4a). Brand-safety verified (declined medical advice, pointed to an IBCLC).
- **Deferred:** the triage tiers (routine→digest / question→draft / red-flag→escalate) as automatic routing, the volume-capped digest line, and per-brand inbox→brand mapping (today the active brand sets reply context). Lights up fully once a production channel is connected in Chatwoot (Bluesky is test-only).

---

## 3e. Real-content ingestion (my own photos & clips)

Not everything is AI-generated — a real business posts real moments. The missing flow, now included:

**Send a photo/clip to the Telegram bot with a line of context** ("client workshop today", "new stock arrived") → the agent writes the on-brand caption (brand profile + memory, §7), suggests platforms, formats (crops per platform spec, §5) and a queue slot → I approve → handed to Postiz.

- Ingested media is stored in the brand's library (§7b — "my own clip library"), **tagged** by subject/event, so it's reusable later as b-roll, recycled posts (§7e), or visual-identity reference.
- **Consent rule applies** (§6a): media showing identifiable people — especially mothers/babies for the breastfeeding brand — needs consent on file before it can be queued.
- This makes the studio the home for **all** content, not just synthetic.

---

## 4. Security design

Because it's only me, the threat model shrinks to "keep others out, keep my credentials safe."

- **Telegram bot locked to my user ID.** Every incoming message checked against an allowlist; everyone else silently ignored.
- **Secrets never in code.** Bot token and all API keys live in a secrets manager / environment variables.
- **No open doors.** If a richer web dashboard is added, reach it over something private (e.g. Tailscale), not the public internet.
- **Platform login tokens are the crown jewels.** The OAuth credentials that let it post as me are the real target — encrypted at rest.
- **The approval gate is itself a security control.** Nothing publishes without my explicit tap, so a runaway research step or a prompt injection from a scraped page can't post anything in my name.
- **Agent autonomy is contained by tool design.** Because Hermes can act, the publish tool is hard-gated behind human confirmation, and web content is consumed as data, never instructions.
- **Dry-run mode.** A global flag that routes publishes to a private test account (or skips the final API call, logging what *would* have posted). Used to rehearse the full chain end-to-end before any real account is touched, and when testing changes. Build it early — trivial then, miserable to retrofit.
- **Audit log** of what went out and when.

---

## 4a. Prompt-injection defence (layered, zero capability cost)

**The right mental model:** no framework makes an LLM immune to instructions hidden in content it reads — prompt injection is unsolved field-wide. Even Hermes' security policy counts injection as a breach *only if it bypasses the approval system, toolset restrictions, or sandbox*. So the model may get fooled; security means a fooled model **can't do anything harmful**. Every layer below constrains *consequences*, not *capabilities* — the bot loses nothing.

### What Hermes ships (use it all)
Seven security layers on every tool call: user authorization (allowlists/pairing), dangerous-command approval, container isolation for execution, credential filtering (strips keys from subprocess envs), context-file injection scanning, cross-session isolation, input sanitization. Plus: blocks fetches to internal/local network addresses by default (injected URLs can't probe my LAN), lookalike-Unicode domain guard, content-level command scanning (pipe-to-interpreter, homograph spoofing).

### The layered model
1. **Identity:** only I can talk to it — Telegram allowlist + Hermes authorization. The "stranger messages the bot" vector doesn't exist.
2. **Data, never instructions (mechanical, not just principle):** all fetched/untrusted content — articles, comments, DMs (the engagement layer §3d reads attacker-writable text *by design*) — is wrapped and labeled as untrusted when passed to the model, never concatenated as if I said it. Hermes' scanning adds a detection pass.
3. **Blast-radius cage (this carries the guarantee):**
   - Publish gate enforced **in code, outside the model** — the publish tool requires a confirmation token generated by my approval tap; no model output can mint one.
   - Agent never holds platform credentials — Postiz does (§2c boundary).
   - Tools scoped per agent to what that brand needs.
   - Execution in Hermes' Docker sandbox.
   - Net effect: a *fully successful* injection drafts garbage that lands in my approval queue and dies there. Annoying; harmless.
4. **Detect & audit:** anomaly alerts on odd tool-call patterns (fetch bursts, config-read attempts); the audit log (§4); spending stays inside budget caps (§10).

### Hermes-specific hardening
- **Skills directory is the known persistence vector** — a manipulated session could write a skill file that future sessions load as instructions. Mitigation: **disable or gate skill self-writing** on production agents (costs nothing — the studio's "skills" are my registered tools), and periodically review the skills directory.
- **Pin the version, watch advisories** — young project, real findings (e.g. a sandbox bypass reported and fixed); fixes land frequently.

### Honest framing
We don't promise the bot can't be fooled — nobody can. We promise a fooled bot **can't publish, can't overspend, can't touch credentials, and can't persist its confusion into future sessions.** That is the strongest injection security that actually exists.

---

## 5. Streamlined design

Goal: one Telegram message → finished content for every platform, fewest taps, least wasted compute.

- **Parallel + async.** One topic kicks off all platform variants at once; long renders happen in the background; I get pinged when something's ready instead of waiting.
- **Master-asset derivation.** Generate one strong hero image / one good long-form video, then crop, resize, and reframe programmatically into each platform's spec (9:16 Reels/Shorts, 16:9 YouTube, 4:5 / 1:1 feeds). More efficient *and* more visually consistent — doubles as a quality move.

---

## 6. Quality design

Quality comes from a few specific places:

- **Factual grounding** — grounded, cited, verified research so nothing is fabricated (see §3c — the trust foundation).
- **Brand memory** so output sounds and looks like me (see §7 — the biggest lever).
- **Strong models where it matters** — capable LLM for scripts, good image model, quality voice (e.g. ElevenLabs) for narration.
- **Assembly approach to video** so I control the final cut (see §7b).
- **The human gate** catching anything off.

**Tiered spending:** machine is fast and cheap on drafts/research/first passes; premium, polished generation only fires for content that passed my eye. High quality on what ships, without premium prices on everything that doesn't.

---

## 6a. Brand-safety policy (three-stage, per-brand)

A written safety policy lives in each brand profile (§7), human-authored and editable. It's checked at **three stages** — discovery (engage this topic at all?), generation (is this draft risky?), and the gate (my final call) — with three outcomes: **green** (proceed), **amber** (only as a flagged item needing my explicit yes, with a reason), **red** (block, don't even draft). Critical default for an autonomous-ish system: **when uncertain, resolve down** (amber/red), never up. Auto-draft (§3b) is allowed only for genuinely green, low-stakes categories; anything amber routes to me first. Every block is logged with its reason — an audit trail, and my overrides tune the policy over time.

### Generic scaffold (tailored per brand)
- **Red (never):** graphic violence/gore; hate/discrimination; sexual/explicit; anything sexualizing minors (absolute); instructions for illegal/dangerous acts; impersonation; unsourced claims about real named people; misinformation that could cause harm.
- **Amber (always needs me):** breaking tragedies/disasters (the newsjacking landmine); divisive politics/religion; health/legal/financial guidance; naming real people/competitors; anything that reads as an unapproved endorsement.
- **Tone red lines:** no ragebait/manufactured outrage; no clickbait or thumbnails that misrepresent (ties to §3c — the hook can't promise what the facts don't); no punching down; profanity ceiling per brand.
- **Legal/IP:** no unlicensed music/clips/images; defamation care on real people/companies; **disclose ads/sponsorships/affiliates** (a legal obligation — ZA/audience advertising rules apply).
- **Platform compliance:** don't post what gets shadowbanned/removed (per-platform rules).

### Breastfeeding-support brand (primary — strictest)
- **Health-information integrity** (merges with §3c): source to authoritative bodies — WHO, UNICEF, La Leche League, Academy of Breastfeeding Medicine, IBCLC/lactation professionals, national health services — not general blogs. **Hard line:** general information and support only, *never* a substitute for personalised care from an IBCLC/doctor/pediatrician. High-stakes zones (medication while breastfeeding, infant weight/jaundice, supplementation, a baby not feeding) carry "speak to your lactation consultant/doctor" framing and route to me. Unproven/dangerous remedies = hard red.
- **Tone is a safety rule here:** audience is often postpartum, struggling, sometimes dealing with PPD/PPA. Supportive, **never shaming** — no absolutist "breast is best" guilt-framing toward formula/combo feeders. A true-but-guilt-inducing post is a safety failure; flag for review.
- **Platform imagery:** breastfeeding imagery is contested and routinely auto-flagged; treat as automatic flag-for-review, know each platform's current stance (verify at build), prefer illustration where a photo is risky.
- **Consent:** real photos of mothers/babies need explicit consent on file; extra care as the baby can't consent (parental permission, caution by default).

### Honest caveat
A classifier reliably catches blatant content, but brand safety is contextual and judgment-heavy. The filter's job isn't to be the final authority — it's to make sure gray areas *reach* me as amber flags rather than slipping through, and to hard-stop only unambiguous reds. The gate is where the real call is made.

---

## 7. Brand-memory layer

The single thing that decides whether output sounds like *me* or like generic AI. Cheap to run, high impact. **Per brand** (§1a): each of the six businesses has its own profile and memory bank — never shared, so voices don't cross-contaminate.

### Two distinct layers
- **Brand profile / constitution (small, always-on):** hand-written, editable. Voice rules, do's and don'ts, visual specs, audience, standard sign-off / call-to-action. Injected into *every* generation.
- **Memory bank (large, retrieved):** past posts, transcripts, best performers, everything approved/rejected. Embedded into a vector store; only a few relevant examples retrieved per generation.

Keeping these separate prevents output that's either too generic (no examples) or too noisy/expensive (everything retrieved every time).

### Per-platform voice
My YouTube voice ≠ my Instagram voice. **Tag everything by platform and format at ingestion** and filter retrieval accordingly — a Bluesky draft pulls Bluesky examples, never long-form scripts. This is most of what makes each platform feel native.

### The learning flywheel
The approval gate generates free labelled training data:
- **Approvals** → "good examples" pool.
- **Rejections** (ideally with a one-word reason) → negative signal.
- **Edits** → richest signal of all; store the *before/after diff* — it shows exactly where the voice model is off.

Over a few weeks of normal use, drafts arrive closer to final. The more I use it, the less I edit.

### Bootstrapping it
I have existing YouTube, Instagram, and other socials — so I'm bootstrapping from myself, with performance data, not from scratch.

- **YouTube** (richest): titles, descriptions, tags via the Data API; views + retention via Analytics to flag best performers; transcripts (clean auto-captions, or Whisper on the audio) for long-form voice and what held attention.
- **Instagram** (Business/Creator): captions, hashtags, insights (saves, reach) via the Graph API — short-form written voice; the grid is the best visual-identity reference (palette, framing, thumbnail style).
- **Other socials:** same principle — pull text, tag by platform.

**Practical first pass:** don't automate or ingest everything. A few dozen strong, representative pieces per platform is plenty. Could even skip APIs at first and hand it a folder of best captions + a few transcripts. Flow: ingest sample → LLM proposes a per-platform voice profile → I correct it → pieces embedded + tagged, top performers marked → feedback loop takes over.

### Visual identity (the harder half)
Store palette, fonts, logo, reference images, plus a written style description for image prompts. Reference-image-capable models (or a light fine-tune on my images) for consistent look. **For thumbnails specifically: programmatic templates** (face cutout + brand colours + bold text in my font, assembled with code) — more consistent, on-brand, and far cheaper than generating each one.

### Scale & security note
Solo scale = small data. Don't over-build — an embedded vector store + tagged files is enough, and Hermes' built-in long-term memory (§2a) can serve as the store rather than standing up a separate system. It's personal data but not credentials, so it lives on my own store.

---

## 7a. Dashboard (the cockpit) — custom, from the outset

A **custom web app**, built **from day one** as the primary cockpit — not deferred. It is *not* a fork or skin of Postiz or Hermes; it's a third peer that sits **beside** them on the shared studio database:

- **Postiz** keeps its own UI (calendar, account connections, publishing) — I *use* that, the dashboard **deep-links** to it; no calendar rebuilt here.
- **Hermes** runs headless (messaging/CLI-first) — the dashboard talks to the **same studio DB and tools**, a parallel front-end, not a wrapper.
- **The shared studio DB is the foundation** (jobs, brand packs, memory, cost ledger). Hermes, Postiz, and the dashboard are three peers reading/writing around it — side by side, not stacked (matches the §2c picture).

Division of labour: Telegram is the lightweight remote (send an idea, tap approve, on the go); the dashboard is what I sit down at. Both are windows into the same state.

### From the outset, grows with phases
"From the outset" + "don't over-build" resolve cleanly: the dashboard **exists from Phase 0/1** as the cockpit, and its panels **light up as phases land** — no elaborate UI for features that don't exist yet.
- **Day one (Phase 0/1):** approval queue, pipeline/job status, accounts health, cost ledger, deep-link to Postiz's calendar.
- **Phase 2+:** full-fidelity video/thumbnail previews, brand-memory manager.
- **Phase 5:** performance analytics pulled back from platforms.

### What lives on it (full target)
- **Approval queue** — the gate, with full-fidelity previews (watch the actual video, inspect the real thumbnail). Approve / edit / reject inline; edits feed the learning loop (§7).
- **Pipeline view** — every job and which stage it's stuck in (`requested → … → published`).
- **Content calendar** — lives in **Postiz** (§7d); the dashboard deep-links to it.
- **Brand-memory manager** — view/edit the voice profile, browse and re-tag the memory bank, mark top performers.
- **Accounts & settings** — health of each platform connection, token status (never raw values).
- **Cost ledger** (§10) — spend per job/brand, budget caps.
- **Performance** (later) — analytics pulled back from Postiz (§7f), surfaced here and fed into memory/recycling/timing.

### Mobile-friendly (responsive)
The dashboard must be **fully usable on a phone**, not a desktop-only tool. Approach:
- **Responsive by default** — Next.js (§9), standard responsive layout; works on phone, tablet, desktop over the same Tailscale connection.
- **Prioritise on-the-go actions for small screens:** review the approval queue, watch a video/thumbnail preview, check job/pipeline status, glance at the cost ledger — the things I'd do away from my desk.
- **Heavier work stays desktop-comfortable** (brand-profile editing, memory-bank management, deep analytics) — usable on mobile, but not contorted to fit it.
- **Pairs with the two-surface model:** Telegram is the fully-native quick-tap surface (send, approve, digest); the responsive dashboard is the richer view on the same phone when I want it. So "mobile-friendly" is a build-time design discipline, not a separate app.

### Security & auth (defence in depth)
The dashboard is the **most powerful surface** in the system — it can edit brand profiles, see everything, and trigger publishing — so it gets real, layered auth, not just "a login." Two independent gates:

**1. Network layer (most of the protection).** Lives on Tailscale (§2c), bound only to the private tailnet interface — **never a public port, no public URL**. An attacker must already be on my private network before auth is even reachable. Don't expose it publicly for convenience.

**2. Application auth (network access ≠ app access).**
- **Individual login + MFA** — strong credential plus a second factor (TOTP/authenticator or a **passkey**). Single-factor is too thin for something that can publish as my brands. (Passkeys/biometrics also make mobile login *better*, §7a mobile.)
- **Real sessions** — short-lived, secure, http-only cookies; sensible expiry; explicit logout.
- **Step-up re-auth on dangerous actions** — changing a brand-safety policy, connecting/disconnecting an account, anything touching credentials requires re-authentication even within a live session. (The detail most setups skip and regret.)
- **Don't hand-roll it** — use a vetted auth library/provider for self-hosted apps; sessions and credential handling are easy to get subtly wrong.

**Respects the rest of the model:**
- An authenticated session does **not** bypass the publish gate — publishing still goes through the code-enforced, token-from-approval path (§4a). Login lets me *operate* the gate, not skip it.
- Every sensitive dashboard action lands in the **audit log** (§4).

**Scope:** auth for *me* (and maybe a future trusted helper), not a user-management system — still single-operator (§1). Strong and layered, but proportionate; not an enterprise identity platform.

### Relationship to Hermes
Hermes (§2a) is messaging- and CLI-first; community "control room" templates exist for managing agents, but the dashboard remains its own thing. In a consolidated deployment it shares one local DB with the agent; in an isolated deployment (§1a) it's built as **one cockpit connecting to several instances** (or one per instance) — one source of truth per brand, a unified front-end over them.

---

## 7b. Video pipeline

Default approach is **assembly, not pure generation** — cheaper, more reliable, easier to keep on-brand. Built on a templating engine like **Remotion** (programmatic video) rather than raw ffmpeg scripting, so branded intros/outros, lower-thirds, and caption styles stay consistent across every video.

### The core principle: one master, many cuts
Build the long-form (16:9) master once, then derive everything else from it rather than generating each format separately. The Reel/Short is auto-cut from the same render, not produced independently.

### Stages
1. **Script + voiceover** — script from planning; TTS narration (e.g. ElevenLabs) with word-level timing.
2. **Assembly** — b-roll, captions, music bed.
3. **Master render** — 16:9 long-form source.
4. **Derive** — YouTube long-form; Reel/Short (9:16, auto-reframed with subject tracking, re-captioned); thumbnail.
5. **Preview & approve.**
6. **Final render + publish.**

### Where the intelligence lives
- **B-roll selection:** the LLM tags each script line with a visual concept, then the system fetches matching footage — stock (Pexels, Storyblocks), my own clip library, Ken-Burns over a still, or an AI-generated clip for shots I can't film. This is what stops it being a static slideshow.
- **Reel cut:** the LLM reads the transcript, picks a self-contained hook, reframes to 9:16, re-captions vertically.
- **Captioning:** Whisper for word-level timing → animated word-by-word style (essential for shorts).

### The big cost lever
Render a **fast, low-res, watermarked draft for approval**; commit to the **full-quality final render only after my yes**. Renders are the expensive, disk-hungry step — never spend a 4K render on something I'll reject. This is also where the local-storage retention rule bites (§9a): keep master + finals, purge intermediate frames after publishing.

Pure AI video generation stays a **garnish** — short inserts where nothing else works, never the backbone (cost runs away).

### Model picks (garnish clips) — swappable defaults, June 2026
Access via an aggregator (e.g. **fal.ai**) so the model is a one-line config swap.
- **Kling 3.0** — default for most clips: native 4K, ~$0.10/sec, cheap enough to iterate.
- **Veo 3.1** — when a clip needs lip-synced speech (only one with native 48kHz dialogue) or scene-extension for longer shots; ~$0.15/sec fast → $0.50/sec quality.
- **Runway Gen-4.5** — when I need director-level control (camera moves, scene consistency).
- **Seedance 2.0** — image-to-video (animate a generated hero) / multi-shot.
- **Wan 2.6/2.7** — open-source, self-hostable, for clips that must stay fully local.
- **Avoid Sora 2** — deprecated; API shuts down 24 Sep 2026. Don't build on it.
- Note: all hosted video models process on *their* servers — only the local Wan route keeps a clip private.

---

## 7c. Image pipeline

Same philosophy, lighter.

- **Hero images:** text-to-image model with brand style in the prompt + reference images for consistency. For a truly repeatable look / recurring character, a light fine-tune on my own images is the stronger route.
- **Master derivation again:** generate one high-res hero, derive every aspect ratio (1:1, 4:5, 9:16) by **subject-aware cropping** so the focal point stays in frame — not separate generations per size.
- **Thumbnails stay programmatic** (per §7): background-removed face cutout + brand colours + bold text in my font, composed by code. More on-brand, more legible, far cheaper than generating each one — and lets me spit out 2–3 variants to feed YouTube's built-in thumbnail testing.

**Caveat:** best-in-class image/video models shift almost monthly. Treat the model as a **swappable component**; verify the current best at build time.

### Model picks (swappable defaults, June 2026)
Access via an aggregator (e.g. **Replicate / fal.ai / Atlas Cloud**) so switching is one line.
- **Flux 2 Pro** — default workhorse for hero images (best all-round speed/quality/price).
- **Ideogram v3** — anything with text *inside* the image (still the typography leader).
- **Z-Image Turbo** — drafts, variants, high volume (~$0.01/image, ~1s).
- **Imagen 4 Ultra / Nano Banana Pro** — premium hero shots where the image is the product.
- **Flux.1 [schnell]** — open-weight, self-hostable, for fully-local generation.
- Tiered use: cheap (Z-Image) for first passes, premium (Flux 2 Pro / Imagen) only post-approval.

---

## 7d. Calendar & scheduling — via Postiz

Scheduling and publishing are handled by **Postiz** (open-source, self-hosted social scheduler, AGPL) rather than custom-built. It runs on my own box, keeps content and tokens local, uses official platform OAuth (no scraping), supports all my target platforms (FB, IG, YouTube, Bluesky, VK, TikTok, Threads, Telegram…), and exposes an API + webhooks. The studio generates and I approve; the approved asset is **handed off to Postiz** to schedule and post.

*(Considered Zernio (ex-"Late") — an API-first hosted SaaS with an MCP server and official-partner compliance, billed per account. Rejected as the default because it routes content through a third-party cloud and adds ongoing cost, which cuts against local-first. **Held in reserve per-brand** (§1a): a good fit for a brand I might hand to a client or run hands-off, even while the rest stay on self-hosted Postiz.)*

### Division of labour with the dashboard
Postiz owns **scheduling, publishing, and the calendar** (it ships its own). My custom dashboard (§7a) keeps only what Postiz can't do: video/thumbnail previews, the approval gate, brand-memory management, pipeline status. No duplicate calendar to build.

### Model: queue + calendar hybrid
Define recurring slots per platform once (e.g. YouTube Mon 6pm, Reels Tue/Thu/Sat, Bluesky daily noon); approved content flows into the next open slot, with the option to pin specific pieces to specific dates. Postiz supports this queue model directly.

### Gap detection
If a platform's queue runs dry, the Hermes assistant proactively flags it ("your IG queue runs out Thursday, want me to spin something up?") — reading queue state from Postiz.

### Timing
- Posting times should become **audience-driven** (when followers are active), with sensible defaults until that data exists.
- **Time zone:** schedule in the *audience's* zone, not necessarily mine (Cape Town/SAST → follow a US/EU audience if that's who's watching).

### Always-on implication
Because Postiz runs the posting queue, **it is the always-on piece** — host it on a low-power always-on box (Pi / mini PC / tiny VM) while heavy generation stays on the main local machine. This replaces the separate custom scheduler/publisher.

---

## 7e. Campaigns, pillars & evergreen recycling

Single posts aren't how brand marketing actually runs — it runs in arcs. Three additions:

### Campaigns
A **campaign object**: one brief that fans out into a coordinated set of pieces scheduled as an arc (e.g. a 5-post World Breastfeeding Week series, a launch week). Same pipeline per piece; the campaign holds the theme, the sequence, and the shared assets (one master derivation, §5, often serves the whole arc). The whole arc lands in the approval queue together so I can review it as a set.

### Content pillars (per brand)
Each brand pack defines **3–5 recurring themes** it rotates through (e.g. for the breastfeeding brand: practical latch help / myth-busting / emotional support / behind-the-scenes). Pillars steer the trend scout (§3b), give the gap-filler something smarter to reach for than "anything", and make the calendar balanced rather than whatever-was-trending. Recurring formats ("Myth Monday") hang off pillars.

### Known-dates calendar (per brand)
Awareness days, holidays, seasonal moments (World Breastfeeding Week in August, Mother's Day, etc.) maintained per brand. The scout plans **ahead** of predictable moments — proposing a campaign 2–3 weeks out — instead of only reacting to trends. *(Upgraded into a full subsystem in §7g — the occasions calendar.)*

### Evergreen recycling
Top performers shouldn't post once and die. A recycler resurfaces proven pieces after a decent interval — refreshed caption, new crop of the same master, "still true a year later" framing — using performance data + the memory bank to pick candidates and Postiz queues to slot them. Recycled pieces still pass the gate (cheap to approve — I've approved them before). One of the highest-ROI automations in social; all the ingredients already exist in this design.

### Built (v1 — 13 Jun 2026)
- **Campaign object** (`campaigns` table + `jobs.campaign_id`): one theme + a shared platform set, fanned into N pieces. Created from the cockpit `/campaigns` page (name, theme, the arc as one-post-per-line, platforms, optional per-piece image). Each piece becomes a normal job (`source=campaign`), runs the full pipeline, and lands in the approval queue tagged to the campaign — reviewed as a set; the campaign page shows per-piece progress.
- The drafting agent gets the campaign's **shared theme** injected (`worker._campaign_block`) so pieces are coherent with the arc yet distinct from each other.
- Deleting a campaign trashes its unpublished pieces (published stay live).
- **Deferred:** auto-suggesting the arc's angles from a single brief, scheduling the arc across dates on creation (today each piece is scheduled individually from the queue), pillar-tagging, and **evergreen recycling** (hard-depends on the §7f performance loop for the "top performers" list).

### Pillars (status)
Per-brand content pillars exist as a brand-pack field and are injected into generation (`worker._brand_block`). **Pillars now steer the scout (built 13 Jun 2026):** when a brand has pillars, the scout prompt (`scout._scout_prompt`) tells the agent to bias discovery toward them and spread ideas across them, and each suggestion is tagged with the pillar it serves (`suggestions.pillar`, `suggest_topic` param). The Scout page shows a per-idea pillar chip + a pillar-coverage strip so under-served themes are visible. Still to do: using pillars to actively balance the *calendar* / gap-filler, and hanging recurring formats ("Myth Monday") off them.

---

## 7f. Performance loop (analytics back from Postiz)

This closes the loop: analytics flow **back** from Postiz into the system, so it learns from what actually worked, not just what I approved.

### Source & scope
- **Primary source:** Postiz collects engagement metrics and exposes them via its API; the studio pulls each post's performance into the studio DB.
- **Depth varies by platform** (Postiz can only surface what each platform's API returns). **Verify per platform at build.** Where Postiz lacks a metric I need, fall back to pulling directly from that platform's own API.
- **Cadence:** periodic pull (e.g. daily) per published post; stored against the job so every piece carries its own results.

### What the analytics are used for (scoped — four jobs only)
1. **Strengthen the learning flywheel (§7):** approve/edit/reject teaches *my taste*; performance teaches *what resonated*. A piece I approved that then flopped vs. one that took off is labelled data that weights which memory-bank examples get surfaced. Taste + results > taste alone.
2. **Feed the recycler (§7e):** the "top performers" list *is* analytics — this is a hard dependency, not a nice-to-have.
3. **Tune posting times (§7d):** audience-active windows come from engagement over time; sensible defaults until the data exists, then slots follow reality.
4. **Signal the trend scout & pillars (§3b, §7e):** which themes/angles consistently perform, so the system leans toward what resonates, not just what's novel.

### What it is NOT used for (deliberately out of scope)
- **Not vanity dashboards** — metrics earn their place by changing a decision (which of the four above), not by being displayed for their own sake.
- **Not autonomous strategy changes** — analytics *inform* suggestions I still approve; the system never silently re-steers a brand on its own read of the numbers.
- **Not chasing engagement at the cost of brand safety** (§6a) — a post that performed well but skirted the tone/health rules is not a template to repeat. Performance never overrides the safety gate.
- **Not cross-brand mixing** — performance data stays within its brand (§1a), like memory.

### Where it surfaces
- **Dashboard performance panel** (§7a, Phase 5).
- **Proactive digest line** from the bot (§3a): "yesterday's reel beat your average; the carousel underperformed" — signal without me going looking.

### Sequencing
Phase 5 — only useful once posts have flowed long enough to mean something, and depends on the Postiz publishing path being solid first. Don't build the scoreboard before the game starts.

### Built (v1 scaffolding — 13 Jun 2026)
- **Postiz analytics verified at build:** the public API exposes `GET /analytics/:integration?date=<days>` (channel-level, metrics = `[{label, percentageChange, data:[{total,date}]}]`) and `GET /analytics/post/:postId` (per-post). Providers with an analytics method: Instagram, Facebook, YouTube, LinkedIn, TikTok, Threads, Pinterest. **Bluesky has none** — the API returns `[]`, so today (Bluesky is the only connected channel) there's no data. Expected per "don't build the scoreboard before the game starts."
- **Built ready-to-light-up:** `lib/postiz.integrationAnalytics/postAnalytics`, `/api/performance`, and a **Performance panel** (`/performance`, nav under Operations) — per-channel metric cards with sparklines + a 7/30/90-day range, an honest empty-state naming the unsupported platform, and a note on which platforms report. Populates the moment an analytics-supporting account is connected.
- **Deferred until data flows:** the daily pull-and-store loop (metrics persisted against each job), the proactive bot digest line, and the four feedback uses (flywheel weighting, recycler top-performers, posting-time tuning, scout/pillar signals) — these need real numbers and, for recycling/timing, systems not yet built.

---

## 7g. Occasions calendar (special-occasion automation)

A per-brand calendar of special occasions (Mother's Day, Father's Day, seasonal moments, business anniversaries) that auto-populates every year and drives content generation ahead of each date. Upgrades the old thin "known-dates" bullet (§7e) into a real subsystem.

### Three sources
- **Recurring built-ins** — common occasions that repopulate yearly. Stored as **rules, not fixed dates** — e.g. "second Sunday of May" — so moveable occasions (Mother's Day differs by country; Easter shifts) recompute each year instead of going stale.
- **Manual additions** — my own dates (business anniversary, launch day, locally meaningful days), added by hand.
- **Country-holiday research** — point it at a country and it pulls that country's public holidays/observances and proposes additions I approve into the calendar.

### Region varies per brand
Holidays are country-specific and audience region varies per brand (§1a), so each brand's occasions calendar is **region-aware** — its built-ins and research default to its audience's country, not a global default.

### Automation: auto-draft (default), with a sensitivity carve-out
- **Default = auto-draft.** As an occasion's lead time hits (e.g. 2–3 weeks out, configurable per occasion), the system auto-generates drafts — often a small campaign arc (§7e), not one post — into the approval queue. Auto-draft never means auto-post; the gate (§4a) always holds.
- **Sensitive occasions drop to notify-first.** Some occasions are emotionally charged for a brand's audience — Mother's Day for the breastfeeding brand especially (loss, infertility, struggling new mothers). Those are flagged **sensitive** per brand and **notify-me-before-drafting** rather than auto-cheerful-draft. Same green/amber logic as the brand-safety policy (§6a); brand-safety and tone rules apply with full force.

### Ties in
- Lead-time generation uses the **campaign object** (§7e) for multi-post occasions.
- Drafts pass **factual integrity** (§3c) and **brand safety** (§6a) like any content.
- The **trend scout** (§3b) reads the occasions calendar so it plans ahead of known dates instead of only reacting to trends.

### Sequencing
Phase 5 (with campaigns/pillars) — a manual occasions list can exist earlier; the auto-populate-yearly, sensitivity routing, and country-research are the polished version.

### Built (v1 — 13 Jun 2026)
- **Recurring-rule occasions** stored as rules, not fixed dates (`{fixed: month/day}` and `{nth_weekday: month/weekday/n}`, n=-1=last), so moveable days (Mother's/Father's Day, Black Friday) recompute every year. Resolver implemented + verified on both sides (Python worker, JS dashboard — they agree).
- **Seeded built-ins** (brand `all`, region-aware for the SA operator) populate the calendar immediately; auto-draft is **off by default** so nothing surprises.
- **Dashboard `/occasions`** page: upcoming list with computed SAST date + countdown, inline auto-draft / sensitive toggles, add/edit (rule builder), per-active-brand + shared scoping (§1b).
- **Lead-time auto-draft scheduler** in the worker: when an enabled, auto-draft occasion's window opens it queues a draft job (for the occasion's brand, or every enabled brand for an `all` occasion; falls back to `unassigned` if no brands), idempotent per occurrence. **Sensitive occasions are notify-first** — pings the operator instead of auto-drafting. Gate (§4a) always holds; never auto-posts.
- **Deferred (the "polished version"):** country-holiday research (point-at-a-country auto-populate), multi-post **campaign arcs** (needs §7e campaign object), and Easter-relative rules.

---

## 8. Phased roadmap

Each phase is independently useful — never stuck in a long build with nothing to show.

- **Phase 0 — Spine.** Stand up Hermes Agent (§2a) + Telegram gateway, job store (SQLite to start, Postgres later), the state machine, **dry-run mode (§4), heartbeat + auto-restart (§9b), and the cost ledger (§10)** — all trivial now, painful to retrofit. Built and brought up via Claude Code on the host (§13). Goal: text a topic, it logs a job and replies in persona.
- **Phase 1 — Research + text.** Research agent → brief → captions/posts → preview → approve → publish **via Postiz** (§7d). Start with **Bluesky** (open API), then Facebook + Instagram captions. **Stand up the custom dashboard here as a thin cockpit** (§7a) — approval queue, job status, accounts health, cost ledger — and grow its panels in later phases. **Add real-content ingestion (§3e) here** too — cheap and immediately useful. Powerful on its own.
- **Phase 2 — Images + thumbnails.** Text-to-image visuals + text-overlay thumbnails, tuned to brand look. *Dashboard gains full-fidelity image/video previews (§7a) — now there are visual assets to inspect.* **Engagement triage-and-notify (§3d) fits here too** — posts are flowing, replies are arriving.
- **Phase 3 — Short video** (Reels/Shorts/TikTok). **Assembly approach:** script → AI voiceover → b-roll → auto-captions (timed with Whisper) → stitched to 9:16 with ffmpeg.
- **Phase 4 — Long-form YouTube.** Longer scripts, chaptering, longer assembly pipeline, upload + thumbnail via YouTube Data API. Heaviest lift; leans on everything before it.
- **Phase 5 — Intelligence polish.** Feedback learning loop, brand-memory vector store, the trend scout (§3b), **campaigns/pillars/recycling (§7e), the occasions calendar (§7g), engagement reply-drafting (§3d), and the performance loop (§7f) — analytics back from Postiz feeding memory, recycling, timing, and the scout**. *(A basic suggest-only scout can arrive earlier, once Phase 1 research works; novelty-ranking and auto-draft are the polished version. A manual occasions list can also arrive earlier; auto-populate/sensitivity/country-research are the polished version.)*

---

## 9. Suggested tech stack

*Sensible defaults — verify current best-in-class at build time, especially for AI video.*

- **Backend:** Python (best for AI, ffmpeg, video tooling; Hermes registers tools as typed Python functions).
- **Packaging / deploy:** **Docker Compose** — one stack per deployment unit (§2c); same file, variable container count. Built/operated via **Claude Code** on the host (§13).
- **Orchestration / agent / Telegram:** **Hermes Agent** (§2a) — orchestrator, conversational layer, persona, memory, Telegram gateway. Per-brand agents.
- **Video:** Remotion (preferred) or ffmpeg / MoviePy.
- **Scheduling / publishing:** **Postiz** (self-hosted, §7d) — owns scheduling, publishing, and the social calendar across all platforms.
- **Generation models:** accessed via an aggregator (Replicate / fal.ai / Atlas Cloud) so models stay swappable. Defaults in §7b / §7c.
- **State:** Postgres (SQLite to start) — shared by the agent and the dashboard.
- **Media storage:** **local disk** (or NAS / always-on box) — local-first by design (see §9a).
- **Dashboard:** Next.js app — a core component for studio-specific views, not optional; **responsive / mobile-friendly** (see §7a).
- **Always-on host:** runs Postiz (the posting queue) on a low-power box; heavy generation stays on the main machine.
- **Voice:** ElevenLabs or similar.

---

## 9a. Storage model (local-first)

Everything lives on my own hardware — media, database, and the brand-memory vector store all on local disk (or a NAS / small always-on box). Privacy-first, no cloud-storage cost, full control, pairs cleanly with the private dashboard. Two responsibilities it creates:

- **Backups.** Local-only means a dead drive = lost data. Need an external or off-site encrypted backup.
- **Capacity + retention.** Video is heavy; long-form renders fill disk fast. Keep masters, auto-clear intermediate render scraps after publishing.

**Honest nuance:** local storage keeps my *data* at home, but calling cloud AI APIs to generate still routes content through those providers during generation. If full privacy ever outranks quality, the path is local models (e.g. Ollama for text, local image gen) — slower, less polished. Future toggle, not a v1 requirement.

---

## 9b. Reliability & monitoring (who watches the watcher)

The bot flags failed uploads — but if the *box* dies (power cut, container crash, full disk), the thing that would tell me is the thing that's down. So:

- **External heartbeat:** the system pings an outside service (e.g. Healthchecks.io, free) on a schedule; if pings *stop*, that service alerts me. The one alert path that doesn't depend on my box being alive.
- **Auto-restart:** `restart: unless-stopped` policies in Compose; containers come back on their own after crashes/reboots.
- **Retry with backoff:** failed publishes retry automatically (e.g. 3 attempts, exponential backoff); only then does the bot escalate to me — transient platform hiccups shouldn't need my attention.
- **Disk watch:** alert before the disk fills (renders are the usual culprit; ties to retention in §9a).
- **Test the restore:** actually restore from backup once. An untested backup is a hope, not a backup.

---

## 10. Cost notes & budget guardrails

Running cost is almost entirely API usage, and swings massively on the video decision.
- Text + image phases: cheap, often cents per piece.
- Assembly-based video w/ AI voiceover: low cents-to-dollar range per clip.
- **Pure AI video generation: expensive, fast** — main reason to favour assembly.
- Tiered spending (§6) keeps costs down: cheap upstream, premium only post-approval.

### Cost ledger (instrumentation, not just philosophy)
- **Every API call logged** with its cost, attributed **per job and per brand**.
- **Monthly budget cap per brand**; the bot warns at ~80% and pauses non-urgent generation at 100% (asks me before exceeding).
- Byproduct: I know what each published post actually cost — useful business data per brand, and it makes the six-brand spend visible instead of surprising.

---

## 11. Platform automation reality

Postiz (§7d) handles the per-platform publishing through official OAuth, which absorbs most of the old per-platform pain — but the platforms' own rules still apply:

- **Bluesky (AT Protocol), VK:** friendly, open.
- **Instagram / Facebook:** need a Business/Creator account; Reels publishing works but can be finicky.
- **TikTok:** still gated behind its Content Posting API approval.
- **X/Twitter:** API is expensive; treat as optional.
- **Avoid spam patterns** even via official APIs — don't fire identical content in rapid bursts across accounts (trips abuse detection). The queue/stagger in §7d helps.
- Where a platform can't be automated, fall back to a **one-tap manual hand-off**.

---

## 13. Build & deployment workflow (Claude Code on the host)

The build is done **hands-on with Claude Code installed in the terminal** on the host (or against the project repo), not just copy-pasting from chat. Claude Code can create and edit the project files, run `docker compose up`, read errors directly, and iterate in place — the right tool for standing up and debugging a multi-service stack.

### What gets built here
The `compose.yml` wiring Postiz (+ its Postgres/Redis), the Hermes agent(s), the studio dashboard and worker, shared volumes/network; `.env`/config templates with secrets externalized; Hermes config including the registered tools and the **code-enforced, token-gated publish tool** (§4a); Tailscale + reverse-proxy for private access (§2c); heartbeat, restart policies, backup scripts (§9b). Plus a deployment runbook (exact commands, in order).

### Division of labour
- **Claude Code (in my environment):** writes/edits files, runs commands, reads output, debugs in place.
- **Me:** execute, hold the secrets, do the per-platform OAuth/app-approval steps in each platform's developer console (guided, but my legwork).
- **Design chat (this document):** architecture decisions and writing the artifacts; Claude Code executes them.

### Build rule: ask, don't assume
A standing rule for the build: **never silently guess on anything consequential.** Stop and ask / confirm before:
- credentials, account identities, or which brand a thing targets;
- destructive or irreversible actions (deleting data, overwriting config, anything that can't be undone);
- ambiguous or under-specified requirements;
- inventing a value, fact, or default that isn't in the plan.

Sensible boundary (so the build stays workable): trivial, reversible implementation details (a variable name, a file layout) don't each need a question — just note the choice. The rule is *surface assumptions and confirm before anything consequential; ask when genuinely ambiguous; never quietly invent facts, values, or requirements.* It's the §3c factual-integrity discipline applied to building.

### Honest boundaries
- Hermes is young and fast-moving — pull its **current** install/config docs at build time rather than relying on older guidance.
- Postiz is documented and stable — work from its actual compose file and docs.
- Platform connection (IG/YouTube/TikTok auth) is real per-platform legwork that can be guided but not clicked through for me.

### Incremental bring-up (don't stand up everything at once)
Follow the roadmap (§8): get the box + Tailscale up, Postiz running with one account connected, one Hermes agent talking on Telegram — prove the Phase 0 spine and dry-run it (§4) before layering the dashboard, workers, and the rest. A stack brought up one service at a time is debuggable; six at once is not.

### Setup note
Install Claude Code on the host terminal (or dev machine with repo access) as the first build step, before standing up the stack.

---

## 14. Resilience (accounts & absence)

### Account-loss posture
The whole system's value rides on social accounts, and automated posting — even compliant — carries a non-zero risk of a flag, suspension, or lost API access. So:
- **The content library is the durable asset, not the account.** Everything (masters, finals, ingested real media, approved copy) lives locally (§9a) and survives any platform losing me. An account is replaceable; the library is not.
- **Don't earn the ban:** official APIs only (Postiz, §11), no spam patterns, staggered posting (§7d). The likeliest cause of trouble is volume/sameness, which the queue already mitigates.
- **Treat each account as potentially disposable** — if one vanishes, reconnect a new one in Postiz and the brand keeps going from its library. No single account is a single point of failure for the brand's content.

### Away mode (human-absence behaviour)
The system is human-gated by design — so by default, when I'm away, nothing new ships and the approval queue just fills. That's safe but goes quiet. **Away mode** is an explicit, opt-in middle ground:
- **On:** evergreen recycling (§7e) of *already-approved* top performers keeps the lights on — no new claims, no new risk, nothing ungated, just proven content re-slotted.
- **Held:** all new generation, trend-scout drafts, and engagement replies wait in the queue for my return (the scout can still *collect* so there's a backlog ready, it just doesn't ship).
- **Always-on exceptions:** urgent escalations (red-flag engagement §3d, system-down §9b) still reach me wherever I am.
- A deliberate switch, not a default — I decide per absence whether to coast on evergreen or go fully quiet.

---

## 12. Open decisions / to revisit

- [ ] Which platforms matter most (to sequence them right).
- [ ] Rough monthly budget comfort level.
- [ ] AI-video vs. assembly tradeoff — confirm preference (current lean: assembly).
- [ ] What the channel(s) are actually about — to ground the brand profile.
- [ ] How much existing content to ingest for the first voice-profile pass.
- [x] Build approach — **Claude Code in the terminal on the host** for hands-on file edits, `docker compose up`, and in-place debugging (§13).
- [ ] Bot persona — name, tone, how proactive vs. terse.
- [ ] Backup strategy for local storage (external drive / off-site, encryption).
- [ ] Whether/when local models matter enough to trade quality for full privacy.
- [ ] Hermes Agent maturity — pin a version; plan for API churn in a young framework.
- [ ] Which LLM provider to run under Hermes (cloud for quality vs. local for privacy).
- [x] Scheduler/publisher — **Postiz** chosen (self-hosted); Zernio held in reserve.
- [ ] Which generation-model aggregator to standardise on (Replicate / fal.ai / Atlas Cloud).
- [ ] Confirm Postiz covers every target platform I need at build time (esp. TikTok, VK).
- [ ] Trend scout: which sources/feeds to watch, scan cadence, shortlist size.
- [ ] Trend scout: suggest-only by default, or auto-draft certain categories? Brand-safety rules.
- [ ] Research integrity: source allow/deny list + quality tiers (what counts as reputable).
- [ ] Which model runs the verification pass (same as research, or a separate/cheaper checker).
- [ ] Single-source policy — flag only, or refuse to use until corroborated?
- [ ] Identify the other 5 businesses → author a brand profile + safety policy for each.
- [ ] Breastfeeding brand: confirm each platform's current breastfeeding-imagery policy at build.
- [ ] Breastfeeding brand: finalise the medical-disclaimer / "see a professional" wording.
- [ ] Per-brand context switching in Telegram (command, separate chats, or default brand).
- [ ] Deployment topology per brand — consolidated, isolated, or hybrid (and which brands isolate).
- [x] Dashboard: **custom, from the outset** (Phase 1), grows panel-by-panel; built on the shared studio DB beside Postiz + Hermes (§7a). Single multi-connect cockpit vs. per-instance still TBD by topology.
- [ ] Which brands (if any) get handed off / run hands-off → candidates for Zernio cloud.
- [ ] Box spec — modest (cloud generation) vs GPU (local models); home server vs hosted-but-controlled.
- [ ] Confirm Tailscale (or equivalent) for private dashboard access.
- [ ] Engagement: per-brand reply-drafting vs triage-only; red-flag escalation criteria (esp. breastfeeding brand).
- [ ] Per-brand content pillars (3–5 each) + known-dates/awareness calendar.
- [ ] Monthly budget cap per brand; recycling interval policy.
- [ ] Quiet-hours window + what counts as urgent-only.
- [ ] Confirm how to disable/gate Hermes skill self-writing on production agents.
- [ ] Anomaly-alert thresholds (what tool-call patterns trigger a ping).
- [ ] Away mode (§14): default recycling cadence when on; how it's toggled (Telegram command?).
- [ ] Performance loop (§7f): which metrics Postiz actually returns per platform; what to pull directly.
- [ ] Dashboard auth (§7a): which vetted auth library/provider; passkey vs TOTP; which actions need step-up.

---

*End of v0.18.*
