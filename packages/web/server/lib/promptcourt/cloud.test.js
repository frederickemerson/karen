import { describe, expect, it, vi } from 'vitest';

import { createPromptCourtCloudSync } from './cloud.js';

const flushMicrotasks = async (ticks = 5) => {
  for (let i = 0; i < ticks; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('promptcourt cloud sync', () => {
  it('skips sync unless explicitly enabled', async () => {
    const fetchImpl = vi.fn();
    const cloud = createPromptCourtCloudSync({
      env: { CONVEX_HTTP_ACTIONS_URL: 'https://example.convex.site' },
      fetchImpl,
      loadEnvFiles: false,
    });

    await expect(cloud.send({ kind: 'approved_prompt' })).resolves.toMatchObject({ skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts events to the Convex HTTP action with optional ingest auth', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const cloud = createPromptCourtCloudSync({
      env: {
        KAREN_CLOUD_SYNC: '1',
        CONVEX_HTTP_ACTIONS_URL: 'https://example.convex.site/',
        KAREN_CLOUD_INGEST_SECRET: 'dev-secret',
      },
      fetchImpl,
      loadEnvFiles: false,
    });

    await expect(cloud.send({ kind: 'approved_prompt' })).resolves.toMatchObject({ ok: true });

    expect(fetchImpl).toHaveBeenCalledWith('https://example.convex.site/karen/ingest', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer dev-secret',
        'content-type': 'application/json',
      }),
    }));
  });

  it('does not enable cloud sync in local-only mode', async () => {
    const fetchImpl = vi.fn();
    const cloud = createPromptCourtCloudSync({
      env: {
        KAREN_CLOUD_SYNC: '1',
        KAREN_LOCAL_ONLY: '1',
        CONVEX_HTTP_ACTIONS_URL: 'https://example.convex.site/',
      },
      fetchImpl,
      loadEnvFiles: false,
    });

    await expect(cloud.send({ kind: 'approved_prompt' })).resolves.toMatchObject({ skipped: true });
    expect(cloud.enabled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('redacts session and public post payloads before Convex ingest', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const cloud = createPromptCourtCloudSync({
      env: {
        KAREN_CLOUD_SYNC: '1',
        CONVEX_HTTP_ACTIONS_URL: 'https://example.convex.site/',
      },
      fetchImpl,
      loadEnvFiles: false,
    });

    cloud.recordBlockedPrompt({
      session: {
        id: 'pc_secret',
        username: 'ada',
        status: 'blocked_bad_prompt',
        prompt: 'Use OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz from /Users/frederick/app',
        promptScore: 12,
        rollbackTriggered: false,
        changedFiles: ['/Users/frederick/app/.env'],
        reasons: ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz'],
        createdAt: 1,
      },
      post: {
        id: 'post_secret',
        type: 'bad_prompt',
        title: 'Blocked sk-abcdefghijklmnopqrstuvwxyz',
        score: 12,
        promptExcerpt: 'email me@example.com',
        failureReasons: ['token=ghp_abcdefghijklmnopqrstuvwxyz'],
        suggestedRewrite: 'Remove credentials.',
        createdAt: 1,
      },
    });
    await flushMicrotasks();

    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(JSON.stringify(payload)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(payload)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(payload)).not.toContain('/Users/frederick');
    expect(payload.session.prompt).toContain('OPENAI_API_KEY=[redacted]');
    expect(payload.session.changedFiles[0]).toContain('/Users/[redacted]');
    expect(payload.publicPost.promptExcerpt).toBe('email [redacted:email]');
  });

  describe('retry queue', () => {
    const enabledEnv = {
      KAREN_CLOUD_SYNC: '1',
      CONVEX_HTTP_ACTIONS_URL: 'https://example.convex.site/',
    };

    const buildSession = (id = 'pc_test') => ({
      id,
      username: 'ada',
      status: 'approved',
      prompt: 'hello',
      promptScore: 80,
      rollbackTriggered: false,
      changedFiles: [],
      reasons: [],
      createdAt: 1,
    });

    it('retries on 5xx with exponential backoff then succeeds', async () => {
      let pendingTimers = [];
      const setTimeoutImpl = (fn, delay) => {
        const timer = { fn, delay, fired: false };
        pendingTimers.push(timer);
        return { unref: () => {} };
      };
      const fireTimers = async () => {
        const toFire = pendingTimers.filter((t) => !t.fired);
        pendingTimers = [];
        for (const t of toFire) {
          t.fired = true;
          t.fn();
          // eslint-disable-next-line no-await-in-loop
          await flushMicrotasks();
        }
      };

      let calls = 0;
      const fetchImpl = vi.fn(async () => {
        calls += 1;
        if (calls < 3) return new Response('boom', { status: 503 });
        return new Response('{}', { status: 200 });
      });

      const cloud = createPromptCourtCloudSync({
        env: enabledEnv,
        fetchImpl,
        loadEnvFiles: false,
        setTimeoutImpl,
      });

      cloud.recordApprovedPrompt({ session: buildSession() });
      expect(cloud.getPendingCount()).toBe(1);

      // First attempt (delay 0) -> 503
      await fireTimers();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(cloud.getPendingCount()).toBe(1);

      // Backoff retry -> 503
      await fireTimers();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(cloud.getPendingCount()).toBe(1);

      // Backoff retry -> 200
      await fireTimers();
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(cloud.getPendingCount()).toBe(0);
    });

    it('drops events on 4xx without retrying', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchImpl = vi.fn(async () => new Response('bad', { status: 400 }));

      const cloud = createPromptCourtCloudSync({
        env: enabledEnv,
        fetchImpl,
        loadEnvFiles: false,
      });

      cloud.recordApprovedPrompt({ session: buildSession() });
      await flushMicrotasks(10);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(cloud.getPendingCount()).toBe(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cloud_sync_dropped'));
      warn.mockRestore();
    });

    it('evicts oldest events once queue cap is exceeded', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // fetchImpl that never resolves so the queue can fill.
      const fetchImpl = vi.fn(() => new Promise(() => {}));

      const cloud = createPromptCourtCloudSync({
        env: enabledEnv,
        fetchImpl,
        loadEnvFiles: false,
      });

      for (let i = 0; i < 1001; i += 1) {
        cloud.recordApprovedPrompt({ session: buildSession(`s_${i}`) });
      }

      expect(cloud.getPendingCount()).toBeLessThanOrEqual(1000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('queue cap reached'));
      warn.mockRestore();
    });

    it('exposes flushNow that resolves once the queue drains', async () => {
      const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));

      const cloud = createPromptCourtCloudSync({
        env: enabledEnv,
        fetchImpl,
        loadEnvFiles: false,
      });

      cloud.recordApprovedPrompt({ session: buildSession() });
      cloud.recordApprovedPrompt({ session: buildSession('s2') });

      await cloud.flushNow();
      expect(cloud.getPendingCount()).toBe(0);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });
});
