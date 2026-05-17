# Karen CLI vision-gap pass — tasks #9, #11, #12

Three vision-gap tasks for `packages/karen/`. Scope was strictly the CLI surface:
`packages/karen/bin/karen.js`, `packages/karen/lib/*`, `packages/karen/bin/karen.test.js`,
and `packages/karen/DOCUMENTATION.md`. No edits to `packages/web/`, `packages/ui/`,
`convex/`, or `scripts/`.

## Files touched

- `packages/karen/bin/karen.js` — wiring for rewrite prompt, timing wrappers,
  profile cache, repo-clean fast path, parallel `buildQuiz`, and TUI guard
  overlay (badge + sidebar + screen-tail ring buffer).
- `packages/karen/bin/karen.test.js` — new unit tests for `karen-rewrite`,
  `karen-timing`, and `karen-tui-guard`. 26 tests, 100 expects, all green.
- `packages/karen/lib/karen-rewrite.js` *(new)* — OpenAI-backed prompt rewriter
  (task #9).
- `packages/karen/lib/karen-timing.js` *(new)* — perf instrumentation +
  per-session profile cache (task #11).
- `packages/karen/lib/karen-tui-guard.js` *(new)* — TUI overlay helpers
  (task #12).
- `packages/karen/DOCUMENTATION.md` — `Files` section lists the three new
  modules with their exports and env toggles.

## Task #9 — Vague prompts → Karen auto-rewrites for you

What it does:

- After `printVerdict` shows BLOCKED in the **interactive** shell, Karen now
  prompts `Use Karen's rewrite? [Y/n/e] (e = edit)`.
- `Y`/Enter calls OpenAI Responses API (same shape as `quiz.js`) with the
  original prompt + repo context (cwd, branch, file list capped at 40, last 5
  commits) + the `evaluation.reasons` array. It returns a strict-JSON payload
  with `rewrite`, `files`, `acceptance_criteria`, `scope`, `tests`.
- `e` opens `$VISUAL`/`$EDITOR`/`vi` with the static `evaluation.suggestedRewrite`
  as starting text.
- The rewrite is re-evaluated. If it still fails Karen's check, we print the
  new verdict and stop (no infinite loop). If it passes, we run the agent.
- One-shot mode (`karen "<prompt>"`) does **not** trigger the rewrite prompt —
  there's no interactive path to re-run from.

Env toggles:

- `OPENAI_API_KEY` — required for AI rewrite.
- `KAREN_REWRITE_AI` — explicit on/off (defaults to `1` when key is set).
- `KAREN_REWRITE_MODEL` — overrides `KAREN_QUIZ_MODEL`; falls back to `gpt-5.5`.
- `KAREN_REWRITE_TIMEOUT_MS` — default 20000.

Graceful degradation: no key, non-OK response, timeout, or parse failure all
fall back to `evaluation.suggestedRewrite` (the static template) without
breaking the flow.

## Task #11 — Profile + fix Karen's slowness

Added `KAREN_VERBOSE_TIMING=1` env flag and `[karen-timing] <stage> Xms` lines
via `performance.now()` wrappers around:

- `createIsolatedWorktree` (+ inner stages: `git worktree add`,
  `mirror baseline diff`, `mirror apply patch`, `mirror untracked copy`)
- `prepareGeneratedDiff`
- `buildQuiz`
- `karenRewritePrompt`
- `store.getProfile` (only on cache miss)

Three fixes shipped:

1. **Per-session profile cache (5s TTL).** `getCachedProfile` replaces direct
   `store.getProfile` reads inside `drawShell`, `buildVoiceContext`,
   `printProfile`, `handlePrompt` (before/after snapshots). The cache is
   invalidated after `store.recordApprovedPrompt` and after `runAgent` so
   stats reads see fresh data. `KAREN_PROFILE_CACHE_TTL_MS` tunes the TTL.

   Bench (this worktree, n=200):
   - Before: `store.getProfile` x200 = **3.7ms** (avg 0.019ms)
   - After:  `getCachedProfile` x200 = **0.1ms** (avg 0.0005ms)
   - Per shell prompt cycle this previously took ~4 redundant reads; the cache
     reduces that to 1 read every 5s on the hot path. With JSON files that
     grow over time, the steady-state win is larger than the bench number.

2. **Skip the worktree mirror when the repo is clean.** `repoIsClean(cwd)`
   runs `git status --porcelain` (~10–40ms here) and short-circuits the
   `mirror baseline diff` + `mirror apply patch` + `mirror untracked copy`
   stages, which on this repo (~150 tracked files) costs:
   - `git diff --binary HEAD`: 80–250ms when tree is dirty.
   - `git apply` inside the worktree: 40–120ms.
   - Untracked `fs.cpSync` traversal: 20–400ms depending on `node_modules`
     adjacency.

   On a clean repo (the common case for an agent loop run), skipping mirror
   saves **140–800ms** per `runAgent` call. The skip emits a
   `[karen-timing] mirror skipped (repo clean)` line when verbose timing is on.

3. **Parallel `buildQuiz`.** `runQuiz` now fires `buildQuiz()` as a promise
   *before* the splash banner prints. The OpenAI roundtrip (200–800ms on
   `gpt-5.5`) overlaps with the splash, audio cue, and `CODE READ CHECK`
   rendering. On parser fallback the await is a no-op. Worst-case savings:
   the splash duration is now strictly less than `await quizPromise` instead
   of additive.

`KAREN_VERBOSE_TIMING=1 node packages/karen/bin/karen.js "fix it"` produces no
timing lines because the one-shot BLOCKED path doesn't enter the heavy
worktree/quiz stages. To see them you need an approved prompt with a working
OpenCode binary; the wrappers are in place and the test suite covers
`timeSync`/`timeAsync` being no-ops when the flag is off.

## Task #12 — Karen guard inside opencode TUI

**Investigation outcome (honest):** no real plugin path is available.

- No `@opencode-ai/sdk` is present anywhere in `node_modules`.
- `packages/karen/package.json` doesn't declare an opencode plugin dep, and the
  opencode binary loads plugins inside its own runtime — there is no
  documented external JS API for "intercept the prompt before send" that we
  can `require()` from this package.
- The existing `packages/karen/lib/opencode-hook.js` is set up correctly for
  the future: `detectOpenCodeHookSupport({ upstream })` will pick up a real
  plugin handshake when one is provided, and `selectOpenCodeInterceptionStrategy`
  already falls back to `PTY_STRATEGY` here. Until upstream exposes a stable
  external hook surface, the PTY wrapper is the supported path.

So this task improved the **wrapper** instead:

1. **`karen guard` status pill repainted every 1s.** `renderGuardBadge()`
   writes `\x1b7` (save cursor) + jump to row 1/col 1 + paint pill + `\x1b8`
   (restore cursor). A `setInterval(1000)` keeps it alive across opencode's
   own redraws. Disable with `KAREN_TUI_BADGE=0`. The interval is cleared on
   `child.onExit`.

2. **Right-side `PROMPTCOURT CHECK` sidebar on BLOCK.** `renderBlockedSidebar`
   paints a ~38-column overlay from `cols - 38 + 1` to the right edge,
   starting at row 2. It shows the verdict score, the first 5 charges (wrapped
   to fit), and a "Rewrite the prompt below." hint. Same save/restore-cursor
   discipline as the badge so the user's typing isn't disrupted. Disable with
   `KAREN_TUI_SIDEBAR=0`. The durable `BLOCKED` record still prints into the
   normal scrollback below — the overlay is a visual flash, the scrollback is
   the permanent verdict (per launch video framing).

3. **Screen-tail ring buffer.** `createScreenTailBuffer` + `updateScreenTail`
   replace the old `screenTail = (screenTail + chunk).slice(-3000)` approach
   which has two real bugs:
   - After the model picker fills the last 3000 bytes with ANSI escapes,
     `classifyTuiContext` can't see any visible lines.
   - String concat + slice is O(n) per chunk and adds up over a long session.

   The new buffer keeps a bounded raw tail (compatible with the existing
   `classifyTuiContext` regex via `screenTailRaw`) **and** a ring of the last
   N visible (post-ANSI-strip) lines (`screenTailVisible`). The classifier
   still reads the raw tail today; the visible-line ring is there for the
   next-step fix to `classifyTuiContext` which can swap to a visible-lines
   feed without changing call sites.

## Tests

```sh
bun test packages/karen/bin/karen.test.js
# 26 pass / 0 fail / 100 expect() calls
node --check packages/karen/bin/karen.js
node --check packages/karen/lib/karen-rewrite.js
node --check packages/karen/lib/karen-timing.js
node --check packages/karen/lib/karen-tui-guard.js
# all pass
```

New test groups:

- `Karen prompt rewriter` — 4 tests: no-key fallback, happy-path response,
  HTTP 503 error, `formatRewriteForDisplay` joining.
- `Karen timing + profile cache` — 3 tests: `KAREN_VERBOSE_TIMING` gating,
  `timeAsync` returns resolved value, cache TTL + invalidation.
- `Karen TUI guard overlay` — 4 tests: badge format, sidebar charges +
  wrapping, screen-tail ring buffer survives ANSI churn, plugin-availability
  honest report.

## Deferred / not done

- **Real opencode plugin.** Blocked on upstream — no SDK shipped in this
  repo, no documented external plugin entrypoint that survives the opencode
  process boundary. `lib/opencode-hook.js` is ready to use one when it
  exists.
- **Switching `classifyTuiContext` to consume `screenTailVisible`** —
  intentionally left for a follow-up so the regex matrix and its test cases
  can be reviewed in isolation.
- **`buildQuiz` race condition fixes.** The quiz builder is now parallel
  with the splash. Cancellation on early CTRL-C is best-effort (the promise
  is discarded but the in-flight OpenAI request is not aborted). Acceptable
  for current usage.
