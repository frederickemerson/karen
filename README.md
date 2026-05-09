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

Requires [OpenCode CLI](https://opencode.ai), Node 20+, and [Bun](https://bun.sh).

```sh
git clone https://github.com/frederickemerson/karen.git
cd karen
bun install
bun run install:karen
karen
```

The installer writes a `karen` launcher to `~/.local/bin` by default. Override with `--dir` or `KAREN_INSTALL_DIR`.

If your shell can't find `karen`:

```sh
export PATH="$HOME/.local/bin:$PATH"
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

## Docker + public URL (hackathon)

Run the web UI locally in Docker, then tunnel it:

```sh
mkdir -p data/openchamber data/opencode/share data/opencode/state data/opencode/config data/ssh workspaces
bun run docker:up
# In another terminal (requires ngrok CLI + account):
ngrok http 3000
```

Optional: run ngrok as a Compose sidecar: `bun run docker:up:ngrok` (set `NGROK_AUTHTOKEN` first). Full checklist, Convex build args, and safety notes: [`docs/karen/operations/docker-ngrok.md`](docs/karen/operations/docker-ngrok.md).

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
