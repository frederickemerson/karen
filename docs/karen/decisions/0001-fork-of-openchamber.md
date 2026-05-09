---
archetype: decision
status: active
---

# 0001: Karen is a fork of OpenChamber

## Context

Karen needed a working OpenCode-backed UI surface (chat, sessions, terminal, diffs, providers, MCP, agents) and a deployable web/desktop/VS Code runtime. Building this from scratch would have duplicated a year of OpenChamber engineering. OpenChamber already provided exactly the substrate Karen needed: an Express web server, a React UI, an Electron shell, a VS Code extension, and a stable OpenCode SDK integration.

Karen's product premise (terminal judgment layer + PromptCourt scoreboard) is layered on top of that substrate. The CLI is the product; the web UI is the scoreboard; the server is the policy boundary; Convex is the public ledger. None of those four surfaces existed in OpenChamber.

## Decision

Karen is a hard fork of OpenChamber. Karen owns four surfaces:

- `packages/karen/` (CLI)
- `packages/web/server/lib/promptcourt/` (server)
- `packages/ui/src/components/promptcourt/` (UI)
- `convex/` (cloud)

Plus repo-root briefs ([../02-product.md](../02-product.md), [../03-design.md](../03-design.md)), Karen operations docs (`../operations/`), Karen decisions (this folder), and the Karen docs spec ([../conventions/docs-spec.md](../conventions/docs-spec.md)).

Everything else is treated as inherited substrate. We minimize edits to inherited surfaces, keep them on the OpenChamber upgrade path where possible, and document any necessary touch points (e.g., mounting PromptCourt routes into the inherited Express server).

Karen docs are governed by Karen's own validator ([../../../scripts/docs/validate-karen-docs.mjs](../../../scripts/docs/validate-karen-docs.mjs)), separate from the inherited Starlight validator (`scripts/docs/validate-docs.mjs`). The inherited [`AGENTS.md`](../../../AGENTS.md) is rewritten to be Karen-first with a clearly labeled inherited appendix.

## Consequences

Trade-offs accepted with this decision:

- **Maintenance debt.** Karen carries the inherited OpenChamber codebase, including parts it does not directly use. Pruning is possible but is not a priority while the substrate is still useful.
- **Upstream merges are manual.** There is no automated sync from OpenChamber. When a relevant fix lands upstream, it must be cherry-picked.
- **Two doc systems.** Inherited Starlight content (`packages/docs/`) and Karen docs (`docs/karen/`) coexist. They are validated separately and never merged.
- **Boundary discipline matters.** Karen scope must be enforced explicitly (see [../00-scope.md](../00-scope.md)), or it will leak into inherited surfaces and make future pruning harder.

Benefits accepted:

- Karen ships with a real web/desktop/VS Code runtime from day one.
- The OpenChamber chat, terminal, diff, and provider UIs become Karen's scoreboard surface for free.
- The fork lets Karen evolve aggressively without blocking on upstream review.

## Date

2026-05-09

## Status

active
