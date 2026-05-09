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

export const createPromptCourtCloudSync = ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  loadEnvFiles = true,
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
      throw new Error(`Convex ingest failed with ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
    }
    return { ok: true };
  };

  const fire = (payload) => {
    void send(payload).catch((error) => {
      if (truthy(resolvedEnv.KAREN_CLOUD_DEBUG)) {
        console.error('[promptcourt] cloud sync failed:', error?.message ?? error);
      }
    });
  };

  return {
    enabled: Boolean(enabled),
    send,
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
