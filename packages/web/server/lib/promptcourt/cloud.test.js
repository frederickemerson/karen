import { describe, expect, it, vi } from 'vitest';

import { createPromptCourtCloudSync } from './cloud.js';

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
    await new Promise((resolve) => setTimeout(resolve, 0));

    const payload = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(JSON.stringify(payload)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(payload)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(payload)).not.toContain('/Users/frederick');
    expect(payload.session.prompt).toContain('OPENAI_API_KEY=[redacted]');
    expect(payload.session.changedFiles[0]).toContain('/Users/[redacted]');
    expect(payload.publicPost.promptExcerpt).toBe('email [redacted:email]');
  });
});
