const GIT_WRAPPER_NAME = process.platform === 'win32' ? 'git.cmd' : 'git';

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

const posixWrapper = () => `#!/bin/sh
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

if [ "$is_commit" = "1" ] && [ "\${KAREN_ALLOW_DIRECT_GIT_COMMIT:-}" != "1" ]; then
  echo "Karen blocked direct git commit from an agent shell." >&2
  echo "Use the Git panel's I read my code button or the Karen guarded-run quiz so the commit passes the code-read check." >&2
  exit 19
fi

exec "\${KAREN_REAL_GIT:-git}" "$@"
`;

const windowsWrapper = () => `@echo off
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
if "!IS_COMMIT!"=="1" if not "%KAREN_ALLOW_DIRECT_GIT_COMMIT%"=="1" (
  echo Karen blocked direct git commit from an agent shell. 1>&2
  echo Use the Git panel's I read my code button or the Karen guarded-run quiz so the commit passes the code-read check. 1>&2
  exit /b 19
)
"%KAREN_REAL_GIT%" %*
exit /b %ERRORLEVEL%
`;

export const createKarenGitCommitGuardRuntime = ({ fs, os, path, processLike = process }) => {
  const guardDir = path.join(os.tmpdir(), `karen-git-guard-${processLike.pid || 'process'}`);
  const wrapperPath = path.join(guardDir, GIT_WRAPPER_NAME);

  const ensureWrapper = () => {
    fs.mkdirSync(guardDir, { recursive: true });
    const content = process.platform === 'win32' ? windowsWrapper() : posixWrapper();
    fs.writeFileSync(wrapperPath, content, { encoding: 'utf8', mode: 0o755 });
    if (process.platform !== 'win32') {
      fs.chmodSync(wrapperPath, 0o755);
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
        KAREN_GIT_COMMIT_GUARD: '1',
      },
    };
  };

  return {
    buildGuardedEnv,
  };
};
