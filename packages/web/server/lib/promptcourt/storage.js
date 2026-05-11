import fs from 'node:fs';
import path from 'node:path';

import { createPromptCourtCloudSync } from './cloud.js';
import { getPromptCourtPrivacyPolicy, redactPublicText, sanitizePublicPost } from './privacy.js';

const DEFAULT_USERNAME = 'local-user';

const emptyState = () => ({
  version: 1,
  users: {
    [DEFAULT_USERNAME]: {
      username: DEFAULT_USERNAME,
      displayName: 'Local User',
      createdAt: Date.now(),
    },
  },
  sessions: [],
  publicPosts: [],
  runEvents: [],
  rewards: {},
});

const ensureDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const safeRead = (targetPath) => {
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        ...emptyState(),
        ...parsed,
        users: parsed.users && typeof parsed.users === 'object' ? parsed.users : emptyState().users,
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        publicPosts: Array.isArray(parsed.publicPosts) ? parsed.publicPosts : [],
        runEvents: Array.isArray(parsed.runEvents) ? parsed.runEvents : [],
        rewards: parsed.rewards && typeof parsed.rewards === 'object' ? parsed.rewards : {},
      };
    }
  } catch {
  }
  return emptyState();
};

const atomicWrite = (targetPath, value) => {
  ensureDir(targetPath);
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
  fs.renameSync(tmpPath, targetPath);
};

const mutateLocks = new Map();
const acquirePathLock = (targetPath) => {
  const previous = mutateLocks.get(targetPath) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  mutateLocks.set(targetPath, previous.then(() => next));
  return { previous, release };
};

const normalizeUsername = (value) => {
  const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const normalized = username.replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return normalized || DEFAULT_USERNAME;
};

const average = (values) => {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const computeProfile = (state, username) => {
  const user = state.users[username] ?? {
    username,
    displayName: username,
    createdAt: Date.now(),
  };
  const sessions = state.sessions.filter((session) => session.username === username);
  const promptScores = sessions
    .map((session) => Number(session.promptScore))
    .filter((score) => Number.isFinite(score));
  const quizSessions = sessions.filter((session) => typeof session.quizPassed === 'boolean');
  const passedQuizCount = quizSessions.filter((session) => session.quizPassed).length;
  const successfulSessions = sessions.filter((session) => session.status === 'executed_quiz_passed').length;
  const rollbackCount = sessions.filter((session) => session.rollbackTriggered).length;
  const promotedCount = sessions.filter((session) => session.status === 'executed_quiz_passed').length;
  const generatedFileCount = new Set(sessions.flatMap((session) => Array.isArray(session.changedFiles) ? session.changedFiles : [])).size;
  const publicFailureCount = state.publicPosts.filter((post) => (
    post.username === username && (post.type === 'bad_prompt' || post.type === 'quiz_failed')
  )).length;

  let currentStreak = 0;
  let longestStreak = 0;
  for (const session of sessions) {
    if (session.status === 'executed_quiz_passed' || session.status === 'approved_pending_quiz') {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else if (session.status === 'blocked_bad_prompt' || session.status === 'executed_quiz_failed_rolled_back') {
      currentStreak = 0;
    }
  }

  const averagePromptScore = average(promptScores);
  const quizPassRate = quizSessions.length > 0 ? Math.round((passedQuizCount / quizSessions.length) * 100) : 0;
  const successfulSessionRate = sessions.length > 0 ? Math.round((successfulSessions / sessions.length) * 100) : 0;
  const grannySkips = Math.floor(currentStreak / 3);
  const lifetimeGrannySkips = Math.floor(longestStreak / 3);
  const disciplineScore = Math.max(0, Math.min(100, Math.round(
    averagePromptScore * 0.35
    + quizPassRate * 0.30
    + successfulSessionRate * 0.20
    + Math.min(longestStreak * 2, 10)
    - Math.min(rollbackCount * 2, 10)
  )));

  return {
    user,
    stats: {
      disciplineScore,
      level: levelForScore(disciplineScore),
      averagePromptScore,
      quizPassRate,
      currentStreak,
      longestStreak,
      grannySkips,
      lifetimeGrannySkips,
      rollbackCount,
      publicFailureCount,
      perfectRuns: sessions.filter((session) => Number(session.promptScore) >= 85 && session.quizPassed === true).length,
      totalSessions: sessions.length,
      blockedPrompts: sessions.filter((session) => session.status === 'blocked_bad_prompt').length,
      promotedRuns: promotedCount,
      generatedFileCount,
    },
    rewards: rewardListForProfile({ disciplineScore, longestStreak, rollbackCount, publicFailureCount, promptScores, quizPassRate, promotedCount, generatedFileCount, lifetimeGrannySkips }),
    recentSessions: sessions.slice(-20).reverse(),
    publicPosts: state.publicPosts.filter((post) => post.username === username).slice(-20).reverse(),
  };
};

const RUN_EVENT_LIMIT = 250;

const appendRunEvent = (state, {
  sessionId,
  username,
  status,
  label,
  details,
}) => {
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    username: normalizeUsername(username),
    status,
    label,
    details,
    createdAt: Date.now(),
  };
  state.runEvents.push(event);
  if (state.runEvents.length > RUN_EVENT_LIMIT) {
    state.runEvents.splice(0, state.runEvents.length - RUN_EVENT_LIMIT);
  }
  return event;
};

const levelForScore = (score) => {
  if (score >= 95) return 'Diff Whisperer';
  if (score >= 85) return 'Agent Handler';
  if (score >= 70) return 'Competent Operator';
  if (score >= 50) return 'Recovering Vibes Coder';
  if (score >= 30) return 'On Probation';
  return 'Prompt Menace';
};

const rewardListForProfile = ({ disciplineScore, longestStreak, rollbackCount, publicFailureCount, promptScores, quizPassRate, promotedCount, generatedFileCount, lifetimeGrannySkips = 0 }) => {
  const rewards = [];
  if (promptScores.length > 0) rewards.push({ id: 'first-verdict', label: 'First Verdict', tone: 'good' });
  if (promptScores.some((score) => score >= 85)) rewards.push({ id: 'criteria-enjoyer', label: 'Criteria Enjoyer', tone: 'good' });
  if (lifetimeGrannySkips >= 1) rewards.push({ id: 'granny-skip', label: 'Granny Skip Earned', tone: 'good' });
  if (longestStreak >= 5) rewards.push({ id: 'five-clean-runs', label: 'Five Clean Runs', tone: 'good' });
  if (quizPassRate >= 80) rewards.push({ id: 'can-explain-diff', label: 'Can Explain The Diff', tone: 'good' });
  if (disciplineScore >= 85) rewards.push({ id: 'agent-handler', label: 'Agent Handler', tone: 'good' });
  if (promotedCount >= 3) rewards.push({ id: 'patch-promoter', label: 'Patch Promoter', tone: 'good' });
  if (generatedFileCount >= 10) rewards.push({ id: 'wide-diff-survivor', label: 'Wide Diff Survivor', tone: 'good' });
  if (rollbackCount > 0) rewards.push({ id: 'rollback-recipient', label: 'Rollback Recipient', tone: 'bad' });
  if (publicFailureCount > 0) rewards.push({ id: 'publicly-blocked', label: 'Publicly Blocked', tone: 'bad' });
  return rewards;
};

export const createPromptCourtStore = ({
  openchamberDataDir,
  cloudSync = createPromptCourtCloudSync(),
  privacyPolicy = getPromptCourtPrivacyPolicy(),
}) => {
  const statePath = path.join(openchamberDataDir, 'promptcourt.json');

  const mutate = (fn) => {
    const { release } = acquirePathLock(statePath);
    try {
      const state = safeRead(statePath);
      const result = fn(state);
      atomicWrite(statePath, state);
      return result;
    } finally {
      release();
    }
  };

  const read = () => safeRead(statePath);

  return {
    normalizeUsername,
    recordBlockedPrompt({ username, prompt, evaluation, publicPost }) {
      const result = mutate((state) => {
        const normalized = normalizeUsername(username);
        state.users[normalized] ??= {
          username: normalized,
          displayName: normalized,
          createdAt: Date.now(),
        };
        const redactedReasons = Array.isArray(evaluation.reasons)
          ? evaluation.reasons.map((reason) => redactPublicText(reason, 240, { policy: privacyPolicy }))
          : [];
        const session = {
          id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          username: normalized,
          status: 'blocked_bad_prompt',
          prompt: redactPublicText(prompt, 1200, { policy: privacyPolicy }),
          promptScore: evaluation.score,
          verdict: evaluation.verdict,
          reasons: redactedReasons,
          createdAt: Date.now(),
        };
        state.sessions.push(session);
        appendRunEvent(state, {
          sessionId: session.id,
          username: normalized,
          status: 'blocked',
          label: `Blocked ${evaluation.score}/100 prompt`,
          details: redactedReasons.slice(0, 4).join(' · '),
        });
        const post = sanitizePublicPost({
          id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          sessionId: session.id,
          username: normalized,
          type: 'bad_prompt',
          createdAt: Date.now(),
          ...publicPost,
        }, { policy: privacyPolicy });
        if (post) state.publicPosts.push(post);
        return { session, post };
      });
      cloudSync.recordBlockedPrompt?.(result);
      if (cloudSync.enabled) {
        mutate((state) => appendRunEvent(state, {
          sessionId: result.session.id,
          username: result.session.username,
          status: 'synced',
          label: 'Blocked prompt mirrored to Convex.',
          details: result.post?.title,
        }));
      }
      return result;
    },
    recordApprovedPrompt({ username, prompt, evaluation, sessionId }) {
      const session = mutate((state) => {
        const normalized = normalizeUsername(username);
        state.users[normalized] ??= {
          username: normalized,
          displayName: normalized,
          createdAt: Date.now(),
        };
        const redactedReasons = Array.isArray(evaluation.reasons)
          ? evaluation.reasons.map((reason) => redactPublicText(reason, 240, { policy: privacyPolicy }))
          : [];
        const session = {
          id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          opencodeSessionId: sessionId,
          username: normalized,
          status: 'approved_pending_quiz',
          prompt: redactPublicText(prompt, 1200, { policy: privacyPolicy }),
          promptScore: evaluation.score,
          verdict: evaluation.verdict,
          reasons: redactedReasons,
          quizPassed: null,
          rollbackTriggered: false,
          createdAt: Date.now(),
        };
        state.sessions.push(session);
        appendRunEvent(state, {
          sessionId: session.id,
          username: normalized,
          status: 'running',
          label: 'Prompt approved. Karen is running the agent.',
          details: `${evaluation.score}/100 prompt score`,
        });
        return session;
      });
      cloudSync.recordApprovedPrompt?.({ session });
      if (cloudSync.enabled) {
        mutate((state) => appendRunEvent(state, {
          sessionId: session.id,
          username: session.username,
          status: 'synced',
          label: 'Approved run mirrored to Convex.',
          details: session.status,
        }));
      }
      return session;
    },
    recordQuizResult({ sessionId, quizPassed, rollbackTriggered = false, changedFiles = [], publicPost = null }) {
      const result = mutate((state) => {
        const session = state.sessions.find((entry) => entry.id === sessionId || entry.opencodeSessionId === sessionId);
        if (!session) return null;
        session.quizPassed = quizPassed;
        session.rollbackTriggered = rollbackTriggered;
        session.changedFiles = Array.isArray(changedFiles) ? changedFiles.slice(0, 50) : [];
        session.status = quizPassed ? 'executed_quiz_passed' : 'executed_quiz_failed_rolled_back';
        session.completedAt = Date.now();
        appendRunEvent(state, {
          sessionId: session.id,
          username: session.username,
          status: quizPassed ? 'quiz_passed' : 'rollback',
          label: quizPassed ? 'Quiz passed. Patch is eligible for promotion.' : 'Quiz failed. Generated code was reset.',
          details: session.changedFiles.length > 0 ? session.changedFiles.slice(0, 4).join(', ') : 'No changed files recorded',
        });
        let post = null;
        if (publicPost) {
          post = sanitizePublicPost({
            id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            sessionId: session.id,
            username: session.username,
            type: 'quiz_failed',
            createdAt: Date.now(),
            ...publicPost,
          }, { policy: privacyPolicy });
          if (post) state.publicPosts.push(post);
        }
        return { session, post };
      });
      if (!result) return null;
      cloudSync.recordQuizResult?.(result);
      if (cloudSync.enabled) {
        mutate((state) => appendRunEvent(state, {
          sessionId: result.session.id,
          username: result.session.username,
          status: 'synced',
          label: 'Quiz result mirrored to Convex.',
          details: result.session.status,
        }));
      }
      return result.session;
    },
    recordRunEvent(event) {
      return mutate((state) => appendRunEvent(state, event));
    },
    getRunEvents({ username = null, sinceId = null, limit = 50 } = {}) {
      const state = read();
      const normalized = username ? normalizeUsername(username) : null;
      let events = state.runEvents;
      if (normalized) {
        events = events.filter((event) => event.username === normalized);
      }
      if (sinceId) {
        const index = events.findIndex((event) => event.id === sinceId);
        if (index >= 0) {
          events = events.slice(index + 1);
        }
      }
      return events.slice(-Math.max(1, Math.min(100, limit)));
    },
    cleanupDevRecords({ mode = 'smoke' } = {}) {
      return mutate((state) => {
        const before = {
          sessions: state.sessions.length,
          publicPosts: state.publicPosts.length,
          runEvents: state.runEvents.length,
          users: Object.keys(state.users).length,
        };
        if (mode === 'all') {
          const next = emptyState();
          state.users = next.users;
          state.sessions = next.sessions;
          state.publicPosts = next.publicPosts;
          state.runEvents = next.runEvents;
          state.rewards = next.rewards;
        } else {
          const smokeUsernames = new Set(['sync-smoke', 'server-sync', 'smoke', 'test', 'route-tester']);
          const smokeText = (value) => /\b(smoke|test|fix it|can you help me|^hi$|^exit$)\b/i.test(String(value ?? '').trim());
          state.sessions = state.sessions.filter((session) => (
            !smokeUsernames.has(session.username)
            && !smokeText(session.prompt)
            && !String(session.id ?? '').includes('smoke')
          ));
          const sessionIds = new Set(state.sessions.map((session) => session.id));
          state.publicPosts = state.publicPosts.filter((post) => (
            sessionIds.has(post.sessionId)
            && !smokeUsernames.has(post.username)
            && !smokeText(post.promptExcerpt)
          ));
          state.runEvents = state.runEvents.filter((event) => (
            !smokeUsernames.has(event.username)
            && (!event.sessionId || sessionIds.has(event.sessionId))
          ));
          for (const username of Object.keys(state.users)) {
            if (username !== DEFAULT_USERNAME && smokeUsernames.has(username)) {
              delete state.users[username];
            }
          }
        }
        return {
          before,
          after: {
            sessions: state.sessions.length,
            publicPosts: state.publicPosts.length,
            runEvents: state.runEvents.length,
            users: Object.keys(state.users).length,
          },
        };
      });
    },
    getFeed(limit = 50) {
      const state = read();
      return state.publicPosts.slice(-limit).reverse();
    },
    getProfile(username) {
      const normalized = normalizeUsername(username);
      return computeProfile(read(), normalized);
    },
    getOverview() {
      const state = read();
      const usernames = Object.keys(state.users);
      const profiles = usernames.map((username) => computeProfile(state, username));
      return {
        users: profiles,
        leaderboard: profiles
          .slice()
          .sort((left, right) => (
            right.stats.disciplineScore - left.stats.disciplineScore
            || right.stats.longestStreak - left.stats.longestStreak
            || right.stats.perfectRuns - left.stats.perfectRuns
          ))
          .slice(0, 25),
        totals: {
          users: profiles.length,
          sessions: state.sessions.length,
          publicFailures: state.publicPosts.length,
          promotedRuns: state.sessions.filter((session) => session.status === 'executed_quiz_passed').length,
        },
        feed: state.publicPosts.slice(-20).reverse(),
      };
    },
  };
};
