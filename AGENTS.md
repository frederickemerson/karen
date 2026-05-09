# Karen - AI Agent Reference

Karen is a terminal judgment layer for OpenCode, built on top of the OpenChamber fork. This file is the master reference for AI agents working in this repo. Karen-specific rules come first; rules inherited from the OpenChamber fork are in the appendix and apply only when touching inherited surfaces.

## How to use this file

- If your work touches a Karen surface (CLI, PromptCourt server, PromptCourt UI, Convex), follow the Karen sections below and read [KAREN.md](KAREN.md).
- If your work touches an inherited OpenChamber surface (everything else), follow the relevant section in the **Appendix: Inherited OpenChamber rules**.
- If your work straddles both, both sets apply. Karen rules take precedence on conflicts.

## Karen scope

Karen-added code lives in four surfaces:

- `cli` - `packages/karen/`
- `server` - `packages/web/server/lib/promptcourt/`
- `ui` - `packages/ui/src/components/promptcourt/`
- `cloud` - `convex/`

Plus repo-root briefs ([docs/karen/02-product.md](docs/karen/02-product.md), [docs/karen/03-design.md](docs/karen/03-design.md)), operations docs (`docs/karen/operations/`), decisions (`docs/karen/decisions/`), and the docs spec (`docs/karen/conventions/docs-spec.md`).

Full surface boundary and module map: [KAREN.md](KAREN.md). Boundary detail: [docs/karen/00-scope.md](docs/karen/00-scope.md).

## Mandatory reads before changing Karen

Before any non-trivial change to a Karen surface, read in order:

1. [KAREN.md](KAREN.md) - entry point, module map, decision tree.
2. [docs/karen/conventions/docs-spec.md](docs/karen/conventions/docs-spec.md) - how docs work and how the validator enforces them.
3. The `DOCUMENTATION.md` of each surface you are about to touch (see Karen modules table below).
4. [docs/karen/02-product.md](docs/karen/02-product.md) and [docs/karen/03-design.md](docs/karen/03-design.md) - immutable briefs.
5. [docs/karen/01-architecture.md](docs/karen/01-architecture.md) - end-to-end flow.

## Karen modules

These are the live, mandatory module docs. Read the matching one before changing code in its directory.

| Surface | Path | Module doc |
|---|---|---|
| `cli` | `packages/karen/` | [packages/karen/DOCUMENTATION.md](packages/karen/DOCUMENTATION.md) |
| `server` | `packages/web/server/lib/promptcourt/` | [packages/web/server/lib/promptcourt/DOCUMENTATION.md](packages/web/server/lib/promptcourt/DOCUMENTATION.md) |
| `ui` | `packages/ui/src/components/promptcourt/` | [packages/ui/src/components/promptcourt/DOCUMENTATION.md](packages/ui/src/components/promptcourt/DOCUMENTATION.md) |
| `cloud` | `convex/` | [convex/DOCUMENTATION.md](convex/DOCUMENTATION.md) |

## Karen-specific rules

- **Cloud sync is non-blocking.** Local recording is authoritative. A Convex outage must never stall the agent flow.
- **PromptCourt is the source of truth for verdicts.** Do not derive verdict UI from heuristics on raw OpenCode output.
- **Briefs are immutable intent.** Changing [docs/karen/02-product.md](docs/karen/02-product.md) or [docs/karen/03-design.md](docs/karen/03-design.md) requires explicit product owner approval and a [decision record](docs/karen/decisions/).
- **CLI is the product; web is the scoreboard.** Do not migrate terminal-defining behavior into the web UI without a product decision.
- **Privacy redaction runs before storage.** Server-side redaction in `packages/web/server/lib/promptcourt/privacy.js` is the policy boundary; UI redaction does not count.
- **Worktree isolation must hold.** Approved prompts execute in an isolated git worktree. Patches only touch the user's tree after the read-check passes.
- **Grow with the codebase.** Adding or renaming any tracked source file under a Karen surface in the same PR also updates that surface's `DOCUMENTATION.md` `Files` section. The validator enforces this.

## Karen validation expectations

Run before finalizing any change to Karen code or Karen docs:

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

If you changed cloud schema or functions: also run `bun run convex:dev -- --once` against your dev deployment.

## Agent constraints (Karen)

- Do not modify `../opencode` (separate repo).
- Do not run git or GitHub commands unless explicitly asked.
- Karen scope is bounded by [KAREN.md](KAREN.md). Do not extend Karen behavior into inherited surfaces under the guise of refactoring.
- Never commit secrets. The Karen-relevant ones live in `.env.local`: `KAREN_CLOUD_INGEST_SECRET`, `CONVEX_DEPLOY_KEY`, `CLERK_SECRET_KEY`.

---

# Appendix: Inherited OpenChamber rules

The following rules are inherited from the OpenChamber fork. They apply when you touch inherited surfaces (anything outside the four Karen surfaces above) or when shared infrastructure is involved.

## Inherited core purpose

OpenChamber provides UI runtimes (web/desktop/VS Code) for interacting with an OpenCode server (local auto-start or remote URL). UI uses HTTP + SSE via `@opencode-ai/sdk`. Karen layers a CLI judgment surface and a PromptCourt scoreboard on top.

## Inherited runtime architecture

- `Desktop` (Electron) boots the web server **in the same Node process** as the Electron main, then loads the web UI from `http://127.0.0.1:<port>`. No sidecar subprocess.
- `Desktop` (Tauri, legacy) still spawns `openchamber-server` as a bun-compiled sidecar binary. Kept only for auto-update compatibility with existing Tauri installs.
- All backend logic lives in `packages/web/server/*` (and `packages/vscode/*` for the VS Code runtime). The native shell is not a feature backend.
- The shell is used only for stable native integrations: menu, dialog (open folder), notifications, updater, deep-links, quit confirmation.

### Desktop shell: Electron is the target, Tauri is legacy

- New desktop work goes into `packages/electron/`. This is the forward path.
- `packages/desktop/` (Tauri) is kept running in parallel only to preserve auto-update for existing installs until the cutover. Do not add features to it; do not port bug fixes back unless they actually affect currently-released Tauri users.
- Desktop-side changes (IPC handlers, native integrations, window/quit/notification behavior) land in `packages/electron/main.mjs` + `packages/electron/preload.mjs`. The `__TAURI__` shim exposed by the preload keeps the shared UI working against both shells, so renderer-side code should not branch on shell type.
- Electron imports the server via `@openchamber/web/server/index.js` (workspace dep) and calls `startWebUiServer({...})`. The returned handle has `getPort()` / `stop()`. Notifications flow via an `onDesktopNotification` callback injected at startup - no stdout-parsing IPC.
- Build/release: both shells ship in the same GitHub release today (`.github/workflows/release.yml`). The one-shot Tauri to Electron auto-update migration is documented in `docs/TAURI_TO_ELECTRON_CUTOVER.md`; run that when the user decides to flip.
- After the cutover ships and stabilises, `packages/desktop/` is deleted; this note collapses back to "Desktop is Electron".

## Inherited tech stack

Source of truth: `package.json`, resolved: `bun.lock`.

- Runtime/tooling: Bun (`package.json` `packageManager`), Node >=20 (`package.json` `engines`)
- UI: React, TypeScript, Vite, Tailwind v4
- State: Zustand (`packages/ui/src/stores/`)
- UI primitives: Base UI (`@base-ui/react`, primary), Radix UI (legacy, migrating), HeroUI, Remixicon
- Server: Express (`packages/web/server/index.js`)
- Desktop (forward): Electron 41 (`packages/electron/`)
- Desktop (legacy): Tauri v2 (`packages/desktop/src-tauri/`)
- VS Code: extension + webview (`packages/vscode/`)
- Cloud (Karen): Convex (`convex/`), Clerk (`@clerk/clerk-react`)

## Inherited monorepo layout

Workspaces are `packages/*` (see `package.json`).

- Shared UI: `packages/ui`
- Web app + server + CLI: `packages/web`
- Desktop shell (Electron - forward): `packages/electron`
- Desktop shell (Tauri - legacy): `packages/desktop`
- VS Code extension: `packages/vscode`
- Karen CLI: `packages/karen` (Karen scope; see [KAREN.md](KAREN.md))

## Inherited documentation map

Before changing any inherited mapped module, read its module documentation first. These are **not** Karen docs and are not validated by `docs:validate:karen`.

- `packages/web/server/lib/quota/DOCUMENTATION.md`
- `packages/web/server/lib/git/DOCUMENTATION.md`
- `packages/web/server/lib/github/DOCUMENTATION.md`
- `packages/web/server/lib/opencode/DOCUMENTATION.md`
- `packages/web/server/lib/notifications/DOCUMENTATION.md`
- `packages/web/server/lib/terminal/DOCUMENTATION.md`
- `packages/web/server/lib/tts/DOCUMENTATION.md`
- `packages/web/server/lib/skills-catalog/DOCUMENTATION.md`
- `packages/web/server/lib/tunnels/DOCUMENTATION.md`
- `packages/web/server/lib/scheduled-tasks/DOCUMENTATION.md`
- `packages/web/server/lib/event-stream/DOCUMENTATION.md`
- `packages/web/server/lib/text/DOCUMENTATION.md`
- `packages/web/server/lib/fs/DOCUMENTATION.md`
- `packages/web/server/lib/ui-auth/DOCUMENTATION.md`
- `packages/ui/src/sync/DOCUMENTATION.md`
- `packages/ui/src/stores/DOCUMENTATION.md`
- `packages/ui/src/components/session/sidebar/DOCUMENTATION.md`
- `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md`
- `packages/vscode/src/DOCUMENTATION.md`

## Inherited build / dev commands

All scripts are in `package.json`.

- Validate: `bun run type-check`, `bun run lint`
- Build all: `bun run build`
- Desktop build (Electron - primary): `bun run electron:build`
- Desktop dev (Electron): `bun run electron:dev`
- Desktop build (Tauri - legacy): `bun run desktop:build`
- VS Code build: `bun run vscode:build`
- Release smoke build: `bun run release:test` (shell script: `scripts/test-release-build.sh`)
- Inherited docs validate: `bun run docs:validate` (Starlight content under `packages/docs/`)

## Inherited runtime entry points

- Web bootstrap: `packages/web/src/main.tsx`
- Web server: `packages/web/server/index.js`
- Web CLI: `packages/web/bin/cli.js` (package bin: `packages/web/package.json`)
- Desktop (Electron - primary): `packages/electron/main.mjs`
- Desktop (Tauri - legacy): `packages/desktop/src-tauri/src/main.rs`
- VS Code extension host: `packages/vscode/src/extension.ts`
- VS Code webview bootstrap: `packages/vscode/webview/main.tsx`
- Karen CLI: `packages/karen/bin/karen.js` (Karen scope)

## Inherited OpenCode integration

- UI client wrapper: `packages/ui/src/lib/opencode/client.ts` (imports `@opencode-ai/sdk/v2`)
- SSE hookup: `packages/ui/src/hooks/useEventStream.ts`
- Web server embeds/starts OpenCode server: `packages/web/server/index.js` (`createOpencodeServer`)
- External server support: Set `OPENCODE_HOST` (full base URL) or `OPENCODE_PORT`, plus `OPENCODE_SKIP_START=true`, to connect to existing OpenCode instance.

## Inherited UI patterns

- Settings shell: `packages/ui/src/components/views/SettingsView.tsx`
- Settings shared primitives: `packages/ui/src/components/sections/shared/`
- Settings sections: `packages/ui/src/components/sections/`
- Chat UI: `packages/ui/src/components/chat/`
- Theme + typography: `packages/ui/src/lib/theme/`, `packages/ui/src/lib/typography.ts`
- Terminal UI: `packages/ui/src/components/terminal/` (uses `ghostty-web`)

## Inherited external integrations

- Git: `packages/ui/src/lib/gitApi.ts`, `packages/web/server/index.js` (`simple-git`)
- Terminal PTY: `packages/web/server/index.js` (`bun-pty`/`node-pty`)
- Skills catalog: `packages/web/server/lib/skills-catalog/`, UI: `packages/ui/src/components/sections/skills/`

## Inherited code of conduct

- Prefer the smallest correct change.
- Preserve working behavior before improving structure.
- Do not add cleverness where a direct implementation is enough.
- Do not infer critical state from weak signals when a stronger source exists.
- Do not encode policy only in UI; enforce it in core logic.
- Do not hide data loss, partial failure, or fallback behavior. Make it explicit in code.
- Finish work end-to-end: implementation, verification, and cleanup.

## Inherited development rules

- Keep diffs tight; avoid drive-by refactors.
- Follow local precedent; inspect nearby code before introducing new patterns.
- Backend changes: keep web, desktop, and VS Code behavior consistent when they share contracts.
- TypeScript: avoid `any`, blind casts, and shape guessing.
- React: prefer function components + hooks; use classes only when required.
- Control flow: prefer early returns and explicit branching over nested ternaries.
- Styling: Tailwind v4, typography via `packages/ui/src/lib/typography.ts`, theme vars via `packages/ui/src/lib/theme/`.
- Shared UI patterns: reuse shared primitives before introducing feature-local markup patterns.
- Toasts: use the wrapper from `@/components/ui`; do not import `sonner` directly in feature code.
- No new deps unless asked.
- Never add secrets or log sensitive data.

## Inherited architecture patterns

### Thin entrypoints, focused modules

- Keep orchestration entrypoints thin: `index.js`, bridge files, bootstrap files, provider roots.
- Move route, domain, and runtime logic into focused modules with clear ownership.
- Prefer dependency injection over hidden module coupling.
- Add or update module documentation when ownership changes.

### Strong source of truth

- Prefer deterministic state over heuristics.
- Use live server/session state for live activity. Do not let historical anomalies masquerade as current execution.
- If a fallback is necessary, scope it narrowly to the active entity and treat it as temporary.
- Restore derived UI state from authoritative records.

### Live state vs historical state

- Derive live UI behavior from live state channels, not persisted history.
- Use historical records to restore context, not to infer that work is still in progress.
- If live state is delayed, use the narrowest possible transient fallback and clear it as soon as authoritative state arrives.

### Cross-runtime parity

- If web defines a route or payload contract that shared UI depends on, keep VS Code and desktop parity where applicable.
- Shared behavior differences must be intentional and visible in code.
- Do not ship a web-only assumption into shared UI.

### Partial-failure-safe flows

- Cross-directory and multi-entity operations must tolerate partial failure.
- Prefer per-item results, rollback paths, or resumable cleanup over all-or-nothing assumptions.
- Never leave optimistic state or local caches stranded after failure.

## Inherited CLI Parity and Safety Policy (MANDATORY for terminal CLI work)

### Principle: policy-first, UX-second

All safety and correctness rules MUST be enforced in core command logic, independent of output mode. Interactive/pretty UX (`@clack/prompts`) is a presentation layer only. It must never be the only place where validation or restriction is enforced.

### Required parity across modes

The same functional outcome and safety gates MUST hold for all execution modes:

- Interactive TTY (full Clack UX)
- Non-interactive shells (piped/stdin-less automation)
- `--quiet`
- `--json`
- Fully pre-specified flags (no prompts)

In all modes, invalid operations MUST fail with non-zero exit code and deterministic error semantics.

### Non-negotiable rule

Do not rely on prompts to enforce policy.

- Prompts MAY help users choose valid inputs.
- Core validators MUST run even when prompts are unavailable or skipped.
- `--quiet` suppresses non-essential output only; it does not weaken validation.
- `--json` changes output shape only; it does not weaken validation.

Detailed Clack UX patterns (primitives, prompt gating, and implementation checklist) are defined in the `clack-cli-patterns` skill and should not be duplicated here.

## Inherited Clack CLI Skill (MANDATORY for terminal CLI work)

When working on terminal CLI commands, prompts, or output formatting, agents MUST study the Clack CLI skill first.

Before starting terminal CLI work:

```
skill({ name: "clack-cli-patterns" })
```

Scope: terminal CLI only (for example `packages/web/bin/*`, `packages/karen/bin/*`). Do not apply this requirement to VS Code or web UI work.

## Inherited Theme System (MANDATORY for UI work)

When working on any UI components, styling, or visual changes, agents MUST study the theme system skill first.

Before starting any UI work:

```
skill({ name: "theme-system" })
```

This skill contains all color tokens, semantic logic, decision tree, and usage patterns. All UI colors must use theme tokens - never hardcoded values or Tailwind color classes.

For Karen-specific color intent (acidic green, hot red, amber, electric cyan), reconcile with [docs/karen/03-design.md](docs/karen/03-design.md).

## Inherited performance rules (MANDATORY)

These rules exist because violating them has caused measurable regressions (render cascades, memory bloat, UI jank). They apply to all UI and sync layer work, including Karen's PromptCourt UI.

### Shared-store render discipline

- Treat common stores as render fanout boundaries. An unnecessary reference change in shared state can re-render large parts of the app.
- Do not put high-frequency state in broadly consumed stores. Fast-changing state should live in narrow stores with narrow subscribers.
- Update only the fields that changed. Preserve references for untouched state branches.
- Prefer leaf selectors over container selectors.
- Isolate hot consumers.
- Do not subscribe shell/layout components to broad live collections.
- Treat provider roots as global hot paths.

### Zustand referential equality

Zustand skips re-renders when a selector returns the same reference (`Object.is`). Every new object/array reference triggers a re-render in every subscriber.

- Never spread all state fields in an update. Only create new references for fields that actually changed.
- Select leaf values, not containers.
- Preserve references when merging.
- For derived collections, preserve item identity when presentation-relevant fields are unchanged.

### Store splitting

A single store with N properties means every subscriber re-evaluates on every state change. Split stores by change frequency and subscriber set.

- Group state by how often it changes.
- Group state by who reads it.
- Cross-store reads use `.getState()`.
- Never add unrelated state to an existing store just because it is convenient. Create a new store.

### Event pipeline and SSE

- Gate expensive operations on the hot path.
- Skip no-op updates.
- Coalesce by key.
- Preserve event ordering semantics.
- Do not widen live-activity fallbacks.

### Polling payload fidelity

- Do not let lightweight polling erase rich fields.
- Use two-phase polling.

### Optimistic updates

- Use the shadow Map pattern.
- Pass client-generated IDs to the server.
- Rollback on error.
- Stabilize bridge callbacks.

### Session/input consistency

- Capture send config at queue time.
- Keep server-selected attachments sendable.
- Do not let text input state repaint unrelated chrome.
- Extract slow-changing chrome from hot input paths.

### Bootstrap resilience

- Treat startup 502/503 as transient. Retry with bounded retries/intervals.
- Use polling recovery when failures are swallowed.

### Scroll and DOM

- Never use `await waitForFrames()` for scroll preservation. Use `useLayoutEffect`.
- Capture scroll state before the state change, restore in layout effect.
- Do not let viewport resizes masquerade as content growth.
- Disable or narrow native/browser scroll anchoring when custom scroll logic exists.
- Autosize textareas without transient collapse on growth.

### List ordering and view consistency

- Do not sort structural lists directly from high-churn live fields.
- If live recency is required, freeze order during high-frequency updates and apply a one-shot reorder only at an intentional lifecycle edge.
- Use one ordering source for all views of the same data.
- Do not mix global snapshots and local live snapshots without an explicit reconciliation policy.

### Component isolation

- Extract high-frequency hook consumers into separate components.
- Use custom `React.memo` comparators for message rows.

### Caching and memory

- Cap in-memory caches with both count and byte limits.
- Set store session limits to match loaded data.
- Invalidate caches on mutations.
- Use TTLs to prevent redundant fetches.

### Directory context

- Never cache directory strings in closures. Read dynamically from `opencodeClient.getDirectory()` at call time.
- Pass directory hints when the source of truth is not available yet.

## Inherited regression-prevention checklist

- When adding fallback logic, ask: can stale persisted data keep this path active forever?
- When deriving UI state, ask: is this live state, historical state, or inferred state?
- When adding store fields, ask: who reads this, how often does it change, and should it live elsewhere?
- When touching polling or bootstrap, ask: can a lighter payload erase richer existing data?
- When handling optimistic updates, ask: where is rollback, reconciliation, and duplicate prevention?
- When changing shared routes or state contracts, ask: what breaks in web, desktop, and VS Code?
- When fixing a bug with a heuristic, prefer narrowing the heuristic over widening it.

## Inherited validation expectations

- Run `bun run type-check` and `bun run lint` before finalizing.
- For hot-path changes, verify behavior under streaming or repeated events, not just static render.
- For sync or startup changes, verify fresh load, retry/failure, and restart behavior.
- For session changes, verify create, stream, abort, permission, archive/delete, and revisit flows when relevant.

## Recent changes

- Releases + high-level changes: `CHANGELOG.md`
- Recent commits: `git log --oneline`
