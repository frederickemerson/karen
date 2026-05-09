---
archetype: operations
status: active
---

# Local Docker + ngrok (hackathon / demos)

Run the full OpenChamber web stack in Docker on your laptop, then expose it with a public HTTPS URL via [ngrok](https://ngrok.com/).

## Agent TL;DR

- Build the image with `bun run docker:up` or `bun run docker:up:ngrok` (loads `.env.local`, starts containers).
- Default Docker build sets `VITE_KAREN_PUBLIC_ONLY=1` — only Karen landing + PromptCourt routes are exposed; the OpenChamber editor is hidden.
- `VITE_*` env vars must be passed as Docker build args (`.env*` files are not in the build context).
- ngrok expose: either `ngrok http 3000` on the host or `bun run docker:up:ngrok` (compose sidecar, prints URL).
- OpenCode still runs inside the container by default; set `OPENCODE_SKIP_START=true` + `OPENCODE_HOST` to point at a host instance instead.

## Prerequisites

- Docker + Docker Compose v2
- Bun (for `bun run` scripts)
- Optional: [ngrok account](https://dashboard.ngrok.com/) and authtoken for public URL via compose sidecar

## Environment

All variables below go in `.env.local` at the repo root. `scripts/docker-ngrok.sh` sources this file before running compose, so compose picks them up for build args and runtime env.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_CONVEX_URL` | No | Bakes Convex client URL into the static bundle at image build |
| `VITE_CLERK_PUBLISHABLE_KEY` | No | Bakes Clerk publishable key into the bundle (enables Clerk sign-in) |
| `VITE_CONVEX_HTTP_ACTIONS_URL` | No | Bakes Convex HTTP actions URL into the bundle |
| `VITE_KAREN_PUBLIC_ONLY` | No | `1` (default in compose) — hides editor, exposes only Karen routes; `0` for full app |
| `NGROK_AUTHTOKEN` | Yes (sidecar) | ngrok auth token for the compose sidecar profile |
| `UI_PASSWORD` | No | Single password protecting the browser UI (recommended for public demos) |
| `OPENCODE_SKIP_START` | No | `true` to skip starting OpenCode inside the container |
| `OPENCODE_HOST` | No | Base URL of an external OpenCode instance (used with `OPENCODE_SKIP_START`) |

## Steps

### 1. Create data directories

```sh
mkdir -p data/openchamber data/opencode/share data/opencode/state data/opencode/config data/ssh workspaces
```

### 2. Local site only (no public URL)

```sh
bun run docker:up
```

Opens `http://127.0.0.1:3000`. Health: `http://127.0.0.1:3000/health`.

### 3. Expose publicly with ngrok

**Option A — host CLI (simplest, no sidecar):**

With the stack running:

```sh
ngrok http 3000
```

Use the printed `https://*.ngrok-free.app` URL. WebSockets and SSE work through ngrok.

**Option B — compose sidecar (URL printed automatically):**

Add `NGROK_AUTHTOKEN=your_token` to `.env.local`, then:

```sh
bun run docker:up:ngrok
```

`scripts/docker-ngrok.sh` loads `.env.local`, runs `docker compose --profile ngrok up --build -d`, then polls `localhost:4040/api/tunnels` and prints the live URL. The tunnel inspector is at `http://localhost:4040`.

### 4. Bake Karen cloud URLs into the UI (optional)

`.env*` files are **not** in the Docker build context (see `.dockerignore`). To embed `VITE_*` values in the static bundle, add them to `.env.local` and rebuild:

```sh
# .env.local (excerpt)
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_CONVEX_HTTP_ACTIONS_URL=https://<deployment>.convex.site

bun run docker:up:ngrok   # or docker:up
```

See [`cloud.md`](cloud.md) for full Convex + Clerk setup.

### 5. Public-only mode (default in Docker)

The compose file builds with `VITE_KAREN_PUBLIC_ONLY=1`. In this mode the SPA only renders:

- `/karen/landing` — marketing / landing page
- `/karen`, `/promptcourt`, `/feed` — PromptCourt scoreboard with Clerk sign-in
- `/u/<username>` — public user profile

Any other path falls back to the landing page. The OpenChamber editor is not reachable. To run the full editor in Docker, set `VITE_KAREN_PUBLIC_ONLY=0` in `.env.local` before building.

### 6. Security (public demos)

- Uncomment and set `UI_PASSWORD` in `docker-compose.yml` under `openchamber.environment` to gate the site with a single password.
- Treat the ngrok URL as public — do not demo real secrets or production API keys.
- Rotate any token leaked in screen shares or recordings.

## Verify

```sh
# Server health
curl http://localhost:3000/health

# All three SPA routes return 200 (index.html)
curl -sI http://localhost:3000/karen/landing | head -1
curl -sI http://localhost:3000/karen         | head -1
curl -sI http://localhost:3000/              | head -1

# ngrok tunnel inspector
open http://localhost:4040
```

Expected: `HTTP/1.1 200 OK` on all, health JSON includes `"status":"ok"` and `"opencodeReady":true`.

## Rollback

- **Stop the stack:** `docker compose --profile ngrok down` (or `docker compose down` if not using sidecar).
- **Remove built image:** `docker image rm karen-openchamber` then rebuild with `bun run docker:up`.
- **Disable public-only mode:** Set `VITE_KAREN_PUBLIC_ONLY=0` in `.env.local` and rebuild.
- **Disable ngrok:** Stop the sidecar with `docker compose stop ngrok`, or simply stop using `--profile ngrok`.

## Failure modes

- **`bun install --frozen-lockfile` fails during build:** Local `bun` version differs from the Docker image's `bun`. The Dockerfile uses `--frozen-lockfile` removed — `bun install --ignore-scripts` regenerates the lockfile inside the image. If it still fails, delete `bun.lock` locally, run `bun install`, commit the updated lockfile, and rebuild.
- **ngrok container exits immediately:** `NGROK_AUTHTOKEN` is missing or invalid. Add it to `.env.local` and re-run `bun run docker:up:ngrok`.
- **`ngrok-url.sh` times out (30 s):** The ngrok container may have not started yet or the authtoken was rejected. Check `docker compose logs ngrok` for error details.
- **Blank PromptCourt cloud UI:** Rebuild with the correct `VITE_CONVEX_*` / `VITE_CLERK_*` build args (Step 4). Without them the bundle has no Convex URL and falls back to local-only mode.
- **OpenCode fails to start in container:** Provide a real OpenCode API key via `OPENCODE_HOST`, or set `OPENCODE_SKIP_START=true` to skip the managed instance entirely.
- **Port 3000 already in use:** Change the host port in `docker-compose.yml` (`"3001:3000"`) and update `ngrok http` or the sidecar target accordingly.
