import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createPromptCourtStore } from './storage.js';

const tempDirs = [];

const createTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptcourt-store-'));
  tempDirs.push(dir);
  return dir;
};

const createStore = () => createPromptCourtStore({
  openchamberDataDir: createTempDir(),
  cloudSync: { enabled: false },
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const approvedEvaluation = {
  score: 91,
  verdict: 'approved',
  reasons: [],
};

const blockedEvaluation = {
  score: 22,
  verdict: 'blocked',
  reasons: ['Missing acceptance criteria'],
};

describe('promptcourt storage', () => {
  it('normalizes usernames and records blocked prompts in the public feed', () => {
    const store = createStore();

    const { session, post } = store.recordBlockedPrompt({
      username: '  Karen Court!!! ',
      prompt: 'fix it',
      evaluation: blockedEvaluation,
      publicPost: {
        title: 'Karen blocked a bad prompt',
        promptExcerpt: 'fix it',
        failureReasons: blockedEvaluation.reasons,
      },
    });

    expect(session.username).toBe('karen-court');
    expect(session.status).toBe('blocked_bad_prompt');
    expect(post.type).toBe('bad_prompt');
    expect(store.getFeed()).toMatchObject([
      {
        id: post.id,
        username: 'karen-court',
        title: 'Karen blocked a bad prompt',
      },
    ]);
    expect(store.getRunEvents({ username: 'karen-court' })[0]).toMatchObject({
      status: 'blocked',
      username: 'karen-court',
    });
  });

  it('updates quiz results, rollback counts, rewards, and leaderboard totals', () => {
    const store = createStore();
    const session = store.recordApprovedPrompt({
      username: 'Ada',
      prompt: 'Implement scoped prompt gate with tests.',
      evaluation: approvedEvaluation,
      sessionId: 'oc_123',
    });

    const updated = store.recordQuizResult({
      sessionId: session.id,
      quizPassed: true,
      changedFiles: ['packages/web/server/lib/promptcourt/routes.js'],
    });

    expect(updated.status).toBe('executed_quiz_passed');
    expect(updated.rollbackTriggered).toBe(false);

    const profile = store.getProfile('ada');
    expect(profile.stats.totalSessions).toBe(1);
    expect(profile.stats.promotedRuns).toBe(1);
    expect(profile.stats.quizPassRate).toBe(100);
    expect(profile.stats.generatedFileCount).toBe(1);
    expect(profile.rewards.map((reward) => reward.id)).toEqual(expect.arrayContaining([
      'first-verdict',
      'criteria-enjoyer',
      'can-explain-diff',
    ]));

    const overview = store.getOverview();
    expect(overview.totals.sessions).toBe(1);
    expect(overview.totals.promotedRuns).toBe(1);
    expect(overview.leaderboard[0].user.username).toBe('ada');
    expect(store.getRunEvents({ username: 'ada' }).map((event) => event.status)).toEqual([
      'running',
      'quiz_passed',
    ]);
  });

  it('cleans smoke records from local development state', () => {
    const store = createStore();
    store.recordBlockedPrompt({
      username: 'sync-smoke',
      prompt: 'fix it',
      evaluation: blockedEvaluation,
      publicPost: {
        title: 'Smoke blocked prompt',
        promptExcerpt: 'fix it',
        failureReasons: blockedEvaluation.reasons,
      },
    });

    const result = store.cleanupDevRecords({ mode: 'smoke' });

    expect(result.before.sessions).toBe(1);
    expect(result.after.sessions).toBe(0);
    expect(store.getFeed()).toEqual([]);
    expect(store.getRunEvents()).toEqual([]);
  });

  it('records failed quizzes as rolled back public failures', () => {
    const store = createStore();
    const session = store.recordApprovedPrompt({
      username: 'Grace',
      prompt: 'Implement scoped storage tests.',
      evaluation: approvedEvaluation,
      sessionId: 'oc_456',
    });

    store.recordQuizResult({
      sessionId: 'oc_456',
      quizPassed: false,
      rollbackTriggered: true,
      changedFiles: ['packages/karen/bin/karen.js'],
      publicPost: {
        title: 'Karen threw out generated code',
        failureReasons: ['Failed code-read quiz'],
      },
    });

    const profile = store.getProfile('grace');
    expect(profile.stats.rollbackCount).toBe(1);
    expect(profile.stats.publicFailureCount).toBe(1);
    expect(profile.recentSessions[0]).toMatchObject({
      id: session.id,
      status: 'executed_quiz_failed_rolled_back',
      quizPassed: false,
      rollbackTriggered: true,
    });
    expect(profile.publicPosts[0]).toMatchObject({
      type: 'quiz_failed',
      title: 'Karen threw out generated code',
    });
  });

  it('recovers from corrupt local state with an empty default profile', () => {
    const openchamberDataDir = createTempDir();
    fs.writeFileSync(path.join(openchamberDataDir, 'promptcourt.json'), '{not json');
    const store = createPromptCourtStore({ openchamberDataDir, cloudSync: { enabled: false } });

    const profile = store.getProfile('anyone');

    expect(profile.user.username).toBe('anyone');
    expect(profile.stats.totalSessions).toBe(0);
    expect(profile.stats.disciplineScore).toBe(0);
  });
});
