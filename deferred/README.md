# deferred/ — parked on the `lite` branch, not removed

These components are part of the full heavy build. On the **`lite` branch** they're moved here (via `git mv`) to slim the active tree down to the transplant — **nothing was deleted or rewritten.**

Two guarantees:

1. **`main` is untouched** — the complete original build lives there, every file in its original location.
2. **These files are intact** — moved, not modified. Git history preserves every original path.

## What's here

| Path | What it is | Plan ref |
|---|---|---|
| `dashboard/` | Custom Next.js cockpit — approval queue, pipeline, brand-memory, cost ledger. | §7a |
| `chatwoot/` | Self-hosted omnichannel engagement inbox (DMs + comments). | §3d |
| `mautic/` | Email marketing. | — |
| `typebot/` | Chatbot / conversational funnel. | — |
| `compose.full.yml` | The full 10-service stack (this is the original top-level `compose.yml` from `main`). | §2c/§13 |

## Bringing something back

To restore any component to the active tree on this branch:

```bash
git mv deferred/dashboard ./dashboard      # for example
```

Or just work from `main`, which has the complete stack as originally built.

See [`../LITE.md`](../LITE.md) for what the lite build keeps and why these are parked.
