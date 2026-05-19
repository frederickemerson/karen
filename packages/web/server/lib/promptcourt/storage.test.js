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

const createStoreWithPrivacy = (privacyPolicy) => createPromptCourtStore({
  openchamberDataDir: createTempDir(),
  cloudSync: { enabled: false },
  privacyPolicy,
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

  it('earns a granny skip every three clean quiz streaks', () => {
    const store = createStore();
    for (let index = 0; index < 3; index += 1) {
      const session = store.recordApprovedPrompt({
        username: 'Ada',
        prompt: `Implement scoped change ${index} with tests.`,
        evaluation: approvedEvaluation,
        sessionId: `oc_skip_${index}`,
      });
      store.recordQuizResult({
        sessionId: session.id,
        quizPassed: true,
        changedFiles: [`packages/example-${index}.ts`],
      });
    }

    const profile = store.getProfile('ada');
    expect(profile.stats.currentStreak).toBe(3);
    expect(profile.stats.grannySkips).toBe(1);
    expect(profile.rewards.map((reward) => reward.id)).toContain('granny-skip');
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

  it('redacts prompt and public post data at the storage boundary', () => {
    const store = createStore();

    const { session, post } = store.recordBlockedPrompt({
      username: 'Security',
      prompt: 'fix it with OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz in /Users/frederick/app',
      evaluation: blockedEvaluation,
      publicPost: {
        title: 'Blocked sk-abcdefghijklmnopqrstuvwxyz',
        promptExcerpt: 'email test@example.com and use https://user:pass@example.com',
        failureReasons: ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz'],
        suggestedRewrite: 'Remove token=ghp_abcdefghijklmnopqrstuvwxyz',
      },
    });

    expect(session.prompt).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(session.prompt).not.toContain('/Users/frederick');
    expect(post.title).toBe('Blocked [redacted]');
    expect(post.promptExcerpt).toBe('email [redacted:email] and use [redacted:url]');
    expect(post.failureReasons[0]).toBe('Authorization: Bearer [redacted]');
    expect(post.suggestedRewrite).toBe('Remove token=[redacted]');
  });

  it('can suppress public posts by policy while still recording the session', () => {
    const store = createStoreWithPrivacy({
      publicPostingEnabled: false,
      secretScanningEnabled: true,
      redactEmails: true,
      redactUrls: 'all',
    });

    const { session, post } = store.recordBlockedPrompt({
      username: 'Private',
      prompt: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
      evaluation: blockedEvaluation,
      publicPost: {
        title: 'Should not publish',
        promptExcerpt: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
        failureReasons: blockedEvaluation.reasons,
      },
    });

    expect(session.status).toBe('blocked_bad_prompt');
    expect(post).toBeNull();
    expect(store.getFeed()).toEqual([]);
    expect(store.getProfile('private').stats.publicFailureCount).toBe(0);
  });

  it('redacts evaluation reasons when persisting sessions', () => {
    const store = createStore();
    const { session } = store.recordBlockedPrompt({
      username: 'Reason Tester',
      prompt: 'fix it',
      evaluation: {
        score: 10,
        verdict: 'blocked',
        reasons: ['Leaked OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz in prompt'],
      },
      publicPost: {
        title: 'Blocked',
        promptExcerpt: 'fix it',
        failureReasons: ['Leaked OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz in prompt'],
      },
    });

    expect(session.reasons[0]).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(session.reasons[0]).toContain('[redacted]');

    const approved = store.recordApprovedPrompt({
      username: 'Reason Tester',
      prompt: 'Implement scoped change with tests.',
      evaluation: {
        score: 80,
        verdict: 'approved',
        reasons: ['Note: see https://user:pass@example.com/secret'],
      },
      sessionId: 'oc_redact',
    });
    expect(approved.reasons[0]).not.toContain('user:pass@example.com');
  });

  it('redacts run event labels and details at the storage boundary', () => {
    const store = createStore();
    const event = store.recordRunEvent({
      username: 'Event Security',
      status: 'queued',
      label: 'Queued OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
      details: 'Contact test@example.com with token=ghp_abcdefghijklmnopqrstuvwxyz',
    });

    expect(event.label).toBe('Queued OPENAI_API_KEY=[redacted]');
    expect(event.details).toBe('Contact [redacted:email] with token=[redacted]');
  });

  it('writes local PromptCourt state with private filesystem permissions', () => {
    const openchamberDataDir = createTempDir();
    const store = createPromptCourtStore({ openchamberDataDir, cloudSync: { enabled: false } });
    store.recordRunEvent({
      username: 'Mode Tester',
      status: 'queued',
      label: 'Queued',
      details: 'safe',
    });

    const dirMode = fs.statSync(openchamberDataDir).mode & 0o777;
    const fileMode = fs.statSync(path.join(openchamberDataDir, 'promptcourt.json')).mode & 0o777;
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
  });

  it('refuses symlinked PromptCourt state paths', () => {
    const realDir = createTempDir();
    const linkDir = `${realDir}-link`;
    tempDirs.push(linkDir);
    fs.symlinkSync(realDir, linkDir);

    const store = createPromptCourtStore({
      openchamberDataDir: linkDir,
      cloudSync: { enabled: false },
    });

    expect(() => store.recordRunEvent({
      username: 'Symlink',
      status: 'queued',
      label: 'Queued',
      details: 'safe',
    })).toThrow(/Refusing to use symlinked PromptCourt path/);
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
