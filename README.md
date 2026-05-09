# Karen

**Terminal judgment layer for OpenCode.** Karen blocks weak prompts, runs approved ones in an isolated worktree, quizzes you on the diff, and only promotes the patch when you pass.

> Agent power with public accountability. Mean about sloppy prompts, never careless with secrets.

## What Karen does

1. **Charges sloppy prompts.** Vague intent, missing files, no acceptance criteria? Karen blocks it and tells you exactly what to rewrite.
2. **Runs in a worktree.** Approved prompts execute against an isolated branch, so nothing touches your tree until the verdict is in.
3. **Quizzes the diff.** Before the patch lands, Karen pulls a random hunk and asks you what it does. Wrong answer, no commit.
4. **Keeps a record.** Bad prompts and failed quizzes go to your PromptCourt profile — a public scoreboard for prompt discipline.

The terminal is the product. The web surface is the scoreboard.

## Install

One line. Requires [OpenCode CLI](https://opencode.ai), Node 20+, and `git`. Bun is installed automatically if missing.

```sh
curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh
```

This clones Karen to `~/.karen`, installs dependencies, and writes a `karen` launcher to `~/.local/bin`. Re-run any time to update — it pulls the latest `main` and rewrites the launcher.

Overrides:

```sh
KAREN_HOME=~/code/karen \
  KAREN_INSTALL_DIR=/usr/local/bin \
  curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh
```

If your shell can't find `karen` after install:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

### From source

If you'd rather clone manually:

```sh
git clone https://github.com/frederickemerson/karen.git
cd karen
bun install
bun run install:karen
karen
```

### Installer commands

```sh
bun run status:karen       # installed path, PATH status, Node, OpenCode
bun run doctor:karen       # install/runtime checks
bun run uninstall:karen    # remove the launcher
```

See [`packages/karen/README.md`](packages/karen/README.md) for install directory options and aliases.

## Inside Karen

```text
/setup      connect OpenCode providers, pick a default model
/commands   list OpenCode commands Karen can proxy
/gui        start/open the Karen web GUI (PromptCourt)
/exit       leave Karen
```

The web GUI is the scoreboard layer: bad-prompt graveyard, code-read quiz showcase, badge wall, replay tape, leaderboard. See [`packages/ui/src/components/promptcourt/`](packages/ui/src/components/promptcourt/).

### GUI quiz gate

Open `http://127.0.0.1:3002` after running `/gui`. Normal GUI chat prompts still go to OpenCode after PromptCourt judgment. The Kahoot-style read check appears when there is an actual diff to defend, such as an OpenChamber Git commit flow. Direct `git commit` attempts from managed OpenCode shells are blocked so commits go through Karen's guarded review path instead of bypassing the quiz.

## Cloud (optional)

Karen runs local-first. Cloud mode adds public profiles, leaderboard, and org policy via Convex + Clerk.

Copy `.env.example` to `.env.local` and fill it in:

```sh
KAREN_CLOUD_SYNC=1
CONVEX_DEPLOYMENT=dev:your-deployment
VITE_CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_HTTP_ACTIONS_URL=https://<deployment>.convex.site
KAREN_CLOUD_INGEST_SECRET=...
VITE_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_JWT_ISSUER_DOMAIN=...
```

Full cloud setup: [`docs/karen/operations/cloud.md`](docs/karen/operations/cloud.md).

## Hosting

Karen has three deployable surfaces. They are intentionally separate because each has different runtime needs:

| Surface | What it serves | Where it runs | Why |
| --- | --- | --- | --- |
| **Marketing landing** | `packages/web/landing.html` (signup, scoreboard preview, install instructions) | Vercel (static) | Pure brochure + Clerk widgets + Convex public reads. No server needed. |
| **OpenChamber app** | Express + GUI + `/api/*` + OpenCode bridge | Your laptop, exposed via ngrok (or any Node host) | Needs PTY, long-lived processes, and an OpenCode child server. Cannot run on Vercel. |
| **Cloud DB** | users, sessions, public posts, leaderboard | Convex cloud (already deployed) | Source of truth. Karen CLI ingests over HTTPS. |

### Option A — Vercel landing + standalone ngrok

Use this when you want a polished marketing/signup landing on a real domain plus a separate live demo of the app via ngrok.

1. **Vercel project**
   - Import this repo into Vercel.
   - Set env vars (`Settings → Environment Variables`):
     - `VITE_CLERK_PUBLISHABLE_KEY`
     - `VITE_CONVEX_URL` (e.g. `https://<deployment>.convex.cloud`)
     - `VITE_CONVEX_SITE_URL` (e.g. `https://<deployment>.convex.site`)
     - `VITE_PUBLIC_APP_URL` (initially blank — fill after step 3 below).
   - Vercel will auto-detect `vercel.json` (`bun run build:landing` → `landing-dist` at the repo root). Leave **Root Directory** empty (monorepo root). If the dashboard sets **Output Directory**, either clear it so `vercel.json` wins or set it to `landing-dist`.
2. **Clerk dashboard**
   - Add the Vercel domain (and `*.vercel.app`) to allowed origins.
   - Set redirect URLs so post-sign-in lands on `${VITE_PUBLIC_APP_URL}/karen`.
3. **Operator loop**
   ```sh
   # 1. Boot the OpenChamber app on your laptop (default port 3001).
   bun run start:web
   # 2. In a second terminal, expose it publicly via ngrok.
   bun run tunnel
   # -> prints: Public URL: https://xxxxx.ngrok.app
   # 3. Paste that URL into Vercel env VITE_PUBLIC_APP_URL and redeploy.
   #    (Or set KAREN_NGROK_DOMAIN=foo.ngrok.app once for a stable URL.)
   ```

The Vercel landing page's "Try Karen now" CTA points at `VITE_PUBLIC_APP_URL`; the "Install locally" CTA shows the `bun install && bun run install:karen` instructions on the same page.

### Option B — Docker + ngrok (single-host, hackathon)

Use this when you want one container behind a single tunnel, no Vercel involved.

```sh
mkdir -p data/openchamber data/opencode/share data/opencode/state data/opencode/config data/ssh workspaces
bun run docker:up
# In another terminal (requires ngrok CLI + account):
ngrok http 3000
```

Optional: run ngrok as a Compose sidecar: `bun run docker:up:ngrok` (set `NGROK_AUTHTOKEN` first). Full checklist, Convex build args, and safety notes: [`docs/karen/operations/docker-ngrok.md`](docs/karen/operations/docker-ngrok.md).

### Going production

When you outgrow laptop-as-VPS:
- Move the OpenChamber Express app to a real Node host (Fly.io, Railway, your own VPS).
- Point `VITE_PUBLIC_APP_URL` at the new HTTPS URL and redeploy Vercel.
- Nothing in the landing or Karen CLI needs to change.

## Repo layout

```
packages/karen/        CLI launcher, installer, self-checks
packages/ui/           Web GUI (PromptCourt scoreboard, courtroom views)
packages/web/          Express server + PromptCourt routes
  └─ server/lib/promptcourt/   evaluator, storage, privacy, cloud sync
convex/                Convex schema + functions for cloud mode
scripts/install-karen.mjs      Installer entry point
KAREN.md                       Agent + contributor entry point
docs/karen/02-product.md       Product brief - purpose, users, tone
docs/karen/03-design.md        Visual / interaction design brief
docs/karen/conventions/docs-spec.md   How Karen docs work
```

## Tone

Judgmental, fast, funny, concrete. Mean about sloppy prompts. Never careless with secrets, customer data, or proprietary diffs. Terminal-native, arcade-like, high signal.

Anti-references: generic SaaS dashboard softness, chatbot-with-a-logo, dark-blue dev tool sameness.

## Built on OpenChamber

Karen extends [OpenChamber](https://github.com/btriapitsyn/openchamber) — a rich GUI for OpenCode (chat, diffs, agents, dev servers, terminal, git/GitHub workflows). The OpenChamber surface is still available; Karen layers prompt judgment, code-read quizzes, and the PromptCourt scoreboard on top.

## Contributing

Agents and contributors: read [`KAREN.md`](KAREN.md) first. It is the entry point for any work on Karen surfaces.

Before opening PRs, read [`docs/karen/02-product.md`](docs/karen/02-product.md) and [`docs/karen/03-design.md`](docs/karen/03-design.md). The product brief is the spec; the design brief is the visual contract.

## License

MIT
