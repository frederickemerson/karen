---
archetype: operations
status: active
---

# Karen Installation

How to install, inspect, and remove the `karen` launcher on a developer machine. The recommended path is the one-line installer at [`install.sh`](../../../install.sh), which orchestrates a git clone + `bun install` + the lower-level launcher writer at [`scripts/install-karen.mjs`](../../../scripts/install-karen.mjs). The launched binary is [`packages/karen/bin/karen.js`](../../../packages/karen/bin/karen.js).

## Agent TL;DR

End users run `curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh`. That clones Karen to `$KAREN_HOME` (default `~/.karen`), installs Bun if missing, runs `bun install`, and writes a shell wrapper to `$KAREN_INSTALL_DIR/karen` (default `~/.local/bin/karen`) via `scripts/install-karen.mjs`. Re-running the one-liner pulls the latest `main` and rewrites the launcher idempotently. From inside an existing checkout, agents can also run `bun run install:karen` directly. Windows uses `karen.cmd`; macOS and Linux use a `sh` wrapper. Inspection: `bun run status:karen` / `bun run doctor:karen`. Removal: `bun run uninstall:karen`.

## Prerequisites

- Node.js 20+ on PATH (the one-liner refuses to proceed below v20).
- `git` on PATH (the one-liner clones via `--depth 1`).
- Bun: auto-installed by the one-liner via `https://bun.sh/install`. Set `KAREN_SKIP_BUN=1` to require a pre-installed Bun.
- A working OpenCode CLI binary discoverable by `OPENCODE_BINARY`, PATH, or one of the well-known paths probed in `resolveOpencodeBinary` (e.g. `~/.opencode/bin/opencode`, `/opt/homebrew/bin/opencode`).
- Write access to the install directory (defaults to `~/.local/bin`).

## Environment

Installer-relevant variables (full reference: [env.md](env.md)):

| Variable | Default | Role |
|---|---|---|
| `KAREN_REPO_URL` | `https://github.com/frederickemerson/karen.git` | Git remote the one-liner clones from. Override to install from a fork. |
| `KAREN_BRANCH` | `main` | Branch the one-liner tracks. |
| `KAREN_HOME` | `~/.karen` | Where the source checkout lives. Updates happen in-place. |
| `KAREN_INSTALL_DIR` | `~/.local/bin` | Where the `karen` launcher is written. Also accepted by `bun run install:karen -- --dir <path>`. |
| `KAREN_SKIP_BUN` | unset | Set to `1` to refuse the auto-Bun install. |
| `OPENCODE_BINARY` | `opencode` | Probed by `doctor` and at runtime to locate OpenCode. |
| `PATH` | system | Doctor warns if `KAREN_INSTALL_DIR` is not on PATH. |
| `XDG_CONFIG_HOME` | `~/.config` | Karen reads/writes settings under `$XDG_CONFIG_HOME/openchamber/`. |

## Steps

The recommended one-liner:

```sh
curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh
```

With overrides (export inline so the piped subshell sees them):

```sh
KAREN_HOME=~/code/karen \
  KAREN_INSTALL_DIR=/usr/local/bin \
  curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh
```

From inside an existing checkout (no clone, just write the launcher):

```sh
bun install
bun run install:karen
```

Or run the underlying installer directly with options:

```sh
bun run install:karen -- --dir ~/.local/bin
KAREN_INSTALL_DIR=/usr/local/bin bun run install:karen
bun run install:karen -- --force      # replace an unrelated 'karen' command
```

If your shell does not pick up the installed launcher:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

To run Karen without installing the launcher:

```sh
bun run karen
```

## Verify

```sh
bun run status:karen     # installed path, ownership, PATH status, Node, OpenCode
bun run doctor:karen     # installer self-diagnosis with actionable findings
karen --version          # confirm the launcher resolves to this repo
karen --help             # confirm the CLI starts and prints help
```

`status` distinguishes:

- `Installed here: yes (wrapper)` - shell wrapper from this repo.
- `Installed here: yes (symlink)` - legacy symlink, also recognized.
- `Owned by this repo: yes` - safe to overwrite or remove without `--force`.

## Rollback

```sh
bun run uninstall:karen
```

The installer refuses to remove a `karen` command not owned by this repo. If a stale unrelated `karen` exists, remove it manually after confirming it is not required.

To rebuild from source after an upgrade or repo move, just rerun `bun run install:karen`. The wrapper points at the live source path; rerunning rewrites the wrapper to the new path.

## Failure modes

- **Source not found.** Symptom: `Karen source not found: ...`. Cause: repo moved or `packages/karen/bin/karen.js` deleted. Fix: clone or restore the repo and rerun.
- **Refused overwrite.** Symptom: `Refusing to replace existing command`. Cause: a `karen` exists not owned by this repo (e.g., installed by another tool). Fix: remove the stranger or pass `--force`.
- **Not on PATH.** Symptom: `karen: command not found` after a clean install. Cause: `KAREN_INSTALL_DIR` is not on PATH. Fix: prepend it to PATH in your shell profile.
- **OpenCode missing.** Symptom: doctor reports `OpenCode CLI was not found`. Karen still starts, but OpenCode passthrough commands fail. Fix: install OpenCode or set `OPENCODE_BINARY` to a working binary.
- **Node missing.** The shell wrapper hard-requires Node on PATH. Doctor flags this; fix by installing Node 20+.
- **One-liner: KAREN_HOME exists but is not a git repo.** Symptom: `... exists but is not a git repo. Move or remove it and re-run.`. Cause: an earlier non-git directory was created at `$KAREN_HOME`. Fix: remove or rename the directory and re-run the one-liner.
- **One-liner: bun install fails.** Symptom: `bun install failed in $KAREN_HOME`. Cause: network failure, or an incompatible existing `node_modules`/`bun.lock` mismatch. Fix: `rm -rf "$KAREN_HOME/node_modules"` and re-run, or clone fresh by removing `$KAREN_HOME` entirely.
