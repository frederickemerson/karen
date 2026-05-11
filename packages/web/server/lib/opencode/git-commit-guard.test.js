import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createKarenGitCommitGuardRuntime, installWorktreeCommitHooks, createCommitTokenFile } from './git-commit-guard.js';

const tempDirs = [];

const makeExecutable = (filePath, content) => {
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o755 });
  fs.chmodSync(filePath, 0o755);
};

const createTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karen-git-guard-test-'));
  tempDirs.push(dir);
  return dir;
};

const setupRuntime = ({ pid = 'test', shell } = {}) => {
  const binDir = createTempDir();
  const guardTemp = createTempDir();
  const realGit = path.join(binDir, 'git');
  const callsFile = path.join(binDir, 'calls.txt');
  makeExecutable(realGit, `#!/bin/sh
echo "$@" >> "${callsFile}"
exit 0
`);

  const runtime = createKarenGitCommitGuardRuntime({
    fs,
    os: { ...os, tmpdir: () => guardTemp },
    path,
    processLike: {
      pid,
      env: shell ? { SHELL: shell } : {},
    },
  });
  const pathWithSystem = [binDir, '/usr/bin', '/bin', '/usr/local/bin'].join(path.delimiter);
  const guarded = runtime.buildGuardedEnv(pathWithSystem);
  return { runtime, guarded, binDir, callsFile, realGit };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Karen git commit guard', () => {
  it('blocks direct git commit and allows read-only git commands', () => {
    if (process.platform === 'win32') return;

    const { guarded, callsFile } = setupRuntime();

    const status = spawnSync('git', ['status'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH },
      encoding: 'utf8',
    });
    expect(status.status).toBe(0);
    expect(fs.readFileSync(callsFile, 'utf8')).toContain('status');

    const commit = spawnSync('git', ['commit', '-m', 'test'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH },
      encoding: 'utf8',
    });
    expect(commit.status).toBe(19);
    expect(commit.stderr).toContain('Karen blocked direct git commit');
  });

  it('blocks git commit inside the guarded shell wrapper (sh -lc)', () => {
    if (process.platform === 'win32') return;

    const { guarded, callsFile } = setupRuntime({ shell: '/bin/sh' });

    const commit = spawnSync(guarded.env.SHELL, ['-lc', 'git add README.md && git commit -m test'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH },
      encoding: 'utf8',
    });

    expect(commit.status).toBe(19);
    expect(commit.stderr).toContain('Karen blocked direct git commit');
    expect(fs.readFileSync(callsFile, 'utf8')).toContain('add README.md');
  });

  it('blocks git commit invoked through bash -c', () => {
    if (process.platform === 'win32') return;

    const { guarded } = setupRuntime({ shell: '/bin/bash' });

    const commit = spawnSync('bash', ['-c', 'git commit -m test'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH },
      encoding: 'utf8',
    });
    expect(commit.status).toBe(19);
    expect(commit.stderr).toContain('Karen blocked direct git commit');
  });

  it('blocks git commit through nested sh -c subshells', () => {
    if (process.platform === 'win32') return;

    const { guarded } = setupRuntime({ shell: '/bin/sh' });

    const commit = spawnSync(guarded.env.SHELL, ['-lc', "sh -c 'sh -c \"git commit -m test\"'"], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH },
      encoding: 'utf8',
    });
    expect(commit.status).toBe(19);
    expect(commit.stderr).toContain('Karen blocked direct git commit');
  });

  it('does not catch absolute-path git invocations (documented residual gap)', () => {
    if (process.platform === 'win32') return;

    const { guarded, realGit, callsFile } = setupRuntime();

    const commit = spawnSync(realGit, ['commit', '-m', 'bypass'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH },
      encoding: 'utf8',
    });
    expect(commit.status).toBe(0);
    expect(fs.readFileSync(callsFile, 'utf8')).toContain('commit -m bypass');
  });

  it('also bypasses guard when PATH is replaced via env PATH=...', () => {
    if (process.platform === 'win32') return;

    const { guarded, binDir, callsFile } = setupRuntime();

    const commit = spawnSync('env', [`PATH=${binDir}`, 'git', 'commit', '-m', 'bypass'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH },
      encoding: 'utf8',
    });
    expect(commit.status).toBe(0);
    expect(fs.readFileSync(callsFile, 'utf8')).toContain('commit -m bypass');
  });

  it('rejects a truthy KAREN_ALLOW_DIRECT_GIT_COMMIT that is not the secret', () => {
    if (process.platform === 'win32') return;

    const { guarded } = setupRuntime();

    const commit = spawnSync('git', ['commit', '-m', 'test'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH, KAREN_ALLOW_DIRECT_GIT_COMMIT: '1' },
      encoding: 'utf8',
    });
    expect(commit.status).toBe(19);
    expect(commit.stderr).toContain('Karen blocked direct git commit');
  });

  it('allows git commit only when withDirectCommitAllowed is used by Karen', () => {
    if (process.platform === 'win32') return;

    const { runtime, guarded, callsFile } = setupRuntime();
    const trustedEnv = runtime.withDirectCommitAllowed({ ...process.env, ...guarded.env, PATH: guarded.PATH });

    const commit = spawnSync('git', ['-C', '/tmp/example', 'commit', '-m', 'test'], {
      env: trustedEnv,
      encoding: 'utf8',
    });
    expect(commit.status).toBe(0);
    expect(fs.readFileSync(callsFile, 'utf8')).toContain('-C /tmp/example commit -m test');
  });

  it('does not include the bypass secret in buildGuardedEnv output', () => {
    const { guarded } = setupRuntime();
    expect(guarded.env.KAREN_ALLOW_DIRECT_GIT_COMMIT).toBeUndefined();
  });

  it('generates a fresh secret per runtime', () => {
    const a = setupRuntime({ pid: 'a' });
    const b = setupRuntime({ pid: 'b' });
    const tokenA = a.runtime.withDirectCommitAllowed({}).KAREN_ALLOW_DIRECT_GIT_COMMIT;
    const tokenB = b.runtime.withDirectCommitAllowed({}).KAREN_ALLOW_DIRECT_GIT_COMMIT;
    expect(tokenA).toMatch(/^[0-9a-f]{32}$/);
    expect(tokenB).toMatch(/^[0-9a-f]{32}$/);
    expect(tokenA).not.toBe(tokenB);
  });
});

const resolveSystemGit = () => {
  for (const candidate of ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const which = spawnSync('which', ['git'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim();
  return null;
};

const initRepoWithHooks = () => {
  const realGit = resolveSystemGit();
  if (!realGit) return null;
  const repoDir = createTempDir();
  const runtimeDir = path.join(createTempDir(), 'karen-run');
  const init = spawnSync(realGit, ['init', '--quiet', repoDir], { encoding: 'utf8' });
  if (init.status !== 0) return null;
  spawnSync(realGit, ['config', 'user.name', 'Test'], { cwd: repoDir });
  spawnSync(realGit, ['config', 'user.email', 'test@local.invalid'], { cwd: repoDir });
  spawnSync(realGit, ['config', 'commit.gpgsign', 'false'], { cwd: repoDir });
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello\n');
  spawnSync(realGit, ['add', '-A'], { cwd: repoDir });
  const tokenInfo = createCommitTokenFile({ runtimeDir, fs, path });
  installWorktreeCommitHooks({
    worktreePath: repoDir,
    runtimeDir,
    allowSecret: tokenInfo.token,
    fs,
    path,
  });
  return { repoDir, runtimeDir, realGit, token: tokenInfo.token, tokenPath: tokenInfo.tokenPath };
};

describe('Karen commit hook (per-worktree)', () => {
  it('blocks absolute-path git commit with exit 19', () => {
    if (process.platform === 'win32') return;
    const ctx = initRepoWithHooks();
    if (!ctx) return;

    const sanitizedEnv = { ...process.env };
    delete sanitizedEnv.KAREN_COMMIT_ALLOW_TOKEN;

    const commit = spawnSync(ctx.realGit, ['commit', '-m', 'bypass'], {
      cwd: ctx.repoDir,
      encoding: 'utf8',
      env: sanitizedEnv,
    });
    expect(commit.status).not.toBe(0);
    expect(commit.stderr).toContain('Karen blocked direct git commit (hook)');
  });

  it('blocks env -i PATH=/usr/bin git commit', () => {
    if (process.platform === 'win32') return;
    const ctx = initRepoWithHooks();
    if (!ctx) return;

    const usrBin = path.dirname(ctx.realGit);
    const commit = spawnSync('env', ['-i', `PATH=${usrBin}`, 'git', 'commit', '-m', 'bypass'], {
      cwd: ctx.repoDir,
      encoding: 'utf8',
    });
    expect(commit.status).not.toBe(0);
    expect(commit.stderr).toContain('Karen blocked direct git commit (hook)');
  });

  it('allows commit when KAREN_COMMIT_ALLOW_TOKEN matches the nonce', () => {
    if (process.platform === 'win32') return;
    const ctx = initRepoWithHooks();
    if (!ctx) return;

    const commit = spawnSync(ctx.realGit, ['commit', '-m', 'allowed'], {
      cwd: ctx.repoDir,
      encoding: 'utf8',
      env: { ...process.env, KAREN_COMMIT_ALLOW_TOKEN: ctx.token },
    });
    expect(commit.status).toBe(0);
  });

  it('rejects commit when KAREN_COMMIT_ALLOW_TOKEN is wrong or missing', () => {
    if (process.platform === 'win32') return;
    const ctx = initRepoWithHooks();
    if (!ctx) return;

    const wrong = spawnSync(ctx.realGit, ['commit', '-m', 'wrong'], {
      cwd: ctx.repoDir,
      encoding: 'utf8',
      env: { ...process.env, KAREN_COMMIT_ALLOW_TOKEN: 'definitely-not-the-token' },
    });
    expect(wrong.status).not.toBe(0);
    expect(wrong.stderr).toContain('Karen blocked direct git commit (hook)');

    const missingEnv = { ...process.env };
    delete missingEnv.KAREN_COMMIT_ALLOW_TOKEN;
    const missing = spawnSync(ctx.realGit, ['commit', '-m', 'missing'], {
      cwd: ctx.repoDir,
      encoding: 'utf8',
      env: missingEnv,
    });
    expect(missing.status).not.toBe(0);
  });

  it('writes the nonce file with mode 0600 and the parent dir 0700', () => {
    if (process.platform === 'win32') return;
    const runtimeDir = path.join(createTempDir(), 'karen-run');
    const info = createCommitTokenFile({ runtimeDir, fs, path });
    const tokenStat = fs.statSync(info.tokenPath);
    const dirStat = fs.statSync(runtimeDir);
    expect((tokenStat.mode & 0o777)).toBe(0o600);
    expect((dirStat.mode & 0o777)).toBe(0o700);
    info.cleanup();
    expect(fs.existsSync(info.tokenPath)).toBe(false);
  });

  it('post-commit hook reverts a --no-verify bypass attempt', () => {
    if (process.platform === 'win32') return;
    const realGit = resolveSystemGit();
    if (!realGit) return;

    const repoDir = createTempDir();
    const runtimeDir = path.join(createTempDir(), 'karen-run');
    spawnSync(realGit, ['init', '--quiet', repoDir]);
    spawnSync(realGit, ['config', 'user.name', 'Test'], { cwd: repoDir });
    spawnSync(realGit, ['config', 'user.email', 'test@local.invalid'], { cwd: repoDir });
    spawnSync(realGit, ['config', 'commit.gpgsign', 'false'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello\n');
    spawnSync(realGit, ['add', '-A'], { cwd: repoDir });
    spawnSync(realGit, ['commit', '-m', 'baseline'], { cwd: repoDir });
    const baselineSha = spawnSync(realGit, ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).stdout.trim();

    const tokenInfo = createCommitTokenFile({ runtimeDir, fs, path });
    installWorktreeCommitHooks({
      worktreePath: repoDir,
      runtimeDir,
      allowSecret: tokenInfo.token,
      fs,
      path,
    });

    fs.writeFileSync(path.join(repoDir, 'evil.txt'), 'bypass\n');
    spawnSync(realGit, ['add', '-A'], { cwd: repoDir });

    const sanitizedEnv = { ...process.env };
    delete sanitizedEnv.KAREN_COMMIT_ALLOW_TOKEN;

    const commit = spawnSync(realGit, ['commit', '--no-verify', '-m', 'bypass'], {
      cwd: repoDir,
      encoding: 'utf8',
      env: sanitizedEnv,
    });

    expect(commit.stderr).toContain('Karen reverted unauthorized commit');

    const finalSha = spawnSync(realGit, ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).stdout.trim();
    expect(finalSha).toBe(baselineSha);

    const markerPath = path.join(runtimeDir, 'unauthorized-commit-detected');
    expect(fs.existsSync(markerPath)).toBe(true);
    const markerContents = fs.readFileSync(markerPath, 'utf8').trim();
    expect(markerContents).not.toBe(baselineSha);
    expect(markerContents).toMatch(/^[0-9a-f]{40}$/);
  });

  it('post-commit hook lets authorized commits survive even with --no-verify', () => {
    if (process.platform === 'win32') return;
    const realGit = resolveSystemGit();
    if (!realGit) return;

    const repoDir = createTempDir();
    const runtimeDir = path.join(createTempDir(), 'karen-run');
    spawnSync(realGit, ['init', '--quiet', repoDir]);
    spawnSync(realGit, ['config', 'user.name', 'Test'], { cwd: repoDir });
    spawnSync(realGit, ['config', 'user.email', 'test@local.invalid'], { cwd: repoDir });
    spawnSync(realGit, ['config', 'commit.gpgsign', 'false'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello\n');
    spawnSync(realGit, ['add', '-A'], { cwd: repoDir });
    spawnSync(realGit, ['commit', '-m', 'baseline'], { cwd: repoDir });
    const baselineSha = spawnSync(realGit, ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).stdout.trim();

    const tokenInfo = createCommitTokenFile({ runtimeDir, fs, path });
    installWorktreeCommitHooks({
      worktreePath: repoDir,
      runtimeDir,
      allowSecret: tokenInfo.token,
      fs,
      path,
    });

    fs.writeFileSync(path.join(repoDir, 'ok.txt'), 'authorized\n');
    spawnSync(realGit, ['add', '-A'], { cwd: repoDir });

    const commit = spawnSync(realGit, ['commit', '--no-verify', '-m', 'ok'], {
      cwd: repoDir,
      encoding: 'utf8',
      env: { ...process.env, KAREN_COMMIT_ALLOW_TOKEN: tokenInfo.token },
    });
    expect(commit.status).toBe(0);

    const finalSha = spawnSync(realGit, ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).stdout.trim();
    expect(finalSha).not.toBe(baselineSha);

    const markerPath = path.join(runtimeDir, 'unauthorized-commit-detected');
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('post-commit hook reverts an absolute-path --no-verify bypass', () => {
    if (process.platform === 'win32') return;
    const realGit = resolveSystemGit();
    if (!realGit) return;

    const repoDir = createTempDir();
    const runtimeDir = path.join(createTempDir(), 'karen-run');
    spawnSync(realGit, ['init', '--quiet', repoDir]);
    spawnSync(realGit, ['config', 'user.name', 'Test'], { cwd: repoDir });
    spawnSync(realGit, ['config', 'user.email', 'test@local.invalid'], { cwd: repoDir });
    spawnSync(realGit, ['config', 'commit.gpgsign', 'false'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello\n');
    spawnSync(realGit, ['add', '-A'], { cwd: repoDir });
    spawnSync(realGit, ['commit', '-m', 'baseline'], { cwd: repoDir });
    const baselineSha = spawnSync(realGit, ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).stdout.trim();

    const tokenInfo = createCommitTokenFile({ runtimeDir, fs, path });
    installWorktreeCommitHooks({
      worktreePath: repoDir,
      runtimeDir,
      allowSecret: tokenInfo.token,
      fs,
      path,
    });

    fs.writeFileSync(path.join(repoDir, 'evil.txt'), 'bypass\n');
    spawnSync(realGit, ['add', '-A'], { cwd: repoDir });

    const sanitizedEnv = { ...process.env };
    delete sanitizedEnv.KAREN_COMMIT_ALLOW_TOKEN;

    // Use the resolved absolute path (mimicking /usr/bin/git commit --no-verify)
    const commit = spawnSync(realGit, ['commit', '--no-verify', '-m', 'bypass-abs'], {
      cwd: repoDir,
      encoding: 'utf8',
      env: sanitizedEnv,
    });

    expect(commit.stderr).toContain('Karen reverted unauthorized commit');

    const finalSha = spawnSync(realGit, ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).stdout.trim();
    expect(finalSha).toBe(baselineSha);

    const markerPath = path.join(runtimeDir, 'unauthorized-commit-detected');
    expect(fs.existsSync(markerPath)).toBe(true);
  });

  it('resolves linked worktrees via the .git file pointer', () => {
    if (process.platform === 'win32') return;
    const realGit = resolveSystemGit();
    if (!realGit) return;

    const mainRepo = createTempDir();
    spawnSync(realGit, ['init', '--quiet', mainRepo], { encoding: 'utf8' });
    spawnSync(realGit, ['config', 'user.name', 'Test'], { cwd: mainRepo });
    spawnSync(realGit, ['config', 'user.email', 'test@local.invalid'], { cwd: mainRepo });
    spawnSync(realGit, ['config', 'commit.gpgsign', 'false'], { cwd: mainRepo });
    fs.writeFileSync(path.join(mainRepo, 'a.txt'), 'a\n');
    spawnSync(realGit, ['add', '-A'], { cwd: mainRepo });
    spawnSync(realGit, ['commit', '-m', 'initial'], { cwd: mainRepo });

    const linked = path.join(createTempDir(), 'wt');
    const wt = spawnSync(realGit, ['worktree', 'add', '--detach', linked, 'HEAD'], {
      cwd: mainRepo,
      encoding: 'utf8',
    });
    expect(wt.status).toBe(0);

    const runtimeDir = path.join(createTempDir(), 'karen-run');
    const tokenInfo = createCommitTokenFile({ runtimeDir, fs, path });
    const installed = installWorktreeCommitHooks({
      worktreePath: linked,
      runtimeDir,
      allowSecret: tokenInfo.token,
      fs,
      path,
    });
    expect(fs.existsSync(path.join(installed.hooksDir, 'pre-commit'))).toBe(true);
    expect(installed.gitDir).not.toBe(installed.commonDir);

    fs.writeFileSync(path.join(linked, 'b.txt'), 'b\n');
    spawnSync(realGit, ['add', '-A'], { cwd: linked });

    const blocked = spawnSync(realGit, ['commit', '-m', 'try'], {
      cwd: linked,
      encoding: 'utf8',
    });
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain('Karen blocked direct git commit (hook)');

    const allowed = spawnSync(realGit, ['commit', '-m', 'pass'], {
      cwd: linked,
      encoding: 'utf8',
      env: { ...process.env, KAREN_COMMIT_ALLOW_TOKEN: tokenInfo.token },
    });
    expect(allowed.status).toBe(0);
  });
});
