---
archetype: operations
status: active
---

# Karen Installation

How to install, inspect, and remove the `karen` launcher on a developer machine. The installer entry point is [`scripts/install-karen.mjs`](../../../scripts/install-karen.mjs); the launched binary is [`packages/karen/bin/karen.js`](../../../packages/karen/bin/karen.js).

## Agent TL;DR

`bun run install:karen` writes a small shell wrapper to `~/.local/bin/karen` (or `KAREN_INSTALL_DIR`) that execs `node packages/karen/bin/karen.js`. The installer refuses to overwrite an unrelated `karen` command unless `--force` is passed. `bun run status:karen` and `bun run doctor:karen` inspect the installed wrapper, PATH, Node, and OpenCode binary. Uninstall with `bun run uninstall:karen`. Windows uses `karen.cmd`; macOS and Linux use a `sh` wrapper.

## Prerequisites

- Node.js 20+ on PATH.
- Bun (per `package.json` `packageManager`).
- A working OpenCode CLI binary discoverable by `OPENCODE_BINARY`, PATH, or one of the well-known paths probed in `resolveOpencodeBinary` (e.g. `~/.opencode/bin/opencode`, `/opt/homebrew/bin/opencode`).
- Write access to the install directory (defaults to `~/.local/bin`).

## Environment

Installer-relevant variables (full reference: [env.md](env.md)):

| Variable | Default | Role |
|---|---|---|
| `KAREN_INSTALL_DIR` | `~/.local/bin` | Where the `karen` launcher is written. Override with `--dir` or this env var. |
| `OPENCODE_BINARY` | `opencode` | Probed by `doctor` and at runtime to locate OpenCode. |
| `PATH` | system | Doctor warns if `KAREN_INSTALL_DIR` is not on PATH. |
| `XDG_CONFIG_HOME` | `~/.config` | Karen reads/writes settings under `$XDG_CONFIG_HOME/openchamber/`. |

## Steps

From the repo root:

```sh
bun install
bun run install:karen
```

Optional overrides:

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
