# Karen

Karen is the terminal judgment layer for OpenCode. It blocks weak prompts before they run, executes approved prompts in an isolated worktree, quizzes you on generated diffs, and only promotes the patch when you pass.

## Local Install

From the repo root:

```sh
bun install
bun run install:karen
karen
```

The installer writes a small `karen` launcher to `~/.local/bin` by default. Override the directory when needed:

```sh
bun run install:karen -- --dir ~/.local/bin
KAREN_INSTALL_DIR=/usr/local/bin bun run install:karen
```

If your shell cannot find `karen`, add the install directory to `PATH`:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

## Installer Commands

```sh
bun run status:karen       # show installed path, PATH status, Node, and OpenCode
bun run doctor:karen       # run install/runtime checks
bun run uninstall:karen    # remove the installed karen command
```

The installer refuses to overwrite or remove an unrelated `karen` command unless you explicitly pass `--force` to install.

## Run Without Installing

```sh
bun run karen
```

Inside Karen:

```text
/setup      connect OpenCode providers and choose a default model
/commands   list OpenCode commands Karen can proxy
/gui        start/open the Karen web GUI
/exit       leave Karen
```
