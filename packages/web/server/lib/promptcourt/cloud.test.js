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
});
