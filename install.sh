#!/usr/bin/env sh
# Karen one-line installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh
#
# Optional environment overrides:
#   KAREN_REPO_URL     git repo to clone (default: https://github.com/frederickemerson/karen.git)
#   KAREN_BRANCH       branch to track (default: main)
#   KAREN_HOME         where to clone the source (default: $HOME/.karen)
#   KAREN_INSTALL_DIR  where to write the `karen` launcher (default: $HOME/.local/bin)
#   KAREN_SKIP_BUN     set to 1 to skip auto-installing Bun
#   KAREN_SKIP_GUI_BUILD set to 1 to skip pre-building the GUI (build happens on first /gui)
#
# What this does:
#   1. Verifies git and Node 20+ are on PATH.
#   2. Installs Bun via the official installer if missing.
#   3. Clones (or updates) the Karen source at $KAREN_HOME.
#   4. Runs `bun install` and writes the `karen` launcher into $KAREN_INSTALL_DIR.
#   5. Pre-builds the Karen GUI so `/gui` opens fast.
#   6. Prints PATH advice if the install dir is not on PATH.

set -eu

KAREN_REPO_URL="${KAREN_REPO_URL:-https://github.com/frederickemerson/karen.git}"
KAREN_BRANCH="${KAREN_BRANCH:-main}"
KAREN_HOME="${KAREN_HOME:-$HOME/.karen}"
KAREN_INSTALL_DIR="${KAREN_INSTALL_DIR:-$HOME/.local/bin}"

# --- output helpers ---------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  C_RESET="$(tput sgr0)"
  C_BOLD="$(tput bold)"
  C_DIM="$(tput dim 2>/dev/null || printf '')"
  C_GREEN="$(tput setaf 2)"
  C_YELLOW="$(tput setaf 3)"
  C_RED="$(tput setaf 1)"
  C_CYAN="$(tput setaf 6)"
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""
fi

step() { printf '%s>%s %s\n' "$C_CYAN$C_BOLD" "$C_RESET" "$1"; }
ok()   { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1" >&2; }
die()  { printf '%s✗%s %s\n' "$C_RED"   "$C_RESET" "$1" >&2; exit 1; }

# --- prerequisite checks ----------------------------------------------------
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1 — install it and re-run"
}

require_cmd git
require_cmd node

NODE_MAJOR="$(node -e 'process.stdout.write(String(parseInt(process.versions.node.split(".")[0],10)))' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node 20+ required (found $(node --version 2>/dev/null || echo unknown))"
fi
ok "node $(node --version)"

if ! command -v bun >/dev/null 2>&1; then
  if [ "${KAREN_SKIP_BUN:-0}" = "1" ]; then
    die "bun missing and KAREN_SKIP_BUN=1 — install Bun manually from https://bun.sh"
  fi
  step "installing bun (https://bun.sh/install)"
  curl -fsSL https://bun.sh/install | sh >/dev/null
  # bun installer drops a binary at $HOME/.bun/bin/bun and prints PATH advice.
  if [ -x "$HOME/.bun/bin/bun" ]; then
    PATH="$HOME/.bun/bin:$PATH"
    export PATH
  fi
  command -v bun >/dev/null 2>&1 || die "bun install completed but 'bun' is still not on PATH — open a new shell and re-run, or set PATH manually"
fi
ok "bun $(bun --version)"

# --- clone or update --------------------------------------------------------
mkdir -p "$(dirname "$KAREN_HOME")"

if [ -d "$KAREN_HOME/.git" ]; then
  step "updating existing Karen checkout at $KAREN_HOME"
  git -C "$KAREN_HOME" fetch --quiet --depth 1 origin "$KAREN_BRANCH"
  git -C "$KAREN_HOME" reset --hard --quiet "origin/$KAREN_BRANCH"
elif [ -e "$KAREN_HOME" ]; then
  die "$KAREN_HOME exists but is not a git repo. Move or remove it and re-run."
else
  step "cloning Karen into $KAREN_HOME"
  git clone --depth 1 --branch "$KAREN_BRANCH" --quiet "$KAREN_REPO_URL" "$KAREN_HOME"
fi
ok "source ready at $KAREN_HOME ($(git -C "$KAREN_HOME" rev-parse --short HEAD))"

# --- dependencies + launcher ------------------------------------------------
step "installing dependencies (bun install)"
( cd "$KAREN_HOME" && bun install --silent ) || die "bun install failed in $KAREN_HOME"
ok "dependencies installed"

step "writing karen launcher to $KAREN_INSTALL_DIR"
KAREN_INSTALL_DIR="$KAREN_INSTALL_DIR" \
  node "$KAREN_HOME/scripts/install-karen.mjs" install --dir "$KAREN_INSTALL_DIR" \
  || die "launcher install failed"

# --- pre-build the GUI ------------------------------------------------------
# vite build for packages/web takes ~30s and needs ~8GB heap. Doing it now
# means the first /gui inside Karen opens straight away instead of hanging
# for half a minute on a 503 page. Non-fatal on failure — the watcher will
# rebuild on demand.
if [ "${KAREN_SKIP_GUI_BUILD:-0}" = "1" ]; then
  warn "skipping GUI build (KAREN_SKIP_GUI_BUILD=1) — /gui will build on first use"
else
  step "pre-building the Karen GUI (one-time, ~30s)"
  if ( cd "$KAREN_HOME" && bun run --cwd packages/web build ); then
    ok "GUI built"
  else
    warn "GUI build failed — /gui will build on first use"
  fi
fi

# --- PATH advice ------------------------------------------------------------
case ":$PATH:" in
  *":$KAREN_INSTALL_DIR:"*)
    ON_PATH=1
    ;;
  *)
    ON_PATH=0
    ;;
esac

printf '\n'
printf '%sKaren installed.%s\n' "$C_GREEN$C_BOLD" "$C_RESET"
printf '  source:    %s\n' "$KAREN_HOME"
printf '  launcher:  %s/karen\n' "$KAREN_INSTALL_DIR"
printf '\n'

if [ "$ON_PATH" = "1" ]; then
  printf '%sRun:%s karen\n' "$C_BOLD" "$C_RESET"
else
  printf '%s%s is not on your PATH.%s Add it to your shell profile:\n' "$C_YELLOW" "$KAREN_INSTALL_DIR" "$C_RESET"
  printf '  echo %sexport PATH="%s:$PATH"%s >> ~/.zshrc   # or ~/.bashrc\n' '"' "$KAREN_INSTALL_DIR" '"'
  printf 'Then open a new shell and run: %skaren%s\n' "$C_BOLD" "$C_RESET"
fi

printf '\n%sNext:%s `karen --help` to see commands, `karen` to start a session.\n' "$C_DIM" "$C_RESET"
