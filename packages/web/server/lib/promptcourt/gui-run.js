import { evaluatePrompt, extractPromptText } from './evaluator.js';
import { redactPublicText } from './privacy.js';

const GUI_RUN_LIMIT = 100;
const GUI_RUN_EVENT_LIMIT = 50;

const normalizePrompt = (body) => {
  if (typeof body?.prompt === 'string') return body.prompt;
  return extractPromptText(body);
};

const getUsernameFromRequest = (req, store, fallback = 'local-user') => {
  const header = typeof req.get === 'function' ? req.get('x-promptcourt-user') : null;
  const bodyUser = req.body && typeof req.body === 'object' ? req.body.username : null;
  const queryUser = req.query && typeof req.query === 'object' ? req.query.username : null;
  return store.normalizeUsername(header || bodyUser || queryUser || fallback);
};

const buildBadPromptPost = (prompt, evaluation) => ({
  title: `Blocked ${evaluation.score}/100 prompt`,
  score: evaluation.score,
  promptExcerpt: redactPublicText(prompt),
  failureReasons: evaluation.reasons,
  suggestedRewrite: redactPublicText(evaluation.suggestedRewrite, 600),
});

const publicRun = (run) => ({
  id: run.id,
  sessionId: run.sessionId,
  username: run.username,
  status: run.status,
  promptExcerpt: run.promptExcerpt,
  promptScore: run.evaluation?.score ?? null,
  verdict: run.evaluation?.verdict ?? null,
  reasons: run.evaluation?.reasons ?? [],
  suggestedRewrite: run.evaluation?.suggestedRewrite ?? null,
  publicPost: run.publicPost ?? null,
  quiz: run.quiz ?? null,
  error: run.error ?? null,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
});

const defaultQuizForRun = (run) => ({
  id: `quiz_${run.id}`,
  title: 'Read-before-promote checkpoint',
  instructions: 'Karen stopped the browser run at the quiz gate. The next version will replace this with real diff questions from the GUI executor.',
  questions: [
    {
      id: `q_${run.id}_scope`,
      prompt: 'What should you verify before promoting this generated patch?',
      choices: [
        'The changed files match the original prompt scope',
        'The terminal printed something green',
        'The model sounded confident',
        'The diff is too long to inspect',
      ],
      answerIndex: 0,
      explanation: 'Karen only promotes code after the user can explain scope, behavior, and risk.',
    },
  ],
});

export const createGuiRunRuntime = ({
  store,
  evaluate = evaluatePrompt,
  runner = null,
  now = () => Date.now(),
  schedule = (fn, delay = 0) => setTimeout(fn, delay),
} = {}) => {
  if (!store) {
    throw new Error('createGuiRunRuntime requires a promptcourt store');
  }

  const runs = new Map();
  const listeners = new Map();
  const statusWaiters = new Map();

  const rememberRun = (run) => {
    runs.set(run.id, run);
    if (runs.size > GUI_RUN_LIMIT) {
      const oldest = [...runs.values()].sort((left, right) => left.createdAt - right.createdAt)[0];
      if (oldest) runs.delete(oldest.id);
    }
  };

  const notifyStatusWaiters = (run) => {
    const waiters = statusWaiters.get(run.id);
    if (!waiters) return;
    for (const waiter of waiters.slice()) {
      if (waiter.statuses.has(run.status)) {
        waiter.resolve(publicRun(run));
        clearTimeout(waiter.timeout);
        waiters.splice(waiters.indexOf(waiter), 1);
      }
    }
    if (waiters.length === 0) statusWaiters.delete(run.id);
  };

  const emit = (run, status, label, details = '', { recordStore = true } = {}) => {
    run.status = status;
    run.updatedAt = now();
    const event = {
      id: `gui_evt_${now()}_${Math.random().toString(36).slice(2, 8)}`,
      runId: run.id,
      sessionId: run.sessionId || run.id,
      username: run.username,
      status,
      label,
      details,
      createdAt: run.updatedAt,
    };
    run.events.push(event);
    if (run.events.length > GUI_RUN_EVENT_LIMIT) {
      run.events.splice(0, run.events.length - GUI_RUN_EVENT_LIMIT);
    }

    if (recordStore && status !== 'judging') {
      store.recordRunEvent({
        sessionId: event.sessionId,
        username: run.username,
        status,
        label,
        details,
      });
    }

    for (const listener of listeners.get(run.id) ?? []) {
      listener(event, publicRun(run));
    }
    notifyStatusWaiters(run);
    return event;
  };

  const failRun = (run, error) => {
    run.error = error instanceof Error ? error.message : String(error || 'Unknown GUI runner error');
    emit(run, 'failed', 'GUI guarded run failed.', run.error);
  };

  const advanceRun = async (runId) => {
    const run = runs.get(runId);
    if (!run || run.status !== 'queued') return;

    try {
      emit(run, 'judging', 'Karen is judging the prompt.', run.promptExcerpt);
      const evaluation = evaluate(run.prompt);
      run.evaluation = evaluation;

      if (!evaluation.allowed) {
        const result = store.recordBlockedPrompt({
          username: run.username,
          prompt: redactPublicText(run.prompt, 1200),
          evaluation,
          publicPost: buildBadPromptPost(run.prompt, evaluation),
        });
        run.sessionId = result.session.id;
        run.publicPost = result.post;
        emit(run, 'blocked', `Blocked ${evaluation.score}/100 prompt.`, evaluation.reasons.slice(0, 4).join(' | '), { recordStore: false });
        return;
      }

      const session = store.recordApprovedPrompt({
        username: run.username,
        prompt: redactPublicText(run.prompt, 1200),
        evaluation,
        sessionId: run.id,
      });
      run.sessionId = session.id;
      emit(run, 'running', 'Prompt approved. Browser run job is active.', `${evaluation.score}/100 prompt score`, { recordStore: false });

      if (typeof runner === 'function') {
        const result = await runner({ run: publicRun(run), prompt: run.prompt, evaluation });
        run.runnerResult = result ?? null;
      }

      run.quiz = defaultQuizForRun(run);
      emit(run, 'quiz_required', 'Karen reached the browser quiz gate.', 'Real sandbox execution will attach diff-backed questions here.');
    } catch (error) {
      failRun(run, error);
    }
  };

  return {
    createRun({ prompt, username = 'local-user', cwd = process.cwd() }) {
      const normalizedPrompt = String(prompt ?? '').trim();
      if (!normalizedPrompt) {
        const error = new Error('Prompt is required');
        error.status = 400;
        throw error;
      }
      const run = {
        id: `gui_${now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId: null,
        username: store.normalizeUsername(username),
        status: 'queued',
        prompt: normalizedPrompt,
        promptExcerpt: redactPublicText(normalizedPrompt, 300),
        cwd,
        events: [],
        evaluation: null,
        publicPost: null,
        quiz: null,
        error: null,
        createdAt: now(),
        updatedAt: now(),
      };
      rememberRun(run);
      emit(run, 'queued', 'GUI queued a guarded Karen run.', run.promptExcerpt);
      schedule(() => {
        void advanceRun(run.id);
      }, 0);
      return publicRun(run);
    },
    getRun(runId) {
      const run = runs.get(runId);
      return run ? publicRun(run) : null;
    },
    getRunEvents(runId) {
      return runs.get(runId)?.events.slice() ?? null;
    },
    listRuns({ username = null, limit = 20 } = {}) {
      const normalized = username ? store.normalizeUsername(username) : null;
      return [...runs.values()]
        .filter((run) => !normalized || run.username === normalized)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, Math.max(1, Math.min(50, limit)))
        .map(publicRun);
    },
    subscribe(runId, listener) {
      if (!runs.has(runId)) return null;
      const runListeners = listeners.get(runId) ?? [];
      runListeners.push(listener);
      listeners.set(runId, runListeners);
      return () => {
        const next = (listeners.get(runId) ?? []).filter((entry) => entry !== listener);
        if (next.length > 0) listeners.set(runId, next);
        else listeners.delete(runId);
      };
    },
    waitForRunStatus(runId, statuses, timeoutMs = 1000) {
      const expected = new Set(Array.isArray(statuses) ? statuses : [statuses]);
      const run = runs.get(runId);
      if (!run) return Promise.resolve(null);
      if (expected.has(run.status)) return Promise.resolve(publicRun(run));
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          const waiters = statusWaiters.get(runId) ?? [];
          statusWaiters.set(runId, waiters.filter((waiter) => waiter.resolve !== resolve));
          reject(new Error(`Timed out waiting for GUI run ${runId}`));
        }, timeoutMs);
        const waiters = statusWaiters.get(runId) ?? [];
        waiters.push({ statuses: expected, resolve, timeout });
        statusWaiters.set(runId, waiters);
      });
    },
  };
};

export const registerGuiRunRoutes = (app, { express, store, runtime = createGuiRunRuntime({ store }) }) => {
  const jsonParser = express.json({ limit: '50mb' });

  app.post('/api/promptcourt/gui-runs', jsonParser, (req, res) => {
    try {
      const run = runtime.createRun({
        prompt: normalizePrompt(req.body),
        username: getUsernameFromRequest(req, store),
        cwd: typeof req.body?.cwd === 'string' ? req.body.cwd : process.cwd(),
      });
      res.status(202).json({
        ok: true,
        run,
        message: 'Karen queued a browser guarded run.',
      });
    } catch (error) {
      res.status(error?.status || 500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Karen could not start the GUI run.',
      });
    }
  });

  app.get('/api/promptcourt/gui-runs', (req, res) => {
    res.json({
      runs: runtime.listRuns({
        username: typeof req.query?.username === 'string' ? req.query.username : null,
        limit: Number(req.query?.limit) || 20,
      }),
    });
  });

  app.get('/api/promptcourt/gui-runs/:runId', (req, res) => {
    const run = runtime.getRun(req.params.runId);
    if (!run) return res.status(404).json({ ok: false, error: 'GUI run not found' });
    res.json({ ok: true, run });
  });

  app.get('/api/promptcourt/gui-runs/:runId/events', (req, res) => {
    const run = runtime.getRun(req.params.runId);
    if (!run) return res.status(404).json({ ok: false, error: 'GUI run not found' });

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const writeEvent = (event, nextRun = runtime.getRun(req.params.runId)) => {
      res.write(`id: ${event.id}\n`);
      res.write('event: gui-run\n');
      res.write(`data: ${JSON.stringify({ event, run: nextRun })}\n\n`);
    };

    for (const event of runtime.getRunEvents(req.params.runId) ?? []) {
      writeEvent(event, run);
    }

    const unsubscribe = runtime.subscribe(req.params.runId, writeEvent);
    const heartbeat = setInterval(() => {
      res.write('event: ping\ndata: {}\n\n');
    }, 1500);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe?.();
    });
  });

  return runtime;
};
