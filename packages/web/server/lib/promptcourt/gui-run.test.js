import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createGuiRunRuntime } from './gui-run.js';
import { createPromptCourtStore } from './storage.js';

const tempDirs = [];

const createStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptcourt-gui-run-'));
  tempDirs.push(dir);
  return createPromptCourtStore({ openchamberDataDir: dir, cloudSync: { enabled: false } });
};

const approvedPrompt = `
  Implement GUI run parity in packages/web/server/lib/promptcourt/gui-run.js.
  Scope: only touch promptcourt GUI run server modules and the Karen dashboard component.
  Acceptance criteria: when a browser submits a scoped prompt, the endpoint must queue a run, approve the prompt, stream running status, and stop at a quiz-required gate.
  Verification: add tests for blocked and approved GUI jobs, then run lint and type-check.
  Constraints: do not change unrelated OpenCode provider, auth, or terminal behavior.
`;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('promptcourt GUI run runtime', () => {
  it('blocks weak GUI runs before execution', async () => {
    const store = createStore();
    const runtime = createGuiRunRuntime({
      store,
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: 'fix it' });
    const blocked = await runtime.waitForRunStatus(queued.id, 'blocked', 100);

    expect(blocked.status).toBe('blocked');
    expect(blocked.publicPost.type).toBe('bad_prompt');
    expect(blocked.reasons).toContain('No clear files, subsystem, or scope boundary');
    expect(store.getOverview().totals.sessions).toBe(1);
  });

  it('queues approved GUI runs and stops at the quiz gate', async () => {
    const store = createStore();
    const seen = [];
    const runtime = createGuiRunRuntime({
      store,
      runner: ({ run }) => {
        seen.push(run.status);
        return { changedFiles: ['packages/web/server/lib/promptcourt/gui-run.js'] };
      },
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: approvedPrompt });
    const finished = await runtime.waitForRunStatus(queued.id, 'quiz_required', 100);

    expect(finished.status).toBe('quiz_required');
    expect(finished.promptScore).toBeGreaterThanOrEqual(70);
    expect(finished.quiz.title).toBe('Read-before-promote checkpoint');
    expect(seen).toEqual(['running']);
    expect(runtime.getRunEvents(queued.id).map((event) => event.status)).toEqual([
      'queued',
      'judging',
      'running',
      'quiz_required',
    ]);
    expect(store.getRunEvents({ username: 'GUI Tester' }).map((event) => event.status)).toContain('quiz_required');
  });
});
