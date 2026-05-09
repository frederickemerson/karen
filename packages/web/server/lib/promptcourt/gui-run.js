import { evaluatePrompt, extractPromptText } from './evaluator.js';
import { redactPublicText } from './privacy.js';
import { buildQuiz } from './quiz.js';
import { synthesizeGuiDiff } from './diff-synthesizer.js';

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
  diff: run.diff ?? null,
  diffSource: run.diffSource ?? null,
  diffNote: run.diffNote ?? null,
  changedFiles: run.changedFiles ?? [],
  result: run.result ?? null,
  error: run.error ?? null,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
});

const FALLBACK_QUIZ_TITLE = 'Read-before-promote checkpoint';
const FALLBACK_QUIZ_QUESTIONS = [
  {
    prompt: 'What should you verify before promoting this generated patch?',
    options: [
      'The changed files match the original prompt scope',
      'The terminal printed something green',
      'The model sounded confident',
      'The diff is too long to inspect',
    ],
    answer: 0,
    evidence: '',
    why: 'Karen only promotes code after the user can explain scope, behavior, and risk.',
    source: 'fallback',
  },
];

const normalizeQuestion = (question, index, runId) => ({
  id: question.id || `q_${runId}_${index}`,
  prompt: String(question.prompt || ''),
  options: Array.isArray(question.options) ? question.options.slice(0, 4) : [],
  answer: Number.isInteger(question.answer) ? question.answer : 0,
  evidence: typeof question.evidence === 'string' ? question.evidence : '',
  why: typeof question.why === 'string' ? question.why : '',
  source: typeof question.source === 'string' ? question.source : 'parser',
});

const collectChangedFiles = (summary) => {
  if (!summary || !Array.isArray(summary.files)) return [];
  return summary.files.map((file) => file.path).filter(Boolean).slice(0, 50);
};

const buildQuizFailurePost = (run, wrongQuestion) => ({
  title: 'Karen threw out the GUI run',
  score: run.evaluation?.score ?? null,
  promptExcerpt: redactPublicText(run.prompt, 600),
  failureReasons: ['Failed code-read quiz', wrongQuestion?.prompt].filter(Boolean),
  suggestedRewrite: redactPublicText(run.evaluation?.suggestedRewrite, 600),
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

  const emit = (run, status, label, details = '', { recordStore = true, keepStatus = false } = {}) => {
    if (!keepStatus) {
      run.status = status;
    }
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

      let runnerOutput = null;
      if (typeof runner === 'function') {
        runnerOutput = await runner({ run: publicRun(run), prompt: run.prompt, evaluation });
        run.runnerResult = runnerOutput ?? null;
      }

      // Conversational chitchat and read-only exploration prompts don't
      // produce code changes, so there's nothing to quiz the user on.
      // Karen approved the run; finish it cleanly without fabricating a diff.
      if (evaluation.intent === 'conversational' || evaluation.intent === 'exploration') {
        run.diff = '';
        run.diffSource = 'none';
        run.diffNote = null;
        run.changedFiles = [];
        run.quiz = null;
        run.result = {
          status: 'approved',
          intent: evaluation.intent,
          message: evaluation.intent === 'conversational'
            ? 'Karen approved chitchat — no quiz required.'
            : 'Karen approved exploration — no quiz required.',
        };
        emit(
          run,
          'completed',
          evaluation.intent === 'conversational' ? 'Chitchat — no quiz required.' : 'Exploration — no quiz required.',
          run.result.message,
        );
        return;
      }

      const synthesized = runnerOutput?.diff
        ? { diff: runnerOutput.diff, source: runnerOutput.diffSource || 'runner', note: runnerOutput.diffNote || null }
        : await synthesizeGuiDiff({ prompt: run.prompt });

      run.diff = synthesized.diff;
      run.diffSource = synthesized.source;
      run.diffNote = synthesized.note || null;

      emit(run, 'building_quiz', 'Karen is generating diff-backed questions.', synthesized.source);

      let quiz;
      try {
        const built = await buildQuiz({
          prompt: run.prompt,
          generatedDiff: synthesized.diff,
          onAiFallback: (message) => {
            emit(run, 'quiz_ai_fallback', 'Falling back to parser questions.', message, { recordStore: false, keepStatus: true });
          },
        });
        quiz = {
          id: `quiz_${run.id}`,
          title: 'Prove you read the diff',
          instructions: 'Answer every question. One miss and Karen rolls the patch back.',
          source: built.source,
          questions: built.questions.map((question, index) => normalizeQuestion(question, index, run.id)),
        };
        run.changedFiles = collectChangedFiles(built.summary);
      } catch (error) {
        emit(run, 'quiz_ai_fallback', 'Quiz builder failed.', error instanceof Error ? error.message : 'unknown error', { recordStore: false, keepStatus: true });
        quiz = {
          id: `quiz_${run.id}`,
          title: FALLBACK_QUIZ_TITLE,
          instructions: 'Karen could not generate diff-backed questions. Answer the fallback check.',
          source: 'fallback',
          questions: FALLBACK_QUIZ_QUESTIONS.map((question, index) => normalizeQuestion(question, index, run.id)),
        };
        run.changedFiles = [];
      }

      run.quiz = quiz;
      emit(run, 'quiz_required', 'Karen handed the run to the quiz gate.', `${quiz.questions.length} questions • ${quiz.source}`);
    } catch (error) {
      failRun(run, error);
    }
  };

  const findQuestion = (run, questionId) => {
    if (!run?.quiz) return null;
    return run.quiz.questions.find((question) => question.id === questionId) || null;
  };

  const submitAnswer = (runId, { questionId, answerIndex }) => {
    const run = runs.get(runId);
    if (!run) {
      const error = new Error('GUI run not found');
      error.status = 404;
      throw error;
    }
    if (run.status !== 'quiz_required') {
      const error = new Error(`Run is in status ${run.status}, expected quiz_required`);
      error.status = 409;
      throw error;
    }
    const question = findQuestion(run, questionId);
    if (!question) {
      const error = new Error('Quiz question not found');
      error.status = 404;
      throw error;
    }
    const numericAnswer = Number(answerIndex);
    if (!Number.isInteger(numericAnswer) || numericAnswer < 0 || numericAnswer >= question.options.length) {
      const error = new Error('Invalid answer index');
      error.status = 400;
      throw error;
    }

    const correct = numericAnswer === question.answer;
    if (correct) {
      emit(run, 'quiz_answer_correct', `Correct: ${question.prompt.slice(0, 80)}`, '', { recordStore: false, keepStatus: true });
      return { correct: true, answer: question.answer, explanation: question.why };
    }

    emit(run, 'quiz_answer_wrong', `Wrong: ${question.prompt.slice(0, 80)}`, `picked option ${numericAnswer + 1}`, { recordStore: false, keepStatus: true });
    finalizeQuiz(run, { passed: false, wrongQuestion: question });
    return { correct: false, answer: question.answer, explanation: question.why };
  };

  const finalizeQuiz = (run, { passed, wrongQuestion = null }) => {
    if (run.status !== 'quiz_required' && run.status !== 'building_quiz') return publicRun(run);

    if (passed) {
      const sessionId = run.sessionId || run.id;
      try {
        store.recordQuizResult({
          sessionId,
          quizPassed: true,
          rollbackTriggered: false,
          changedFiles: run.changedFiles,
        });
      } catch {
        // Store failures are tolerated; the run is still informational.
      }
      run.result = { passed: true, completedAt: now() };
      emit(run, 'quiz_passed', 'Patch survived the quiz. Karen approves.', `${run.changedFiles.length} files in scope`);
      return publicRun(run);
    }

    const sessionId = run.sessionId || run.id;
    try {
      store.recordQuizResult({
        sessionId,
        quizPassed: false,
        rollbackTriggered: true,
        changedFiles: run.changedFiles,
        publicPost: buildQuizFailurePost(run, wrongQuestion),
      });
    } catch {
      // ignore
    }
    run.result = {
      passed: false,
      completedAt: now(),
      wrongQuestionId: wrongQuestion?.id ?? null,
    };
    emit(run, 'rollback', 'Quiz failed. Karen rolled the patch back.', wrongQuestion?.prompt?.slice(0, 120) || '');
    return publicRun(run);
  };

  const completeQuiz = (runId) => {
    const run = runs.get(runId);
    if (!run) {
      const error = new Error('GUI run not found');
      error.status = 404;
      throw error;
    }
    if (run.status !== 'quiz_required') {
      const error = new Error(`Run is in status ${run.status}, expected quiz_required`);
      error.status = 409;
      throw error;
    }
    return finalizeQuiz(run, { passed: true });
  };

  const abandonQuiz = (runId, { reason = 'closed' } = {}) => {
    const run = runs.get(runId);
    if (!run) return null;
    if (run.status !== 'quiz_required' && run.status !== 'building_quiz') return publicRun(run);
    return finalizeQuiz(run, { passed: false, wrongQuestion: { prompt: `User abandoned the quiz (${reason}).`, id: null } });
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
        diff: null,
        diffSource: null,
        diffNote: null,
        changedFiles: [],
        result: null,
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
    submitAnswer,
    completeQuiz,
    abandonQuiz,
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

  app.post('/api/promptcourt/gui-runs/:runId/answer', jsonParser, (req, res) => {
    try {
      const result = runtime.submitAnswer(req.params.runId, {
        questionId: req.body?.questionId,
        answerIndex: req.body?.answerIndex,
      });
      res.json({ ok: true, ...result, run: runtime.getRun(req.params.runId) });
    } catch (error) {
      res.status(error?.status || 500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Karen could not record the answer.',
      });
    }
  });

  app.post('/api/promptcourt/gui-runs/:runId/complete', jsonParser, (req, res) => {
    try {
      const run = runtime.completeQuiz(req.params.runId);
      res.json({ ok: true, run });
    } catch (error) {
      res.status(error?.status || 500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Karen could not complete the quiz.',
      });
    }
  });

  app.post('/api/promptcourt/gui-runs/:runId/abandon', jsonParser, (req, res) => {
    const run = runtime.abandonQuiz(req.params.runId, { reason: typeof req.body?.reason === 'string' ? req.body.reason : 'closed' });
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
