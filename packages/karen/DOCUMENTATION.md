---
archetype: module
karen-surface: cli
status: active
---

# Karen CLI

The terminal judgment layer for OpenCode. This is the product. Karen runs in a developer's terminal, intercepts prompts, evaluates them through PromptCourt, executes approved ones in an isolated git worktree against OpenCode, quizzes the developer on the resulting diff, and only promotes the patch into the real repo when the read-check passes.

## Agent TL;DR

- Two CLI-local modules: [`bin/karen.js`](bin/karen.js) owns terminal UX, OpenCode passthrough, worktree orchestration, and the quiz flow; [`lib/opencode-hook.js`](lib/opencode-hook.js) owns the upstream-hook vs PTY interception decision.
- Prompt evaluation, storage, privacy redaction, the shared quiz builder, the AST-backed diff analyzer, and GUI diff synthesis all live in [`../web/server/lib/promptcourt/`](../web/server/lib/promptcourt/) and are imported directly. Do not duplicate them here. The CLI shares `quiz.js` and `quiz-analyzer.js` with the GUI runtime so both surfaces produce identical questions.
- Worktree isolation and patch promotion are non-negotiable. The self-check in [`self-check/worktree-safe.mjs`](self-check/worktree-safe.mjs) protects this contract.
- The installer and the `karen` launcher live in [`scripts/install-karen.mjs`](../../scripts/install-karen.mjs). For installer behavior, read [`docs/karen/operations/install.md`](../../docs/karen/operations/install.md).
- Audio is opt-out via `KAREN_AUDIO=0`. ElevenLabs and AI quizzes degrade gracefully when API keys are missing.

## Purpose

Make the agent loop feel like a courtroom: charges, verdict, sentence, appeal, read check. The CLI is the only place a developer actually runs Karen on real code. Everything in the web UI ([`../ui/src/components/promptcourt/`](../ui/src/components/promptcourt/)) is a scoreboard derived from CLI activity.

## Files

- [`bin/karen.js`](bin/karen.js) - main CLI entrypoint. Renders the shell, runs the setup wizard, dispatches `/commands`, intercepts terminal-typed prompts, runs the prompt-evaluate -> worktree -> OpenCode -> quiz -> promote loop, plays audio cues, and orchestrates the quiz flow. Diff parsing, evidence analysis, and quiz building (parser + AI) all come from the shared promptcourt server lib (see Imports below); CLI-local code only owns terminal/UX glue and (when wired) prompt-hook strategy selection from [`lib/opencode-hook.js`](lib/opencode-hook.js).
- [`lib/opencode-hook.js`](lib/opencode-hook.js) - upstream OpenCode prompt-hook adapter. Exports `readOpenCodeHookConfig`, `detectOpenCodeHookSupport`, `selectOpenCodeInterceptionStrategy`, `normalizeOpenCodePromptEvent`, `createOpenCodeHookAdapter`, and `openCodeHookStrategies` (`HOOK_STRATEGY` / `PTY_STRATEGY` / `DISABLED_STRATEGY` / `UNAVAILABLE_STRATEGY`). Honors `KAREN_OPENCODE_HOOK_MODE` (`auto` / `required` / `disabled` / `pty`); when no upstream hook API is detected it falls back to PTY heuristics unless the mode forbids it.
- [`self-check/worktree-safe.mjs`](self-check/worktree-safe.mjs) - end-to-end self-check for the worktree isolation contract. Creates a temp git repo, simulates failed and passed runs, and asserts that failed runs cannot leak files into the real repo and that passed runs promote correctly.
- [`self-check/cli-and-installer.mjs`](self-check/cli-and-installer.mjs) - asserts `karen --help` exposes documented commands, and that the installer can install, report status, and uninstall using a temp directory.

The bundled launcher and assets are not tracked source files (they are generated or static):

- `bin/karen.js` is also referenced by the installer wrapper written by [`scripts/install-karen.mjs`](../../scripts/install-karen.mjs).
- `assets/terminal-banner.txt` is a static text asset.
- `package.json` and `README.md` are package manifests, not module logic.

## Contract

Public CLI surface:

- `karen` - opens the interactive Karen shell.
- `karen "<prompt>"` - judges and runs one prompt, then drops into the shell.
- `karen --help` / `-h` - prints usage and the command list.
- `karen --version` / `-v` - prints the package version from [`package.json`](package.json).

Inside the shell, slash commands include `/help`, `/setup`, `/gui`, `/tui`, `/tui-raw`, `/run`, `/providers`, `/models`, `/auth`, `/mcp`, `/agent`, `/session`, `/stats`, `/audio`, `/feed`, `/profile`, `/diff`, `/opencode ...`, and `/quit`. The full list is enumerated in `printHelp` and `printOpenCodeCommands` in [`bin/karen.js`](bin/karen.js).

Local module imports inside [`bin/karen.js`](bin/karen.js):

- `createOpenCodeHookAdapter` and friends from [`lib/opencode-hook.js`](lib/opencode-hook.js) when wiring upstream prompt hooks.

Imports from sibling Karen surfaces:

- `evaluatePrompt` from `../../web/server/lib/promptcourt/evaluator.js`.
- `redactPublicText` from `../../web/server/lib/promptcourt/privacy.js`.
- `createPromptCourtStore` from `../../web/server/lib/promptcourt/storage.js` (which wires in the cloud sync from `cloud.js`).
- `buildQuiz` from `../../web/server/lib/promptcourt/quiz.js` (shared with the GUI quiz runtime).
- `parseDiff`, `analyzeDiffImpact` from `../../web/server/lib/promptcourt/quiz-analyzer.js`.

External binaries the CLI shells out to: `git`, `node`, `node-pty`, `opencode` (resolved by `resolveOpencodeBinary`), and platform-specific audio tools (`afplay`, `say`, `osascript`, `spd-say`, `powershell`).

## Data flow

```mermaid
graph TD
  Dev["Developer terminal"] --> Shell["drawShell + readline loop"]
  Shell -->|"prompt"| Evaluate["evaluatePrompt"]
  Evaluate -->|"blocked"| RecordBlocked["store.recordBlockedPrompt"]
  Evaluate -->|"approved"| RecordApproved["store.recordApprovedPrompt"]
  RecordApproved --> Worktree["createIsolatedWorktree"]
  Worktree --> OpenCode["proxyOpencode (run --model ...)"]
  OpenCode --> Diff["prepareGeneratedDiff"]
  Diff --> Quiz["runQuiz (parser + optional AI)"]
  Quiz -->|"passed"| Promote["promoteGeneratedDiff -> real repo"]
  Quiz -->|"failed"| Rollback["cleanupWorktree, discard"]
  Promote --> RecordQuiz["store.recordQuizResult (passed)"]
  Rollback --> RecordQuiz["store.recordQuizResult (failed)"]
  RecordBlocked --> Cloud["cloud sync (best-effort)"]
  RecordQuiz --> Cloud
```

The TUI passthrough mode (`/tui`) wraps OpenCode's TUI with a PTY-level interceptor (`proxyOpencodeTuiIntercept`) that watches for Enter, classifies the screen tail (`classifyTuiContext`), and runs the same evaluator before letting Enter through.

## Invariants

- **Worktree isolation.** Approved prompts execute in a temp worktree created by `createIsolatedWorktree`. Failed quizzes never touch the real repo. Tracked changes and untracked files from the real repo are mirrored into the worktree as a baseline so OpenCode sees the same state.
- **Patch promotion is atomic.** `promoteGeneratedDiff` applies the worktree diff to the real repo using `git apply`. If application fails, the patch is discarded and Karen records `executed_quiz_failed_rolled_back` even though the quiz passed.
- **Cloud is non-blocking.** Storage records locally first; cloud sync is fire-and-forget via `createPromptCourtStore`'s injected `cloudSync`. Karen prints sync errors only when `KAREN_CLOUD_DEBUG=1`.
- **Audio is opt-in for some channels.** `KAREN_AUDIO`, `KAREN_BELL`, `KAREN_MUSIC` default on; `KAREN_SAY`, `KAREN_SYSTEM_AUDIO`, `KAREN_ELEVENLABS_AUDIO` default off (last one defaults on only when `ELEVENLABS_API_KEY` is set). ElevenLabs has a daily character cap and falls back to local TTS.
- **Setup wizard runs once.** `runSetupWizard` skips when `OPENCODE_BINARY` resolves and a default model is already chosen. `KAREN_SKIP_SETUP=1` forces skip (used by self-checks and CI).
- **No prompt is judged by heuristic alone.** The evaluator is the single source of truth for verdicts. The CLI never overrides a verdict; it only renders it.
- **Upstream hook beats PTY heuristics.** When [`lib/opencode-hook.js`](lib/opencode-hook.js) detects a real OpenCode prompt-submission hook, the adapter uses it. PTY interception is the compatibility fallback for current OpenCode builds and must stay secondary; `KAREN_OPENCODE_HOOK_MODE=required` makes Karen refuse to fall back.

## Change rules

- Terminal-UX changes go in [`bin/karen.js`](bin/karen.js). Diff- or evidence-related logic goes in `../web/server/lib/promptcourt/quiz-analyzer.js` so the CLI and GUI quizzes stay aligned. Hook-strategy logic goes in [`lib/opencode-hook.js`](lib/opencode-hook.js). Do not duplicate across files or fork analyzer behavior in the CLI.
- New environment toggles must be documented in [`docs/karen/operations/env.md`](../../docs/karen/operations/env.md) in the same change.
- Touching the worktree, patch promotion, or rollback paths requires updating [`self-check/worktree-safe.mjs`](self-check/worktree-safe.mjs) so the new behavior is asserted.
- Changes to slash commands or top-level help must keep [`self-check/cli-and-installer.mjs`](self-check/cli-and-installer.mjs) green (it asserts `/opencode ...` and `/providers` show up in help).
- Quiz logic exports test hooks via the `__karenTest` object at the bottom of [`bin/karen.js`](bin/karen.js). Keep the names of `analyzeDiffImpact`, `buildQuiz`, `classifyTuiContext`, `parseDiff`, `shouldJudgeTuiBuffer`, and `updateTuiBuffer` stable; [`bin/karen.test.js`](bin/karen.test.js) depends on them.
- The exported names from [`lib/opencode-hook.js`](lib/opencode-hook.js) (`createOpenCodeHookAdapter`, `selectOpenCodeInterceptionStrategy`, `normalizeOpenCodePromptEvent`, `openCodeHookStrategies`) are part of the test contract; renaming them requires a parallel update to [`bin/karen.test.js`](bin/karen.test.js).
- Imports from `../../web/server/lib/promptcourt/*` are an intentional cross-surface dependency. Do not invert it (server must not import from `packages/karen/`).

## Tests

- [`bin/karen.test.js`](bin/karen.test.js) - Bun-based unit tests covering the exported `__karenTest` helpers, the `parseDiff` / `analyzeDiffImpact` contract sourced from `../web/server/lib/promptcourt/quiz-analyzer.js`, and the hook-strategy decision matrix from [`lib/opencode-hook.js`](lib/opencode-hook.js). Run via `bun test bin/*.test.js`.
- [`self-check/worktree-safe.mjs`](self-check/worktree-safe.mjs) - end-to-end worktree isolation contract.
- [`self-check/cli-and-installer.mjs`](self-check/cli-and-installer.mjs) - end-to-end CLI help + install/status/uninstall flow.

Run all Karen CLI tests:

```sh
bun run --cwd packages/karen test
# or, from the repo root:
bun run test:karen          # self-check only
bun run test:karen-core     # promptcourt server tests + Karen self-check
bun run test:karen-gui      # Playwright GUI smoke
```
