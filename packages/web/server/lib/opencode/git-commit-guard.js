import crypto from 'node:crypto';

const GIT_WRAPPER_NAME = process.platform === 'win32' ? 'git.cmd' : 'git';
const SHELL_WRAPPER_NAME = process.platform === 'win32' ? 'karen-shell.cmd' : 'karen-shell';

const isExecutable = (fs, filePath) => {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform === 'win32') return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const findRealGit = ({ fs, path, pathValue, guardDir }) => {
  const entries = String(pathValue || '').split(path.delimiter).filter(Boolean);
  const executableNames = process.platform === 'win32' ? ['git.exe', 'git.cmd', 'git.bat'] : ['git'];
  const normalizedGuardDir = guardDir ? path.resolve(guardDir) : null;

  for (const entry of entries) {
    const normalizedEntry = path.resolve(entry);
    if (normalizedGuardDir && normalizedEntry === normalizedGuardDir) continue;
    for (const name of executableNames) {
      const candidate = path.join(entry, name);
      if (isExecutable(fs, candidate)) return candidate;
    }
  }

  return process.platform === 'win32' ? 'git.exe' : '/usr/bin/git';
};

const posixWrapper = (secret) => `#!/bin/sh
is_commit=0
skip_next=0

for arg in "$@"; do
  if [ "$skip_next" = "1" ]; then
    skip_next=0
    continue
  fi

  case "$arg" in
    -C|--git-dir|--work-tree|--namespace|--exec-path|-c)
      skip_next=1
      continue
      ;;
    --git-dir=*|--work-tree=*|--namespace=*|--exec-path=*)
      continue
      ;;
    --)
      continue
      ;;
    -*)
      continue
      ;;
    commit)
      is_commit=1
      break
      ;;
    *)
      break
      ;;
  esac
done

if [ "$is_commit" = "1" ] && [ "\${KAREN_ALLOW_DIRECT_GIT_COMMIT:-}" != "${secret}" ]; then
  echo "Karen blocked direct git commit from an agent shell." >&2
  echo "Use the Git panel's I read my code button or the Karen guarded-run quiz so the commit passes the code-read check." >&2
  exit 19
fi

exec "\${KAREN_REAL_GIT:-git}" "$@"
`;

const posixShellWrapper = () => `#!/bin/sh
export PATH="\${KAREN_GIT_GUARD_PATH:-$PATH}"
real_shell="\${KAREN_REAL_SHELL:-/bin/sh}"

case "$1" in
  -lc)
    shift
    exec "$real_shell" -c "$@"
    ;;
  -ilc)
    shift
    exec "$real_shell" -ic "$@"
    ;;
  -l)
    if [ "$2" = "-c" ]; then
      shift 2
      exec "$real_shell" -c "$@"
    fi
    ;;
esac

exec "$real_shell" "$@"
`;

const windowsWrapper = (secret) => `@echo off
setlocal enabledelayedexpansion
set "IS_COMMIT=0"
set "SKIP_NEXT=0"
for %%A in (%*) do (
  if "!SKIP_NEXT!"=="1" (
    set "SKIP_NEXT=0"
  ) else if "%%~A"=="-C" (
    set "SKIP_NEXT=1"
  ) else if "%%~A"=="-c" (
    set "SKIP_NEXT=1"
  ) else if /I "%%~A"=="commit" (
    set "IS_COMMIT=1"
    goto :checked
  ) else (
    echo %%~A | findstr /b "-" >nul
    if errorlevel 1 goto :checked
  )
)
:checked
if "!IS_COMMIT!"=="1" if not "%KAREN_ALLOW_DIRECT_GIT_COMMIT%"=="${secret}" (
  echo Karen blocked direct git commit from an agent shell. 1>&2
  echo Use the Git panel's I read my code button or the Karen guarded-run quiz so the commit passes the code-read check. 1>&2
  exit /b 19
)
"%KAREN_REAL_GIT%" %*
exit /b %ERRORLEVEL%
`;

const windowsShellWrapper = () => `@echo off
set "PATH=%KAREN_GIT_GUARD_PATH%"
if "%KAREN_REAL_SHELL%"=="" (
  cmd.exe %*
) else (
  "%KAREN_REAL_SHELL%" %*
)
exit /b %ERRORLEVEL%
`;

const resolveRealGitDir = ({ fs, path, worktreePath }) => {
  const dotGit = path.join(worktreePath, '.git');
  let stat;
  try {
    stat = fs.statSync(dotGit);
  } catch {
    return null;
  }
  if (stat.isDirectory()) return { gitDir: dotGit, commonDir: dotGit };
  if (!stat.isFile()) return null;
  const contents = fs.readFileSync(dotGit, 'utf8');
  const match = contents.match(/^gitdir:\s*(.+)\s*$/m);
  if (!match) return null;
  const target = match[1].trim();
  const gitDir = path.isAbsolute(target) ? target : path.resolve(worktreePath, target);
  let commonDir = gitDir;
  try {
    const commondirFile = fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim();
    if (commondirFile) {
      commonDir = path.isAbsolute(commondirFile) ? commondirFile : path.resolve(gitDir, commondirFile);
    }
  } catch {}
  return { gitDir, commonDir };
};

const posixHook = (tokenPath) => `#!/bin/sh
token_file=${JSON.stringify(tokenPath)}
if [ -r "$token_file" ]; then
  expected=$(cat "$token_file")
else
  expected=""
fi
if [ -n "$expected" ] && [ "\${KAREN_COMMIT_ALLOW_TOKEN:-}" = "$expected" ]; then
  exit 0
fi
echo "Karen blocked direct git commit (hook)" >&2
exit 19
`;

const windowsHook = (tokenPath) => `@echo off
setlocal enabledelayedexpansion
set "TOKEN_FILE=${tokenPath.replace(/"/g, '""')}"
set "EXPECTED="
if exist "%TOKEN_FILE%" (
  for /f "usebackq delims=" %%T in ("%TOKEN_FILE%") do set "EXPECTED=%%T"
)
if not "%EXPECTED%"=="" if "%KAREN_COMMIT_ALLOW_TOKEN%"=="%EXPECTED%" exit /b 0
echo Karen blocked direct git commit (hook) 1>&2
exit /b 19
`;

const posixPostCommitHook = (tokenPath, runtimeDir) => `#!/bin/sh
token_file=${JSON.stringify(tokenPath)}
runtime_dir=${JSON.stringify(runtimeDir)}
if [ -r "$token_file" ]; then
  expected=$(cat "$token_file")
else
  expected=""
fi
if [ -n "$expected" ] && [ -n "\${KAREN_COMMIT_ALLOW_TOKEN:-}" ] && [ "\${KAREN_COMMIT_ALLOW_TOKEN}" = "$expected" ]; then
  exit 0
fi
new_sha=$(git rev-parse HEAD 2>/dev/null)
mkdir -p "$runtime_dir"
printf '%s\\n' "$new_sha" > "$runtime_dir/unauthorized-commit-detected"
printf '\\033[1;31mKaren reverted unauthorized commit %s\\033[0m\\n' "$new_sha" >&2
printf '\\033[1;31muse the Karen-guarded review flow\\033[0m\\n' >&2
if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  git reset --hard HEAD~1 >/dev/null 2>&1
else
  git update-ref -d HEAD >/dev/null 2>&1
fi
exit 0
`;

const windowsPostCommitHook = (tokenPath, runtimeDir) => `@echo off
setlocal enabledelayedexpansion
set "TOKEN_FILE=${tokenPath.replace(/"/g, '""')}"
set "RUNTIME_DIR=${runtimeDir.replace(/"/g, '""')}"
set "EXPECTED="
if exist "%TOKEN_FILE%" (
  for /f "usebackq delims=" %%T in ("%TOKEN_FILE%") do set "EXPECTED=%%T"
)
if not "%EXPECTED%"=="" if "%KAREN_COMMIT_ALLOW_TOKEN%"=="%EXPECTED%" exit /b 0
for /f "usebackq delims=" %%S in (\`git rev-parse HEAD 2^>nul\`) do set "NEW_SHA=%%S"
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
echo %NEW_SHA% > "%RUNTIME_DIR%\\unauthorized-commit-detected"
echo Karen reverted unauthorized commit %NEW_SHA% 1>&2
echo use the Karen-guarded review flow 1>&2
git rev-parse --verify HEAD~1 >nul 2>&1
if errorlevel 1 (
  git update-ref -d HEAD >nul 2>&1
) else (
  git reset --hard HEAD~1 >nul 2>&1
)
exit /b 0
`;

export const installWorktreeCommitHooks = ({ worktreePath, runtimeDir, allowSecret, fs: fsImpl = null, path: pathImpl = null } = {}) => {
  const fsLib = fsImpl || (typeof require === 'function' ? require('node:fs') : null);
  const pathLib = pathImpl || (typeof require === 'function' ? require('node:path') : null);
  if (!fsLib || !pathLib) {
    throw new Error('installWorktreeCommitHooks requires fs and path implementations');
  }
  if (!worktreePath) throw new Error('installWorktreeCommitHooks requires worktreePath');
  if (!runtimeDir) throw new Error('installWorktreeCommitHooks requires runtimeDir');

  const resolved = resolveRealGitDir({ fs: fsLib, path: pathLib, worktreePath });
  if (!resolved) {
    throw new Error(`installWorktreeCommitHooks: could not resolve gitdir for ${worktreePath}`);
  }
  const { gitDir, commonDir } = resolved;

  fsLib.mkdirSync(runtimeDir, { recursive: true });
  if (process.platform !== 'win32') {
    try { fsLib.chmodSync(runtimeDir, 0o700); } catch {}
  }
  const hooksDir = pathLib.join(runtimeDir, 'hooks');
  fsLib.mkdirSync(hooksDir, { recursive: true });

  const tokenPath = pathLib.join(runtimeDir, 'commit-token');
  if (allowSecret) {
    fsLib.writeFileSync(tokenPath, allowSecret, { encoding: 'utf8', mode: 0o600 });
    if (process.platform !== 'win32') {
      try { fsLib.chmodSync(tokenPath, 0o600); } catch {}
    }
  }

  const isWindows = process.platform === 'win32';
  const blockingNames = isWindows ? ['pre-commit.cmd', 'commit-msg.cmd'] : ['pre-commit', 'commit-msg'];
  const blockingBody = isWindows ? windowsHook(tokenPath) : posixHook(tokenPath);
  const postCommitName = isWindows ? 'post-commit.cmd' : 'post-commit';
  const postCommitBody = isWindows
    ? windowsPostCommitHook(tokenPath, runtimeDir)
    : posixPostCommitHook(tokenPath, runtimeDir);
  const hookPaths = [];
  const writeHook = (name, body) => {
    const hookPath = pathLib.join(hooksDir, name);
    fsLib.writeFileSync(hookPath, body, { encoding: 'utf8', mode: 0o755 });
    if (!isWindows) {
      try { fsLib.chmodSync(hookPath, 0o755); } catch {}
    }
    hookPaths.push(hookPath);
  };
  for (const name of blockingNames) writeHook(name, blockingBody);
  writeHook(postCommitName, postCommitBody);

  const isLinkedWorktree = gitDir !== commonDir;
  if (isLinkedWorktree) {
    const mainConfigPath = pathLib.join(commonDir, 'config');
    try {
      let mainCfg = fsLib.readFileSync(mainConfigPath, 'utf8');
      if (!/\bworktreeConfig\s*=\s*true/i.test(mainCfg)) {
        if (/\[extensions\]/i.test(mainCfg)) {
          mainCfg = mainCfg.replace(/\[extensions\]/i, '[extensions]\n\tworktreeConfig = true');
        } else {
          mainCfg += '\n[extensions]\n\tworktreeConfig = true\n';
        }
        fsLib.writeFileSync(mainConfigPath, mainCfg, 'utf8');
      }
    } catch {}
    const wtConfigPath = pathLib.join(gitDir, 'config.worktree');
    let existing = '';
    try { existing = fsLib.readFileSync(wtConfigPath, 'utf8'); } catch {}
    if (!existing.includes(hooksDir)) {
      fsLib.writeFileSync(wtConfigPath, `${existing.trim()}\n[core]\n\thooksPath = ${hooksDir}\n`, 'utf8');
    }
  } else {
    const mainConfigPath = pathLib.join(gitDir, 'config');
    let cfg = '';
    try { cfg = fsLib.readFileSync(mainConfigPath, 'utf8'); } catch {}
    if (!cfg.includes(hooksDir)) {
      const next = cfg.replace(/\[core\]/i, `[core]\n\thooksPath = ${hooksDir}`);
      if (next === cfg) {
        fsLib.writeFileSync(mainConfigPath, `${cfg.trim()}\n[core]\n\thooksPath = ${hooksDir}\n`, 'utf8');
      } else {
        fsLib.writeFileSync(mainConfigPath, next, 'utf8');
      }
    }
  }

  return { hooksDir, tokenPath, hookPaths, gitDir, commonDir };
};

export const createCommitTokenFile = ({ runtimeDir, fs: fsImpl = null, path: pathImpl = null } = {}) => {
  const fsLib = fsImpl || (typeof require === 'function' ? require('node:fs') : null);
  const pathLib = pathImpl || (typeof require === 'function' ? require('node:path') : null);
  if (!fsLib || !pathLib) {
    throw new Error('createCommitTokenFile requires fs and path implementations');
  }
  if (!runtimeDir) throw new Error('createCommitTokenFile requires runtimeDir');

  fsLib.mkdirSync(runtimeDir, { recursive: true });
  if (process.platform !== 'win32') {
    try { fsLib.chmodSync(runtimeDir, 0o700); } catch {}
  }
  const token = crypto.randomBytes(16).toString('hex');
  const tokenPath = pathLib.join(runtimeDir, 'commit-token');
  fsLib.writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
  if (process.platform !== 'win32') {
    try { fsLib.chmodSync(tokenPath, 0o600); } catch {}
  }
  const cleanup = () => {
    try { fsLib.rmSync(tokenPath, { force: true }); } catch {}
  };
  return { token, tokenPath, cleanup };
};

export const createKarenGitCommitGuardRuntime = ({ fs, os, path, processLike = process }) => {
  const guardDir = path.join(os.tmpdir(), `karen-git-guard-${processLike.pid || 'process'}`);
  const wrapperPath = path.join(guardDir, GIT_WRAPPER_NAME);
  const shellWrapperPath = path.join(guardDir, SHELL_WRAPPER_NAME);
  const directCommitSecret = crypto.randomBytes(16).toString('hex');
  let commitTokenValue = null;

  const ensureWrapper = () => {
    fs.mkdirSync(guardDir, { recursive: true });
    const gitContent = process.platform === 'win32' ? windowsWrapper(directCommitSecret) : posixWrapper(directCommitSecret);
    const shellContent = process.platform === 'win32' ? windowsShellWrapper() : posixShellWrapper();
    fs.writeFileSync(wrapperPath, gitContent, { encoding: 'utf8', mode: 0o700 });
    fs.writeFileSync(shellWrapperPath, shellContent, { encoding: 'utf8', mode: 0o755 });
    if (process.platform !== 'win32') {
      fs.chmodSync(wrapperPath, 0o700);
      fs.chmodSync(shellWrapperPath, 0o755);
    }
  };

  const buildGuardedEnv = (pathValue) => {
    if (processLike.env?.KAREN_DISABLE_GIT_COMMIT_GUARD === '1') {
      return { PATH: pathValue, env: {} };
    }

    ensureWrapper();
    const realGit = findRealGit({ fs, path, pathValue, guardDir });
    const guardedPath = [guardDir, String(pathValue || '')].filter(Boolean).join(path.delimiter);

    return {
      PATH: guardedPath,
      env: {
        KAREN_REAL_GIT: realGit,
        KAREN_REAL_SHELL: processLike.env?.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'),
        KAREN_GIT_GUARD_PATH: guardedPath,
        KAREN_GIT_COMMIT_GUARD: '1',
        SHELL: shellWrapperPath,
      },
    };
  };

  const installCommitHooks = ({ worktreePath, runtimeDir }) => {
    const { token, tokenPath, cleanup } = createCommitTokenFile({ runtimeDir, fs, path });
    commitTokenValue = token;
    const installed = installWorktreeCommitHooks({
      worktreePath,
      runtimeDir,
      allowSecret: token,
      fs,
      path,
    });
    return { token, tokenPath, cleanup, ...installed };
  };

  const withDirectCommitAllowed = (env = {}) => {
    const next = {
      ...env,
      KAREN_ALLOW_DIRECT_GIT_COMMIT: directCommitSecret,
    };
    if (commitTokenValue) next.KAREN_COMMIT_ALLOW_TOKEN = commitTokenValue;
    return next;
  };

  return {
    buildGuardedEnv,
    withDirectCommitAllowed,
    installCommitHooks,
  };
};
