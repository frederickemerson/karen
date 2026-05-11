import path from 'node:path';
import { MONOREPO_ROOT, parseEnvFile } from '../monorepo-root-env.js';
import { getPromptCourtPrivacyPolicy, redactPublicText, sanitizePublicPost, shouldSyncPromptCourtCloud } from './privacy.js';

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

const loadLocalEnv = (env) => ({
  ...parseEnvFile(path.join(MONOREPO_ROOT, '.env')),
  ...parseEnvFile(path.join(MONOREPO_ROOT, '.env.local')),
  ...env,
});

const normalizeBaseUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
};

const publicPostPayload = (post, policy) => {
  const safePost = sanitizePublicPost(post, { policy });
  if (!safePost) return null;
  return {
    localPostId: safePost.id,
    type: safePost.type,
    title: safePost.title,
    score: Number.isFinite(Number(safePost.score)) ? Number(safePost.score) : undefined,
    promptExcerpt: safePost.promptExcerpt,
    failureReasons: Array.isArray(safePost.failureReasons) ? safePost.failureReasons.slice(0, 10) : [],
    suggestedRewrite: safePost.suggestedRewrite,
    createdAt: Number.isFinite(Number(safePost.createdAt)) ? Number(safePost.createdAt) : Date.now(),
  };
};

const sessionPayload = (session, policy) => ({
  localSessionId: session.id,
  opencodeSessionId: session.opencodeSessionId,
  username: session.username,
  status: session.status,
  prompt: redactPublicText(session.prompt, 1200, { policy }),
  promptScore: Number.isFinite(Number(session.promptScore)) ? Number(session.promptScore) : 0,
  quizPassed: typeof session.quizPassed === 'boolean' ? session.quizPassed : undefined,
  rollbackTriggered: Boolean(session.rollbackTriggered),
  changedFiles: Array.isArray(session.changedFiles) ? session.changedFiles.slice(0, 50).map((file) => redactPublicText(file, 240, { policy })) : [],
  reasons: Array.isArray(session.reasons) ? session.reasons.slice(0, 10).map((reason) => redactPublicText(reason, 240, { policy })) : [],
  createdAt: Number.isFinite(Number(session.createdAt)) ? Number(session.createdAt) : Date.now(),
  completedAt: Number.isFinite(Number(session.completedAt)) ? Number(session.completedAt) : undefined,
});

const QUEUE_CAP = 1000;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 60000;

const isRetryableError = (error) => {
  const status = Number(error?.status);
  if (Number.isFinite(status)) {
    // 5xx and 429 retryable; 4xx (other than 429) is non-retryable.
    return status >= 500 || status === 429;
  }
  // Network / fetch failures (no status) are retryable.
  return true;
};

export const createPromptCourtCloudSync = ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  loadEnvFiles = true,
  setTimeoutImpl = setTimeout,
} = {}) => {
  const resolvedEnv = loadEnvFiles ? loadLocalEnv(env) : env;
  const privacyPolicy = getPromptCourtPrivacyPolicy(resolvedEnv);
  const endpoint = normalizeBaseUrl(
    resolvedEnv.CONVEX_HTTP_ACTIONS_URL
    || resolvedEnv.VITE_CONVEX_HTTP_ACTIONS_URL
    || resolvedEnv.CONVEX_SITE_URL
    || resolvedEnv.VITE_CONVEX_SITE_URL,
  );
  const enabled = shouldSyncPromptCourtCloud(resolvedEnv) && truthy(resolvedEnv.KAREN_CLOUD_SYNC) && endpoint && typeof fetchImpl === 'function';
  const ingestSecret = typeof resolvedEnv.KAREN_CLOUD_INGEST_SECRET === 'string' ? resolvedEnv.KAREN_CLOUD_INGEST_SECRET.trim() : '';
  const debug = truthy(resolvedEnv.KAREN_CLOUD_DEBUG);

  const send = async (payload) => {
    if (!enabled) return { ok: false, skipped: true };
    const headers = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (ingestSecret) {
      headers.authorization = `Bearer ${ingestSecret}`;
    }

    const response = await fetchImpl(`${endpoint}/karen/ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(`Convex ingest failed with ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
      error.status = response.status;
      throw error;
    }
    return { ok: true };
  };

  // In-process retry queue. Scope is intentionally in-memory only — events that
  // matter for billing/audit must already be persisted by storage.js before
  // landing here; this queue exists only to smooth Convex outages.
  const queue = [];
  let eventCounter = 0;
  let draining = false;
  let backoffMs = BACKOFF_START_MS;
  let pendingFlush = null;
  let scheduledTimer = null;

  const enqueue = (payload) => {
    if (queue.length >= QUEUE_CAP) {
      const dropped = queue.shift();
      console.warn(`[promptcourt] cloud_sync_dropped queue cap reached, evicting oldest event ${dropped?.eventId}`);
    }
    eventCounter += 1;
    const eventId = `pc_cloud_${Date.now()}_${eventCounter}`;
    queue.push({ eventId, payload });
    return eventId;
  };

  const scheduleDrain = (delayMs = 0) => {
    if (scheduledTimer || draining) return;
    scheduledTimer = setTimeoutImpl(() => {
      scheduledTimer = null;
      void drain();
    }, delayMs);
    // Don't keep the event loop alive just for the retry timer.
    if (scheduledTimer && typeof scheduledTimer.unref === 'function') {
      scheduledTimer.unref();
    }
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    let retryAfterMs = null;
    try {
      while (queue.length > 0) {
        const head = queue[0];
        try {
          // eslint-disable-next-line no-await-in-loop
          await send(head.payload);
          queue.shift();
          backoffMs = BACKOFF_START_MS;
        } catch (error) {
          if (!isRetryableError(error)) {
            console.warn(`[promptcourt] cloud_sync_dropped non-retryable error for event ${head.eventId}: ${error?.message ?? error}`);
            queue.shift();
            backoffMs = BACKOFF_START_MS;
            continue;
          }
          if (debug) {
            console.error(`[promptcourt] cloud sync retry for event ${head.eventId}: ${error?.message ?? error} (backoff ${backoffMs}ms)`);
          }
          retryAfterMs = backoffMs;
          backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
          break;
        }
      }
    } finally {
      draining = false;
      if (retryAfterMs !== null && queue.length > 0) {
        scheduleDrain(retryAfterMs);
      }
      if (pendingFlush && queue.length === 0) {
        const { resolve } = pendingFlush;
        pendingFlush = null;
        resolve();
      }
    }
  };

  const fire = (payload) => {
    if (!enabled) return null;
    const eventId = enqueue(payload);
    scheduleDrain(0);
    return eventId;
  };

  const getPendingCount = () => queue.length;

  const flushNow = () => {
    if (queue.length === 0) return Promise.resolve();
    if (pendingFlush) return pendingFlush.promise;
    let resolveFn;
    const promise = new Promise((resolve) => { resolveFn = resolve; });
    pendingFlush = { promise, resolve: resolveFn };
    // Cancel any scheduled backoff timer and try immediately.
    if (scheduledTimer) {
      clearTimeout(scheduledTimer);
      scheduledTimer = null;
    }
    backoffMs = BACKOFF_START_MS;
    scheduleDrain(0);
    return promise;
  };

  return {
    enabled: Boolean(enabled),
    send,
    getPendingCount,
    flushNow,
    recordBlockedPrompt({ session, post }) {
      fire({ kind: 'blocked_prompt', session: sessionPayload(session, privacyPolicy), publicPost: publicPostPayload(post, privacyPolicy) });
    },
    recordApprovedPrompt({ session }) {
      fire({ kind: 'approved_prompt', session: sessionPayload(session, privacyPolicy) });
    },
    recordQuizResult({ session, post }) {
      fire({ kind: 'quiz_result', session: sessionPayload(session, privacyPolicy), publicPost: publicPostPayload(post, privacyPolicy) });
    },
  };
};
