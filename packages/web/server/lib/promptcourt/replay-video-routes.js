import path from 'node:path';

import { RemotionNotInstalledError, renderReplayVideoExport } from './replay-video.js';

const getRequestUsername = (req) => {
  const header = typeof req.get === 'function' ? req.get('x-promptcourt-user') : null;
  return header || req.body?.username || req.query?.username || null;
};

const selectRunEvents = ({ store, username, sessionId }) => {
  if (!store || typeof store.getRunEvents !== 'function') return [];
  const events = store.getRunEvents({ username, limit: 100 });
  if (!sessionId) return events;
  return events.filter((event) => event.sessionId === sessionId);
};

export const createReplayVideoExportHandler = ({
  store,
  renderer,
  outputDir,
} = {}) => async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
  const username = getRequestUsername(req);
  const events = Array.isArray(body.events) && body.events.length > 0
    ? body.events
    : selectRunEvents({ store, username, sessionId });

  try {
    const result = await renderReplayVideoExport({
      renderer,
      outputDir,
      format: body.format,
      title: body.title,
      subtitle: body.subtitle,
      outcome: body.outcome,
      steps: body.steps,
      events,
      session: body.session || { id: sessionId, username },
      username,
      width: body.width,
      height: body.height,
      fps: body.fps,
    });

    res.json({
      ok: true,
      export: {
        format: result.format,
        rendered: result.rendered,
        fallback: result.fallback,
        renderer: result.renderer,
        artifact: result.artifact,
      },
      contract: result.contract,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Replay export failed';
    const status = error instanceof RemotionNotInstalledError
      ? 503
      : typeof error?.statusCode === 'number'
        ? error.statusCode
        : 500;
    res.status(status).json({
      ok: false,
      error: message,
    });
  }
};

export const registerPromptCourtReplayVideoRoutes = (app, {
  express,
  openchamberDataDir,
  store,
  renderer,
}) => {
  const jsonParser = express.json({ limit: '10mb' });
  const outputDir = path.join(openchamberDataDir, 'promptcourt-replay-exports');

  app.post(
    '/api/promptcourt/replay/export',
    jsonParser,
    createReplayVideoExportHandler({ store, renderer, outputDir }),
  );
};
