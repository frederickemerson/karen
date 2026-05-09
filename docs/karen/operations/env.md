---
archetype: operations
status: active
---

# Karen Environment Variables

Single source of truth for every environment variable Karen reads. Cloud-specific vars also appear in [cloud.md](cloud.md); installer-specific vars also appear in [install.md](install.md).

## Agent TL;DR

Karen reads variables in three groups: behavior toggles (`KAREN_*`), cloud config (`KAREN_CLOUD_*`, `CONVEX_*`, `CLERK_*`, `VITE_CONVEX_*`, `VITE_CLERK_*`), and inherited hooks Karen relies on (`OPENCODE_*`, `OPENCHAMBER_PORT`, `XDG_CONFIG_HOME`, `OPENAI_API_KEY`, `ELEVENLABS_*`). Browser-visible values must use the `VITE_` prefix. Vite loads `.env*` from the repo root (see [`packages/web/vite.config.ts`](../../../packages/web/vite.config.ts) `envDir`). Never log values for `KAREN_CLOUD_INGEST_SECRET`, `CONVEX_DEPLOY_KEY`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`, or `ELEVENLABS_API_KEY`.

## Prerequisites

- `.env.local` at the repo root for local development.
- Convex deployment env, Clerk app config, and OpenCode installation when relevant.

## Environment

### Karen behavior toggles

Read by [`packages/karen/bin/karen.js`](../../../packages/karen/bin/karen.js).

| Variable | Default | Role |
|---|---|---|
| `KAREN_USER` | `os.userInfo().username` | Username Karen records under in PromptCourt. |
| `KAREN_INSTALL_DIR` | `~/.local/bin` | Where the launcher is written. See [install.md](install.md). |
| `KAREN_SKIP_SETUP` | `unset` | Set to `1` to skip the setup wizard at startup. |
| `KAREN_AUDIO` | `1` (TTY only) | Master audio switch for terminal cues. |
| `KAREN_AUDIO_FORCE` | `0` | Force audio even when not running in a TTY. |
| `KAREN_BELL` | `1` | Terminal bell cues. |
| `KAREN_MUSIC` | `1` | Quiz beat using terminal bell rhythm. |
| `KAREN_SAY` | `0` | Local OS speech synthesizer (`say`, `spd-say`, PowerShell). |
| `KAREN_SAY_VOICE` | `Samantha` (macOS) | Voice name for the OS speech synthesizer. |
| `KAREN_SYSTEM_AUDIO` | `0` | Optional OS beep (macOS `osascript`, Windows `console.beep`). |
| `KAREN_ELEVENLABS_AUDIO` | `1` if `ELEVENLABS_API_KEY` set | ElevenLabs terminal audio with local cache. |
| `KAREN_ELEVENLABS_DAILY_CAP` | `20000` | Daily ElevenLabs character-cost cap. Falls back to local TTS when exceeded. |
| `KAREN_AUDIO_DAILY_CAP` | `20000` | Alias for `KAREN_ELEVENLABS_DAILY_CAP`. |
| `KAREN_AUDIO_CACHE_DIR` | `$XDG_CONFIG_HOME/openchamber/karen-audio-cache/terminal` | Override for the local audio cache directory. |
| `KAREN_TUI_INTERCEPT` | `1` | Enable PromptCourt interception inside the OpenCode TUI. |
| `KAREN_TUI_HEURISTIC_PROMPTS` | `1` | When TUI context is unknown, allow heuristic-based prompt judgment. |
| `KAREN_OPENCODE_HOOK_MODE` | `auto` | Strategy for [`packages/karen/lib/opencode-hook.js`](../../../packages/karen/lib/opencode-hook.js): `auto` (use upstream hook when present, else PTY), `required` (refuse to fall back to PTY), `disabled` (no interception), or `pty` (PTY only). |
| `KAREN_OPENCODE_HOOK` | unset | Alias accepted by the hook adapter when `KAREN_OPENCODE_HOOK_MODE` is unset. |
| `KAREN_OPENCODE_HOOK_PACKAGE` | unset | Optional override for the upstream-hook package the adapter binds to. |
| `KAREN_QUIZ_AI` | `1` if `OPENAI_API_KEY` set | Use OpenAI to generate read-check questions. |
| `KAREN_QUIZ_MODEL` | `gpt-5.5` | Model used for AI-generated quizzes. |
| `KAREN_QUIZ_REASONING_EFFORT` | `high` | Reasoning effort hint for the quiz model. |
| `KAREN_QUIZ_TIMEOUT_MS` | `25000` | Per-request timeout for the AI quiz call. |
| `KAREN_REPLAY_RENDERER` | `stub` | Set to `remotion` to use the Remotion-backed replay renderer in [`packages/web/server/lib/promptcourt/replay-video.js`](../../../packages/web/server/lib/promptcourt/replay-video.js); otherwise the stub JSON-manifest renderer is used. |

### Karen cloud

Read by Karen's PromptCourt server in [`packages/web/server/lib/promptcourt/cloud.js`](../../../packages/web/server/lib/promptcourt/cloud.js) and by Convex functions in [`convex/`](../../../convex/). Full deployment doc: [cloud.md](cloud.md).

| Variable | Used by | Role |
|---|---|---|
| `KAREN_CLOUD_SYNC` | server | Set to `1` to enable cloud sync. Anything else keeps Karen local-only. |
| `KAREN_CLOUD_INGEST_SECRET` | server + Convex | Shared secret for `/karen/ingest` calls. Must match in both places. |
| `KAREN_CLOUD_DEBUG` | server | Set to `1` while developing to print sync failures inline. |
| `CONVEX_DEPLOYMENT` | tooling | `dev:<deployment-name>` or production slug. |
| `CONVEX_DEPLOY_KEY` | tooling | Required for `bun run convex:deploy`. Treat as secret. |
| `VITE_CONVEX_URL` | UI | `https://<deployment>.convex.cloud` for client subscriptions. |
| `NEXT_PUBLIC_CONVEX_URL` | compatibility | Mirror of `VITE_CONVEX_URL` for a future Next.js landing app. |
| `CONVEX_HTTP_ACTIONS_URL` | server | `https://<deployment>.convex.site` for HTTP actions. |
| `VITE_CONVEX_HTTP_ACTIONS_URL` | UI | Browser-visible mirror of `CONVEX_HTTP_ACTIONS_URL`. |
| `CONVEX_SITE_URL` | server | Alias for `CONVEX_HTTP_ACTIONS_URL`. |
| `VITE_CONVEX_SITE_URL` | UI | Browser-visible mirror. |
| `VITE_CLERK_PUBLISHABLE_KEY` | UI | Clerk publishable key for the browser. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | compatibility | Mirror for a future Next.js landing app. |
| `CLERK_SECRET_KEY` | server | Server-side Clerk secret. Treat as secret. |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex | Set in the Convex deployment env to the Clerk Frontend API URL. |

### Inherited variables Karen relies on

Defined and primarily owned by inherited OpenChamber surfaces. Karen reads them.

| Variable | Default | Role |
|---|---|---|
| `OPENCODE_BINARY` | `opencode` | Path to the OpenCode CLI. Karen probes this first before falling back to PATH and well-known paths. |
| `OPENCODE_PATH` | unset | Fallback OpenCode binary path. |
| `OPENCHAMBER_OPENCODE_PATH` | unset | Inherited fallback. |
| `OPENCHAMBER_OPENCODE_BIN` | unset | Inherited fallback. |
| `OPENCODE_CONFIG` | unset | Override for the OpenCode config file Karen reads to learn provider/model. |
| `OPENCHAMBER_PORT` | `3002` | Port for the local OpenChamber web server. |
| `KAREN_GUI_PATH` | `/` | Path `/gui` prints and opens (OpenChamber editor shell). Use `/karen` if you only want the PromptCourt scoreboard page. |
| `XDG_CONFIG_HOME` | `~/.config` | Base for `openchamber/` settings, audio cache, and PromptCourt local store. |
| `OPENAI_API_KEY` | unset | Powers `KAREN_QUIZ_AI` when set. |
| `ELEVENLABS_API_KEY` | unset | Powers ElevenLabs TTS when set; Karen redacts it from logs. |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | Voice for terminal TTS. |
| `ELEVENLABS_MODEL_ID` | `eleven_flash_v2_5` | Model for terminal TTS. |
| `ELEVENLABS_STABILITY` | `0.62` | TTS stability tuning. |
| `ELEVENLABS_SIMILARITY_BOOST` | `0.78` | TTS similarity boost. |
| `ELEVENLABS_STYLE` | `0.34` | TTS style. |
| `ELEVENLABS_SPEED` | `0.92` | TTS speed. |

## Steps

To set values for local development:

1. Create or edit `.env.local` at the repo root.
2. Add the variables you need from the tables above.
3. Restart any running dev servers, the Karen CLI, or the Convex dev process so the new values are picked up.
4. For browser-visible values, double-check the `VITE_` prefix.

To set values in a Convex deployment:

1. Open the Convex dashboard (`bun run convex:dashboard`).
2. Set `KAREN_CLOUD_INGEST_SECRET` and `CLERK_JWT_ISSUER_DOMAIN` in the deployment environment.
3. Redeploy if necessary (`bun run convex:deploy`).

## Verify

- `bun run karen` starts; if a setup wizard runs, your `OPENCODE_BINARY` resolution is missing or invalid.
- `karen --version` and `karen --help` work without errors.
- `bun run status:karen` reports `Owned by this repo: yes` and `Resolved karen` matches the launcher path.
- For cloud: `https://<deployment>.convex.site/karen/health` returns 200; `bun run test:promptcourt` passes.

## Rollback

Unset variables to revert to defaults. There is no separate state for env vars; they are read on each invocation.

To revert cloud sync to local-only without changing infrastructure: `unset KAREN_CLOUD_SYNC` (or set it to anything other than `1`). Karen falls back to local JSON storage immediately.

## Failure modes

- **Browser cannot read a Convex or Clerk value.** Cause: missing `VITE_` prefix. Fix: add the `VITE_*` mirror.
- **Karen logs a secret.** This is a hard rule violation. Fix: redact in code, rotate the leaked secret, ship a fix with a [decision record](../decisions/) if the leak path is not obvious.
- **Cloud sync silently failing.** Cause: missing `KAREN_CLOUD_DEBUG=1` masks errors during development. Set it while debugging cloud paths.
- **Quiz AI quietly disabled.** Cause: `OPENAI_API_KEY` unset or `KAREN_QUIZ_AI=0`. Karen falls back to the parser-built quiz, which is intentional.
- **Wrong Convex URL split.** Cause: using `.convex.cloud` for HTTP actions or `.convex.site` for client subscriptions. Fix: keep the split per the `Cloud` table above.
