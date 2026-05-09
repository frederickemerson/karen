import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MONOREPO_ROOT,
  mergeMonorepoRootEnvIntoProcess,
  parseEnvFile,
} from './monorepo-root-env.js';

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

describe('parseEnvFile', () => {
  let dir;
  afterEach(() => {
    rmDir(dir);
    dir = undefined;
  });

  it('parses KEY=value and strips surrounding quotes', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monorepo-env-'));
    const filePath = path.join(dir, 'sample.env');
    fs.writeFileSync(filePath, ['A=1', 'B="quoted"', ''].join('\n'));
    expect(parseEnvFile(filePath)).toEqual({ A: '1', B: 'quoted' });
  });
});

describe('mergeMonorepoRootEnvIntoProcess', () => {
  let dir;
  afterEach(() => {
    rmDir(dir);
    dir = undefined;
  });

  it('layers .env.local over .env and does not overwrite preset keys', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monorepo-env-'));
    fs.writeFileSync(
      path.join(dir, '.env'),
      ['SHARED=from-env', 'ONLY_ENV=1', ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, '.env.local'),
      ['SHARED=from-local', 'ONLY_LOCAL=2', ''].join('\n'),
    );
    const target = { PRESET: 'keep', SHARED: 'preset-wins' };
    mergeMonorepoRootEnvIntoProcess({ repoRoot: dir, into: target });
    expect(target.PRESET).toBe('keep');
    expect(target.SHARED).toBe('preset-wins');
    expect(target.ONLY_ENV).toBe('1');
    expect(target.ONLY_LOCAL).toBe('2');
  });
});

describe('MONOREPO_ROOT', () => {
  it('points at the workspace root (root package.json has workspaces)', () => {
    const pkgPath = path.join(MONOREPO_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.workspaces).toBeDefined();
  });
});
