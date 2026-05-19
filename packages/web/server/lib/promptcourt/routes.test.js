import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createPromptCourtStore } from './storage.js';
import { evaluatePromptCourtRun, registerPromptCourtRoutes } from './routes.js';

const tempDirs = [];

const createStore = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptcourt-routes-'));
  tempDirs.push(dir);
  return createPromptCourtStore({ openchamberDataDir: dir, cloudSync: { enabled: false } });
};

const createApp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptcourt-routes-app-'));
  tempDirs.push(dir);
  process.env.KAREN_PROMPTCOURT_SESSION_TOKEN = 'test-promptcourt-token';
  const app = express();
  registerPromptCourtRoutes(app, {
    express,
    openchamberDataDir: dir,
    buildOpenCodeUrl: (upstreamPath) => `http://127.0.0.1:9${upstreamPath}`,
    getOpenCodeAuthHeaders: () => ({}),
  });
  return app;
};

afterEach(() => {
  delete process.env.KAREN_PROMPTCOURT_SESSION_TOKEN;
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
      prompt: 'do your magic',
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
      prompt: 'do your magic',
    });

    const overview = store.getOverview();
    expect(overview.totals.sessions).toBe(1);
    expect(overview.users.map((profile) => profile.user.username)).toContain('route-tester');
  });

  it('rejects unauthenticated PromptCourt HTTP reads and mutations', async () => {
    const app = createApp();

    await request(app).get('/api/promptcourt/overview').expect(401);
    await request(app)
      .post('/api/promptcourt/evaluate')
      .send({ prompt: 'fix it', recordBlocked: true })
      .expect(401);
    await request(app)
      .post('/api/promptcourt/run')
      .send({ prompt: 'Implement a scoped change with tests.' })
      .expect(401);
    await request(app)
      .post('/api/promptcourt/replay/export')
      .send({ events: [] })
      .expect(401);
    await request(app)
      .post('/api/session/test-session/prompt_async')
      .send({ parts: [{ text: 'Implement a scoped change with tests.' }] })
      .expect(401);
  });

  it('allows PromptCourt HTTP routes with the session bearer', async () => {
    const app = createApp();

    await request(app)
      .get('/api/promptcourt/overview')
      .set('Authorization', 'Bearer test-promptcourt-token')
      .expect(200);

    const evaluation = await request(app)
      .post('/api/promptcourt/evaluate')
      .set('Authorization', 'Bearer test-promptcourt-token')
      .send({ prompt: 'fix it', recordBlocked: true })
      .expect(200);

    expect(evaluation.body.verdict).toBe('blocked');
    expect(evaluation.body.publicPost).toMatchObject({ type: 'bad_prompt' });
  });

  it('bootstraps the local PromptCourt session cookie on Karen pages', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/karen')
      .expect(404);

    expect(response.headers['set-cookie']?.join('\n')).toContain(
      'karen_promptcourt_session=test-promptcourt-token',
    );
  });

  it('bootstraps the local PromptCourt session cookie through the API bootstrap route', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/api/promptcourt/session')
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(response.headers['set-cookie']?.join('\n')).toContain(
      'karen_promptcourt_session=test-promptcourt-token',
    );
  });
});
