import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  REPLAY_COMPOSITION_ID,
  REPLAY_VIDEO_SCHEMA_VERSION,
  buildReplayVideoContract,
  createStubReplayRenderer,
  renderReplayVideoExport,
} from './replay-video.js';
import { createReplayVideoExportHandler } from './replay-video-routes.js';

const tempDirs = [];

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karen-replay-video-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('promptcourt replay video contract', () => {
  it('builds a Remotion-ready contract from Karen run events', () => {
    const contract = buildReplayVideoContract({
      title: 'Demo replay',
      username: 'Ada',
      createdAt: 123,
      events: [
        {
          id: 'evt_1',
          sessionId: 'pc_1',
          username: 'ada',
          status: 'queued',
          label: 'GUI submitted a guarded Karen run.',
          details: 'Implement replay export',
          createdAt: 10,
        },
        {
          id: 'evt_2',
          sessionId: 'pc_1',
          username: 'ada',
          status: 'quiz_passed',
          label: 'Quiz passed. Patch is eligible for promotion.',
          details: 'packages/web/server/lib/promptcourt/replay-video.js',
          createdAt: 20,
        },
      ],
    });

    expect(contract.schemaVersion).toBe(REPLAY_VIDEO_SCHEMA_VERSION);
    expect(contract.compositionId).toBe(REPLAY_COMPOSITION_ID);
    expect(contract.renderTarget).toMatchObject({ width: 1920, height: 1080, fps: 30 });
    expect(contract.metadata).toMatchObject({
      replayId: 'replay_pc-1_123',
      sessionId: 'pc_1',
      username: 'Ada',
      outcome: 'promoted',
    });
    expect(contract.props.steps).toHaveLength(2);
    expect(contract.props.steps[0]).toMatchObject({
      id: 'evt-1',
      label: 'GUI submitted a guarded Karen run.',
      status: 'complete',
      startFrame: 0,
    });
    expect(contract.props.steps[1]).toMatchObject({
      id: 'evt-2',
      metric: 'quiz_passed',
      status: 'active',
      startFrame: 72,
    });
  });

  it('writes a concrete fallback artifact when MP4 rendering is unavailable', async () => {
    const outputDir = makeTempDir();
    const renderer = createStubReplayRenderer({ outputDir, now: () => 456 });
    const result = await renderReplayVideoExport({
      renderer,
      format: 'mp4',
      createdAt: 123,
      session: { id: 'pc_2', username: 'grace' },
      steps: [
        {
          id: 'patch-promoted',
          label: 'Patch promoted',
          description: 'User passed the quiz.',
          detail: 'The generated patch can be kept.',
          timestamp: '01:00',
          status: 'complete',
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      format: 'mp4',
      rendered: false,
      fallback: true,
      renderer: 'stub-json-renderer',
    });
    expect(result.artifact.filename).toBe('replay_pc-2_123.mp4.json');
    expect(fs.existsSync(result.artifact.path)).toBe(true);
    const artifact = JSON.parse(fs.readFileSync(result.artifact.path, 'utf8'));
    expect(artifact).toMatchObject({
      fallback: true,
      renderer: 'stub',
      generatedAt: 456,
      remotionPlugIn: {
        package: '@remotion/renderer',
        function: 'renderMedia',
        compositionId: REPLAY_COMPOSITION_ID,
      },
    });
    expect(artifact.contract.props.steps[0].label).toBe('Patch promoted');
  });

  it('exports using stored run events when the GUI sends a session id', async () => {
    const outputDir = makeTempDir();
    const renderer = createStubReplayRenderer({ outputDir, now: () => 789 });
    const store = {
      getRunEvents: () => [
        {
          id: 'evt_wrong',
          sessionId: 'pc_other',
          username: 'ada',
          status: 'queued',
          label: 'Wrong session',
          details: 'Ignore me',
          createdAt: 1,
        },
        {
          id: 'evt_right',
          sessionId: 'pc_target',
          username: 'ada',
          status: 'rollback',
          label: 'Quiz failed. Generated code was reset.',
          details: 'The patch was discarded.',
          createdAt: 2,
        },
      ],
    };
    const handler = createReplayVideoExportHandler({ store, renderer, outputDir });
    const response = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    await handler({
      body: { sessionId: 'pc_target', format: 'json' },
      query: {},
      get: () => null,
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.export).toMatchObject({
      format: 'json',
      rendered: true,
      fallback: false,
    });
    expect(response.body.contract.metadata).toMatchObject({
      sessionId: 'pc_target',
      outcome: 'deleted',
    });
    expect(response.body.contract.props.steps).toHaveLength(1);
    expect(response.body.contract.props.steps[0].label).toBe('Quiz failed. Generated code was reset.');
  });
});
