import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluatePrompt, extractPromptText } from './evaluator.js';
import { redactPublicText } from './privacy.js';
import { createPromptCourtStore } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../..');
const karenBin = path.join(root, 'packages/karen/bin/karen.js');

const getUsernameFromRequest = (req, fallback = 'local-user') => {
  const header = typeof req.get === 'function' ? req.get('x-promptcourt-user') : null;
  const bodyUser = req.body && typeof req.body === 'object' ? req.body.username : null;
  const queryUser = req.query && typeof req.query === 'object' ? req.query.username : null;
  return header || bodyUser || queryUser || fallback;
};

const buildBadPromptPost = (prompt, evaluation) => ({
  title: `Blocked ${evaluation.score}/100 prompt`,
  score: evaluation.score,
  promptExcerpt: redactPublicText(prompt),
  failureReasons: evaluation.reasons,
  suggestedRewrite: redactPublicText(evaluation.suggestedRewrite, 600),
});

const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;

const launchKarenTerminalRun = ({ prompt, cwd = root, username = 'local-user' }) => {
  const command = `cd ${shellQuote(cwd)} && KAREN_USER=${shellQuote(username)} ${shellQuote(process.execPath)} ${shellQuote(karenBin)} ${shellQuote(prompt)}`;

  if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script ${JSON.stringify(command)}`;
    const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, launcher: 'terminal' };
  }

  if (process.platform === 'win32') {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process powershell -ArgumentList '-NoExit','-Command',${JSON.stringify(command)}`], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { ok: true, launcher: 'powershell' };
  }

  const terminal = process.env.TERMINAL || 'x-terminal-emulator';
  const child = spawn(terminal, ['-e', 'sh', '-lc', `${command}; exec sh`], { detached: true, stdio: 'ignore' });
  child.unref();
  return { ok: true, launcher: terminal };
};

const authorizeAdmin = (req) => {
  const expected = process.env.KAREN_ADMIN_TOKEN || process.env.KAREN_CLOUD_INGEST_SECRET;
  if (!expected) return false;
  const header = typeof req.get === 'function' ? req.get('authorization') : null;
  return header === `Bearer ${expected}`;
};

export const evaluatePromptCourtRun = ({ store, prompt, username }) => {
  const normalizedUsername = store.normalizeUsername(username);
  const evaluation = evaluatePrompt(prompt);

  if (!evaluation.allowed) {
    const { post } = store.recordBlockedPrompt({
      username: normalizedUsername,
      prompt: redactPublicText(prompt, 1200),
      evaluation,
      publicPost: buildBadPromptPost(prompt, evaluation),
    });
    return {
      allowed: false,
      status: 422,
      payload: {
        error: 'Karen blocked this prompt',
        promptcourt: {
          ...evaluation,
          username: normalizedUsername,
          publicPost: post,
        },
      },
    };
  }

  return {
    allowed: true,
    status: 200,
    payload: {
      ...evaluation,
      username: normalizedUsername,
    },
  };
};

const forwardPromptAsync = async ({ req, res, buildOpenCodeUrl, getOpenCodeAuthHeaders }) => {
  const upstreamPath = (req.originalUrl || req.url || '').replace(/^\/api/, '') || req.path;
  const upstream = await fetch(buildOpenCodeUrl(upstreamPath, ''), {
    method: 'POST',
    headers: {
      accept: req.get('accept') || 'application/json',
      'content-type': 'application/json',
      ...getOpenCodeAuthHeaders(),
    },
    body: JSON.stringify(req.body ?? {}),
  });

  const text = await upstream.text().catch(() => '');
  res.status(upstream.status);
  const contentType = upstream.headers.get('content-type');
  if (contentType) {
    res.setHeader('content-type', contentType);
  }
  res.send(text);
};

export const registerPromptCourtRoutes = (app, {
  express,
  openchamberDataDir,
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
}) => {
  const store = createPromptCourtStore({ openchamberDataDir });
  const jsonParser = express.json({ limit: '50mb' });

  app.get('/api/promptcourt/feed', (_req, res) => {
    res.json({ posts: store.getFeed() });
  });

  app.get('/api/promptcourt/profile/:username', (req, res) => {
    res.json(store.getProfile(req.params.username));
  });

  app.get('/api/promptcourt/overview', (_req, res) => {
    res.json(store.getOverview());
  });

  app.get('/api/promptcourt/runs', (req, res) => {
    res.json({
      events: store.getRunEvents({
        username: req.query?.username || null,
        sinceId: req.query?.since || null,
        limit: Number(req.query?.limit) || 50,
      }),
    });
  });

  app.get('/api/promptcourt/runs/events', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    let sinceId = typeof req.query?.since === 'string' ? req.query.since : null;
    const username = typeof req.query?.username === 'string' ? req.query.username : null;

    const flush = () => {
      const events = store.getRunEvents({ username, sinceId, limit: 100 });
      for (const event of events) {
        sinceId = event.id;
        res.write(`id: ${event.id}\n`);
        res.write('event: run\n');
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    flush();
    const heartbeat = setInterval(() => {
      flush();
      res.write('event: ping\ndata: {}\n\n');
    }, 1500);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  app.post('/api/promptcourt/admin/cleanup', jsonParser, (req, res) => {
    if (!authorizeAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    res.json({
      ok: true,
      ...store.cleanupDevRecords({ mode: req.body?.mode === 'all' ? 'all' : 'smoke' }),
    });
  });

  app.post('/api/promptcourt/evaluate', jsonParser, (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : extractPromptText(req.body);
    const username = getUsernameFromRequest(req);
    const evaluation = evaluatePrompt(prompt);
    const shouldRecordBlocked = req.body?.recordBlocked === true;
    let publicPost = null;
    if (!evaluation.allowed && shouldRecordBlocked) {
      publicPost = store.recordBlockedPrompt({
        username,
        prompt: redactPublicText(prompt, 1200),
        evaluation,
        publicPost: buildBadPromptPost(prompt, evaluation),
      }).post;
    }
    res.json({
      ...evaluation,
      username: store.normalizeUsername(username),
      publicPreview: evaluation.allowed ? null : buildBadPromptPost(prompt, evaluation),
      publicPost,
    });
  });

  app.post('/api/promptcourt/run', jsonParser, (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : extractPromptText(req.body);
    const username = getUsernameFromRequest(req);
    const queued = store.recordRunEvent({
      username,
      status: 'queued',
      label: 'GUI submitted a guarded Karen run.',
      details: prompt.slice(0, 120),
    });
    const verdict = evaluatePromptCourtRun({ store, prompt, username });

    if (!verdict.allowed) {
      return res.status(verdict.status).json(verdict.payload);
    }

    try {
      const launched = launchKarenTerminalRun({ prompt, cwd: req.body?.cwd || process.cwd(), username: store.normalizeUsername(username) });
      store.recordRunEvent({
        sessionId: queued.sessionId,
        username,
        status: 'terminal_opened',
        label: 'Terminal opened. Karen is now running outside the browser.',
        details: launched.launcher,
      });
      res.json({
        ...verdict.payload,
        launched,
        runEvent: queued,
        message: 'Karen opened a terminal run for this prompt.',
      });
    } catch (error) {
      store.recordRunEvent({
        sessionId: queued.sessionId,
        username,
        status: 'failed',
        label: 'Karen could not open the terminal run.',
        details: error instanceof Error ? error.message : 'Unknown launcher error',
      });
      res.status(503).json({
        error: error instanceof Error ? error.message : 'Karen could not open a terminal run.',
      });
    }
  });

  app.post('/api/session/:sessionId/prompt_async', jsonParser, async (req, res) => {
    const prompt = extractPromptText(req.body);
    const username = store.normalizeUsername(getUsernameFromRequest(req));
    const evaluation = evaluatePrompt(prompt);

    if (!evaluation.allowed) {
      const { post } = store.recordBlockedPrompt({
        username,
        prompt: redactPublicText(prompt, 1200),
        evaluation,
        publicPost: buildBadPromptPost(prompt, evaluation),
      });
      return res.status(422).json({
        error: 'Karen blocked this prompt',
        promptcourt: {
          ...evaluation,
          username,
          publicPost: post,
        },
      });
    }

    store.recordApprovedPrompt({
      username,
      prompt: redactPublicText(prompt, 1200),
      evaluation,
      sessionId: req.params.sessionId,
    });

    try {
      await forwardPromptAsync({ req, res, buildOpenCodeUrl, getOpenCodeAuthHeaders });
    } catch (error) {
      console.error('[promptcourt] prompt_async forward failed:', error?.message ?? error);
      if (!res.headersSent) {
        res.status(503).json({ error: 'OpenCode service unavailable' });
      }
    }
  });
};
