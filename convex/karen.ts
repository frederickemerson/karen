import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';

const normalizeUsername = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'local-user';
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined),
) as T;

const ensureLocalUser = async (ctx: any, usernameValue: string) => {
  const username = normalizeUsername(usernameValue);
  const existing = await ctx.db
    .query('users')
    .withIndex('by_username', (q: any) => q.eq('username', username))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { updatedAt: now });
    return existing._id;
  }

  return ctx.db.insert('users', {
    clerkUserId: `local:${username}`,
    username,
    displayName: username,
    createdAt: now,
    updatedAt: now,
  });
};

const adminSubjects = () => String(process.env.KAREN_ADMIN_USER_IDS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const requireAdmin = async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  const allowed = adminSubjects();
  if (!identity || (allowed.length > 0 && !allowed.includes(identity.subject))) {
    throw new Error('Admin access required');
  }
  return identity;
};

const levelForScore = (score: number) => {
  if (score >= 95) return 'Diff Whisperer';
  if (score >= 85) return 'Agent Handler';
  if (score >= 70) return 'Competent Operator';
  if (score >= 50) return 'Recovering Vibes Coder';
  if (score >= 30) return 'On Probation';
  return 'Prompt Menace';
};

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const rewardListForProfile = ({
  disciplineScore,
  longestStreak,
  rollbackCount,
  publicFailureCount,
  promptScores,
  quizPassRate,
  promotedCount,
  generatedFileCount,
}: {
  disciplineScore: number;
  longestStreak: number;
  rollbackCount: number;
  publicFailureCount: number;
  promptScores: number[];
  quizPassRate: number;
  promotedCount: number;
  generatedFileCount: number;
}) => {
  const rewards = [];
  if (promptScores.length > 0) rewards.push({ id: 'first-verdict', label: 'First Verdict', tone: 'good' });
  if (promptScores.some((score) => score >= 85)) rewards.push({ id: 'criteria-enjoyer', label: 'Criteria Enjoyer', tone: 'good' });
  if (longestStreak >= 5) rewards.push({ id: 'five-clean-runs', label: 'Five Clean Runs', tone: 'good' });
  if (quizPassRate >= 80) rewards.push({ id: 'can-explain-diff', label: 'Can Explain The Diff', tone: 'good' });
  if (disciplineScore >= 85) rewards.push({ id: 'agent-handler', label: 'Agent Handler', tone: 'good' });
  if (promotedCount >= 3) rewards.push({ id: 'patch-promoter', label: 'Patch Promoter', tone: 'good' });
  if (generatedFileCount >= 10) rewards.push({ id: 'wide-diff-survivor', label: 'Wide Diff Survivor', tone: 'good' });
  if (rollbackCount > 0) rewards.push({ id: 'rollback-recipient', label: 'Rollback Recipient', tone: 'bad' });
  if (publicFailureCount > 0) rewards.push({ id: 'publicly-blocked', label: 'Publicly Blocked', tone: 'bad' });
  return rewards;
};

const publicPostView = (post: any) => ({
  id: post._id,
  username: post.username,
  type: post.type,
  title: post.title,
  score: post.score,
  promptExcerpt: post.promptExcerpt,
  failureReasons: post.failureReasons,
  suggestedRewrite: post.suggestedRewrite,
  createdAt: post.createdAt,
});

const sessionView = (session: any) => ({
  id: session.localSessionId || session.opencodeSessionId || session._id,
  status: session.status,
  promptScore: session.promptScore,
  prompt: session.prompt,
  reasons: session.reasons,
  quizPassed: session.quizPassed,
  rollbackTriggered: session.rollbackTriggered,
  changedFiles: session.changedFiles,
  createdAt: session.createdAt,
  completedAt: session.completedAt,
});

const computeProfile = (user: any, sessions: any[], publicPosts: any[]) => {
  const promptScores = sessions
    .map((session) => Number(session.promptScore))
    .filter((score) => Number.isFinite(score));
  const quizSessions = sessions.filter((session) => typeof session.quizPassed === 'boolean');
  const passedQuizCount = quizSessions.filter((session) => session.quizPassed).length;
  const successfulSessions = sessions.filter((session) => session.status === 'executed_quiz_passed').length;
  const rollbackCount = sessions.filter((session) => session.rollbackTriggered).length;
  const promotedCount = successfulSessions;
  const generatedFileCount = new Set(sessions.flatMap((session) => Array.isArray(session.changedFiles) ? session.changedFiles : [])).size;
  const publicFailureCount = publicPosts.filter((post) => post.type === 'bad_prompt' || post.type === 'quiz_failed').length;

  let currentStreak = 0;
  let longestStreak = 0;
  for (const session of [...sessions].sort((left, right) => left.createdAt - right.createdAt)) {
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
  const disciplineScore = Math.max(0, Math.min(100, Math.round(
    averagePromptScore * 0.35
    + quizPassRate * 0.30
    + successfulSessionRate * 0.20
    + Math.min(longestStreak * 2, 10)
    - Math.min(rollbackCount * 2, 10),
  )));

  return {
    user: {
      username: user.username,
      displayName: user.displayName,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
    },
    stats: {
      disciplineScore,
      level: levelForScore(disciplineScore),
      averagePromptScore,
      quizPassRate,
      currentStreak,
      longestStreak,
      rollbackCount,
      publicFailureCount,
      perfectRuns: sessions.filter((session) => Number(session.promptScore) >= 85 && session.quizPassed === true).length,
      totalSessions: sessions.length,
      blockedPrompts: sessions.filter((session) => session.status === 'blocked_bad_prompt').length,
      promotedRuns: promotedCount,
      generatedFileCount,
    },
    rewards: rewardListForProfile({ disciplineScore, longestStreak, rollbackCount, publicFailureCount, promptScores, quizPassRate, promotedCount, generatedFileCount }),
    recentSessions: [...sessions].sort((left, right) => right.createdAt - left.createdAt).slice(0, 20).map(sessionView),
    publicPosts: [...publicPosts].sort((left, right) => right.createdAt - left.createdAt).slice(0, 20).map(publicPostView),
  };
};

const publicPostValidator = v.object({
  localPostId: v.optional(v.string()),
  type: v.string(),
  title: v.string(),
  score: v.optional(v.number()),
  promptExcerpt: v.optional(v.string()),
  failureReasons: v.array(v.string()),
  suggestedRewrite: v.optional(v.string()),
  createdAt: v.number(),
});

const sessionValidator = v.object({
  localSessionId: v.optional(v.string()),
  opencodeSessionId: v.optional(v.string()),
  username: v.string(),
  status: v.string(),
  prompt: v.string(),
  promptScore: v.number(),
  quizPassed: v.optional(v.boolean()),
  rollbackTriggered: v.boolean(),
  changedFiles: v.array(v.string()),
  reasons: v.array(v.string()),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
});

const isSmokeRecord = (value: any) => {
  const username = String(value?.username ?? '').toLowerCase();
  const prompt = String(value?.prompt ?? value?.promptExcerpt ?? '').trim().toLowerCase();
  return ['sync-smoke', 'server-sync', 'smoke', 'test', 'route-tester', 'local-user'].includes(username)
    && /^(fix it|hi|exit|can you help me)?$/.test(prompt);
};

const cleanupDevRecords = async (ctx: any, mode: 'smoke' | 'all') => {
  const [sessions, posts, users, rewards] = await Promise.all([
    ctx.db.query('sessions').collect(),
    ctx.db.query('publicPosts').collect(),
    ctx.db.query('users').collect(),
    ctx.db.query('rewards').collect(),
  ]);
  const before = {
    sessions: sessions.length,
    publicPosts: posts.length,
    users: users.length,
    rewards: rewards.length,
  };

  const deletedSessionIds = new Set<string>();
  for (const session of sessions) {
    if (mode === 'all' || isSmokeRecord(session)) {
      deletedSessionIds.add(session._id);
      await ctx.db.delete(session._id);
    }
  }

  const deletedUserIds = new Set<string>();
  for (const post of posts) {
    if (mode === 'all' || deletedSessionIds.has(post.sessionId) || isSmokeRecord(post)) {
      await ctx.db.delete(post._id);
    }
  }

  for (const user of users) {
    if (mode === 'all' || isSmokeRecord(user)) {
      deletedUserIds.add(user._id);
      await ctx.db.delete(user._id);
    }
  }

  for (const reward of rewards) {
    if (mode === 'all' || deletedUserIds.has(reward.userId)) {
      await ctx.db.delete(reward._id);
    }
  }

  const [afterSessions, afterPosts, afterUsers, afterRewards] = await Promise.all([
    ctx.db.query('sessions').collect(),
    ctx.db.query('publicPosts').collect(),
    ctx.db.query('users').collect(),
    ctx.db.query('rewards').collect(),
  ]);

  return {
    before,
    after: {
      sessions: afterSessions.length,
      publicPosts: afterPosts.length,
      users: afterUsers.length,
      rewards: afterRewards.length,
    },
  };
};

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const [users, posts, sessions] = await Promise.all([
      ctx.db.query('users').collect(),
      ctx.db.query('publicPosts').order('desc').take(25),
      ctx.db.query('sessions').collect(),
    ]);

    const sessionsByUsername = new Map<string, any[]>();
    for (const session of sessions) {
      const group = sessionsByUsername.get(session.username) ?? [];
      group.push(session);
      sessionsByUsername.set(session.username, group);
    }
    const postsByUsername = new Map<string, any[]>();
    for (const post of posts) {
      const group = postsByUsername.get(post.username) ?? [];
      group.push(post);
      postsByUsername.set(post.username, group);
    }

    const profiles = users.map((user) => computeProfile(
      user,
      sessionsByUsername.get(user.username) ?? [],
      postsByUsername.get(user.username) ?? [],
    ));
    const leaderboard = profiles
      .slice()
      .sort((left, right) => (
        right.stats.disciplineScore - left.stats.disciplineScore
        || right.stats.longestStreak - left.stats.longestStreak
        || right.stats.perfectRuns - left.stats.perfectRuns
      ))
      .slice(0, 25);

    return {
      users: profiles,
      leaderboard,
      feed: posts.map(publicPostView),
      totals: {
        users: users.length,
        sessions: sessions.length,
        publicFailures: posts.length,
        promotedRuns: sessions.filter((session) => session.status === 'executed_quiz_passed').length,
      },
    };
  },
});

export const profile = query({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const username = normalizeUsername(args.username);
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', username))
      .first();

    if (!user) {
      return computeProfile({
        username,
        displayName: username,
        createdAt: Date.now(),
      }, [], []);
    }

    const [sessions, posts] = await Promise.all([
      ctx.db.query('sessions').withIndex('by_user', (q) => q.eq('userId', user._id)).collect(),
      ctx.db.query('publicPosts').withIndex('by_username', (q) => q.eq('username', username)).collect(),
    ]);
    return computeProfile(user, sessions, posts);
  },
});

export const upsertCurrentUser = mutation({
  args: {
    username: v.string(),
    displayName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error('Not authenticated');
    }

    const username = normalizeUsername(args.username);
    const now = Date.now();
    const existing = await ctx.db
      .query('users')
      .withIndex('by_clerk_user', (q) => q.eq('clerkUserId', identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, stripUndefined({
        username,
        displayName: args.displayName,
        imageUrl: args.imageUrl,
        updatedAt: now,
      }));
      return existing._id;
    }

    return ctx.db.insert('users', stripUndefined({
      clerkUserId: identity.subject,
      username,
      displayName: args.displayName,
      imageUrl: args.imageUrl,
      createdAt: now,
      updatedAt: now,
    }));
  },
});

export const adminCleanupDevRecords = mutation({
  args: {
    mode: v.union(v.literal('smoke'), v.literal('all')),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return cleanupDevRecords(ctx, args.mode);
  },
});

export const cleanupDevRecordsBySecret = internalMutation({
  args: {
    mode: v.union(v.literal('smoke'), v.literal('all')),
  },
  handler: async (ctx, args) => cleanupDevRecords(ctx, args.mode),
});

export const ingestEvent = internalMutation({
  args: {
    kind: v.union(v.literal('blocked_prompt'), v.literal('approved_prompt'), v.literal('quiz_result')),
    session: sessionValidator,
    publicPost: v.optional(publicPostValidator),
  },
  handler: async (ctx, args) => {
    const username = normalizeUsername(args.session.username);
    const userId = await ensureLocalUser(ctx, username);
    const now = Date.now();
    const localSessionId = args.session.localSessionId;
    const opencodeSessionId = args.session.opencodeSessionId;

    let session = localSessionId
      ? await ctx.db
        .query('sessions')
        .withIndex('by_local_session', (q) => q.eq('localSessionId', localSessionId))
        .unique()
      : null;

    if (!session && opencodeSessionId) {
      session = await ctx.db
        .query('sessions')
        .withIndex('by_opencode_session', (q) => q.eq('opencodeSessionId', opencodeSessionId))
        .first();
    }

    const patch = stripUndefined({
      userId,
      localSessionId,
      opencodeSessionId,
      username,
      status: args.session.status,
      prompt: args.session.prompt,
      promptScore: args.session.promptScore,
      quizPassed: args.session.quizPassed,
      rollbackTriggered: args.session.rollbackTriggered,
      changedFiles: args.session.changedFiles,
      reasons: args.session.reasons,
      createdAt: args.session.createdAt || now,
      completedAt: args.session.completedAt,
    });

    const sessionId = session
      ? (await ctx.db.patch(session._id, patch), session._id)
      : await ctx.db.insert('sessions', patch);

    if (args.publicPost) {
      await ctx.db.insert('publicPosts', {
        sessionId,
        userId,
        username,
        ...args.publicPost,
      });
    }

    return { ok: true, kind: args.kind, sessionId };
  },
});
