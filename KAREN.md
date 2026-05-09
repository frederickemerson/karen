---
archetype: scope
status: active
---

# Karen

Karen is a terminal judgment layer for OpenCode. It blocks weak prompts, runs approved ones in an isolated worktree, quizzes you on the diff, and only promotes the patch when you pass. This file is the agent entry point for any work on Karen-added surfaces in this repo. Inherited OpenChamber surfaces are out of scope here; for those, see [AGENTS.md](AGENTS.md).

## Agent TL;DR

- Karen-added code lives in four surfaces. Touching any of them means reading that surface's `DOCUMENTATION.md` first.
- Briefs ([docs/karen/02-product.md](docs/karen/02-product.md), [docs/karen/03-design.md](docs/karen/03-design.md)) define immutable product and visual intent. Do not drift from them.
- The terminal CLI is the product. The web GUI is the scoreboard. Cloud sync is non-blocking.
- Run `bun run docs:validate:karen` before finalizing any change to Karen code or Karen docs.
- The full convention is in [docs/karen/conventions/docs-spec.md](docs/karen/conventions/docs-spec.md).

## In scope

Karen surfaces and their module docs:

| Surface | Path | Module doc |
|---|---|---|
| `cli` | `packages/karen/` | [packages/karen/DOCUMENTATION.md](packages/karen/DOCUMENTATION.md) |
| `server` | `packages/web/server/lib/promptcourt/` | [packages/web/server/lib/promptcourt/DOCUMENTATION.md](packages/web/server/lib/promptcourt/DOCUMENTATION.md) |
| `ui` | `packages/ui/src/components/promptcourt/` | [packages/ui/src/components/promptcourt/DOCUMENTATION.md](packages/ui/src/components/promptcourt/DOCUMENTATION.md) |
| `cloud` | `convex/` | [convex/DOCUMENTATION.md](convex/DOCUMENTATION.md) |

Cross-cutting Karen docs:

- [docs/karen/00-scope.md](docs/karen/00-scope.md) - Karen vs OpenChamber boundary
- [docs/karen/01-architecture.md](docs/karen/01-architecture.md) - end-to-end flow and data shapes
- [docs/karen/02-product.md](docs/karen/02-product.md) - product brief
- [docs/karen/03-design.md](docs/karen/03-design.md) - design brief
- [docs/karen/operations/install.md](docs/karen/operations/install.md) - CLI installer
- [docs/karen/operations/cloud.md](docs/karen/operations/cloud.md) - Convex + Clerk deployment
- [docs/karen/operations/env.md](docs/karen/operations/env.md) - environment variables
- [docs/karen/decisions/](docs/karen/decisions/) - decisions, append-only
- [docs/karen/conventions/docs-spec.md](docs/karen/conventions/docs-spec.md) - this docs system

Karen scripts in [package.json](package.json): `karen`, `install:karen`, `uninstall:karen`, `status:karen`, `doctor:karen`, `convex:dev`, `convex:deploy`, `convex:dashboard`, `test:promptcourt`, `test:karen`, `test:karen-core`, `test:karen-gui`.

## Out of scope

Inherited from the OpenChamber fork. Documentation for these is **not** governed by Karen's docs spec; do not modify under the guise of Karen work:

- `packages/web/` (web server, except `server/lib/promptcourt/` which is Karen)
- `packages/ui/` (shared UI, except `src/components/promptcourt/` which is Karen)
- `packages/electron/`, `packages/desktop/`, `packages/vscode/`, `packages/docs/`
- All other `packages/web/server/lib/*/DOCUMENTATION.md`
- `docs/REVERSE_PROXY.md`, `docs/CUSTOM_THEMES.md`, `docs/PREVIEW_REMOTE_RELAY.md`, `docs/TAURI_TO_ELECTRON_CUTOVER.md`
- `SECURITY.md`, `CHANGELOG.md`
- `scripts/docs/validate-docs.mjs` (Starlight validator, untouched)

If a Karen change must touch an inherited surface (e.g., wiring PromptCourt routes into the Express app in `packages/web/server/index.js`), keep the change minimal and follow the inherited rules in [AGENTS.md](AGENTS.md) Appendix.

## How to add a new surface

When Karen grows a new top-level directory of Karen-owned code:

1. Add the surface to the `KAREN_SURFACES` list in [scripts/docs/validate-karen-docs.mjs](scripts/docs/validate-karen-docs.mjs).
2. Add the surface to the table above and to [docs/karen/conventions/docs-spec.md](docs/karen/conventions/docs-spec.md) `In scope`.
3. Create `<new-surface>/DOCUMENTATION.md` from the `module` template in [docs/karen/conventions/docs-spec.md](docs/karen/conventions/docs-spec.md).
4. Reference every non-test, non-generated source file from that surface in the new `DOCUMENTATION.md` `Files` section.
5. Run `bun run docs:validate:karen`. It must pass.
6. Run `bun run type-check` and `bun run lint`.

To add a new file inside an existing surface: update that surface's `DOCUMENTATION.md` `Files` section in the same change. The validator fails if you do not.

## Read-first decision tree

| If you are touching... | Read first |
|---|---|
| Anything Karen | This file, then [docs/karen/conventions/docs-spec.md](docs/karen/conventions/docs-spec.md) |
| `packages/karen/**` | [packages/karen/DOCUMENTATION.md](packages/karen/DOCUMENTATION.md) and [docs/karen/operations/install.md](docs/karen/operations/install.md) |
| `packages/web/server/lib/promptcourt/**` | [packages/web/server/lib/promptcourt/DOCUMENTATION.md](packages/web/server/lib/promptcourt/DOCUMENTATION.md) |
| `packages/ui/src/components/promptcourt/**` | [packages/ui/src/components/promptcourt/DOCUMENTATION.md](packages/ui/src/components/promptcourt/DOCUMENTATION.md) and [docs/karen/03-design.md](docs/karen/03-design.md) |
| `convex/**` | [convex/DOCUMENTATION.md](convex/DOCUMENTATION.md) and [docs/karen/operations/cloud.md](docs/karen/operations/cloud.md) |
| Cloud or env behavior | [docs/karen/operations/cloud.md](docs/karen/operations/cloud.md) and [docs/karen/operations/env.md](docs/karen/operations/env.md) |
| Product copy, judgment tone, scoreboard intent | [docs/karen/02-product.md](docs/karen/02-product.md) |
| Colors, typography, motion, layout | [docs/karen/03-design.md](docs/karen/03-design.md) |
| Adding or moving a doc | [docs/karen/conventions/docs-spec.md](docs/karen/conventions/docs-spec.md) |

## Karen-specific rules

- **Cloud sync is non-blocking.** Karen records locally first; cloud sync is best-effort. A cloud failure must never stall the agent flow.
- **PromptCourt is the source of truth for verdicts.** UI must render verdicts derived from PromptCourt records, not from heuristics on raw OpenCode output.
- **Briefs are immutable intent.** Changes to [docs/karen/02-product.md](docs/karen/02-product.md) or [docs/karen/03-design.md](docs/karen/03-design.md) require explicit product owner approval and a [decision record](docs/karen/decisions/).
- **The CLI is the product; the web is the scoreboard.** Do not move terminal-defining behavior into the web UI without a product decision.
- **Privacy redaction runs before storage.** Server-side redaction in `packages/web/server/lib/promptcourt/privacy.js` is the policy boundary; UI must not be the only redaction layer.
- **Worktree isolation must hold.** Approved prompts execute in an isolated git worktree. Patches only touch the user's tree after the read-check passes.

## Mandatory commands before finalizing Karen changes

```sh
bun run docs:validate:karen
bun run type-check
bun run lint
```

For Karen test suites:

```sh
bun run test:karen-core    # promptcourt unit tests + karen self-check
bun run test:karen-gui     # Playwright GUI smoke
```
