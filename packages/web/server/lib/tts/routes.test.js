import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { registerTtsRoutes } from './routes.js';

const originalEnv = { ...process.env };
const tempDirs = [];

const createApp = () => {
  const app = express();
  app.use(express.json());
  registerTtsRoutes(app, {
    resolveZenModel: async () => 'gpt-5-nano',
    sayTTSCapability: null,
  });
  return app;
};

const createTempDataDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karen-tts-routes-'));
  tempDirs.push(dir);
  return dir;
};

const mockAudioResponse = (bytes = [1, 2, 3], headers = {}) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  headers: {
    get: (key) => headers[key.toLowerCase()] ?? null,
  },
});

describe('tts routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retries note summarization with notification mode before failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'unavailable' }),
    })));

    const response = await request(createApp())
      .post('/api/text/summarize')
      .send({
        text: 'First sentence. Second sentence with the useful insight.',
        threshold: 0,
        maxLength: 100,
        mode: 'note',
      });

    expect(response.status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(response.body).toEqual({
      error: 'Note summarization failed',
      reason: 'zen API returned 503',
    });
  });

  it('uses notification summarizer result when note mode falls back', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output: [{
            type: 'message',
            content: [{ type: 'output_text', text: '**Keep provider state stable** during streaming.' }],
          }],
        }),
      }));

    const response = await request(createApp())
      .post('/api/text/summarize')
      .send({
        text: 'First sentence. Preserve provider state references during streaming to avoid wide rerenders.',
        threshold: 0,
        maxLength: 100,
        mode: 'note',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      summary: 'Keep provider state stable during streaming.',
      summarized: true,
    });
  });

  it('keeps notification fallback behavior', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'unavailable' }),
    })));

    const response = await request(createApp())
      .post('/api/text/summarize')
      .send({
        text: 'Notification text that should fall back cleanly.',
        threshold: 0,
        maxLength: 100,
        mode: 'notification',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      summary: 'Notification text that should fall back cleanly.',
      summarized: false,
      reason: 'zen API returned 503',
    });
  });

  it('caches Karen ElevenLabs speech and tracks fresh character usage once', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
    process.env.ELEVENLABS_VOICE_ID = 'voice_test';
    process.env.OPENCHAMBER_DATA_DIR = createTempDataDir();
    process.env.KAREN_AUDIO_CACHE = '1';
    process.env.KAREN_AUDIO_DEMO_MODE = '0';
    process.env.KAREN_ELEVENLABS_DAILY_CAP = '500';

    const fetchMock = vi.fn(async () => mockAudioResponse([7, 8, 9], {
      'content-type': 'audio/mpeg',
      'character-cost': '42',
      'request-id': 'req_test',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      text: 'Karen says read the diff.',
      voiceId: 'voice_test',
      modelId: 'eleven_flash_v2_5',
    };
    const first = await request(createApp()).post('/api/karen/elevenlabs/speech').send(payload);
    const second = await request(createApp()).post('/api/karen/elevenlabs/speech').send(payload);
    const usage = await request(createApp()).get('/api/karen/elevenlabs/usage');

    expect(first.status).toBe(200);
    expect(first.headers['x-karen-audio-cache']).toBe('miss');
    expect(first.headers['x-elevenlabs-character-cost']).toBe('42');
    expect(second.status).toBe(200);
    expect(second.headers['x-karen-audio-cache']).toBe('hit');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usage.body).toMatchObject({
      requests: 1,
      characterCost: 42,
      dailyCap: 500,
      cacheEnabled: true,
    });
  });

  it('never echoes the ElevenLabs API key in status, usage, voices, or error responses', async () => {
    const secret = 'sk-test-elevenlabs-secret-do-not-leak';
    process.env.ELEVENLABS_API_KEY = secret;
    process.env.OPENCHAMBER_DATA_DIR = createTempDataDir();
    process.env.KAREN_AUDIO_DEMO_MODE = '0';

    // Make /voices fail so we cover the error path too.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    })));

    const app = createApp();

    const status = await request(app).get('/api/karen/elevenlabs/status');
    expect(status.status).toBe(200);
    expect(JSON.stringify(status.body)).not.toContain(secret);
    expect(status.body.secretEnvVar).toBe('ELEVENLABS_API_KEY');

    const usage = await request(app).get('/api/karen/elevenlabs/usage');
    expect(usage.status).toBe(200);
    expect(JSON.stringify(usage.body)).not.toContain(secret);

    const voices = await request(app).get('/api/karen/elevenlabs/voices');
    expect(voices.status).toBe(401);
    expect(JSON.stringify(voices.body)).not.toContain(secret);

    // Forcing a generic speech error path too.
    const speech = await request(app)
      .post('/api/karen/elevenlabs/speech')
      .send({ text: 'leak check', voiceId: 'voice_test' });
    expect(JSON.stringify(speech.body)).not.toContain(secret);
  });

  it('blocks fresh Karen ElevenLabs audio when the daily cap would be exceeded', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
    process.env.OPENCHAMBER_DATA_DIR = createTempDataDir();
    process.env.KAREN_AUDIO_CACHE = '1';
    process.env.KAREN_AUDIO_DEMO_MODE = '0';
    process.env.KAREN_ELEVENLABS_DAILY_CAP = '10';

    const fetchMock = vi.fn(async () => mockAudioResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(createApp())
      .post('/api/karen/elevenlabs/sound-effect')
      .send({ text: 'this prompt is longer than the cap', durationSeconds: 1 });

    expect(response.status).toBe(429);
    expect(response.body.error).toContain('daily cap');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
