import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createKarenGitCommitGuardRuntime } from './git-commit-guard.js';

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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Karen git commit guard', () => {
  it('blocks direct git commit and allows read-only git commands', () => {
    if (process.platform === 'win32') return;

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
        pid: 'test',
        env: {},
      },
    });
    const guarded = runtime.buildGuardedEnv(binDir);

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

  it('allows git commit only when explicitly bypassed by Karen-controlled env', () => {
    if (process.platform === 'win32') return;

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
        pid: 'test',
        env: {},
      },
    });
    const guarded = runtime.buildGuardedEnv(binDir);

    const commit = spawnSync('git', ['-C', '/tmp/example', 'commit', '-m', 'test'], {
      env: { ...process.env, ...guarded.env, PATH: guarded.PATH, KAREN_ALLOW_DIRECT_GIT_COMMIT: '1' },
      encoding: 'utf8',
    });
    expect(commit.status).toBe(0);
    expect(fs.readFileSync(callsFile, 'utf8')).toContain('-C /tmp/example commit -m test');
  });
});
