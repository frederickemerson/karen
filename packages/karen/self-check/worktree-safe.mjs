#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempDirs = [];

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    input: options.input,
    stdio: options.input ? ['pipe', 'pipe', 'pipe'] : 'pipe',
  });
  if (options.allowFailure) return result;
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join('\n'));
  }
  return result;
};

const tempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const cleanup = () => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const git = (cwd, args, options = {}) => run('git', args, { cwd, ...options });

const getDiff = (cwd) => git(cwd, ['diff', '--binary', '--no-color', 'HEAD']).stdout;

const applyPatch = (cwd, patch) => {
  if (!patch.trim()) return;
  git(cwd, ['apply', '--whitespace=nowarn'], { input: patch });
};

const copyUntracked = (sourceRoot, targetRoot) => {
  const raw = git(sourceRoot, ['ls-files', '--others', '--exclude-standard', '-z']).stdout;
  for (const relativePath of raw.split('\0').filter(Boolean)) {
    const source = path.join(sourceRoot, relativePath);
    const target = path.join(targetRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, force: true });
  }
};

const createIsolatedBaseline = (repoRoot) => {
  const worktreePath = tempDir('karen-self-check-worktree-');
  git(repoRoot, ['worktree', 'add', '--quiet', '--detach', worktreePath, 'HEAD']);

  const baselineDiff = getDiff(repoRoot);
  applyPatch(worktreePath, baselineDiff);
  copyUntracked(repoRoot, worktreePath);
  git(worktreePath, ['add', '-A']);
  git(worktreePath, [
    '-c',
    'user.name=Karen',
    '-c',
    'user.email=karen@local.invalid',
    'commit',
    '--allow-empty',
    '--quiet',
    '-m',
    'Karen isolated baseline',
  ]);

  return worktreePath;
};

const removeWorktree = (repoRoot, worktreePath) => {
  git(repoRoot, ['worktree', 'remove', '--force', worktreePath], { allowFailure: true });
  fs.rmSync(worktreePath, { recursive: true, force: true });
  git(repoRoot, ['worktree', 'prune'], { allowFailure: true });
};

const generatedPatchFrom = (worktreePath) => {
  git(worktreePath, ['add', '-N', '.']);
  return getDiff(worktreePath);
};

const main = () => {
  const repoRoot = tempDir('karen-self-check-repo-');
  git(repoRoot, ['init', '--quiet']);
  git(repoRoot, ['config', 'user.name', 'Karen Self Check']);
  git(repoRoot, ['config', 'user.email', 'karen-self-check@local.invalid']);
  fs.writeFileSync(path.join(repoRoot, 'app.js'), 'export const value = 1;\n');
  git(repoRoot, ['add', 'app.js']);
  git(repoRoot, ['commit', '--quiet', '-m', 'initial']);

  fs.writeFileSync(path.join(repoRoot, 'app.js'), 'export const value = 2;\n');
  fs.writeFileSync(path.join(repoRoot, 'notes.md'), 'local untracked context\n');

  const failedWorktree = createIsolatedBaseline(repoRoot);
  fs.writeFileSync(path.join(failedWorktree, 'app.js'), 'export const value = 3;\n');
  fs.writeFileSync(path.join(failedWorktree, 'generated.txt'), 'agent output\n');
  const failedPatch = generatedPatchFrom(failedWorktree);
  assert(failedPatch.includes('generated.txt'), 'self-check expected generated patch to include untracked file');
  removeWorktree(repoRoot, failedWorktree);

  assert(fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8') === 'export const value = 2;\n', 'failed isolated run changed tracked file in real repo');
  assert(!fs.existsSync(path.join(repoRoot, 'generated.txt')), 'failed isolated run leaked generated file into real repo');
  assert(fs.existsSync(path.join(repoRoot, 'notes.md')), 'baseline untracked context was removed from real repo');

  const passedWorktree = createIsolatedBaseline(repoRoot);
  fs.writeFileSync(path.join(passedWorktree, 'app.js'), 'export const value = 4;\n');
  fs.writeFileSync(path.join(passedWorktree, 'generated.txt'), 'promoted output\n');
  const passedPatch = generatedPatchFrom(passedWorktree);
  applyPatch(repoRoot, passedPatch);
  removeWorktree(repoRoot, passedWorktree);

  assert(fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8') === 'export const value = 4;\n', 'passed isolated run did not promote tracked change');
  assert(fs.readFileSync(path.join(repoRoot, 'generated.txt'), 'utf8') === 'promoted output\n', 'passed isolated run did not promote generated file');
  assert(fs.readFileSync(path.join(repoRoot, 'notes.md'), 'utf8') === 'local untracked context\n', 'promotion damaged pre-existing untracked context');

  console.log('Karen worktree self-check passed');
};

try {
  main();
} finally {
  cleanup();
}
