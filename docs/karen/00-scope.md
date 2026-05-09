---
archetype: scope
status: active
---

# Karen vs OpenChamber Boundary

Karen is built on a fork of OpenChamber. This file defines exactly which code, files, and docs belong to Karen and which are inherited from the fork. Use this when you are not sure whether a change is "Karen scope."

## Agent TL;DR

- Karen owns four code surfaces: `packages/karen/`, `packages/web/server/lib/promptcourt/`, `packages/ui/src/components/promptcourt/`, `convex/`.
- Karen owns its briefs ([02-product.md](02-product.md), [03-design.md](03-design.md)), its operations docs (`operations/`), its decisions (`decisions/`), and the docs spec ([conventions/docs-spec.md](conventions/docs-spec.md)).
- Everything else in this repo is inherited from OpenChamber. Treat it as a stable substrate.
- When a Karen change must touch an inherited surface (e.g., wiring routes into the Express server), keep the change minimal, follow inherited rules, and document the touch point.

## In scope

Karen-owned code:

- [`packages/karen/`](../../packages/karen/) - CLI launcher, installer, self-checks (surface `cli`).
- [`packages/web/server/lib/promptcourt/`](../../packages/web/server/lib/promptcourt/) - PromptCourt server logic (surface `server`).
- [`packages/ui/src/components/promptcourt/`](../../packages/ui/src/components/promptcourt/) - PromptCourt web UI (surface `ui`).
- [`convex/`](../../convex/) - Convex schema, functions, HTTP actions, auth config (surface `cloud`).

Karen-owned scripts and tooling:

- [`scripts/install-karen.mjs`](../../scripts/install-karen.mjs) - the installer entry point.
- [`scripts/docs/validate-karen-docs.mjs`](../../scripts/docs/validate-karen-docs.mjs) - the Karen docs validator.
- Karen scripts in [`package.json`](../../package.json): `karen`, `install:karen`, `uninstall:karen`, `status:karen`, `doctor:karen`, `convex:dev`, `convex:deploy`, `convex:dashboard`, `test:promptcourt`, `test:karen`, `test:karen-core`, `test:karen-gui`, `docs:validate:karen`.

Karen-owned docs:

- [`KAREN.md`](../../KAREN.md) - agent entry point.
- All files under [`docs/karen/`](.).

## Out of scope

Inherited from OpenChamber. Do not modify under the guise of Karen work, do not document under Karen's docs spec, and do not extend without an explicit decision.

Code:

- `packages/web/` (except `packages/web/server/lib/promptcourt/`)
- `packages/ui/` (except `packages/ui/src/components/promptcourt/`)
- `packages/electron/`, `packages/desktop/`, `packages/vscode/`, `packages/docs/`

Inherited module docs (managed under [`AGENTS.md`](../../AGENTS.md) Inherited documentation map):

- All other `packages/web/server/lib/*/DOCUMENTATION.md`
- `packages/ui/src/sync/DOCUMENTATION.md`, `packages/ui/src/stores/DOCUMENTATION.md`, `packages/ui/src/components/session/sidebar/DOCUMENTATION.md`, `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md`
- `packages/vscode/src/DOCUMENTATION.md`

Inherited topic docs:

- [`docs/REVERSE_PROXY.md`](../../docs/REVERSE_PROXY.md), [`docs/CUSTOM_THEMES.md`](../../docs/CUSTOM_THEMES.md), [`docs/PREVIEW_REMOTE_RELAY.md`](../../docs/PREVIEW_REMOTE_RELAY.md), [`docs/TAURI_TO_ELECTRON_CUTOVER.md`](../../docs/TAURI_TO_ELECTRON_CUTOVER.md)

Inherited repo-root files:

- [`SECURITY.md`](../../SECURITY.md), [`CHANGELOG.md`](../../CHANGELOG.md), [`README.md`](../../README.md), [`Caddyfile`](../../Caddyfile)

Inherited tooling:

- [`scripts/docs/validate-docs.mjs`](../../scripts/docs/validate-docs.mjs) - Starlight content validator. Stays separate from the Karen validator.

## How to add a new surface

When Karen needs a new top-level directory of Karen-owned code:

1. Open a [decision record](decisions/) explaining why Karen needs this surface and what it owns. Get approval before writing code.
2. Create the directory and at least one source file.
3. Add the directory to `KAREN_SURFACES` in [`scripts/docs/validate-karen-docs.mjs`](../../scripts/docs/validate-karen-docs.mjs).
4. Add the directory to the `In scope` list above.
5. Add the directory to the module map in [`KAREN.md`](../../KAREN.md) and to [`AGENTS.md`](../../AGENTS.md) Karen modules table.
6. Create `<new-surface>/DOCUMENTATION.md` from the `module` template in [`conventions/docs-spec.md`](conventions/docs-spec.md).
7. Run `bun run docs:validate:karen`. It must pass.
8. Run `bun run type-check` and `bun run lint`.

Touching an inherited surface from Karen code is fine when unavoidable (e.g., mounting PromptCourt routes into the Express app). It does not promote the inherited surface into Karen scope. Document the touch point in the relevant Karen `DOCUMENTATION.md`.
