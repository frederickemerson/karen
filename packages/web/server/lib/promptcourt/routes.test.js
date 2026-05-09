import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createPromptCourtStore } from './storage.js';
import { evaluatePromptCourtRun } from './routes.js';

const tempDirs = [];

const createStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptcourt-routes-'));
  tempDirs.push(dir);
  return createPromptCourtStore({ openchamberDataDir: dir, cloudSync: { enabled: false } });
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('promptcourt route behavior', () => {
  it('blocks GUI runs before launching Karen', () => {
    const store = createStore();
    const verdict = evaluatePromptCourtRun({
      store,
      username: 'Route Tester',
      prompt: 'fix it',
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.status).toBe(422);
    expect(verdict.payload.error).toBe('Karen blocked this prompt');
    expect(verdict.payload.promptcourt.publicPost.type).toBe('bad_prompt');
  });

  it('normalizes users and preserves local overview data', () => {
    const store = createStore();
    evaluatePromptCourtRun({
      store,
      username: 'Route Tester',
      prompt: 'fix it',
    });

    const overview = store.getOverview();
    expect(overview.totals.sessions).toBe(1);
    expect(overview.users.map((profile) => profile.user.username)).toContain('route-tester');
  });
});
