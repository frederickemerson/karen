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

const approvedDiff = [
  'diff --git a/packages/web/server/lib/promptcourt/gui-run.js b/packages/web/server/lib/promptcourt/gui-run.js',
  'index 1111111..2222222 100644',
  '--- a/packages/web/server/lib/promptcourt/gui-run.js',
  '+++ b/packages/web/server/lib/promptcourt/gui-run.js',
  '@@ -10,6 +10,7 @@ export const createGuiRunRuntime = () => {',
  '   const runs = new Map();',
  '+  const guardedMode = true;',
  '   return {',
  '     createRun() {}',
  '   };',
].join('\n');

const approvedRunner = () => ({
  diff: approvedDiff,
  diffSource: 'runner',
  changedFiles: ['packages/web/server/lib/promptcourt/gui-run.js'],
});

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
      runner: approvedRunner,
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: 'fix it' });
    const blocked = await runtime.waitForRunStatus(queued.id, 'blocked', 100);

    expect(blocked.status).toBe('blocked');
    expect(blocked.publicPost.type).toBe('bad_prompt');
    expect(blocked.reasons).toContain('No clear files, subsystem, or scope boundary');
    expect(store.getOverview().totals.sessions).toBe(1);
  });

  it('queues approved GUI runs, builds a real quiz, and stops at the gate', async () => {
    const store = createStore();
    const seen = [];
    const runtime = createGuiRunRuntime({
      store,
      runner: ({ run }) => {
        seen.push(run.status);
        return approvedRunner();
      },
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: approvedPrompt });
    const finished = await runtime.waitForRunStatus(queued.id, 'quiz_required', 5000);

    expect(finished.status).toBe('quiz_required');
    expect(finished.promptScore).toBeGreaterThanOrEqual(70);
    expect(finished.quiz.title).toBe('Prove you read the diff');
    expect(finished.quiz.questions.length).toBeGreaterThanOrEqual(1);
    for (const question of finished.quiz.questions) {
      expect(question.options).toHaveLength(4);
      expect(question.answer).toBeGreaterThanOrEqual(0);
      expect(question.answer).toBeLessThan(4);
    }
    expect(typeof finished.diff).toBe('string');
    expect(finished.diff.length).toBeGreaterThan(20);
    expect(finished.changedFiles.length).toBeGreaterThan(0);
    expect(seen).toEqual(['running']);
    const runtimeStatuses = runtime.getRunEvents(queued.id).map((event) => event.status);
    expect(runtimeStatuses).toContain('queued');
    expect(runtimeStatuses).toContain('judging');
    expect(runtimeStatuses).toContain('running');
    expect(runtimeStatuses).toContain('building_quiz');
    expect(runtimeStatuses).toContain('quiz_required');
    expect(store.getRunEvents({ username: 'GUI Tester' }).map((event) => event.status)).toContain('quiz_required');
  });

  it('refuses to quiz implementation prompts when no GUI runner is configured', async () => {
    const store = createStore();
    const runtime = createGuiRunRuntime({
      store,
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: approvedPrompt });
    const finished = await runtime.waitForRunStatus(queued.id, 'failed', 1000);

    expect(finished.status).toBe('failed');
    expect(finished.quiz).toBeNull();
    expect(finished.diff).toBeNull();
    expect(finished.error).toContain('No GUI runner is configured');
    const statuses = runtime.getRunEvents(queued.id).map((event) => event.status);
    expect(statuses).toContain('running');
    expect(statuses).toContain('failed');
    expect(statuses).not.toContain('building_quiz');
    expect(statuses).not.toContain('quiz_required');
  });

  it('grades a wrong answer and rolls the run back', async () => {
    const store = createStore();
    const runtime = createGuiRunRuntime({
      store,
      runner: approvedRunner,
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: approvedPrompt });
    const ready = await runtime.waitForRunStatus(queued.id, 'quiz_required', 5000);
    const firstQuestion = ready.quiz.questions[0];
    const wrongIndex = (firstQuestion.answer + 1) % firstQuestion.options.length;

    const result = runtime.submitAnswer(queued.id, {
      questionId: firstQuestion.id,
      answerIndex: wrongIndex,
    });

    expect(result.correct).toBe(false);
    expect(result.answer).toBe(firstQuestion.answer);

    const after = runtime.getRun(queued.id);
    expect(after.status).toBe('rollback');
    expect(after.result.passed).toBe(false);
    expect(store.getRunEvents({ username: 'GUI Tester' }).map((event) => event.status)).toContain('rollback');
  });

  it('skips the quiz for conversational greetings and completes the run cleanly', async () => {
    const store = createStore();
    const runtime = createGuiRunRuntime({
      store,
      runner: approvedRunner,
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: 'hi karen' });
    const finished = await runtime.waitForRunStatus(queued.id, 'completed', 1000);

    expect(finished.status).toBe('completed');
    expect(finished.quiz).toBeNull();
    expect(finished.diff).toBe('');
    expect(finished.changedFiles).toEqual([]);
    expect(finished.result).toMatchObject({ status: 'approved', intent: 'conversational' });
    const statuses = runtime.getRunEvents(queued.id).map((event) => event.status);
    expect(statuses).toContain('running');
    expect(statuses).toContain('completed');
    expect(statuses).not.toContain('building_quiz');
    expect(statuses).not.toContain('quiz_required');
  });

  it('skips the quiz for read-only exploration prompts', async () => {
    const store = createStore();
    const runtime = createGuiRunRuntime({
      store,
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: 'explore the codebase' });
    const finished = await runtime.waitForRunStatus(queued.id, 'completed', 1000);

    expect(finished.status).toBe('completed');
    expect(finished.quiz).toBeNull();
    expect(finished.result).toMatchObject({ status: 'approved', intent: 'exploration' });
  });

  it('grades all-correct answers and finalizes the quiz', async () => {
    const store = createStore();
    const runtime = createGuiRunRuntime({
      store,
      runner: approvedRunner,
      schedule: (fn) => queueMicrotask(fn),
    });

    const queued = runtime.createRun({ username: 'GUI Tester', prompt: approvedPrompt });
    const ready = await runtime.waitForRunStatus(queued.id, 'quiz_required', 5000);

    for (const question of ready.quiz.questions) {
      const result = runtime.submitAnswer(queued.id, {
        questionId: question.id,
        answerIndex: question.answer,
      });
      expect(result.correct).toBe(true);
    }

    const finalized = runtime.completeQuiz(queued.id);
    expect(finalized.status).toBe('quiz_passed');
    expect(finalized.result.passed).toBe(true);
    expect(store.getRunEvents({ username: 'GUI Tester' }).map((event) => event.status)).toContain('quiz_passed');
  });
});
