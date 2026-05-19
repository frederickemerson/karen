import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ---------------------------------------------------------------------------
// Device-link / scoreboard helpers
// ---------------------------------------------------------------------------

// Alphabet excludes I, O, 0, 1 to reduce read-aloud ambiguity.
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateUserCode = () => {
  const buffer = new Uint8Array(8);
  // Convex runtime exposes Web Crypto; fall back to Math.random if for some reason it is missing.
  const cryptoRef: any = (globalThis as any).crypto;
  if (cryptoRef?.getRandomValues) {
    cryptoRef.getRandomValues(buffer);
  } else {
    for (let i = 0; i < buffer.length; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < buffer.length; i += 1) {
    out += USER_CODE_ALPHABET[buffer[i] % USER_CODE_ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}`;
};

export const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const digest = await (globalThis as any).crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

export const timingSafeEqual = (a: string, b: string): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

const randomBase64UrlBytes = (byteLength: number): string => {
  const buffer = new Uint8Array(byteLength);
  const cryptoRef: any = (globalThis as any).crypto;
  if (cryptoRef?.getRandomValues) {
    cryptoRef.getRandomValues(buffer);
  } else {
    for (let i = 0; i < byteLength; i += 1) buffer[i] = Math.floor(Math.random() * 256);
  }
  let binary = '';
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const weekKeyFor = (ts: number): string => {
  // ISO 8601 week-numbering year + week. Returns 'YYYY-WNN'.
  const date = new Date(ts);
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week decides the year.
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

// Forward-declared; defined after computeProfile below.
let recomputeUserCachesImpl: ((ctx: any, userId: any) => Promise<void>) | null = null;
const recomputeUserCaches = async (ctx: any, userId: any) => {
  if (recomputeUserCachesImpl) await recomputeUserCachesImpl(ctx, userId);
};

const normalizeUsername = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'local-user';
};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const stripUndefined = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(
  Object.entries(value).filter(([, entry]) => entry !== undefined),
) as T;

const fallbackEventId = (parts: Array<string | number | undefined>) => {
  // FNV-1a 32-bit; sufficient for idempotency keys when client omits eventId.
  let hash = 0x811c9dc5;
  const input = parts.map((value) => String(value ?? '')).join('|');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return `auto-${hash.toString(16)}-${input.length}`;
};

const adminSubjects = () => String(process.env.KAREN_ADMIN_USER_IDS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const isAdminSubject = (subject: string | undefined) => {
  if (!subject) return false;
  const allowed = adminSubjects();
  return allowed.includes(subject);
};

const defaultUserRole = (clerkUserId: string) => isAdminSubject(clerkUserId) ? 'admin' : 'user';

const findLocalPlaceholderUser = async (ctx: any, username: string) => {
  const existing = await ctx.db
    .query('users')
    .withIndex('by_username', (q: any) => q.eq('username', username))
    .first();
  if (!existing) return null;
  return String(existing.clerkUserId || '').startsWith('local:') ? existing : null;
};

const redactionPatterns = [
  { name: 'openai_key', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { name: 'elevenlabs_key', pattern: /sk_[A-Za-z0-9]{20,}/g },
  { name: 'convex_deploy_key', pattern: /(?:prod|dev):[A-Za-z0-9-]+\|[A-Za-z0-9._=-]+/g },
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'github_token', pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/g },
  { name: 'generic_assignment', pattern: /\b[A-Z][A-Z0-9_]{8,}\s*=\s*["']?[^"'\s]{12,}["']?/g },
  { name: 'bearer_token', pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi },
];

const redactText = (value: string | undefined) => {
  if (!value) return { value, redacted: false, labels: [] as string[] };
  let next = value;
  const labels = new Set<string>();
  for (const item of redactionPatterns) {
    next = next.replace(item.pattern, () => {
      labels.add(item.name);
      return '[redacted]';
    });
  }
  return { value: next, redacted: labels.size > 0, labels: [...labels] };
};

const redactList = (values: string[]) => {
  const labels = new Set<string>();
  let redacted = false;
  const next = values.map((value) => {
    const result = redactText(value);
    if (result.redacted) {
      redacted = true;
      for (const label of result.labels) labels.add(label);
    }
    return result.value || '';
  });
  return { value: next, redacted, labels: [...labels] };
};

const visiblePost = (post: any) => (
  (post.visibility ?? 'public') === 'public'
  && (post.moderationStatus ?? 'visible') === 'visible'
);

const visibleSession = (session: any) => (
  (session.privacyMode ?? 'public') === 'public'
  && (session.moderationStatus ?? 'visible') === 'visible'
);

const visibleUser = (user: any) => (
  (user.status ?? 'active') === 'active'
  && (user.publicProfileEnabled ?? true) === true
);

const getOrgPolicy = async (ctx: any, orgId: string | undefined) => {
  const normalizedOrgId = normalizeOptionalString(orgId) ?? 'default';
  const settings = await ctx.db
    .query('orgSettings')
    .withIndex('by_org', (q: any) => q.eq('orgId', normalizedOrgId))
    .unique();
  return {
    orgId: normalizedOrgId,
    mode: settings?.mode ?? 'public',
    secretScanningEnabled: settings?.secretScanningEnabled ?? true,
    publicPostingEnabled: settings?.publicPostingEnabled ?? true,
    requireClerkForPublicProfiles: settings?.requireClerkForPublicProfiles ?? false,
    allowLocalUsersOnLeaderboard: settings?.allowLocalUsersOnLeaderboard ?? true,
    moderationMode: settings?.moderationMode ?? 'manual',
  };
};

const auditAdminAction = async (
  ctx: any,
  action: string,
  targetTable: string,
  targetId: string | undefined,
  actor: string,
  reason?: string,
  metadata?: any,
) => ctx.db.insert('adminAuditLog', stripUndefined({
  actor,
  action,
  targetTable,
  targetId,
  reason,
  metadata,
  createdAt: Date.now(),
}));

const ensureUser = async (ctx: any, input: {
  username: string;
  clerkUserId?: string;
  clerkOrgId?: string;
  displayName?: string;
  imageUrl?: string;
  email?: string;
  source?: 'clerk' | 'local_ingest' | 'http_ingest';
}) => {
  const username = normalizeUsername(input.username);
  const clerkUserId = normalizeOptionalString(input.clerkUserId);
  const now = Date.now();

  if (clerkUserId) {
    const existingByClerk = await ctx.db
      .query('users')
      .withIndex('by_clerk_user', (q: any) => q.eq('clerkUserId', clerkUserId))
      .unique();
    if (existingByClerk) {
      await ctx.db.patch(existingByClerk._id, stripUndefined({
        clerkOrgId: input.clerkOrgId,
        username,
        displayName: input.displayName,
        imageUrl: input.imageUrl,
        email: input.email,
        authProvider: 'clerk',
        role: existingByClerk.role ?? defaultUserRole(clerkUserId),
        status: existingByClerk.status ?? 'active',
        publicProfileEnabled: existingByClerk.publicProfileEnabled ?? true,
        source: input.source ?? 'clerk',
        firstSeenAt: existingByClerk.firstSeenAt ?? existingByClerk.createdAt ?? now,
        lastSeenAt: now,
        updatedAt: now,
      }));
      return existingByClerk._id;
    }

    // SECURITY: do not claim local placeholders. A fresh Clerk user gets a fresh users row
    // even if a `local:<username>` placeholder exists with the same normalized username.
    // Placeholders are wiped via the admin `wipe-placeholders` migration; until then we
    // pick a non-colliding username to avoid the `by_username` uniqueness conflict.
    const placeholder = await findLocalPlaceholderUser(ctx, username);
    let insertUsername = username;
    if (placeholder) {
      // Find a free variant: <username>-2, -3, etc. Bounded loop keeps mutation deterministic.
      for (let suffix = 2; suffix < 100; suffix += 1) {
        const candidate = normalizeUsername(`${username}-${suffix}`);
        const exists = await ctx.db
          .query('users')
          .withIndex('by_username', (q: any) => q.eq('username', candidate))
          .first();
        if (!exists) {
          insertUsername = candidate;
          break;
        }
      }
    }

    return ctx.db.insert('users', stripUndefined({
      clerkUserId,
      clerkOrgId: input.clerkOrgId,
      username: insertUsername,
      displayName: input.displayName ?? insertUsername,
      imageUrl: input.imageUrl,
      email: input.email,
      authProvider: 'clerk',
      role: defaultUserRole(clerkUserId),
      status: 'active',
      publicProfileEnabled: true,
      source: input.source ?? 'clerk',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    }));
  }

  const existing = await ctx.db
    .query('users')
    .withIndex('by_username', (q: any) => q.eq('username', username))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, stripUndefined({
      authProvider: existing.authProvider ?? 'local',
      role: existing.role ?? 'user',
      status: existing.status ?? 'active',
      publicProfileEnabled: existing.publicProfileEnabled ?? true,
      source: existing.source ?? input.source ?? 'local_ingest',
      firstSeenAt: existing.firstSeenAt ?? existing.createdAt ?? now,
      lastSeenAt: now,
      updatedAt: now,
    }));
    return existing._id;
  }

  return ctx.db.insert('users', {
    clerkUserId: `local:${username}`,
    username,
    displayName: input.displayName ?? username,
    authProvider: 'local',
    role: 'user',
    status: 'active',
    publicProfileEnabled: true,
    source: input.source ?? 'local_ingest',
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
};

const ensureLocalUser = async (ctx: any, usernameValue: string) => {
  const username = normalizeUsername(usernameValue);
  return ensureUser(ctx, { username, source: 'local_ingest' });
};

const identityUsername = (identity: any) => normalizeUsername(
  identity?.nickname
  || identity?.preferredUsername
  || identity?.username
  || identity?.name
  || String(identity?.email || '').split('@')[0]
  || identity?.subject
  || 'local-user',
);

const findUserByIdentity = async (ctx: any, identity: any) => {
  if (!identity?.subject) return null;
  return ctx.db
    .query('users')
    .withIndex('by_clerk_user', (q: any) => q.eq('clerkUserId', identity.subject))
    .unique();
};

const ensureUserFromIdentity = async (ctx: any, identity: any) => ensureUser(ctx, stripUndefined({
  clerkUserId: identity.subject,
  clerkOrgId: (identity as any).orgId,
  username: identityUsername(identity),
  displayName: (identity as any).name,
  imageUrl: (identity as any).pictureUrl,
  email: (identity as any).email,
  source: 'clerk' as const,
}));

const requireAdmin = async (ctx: any) => {
  const identity = await ctx.auth.getUserIdentity();
  const allowed = adminSubjects();
  if (!identity || allowed.length === 0 || !allowed.includes(identity.subject)) {
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
  lifetimeGrannySkips = 0,
}: {
  disciplineScore: number;
  longestStreak: number;
  rollbackCount: number;
  publicFailureCount: number;
  promptScores: number[];
  quizPassRate: number;
  promotedCount: number;
  generatedFileCount: number;
  lifetimeGrannySkips?: number;
}) => {
  const rewards: Array<{ id: string; label: string; tone: 'good' | 'bad' }> = [];
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

const publicPostView = (post: any) => ({
  id: post._id,
  username: post.username,
  type: post.type,
  title: post.title,
  score: post.score,
  promptExcerpt: post.promptExcerpt,
  failureReasons: post.failureReasons,
  suggestedRewrite: post.suggestedRewrite,
  visibility: post.visibility ?? 'public',
  moderationStatus: post.moderationStatus ?? 'visible',
  redactionSummary: post.redactionSummary,
  reportCount: post.reportCount ?? 0,
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
  privacyMode: session.privacyMode ?? 'public',
  moderationStatus: session.moderationStatus ?? 'visible',
  createdAt: session.createdAt,
  completedAt: session.completedAt,
});

const profileForUser = async (ctx: any, user: any) => {
  const [sessions, posts] = await Promise.all([
    ctx.db.query('sessions').withIndex('by_user', (q: any) => q.eq('userId', user._id)).take(200),
    ctx.db.query('publicPosts').withIndex('by_username', (q: any) => q.eq('username', user.username)).take(200),
  ]);
  return computeProfile(user, sessions, posts);
};

const emptyProfile = (usernameValue: string, overrides: Record<string, unknown> = {}) => {
  const username = normalizeUsername(usernameValue);
  return computeProfile({
    username,
    displayName: username,
    createdAt: Date.now(),
    ...overrides,
  }, [], []);
};

const computeProfile = (user: any, sessions: any[], publicPosts: any[]) => {
  const visibleSessions = sessions.filter(visibleSession);
  const visiblePosts = publicPosts.filter(visiblePost);
  const promptScores = visibleSessions
    .map((session) => Number(session.promptScore))
    .filter((score) => Number.isFinite(score));
  const quizSessions = visibleSessions.filter((session) => typeof session.quizPassed === 'boolean');
  const passedQuizCount = quizSessions.filter((session) => session.quizPassed).length;
  const successfulSessions = visibleSessions.filter((session) => session.status === 'executed_quiz_passed').length;
  const rollbackCount = visibleSessions.filter((session) => session.rollbackTriggered).length;
  const promotedCount = successfulSessions;
  const generatedFileCount = new Set(visibleSessions.flatMap((session) => Array.isArray(session.changedFiles) ? session.changedFiles : [])).size;
  const publicFailureCount = visiblePosts.filter((post) => post.type === 'bad_prompt' || post.type === 'quiz_failed').length;

  let currentStreak = 0;
  let longestStreak = 0;
  for (const session of [...visibleSessions].sort((left, right) => left.createdAt - right.createdAt)) {
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
    - Math.min(rollbackCount * 2, 10),
  )));

  return {
    user: {
      username: user.username,
      displayName: user.displayName,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt,
      status: user.status ?? 'active',
      publicProfileEnabled: user.publicProfileEnabled ?? true,
      source: user.source ?? 'local_ingest',
      authProvider: user.authProvider ?? (String(user.clerkUserId || '').startsWith('local:') ? 'local' : 'clerk'),
    },
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
      perfectRuns: visibleSessions.filter((session) => Number(session.promptScore) >= 85 && session.quizPassed === true).length,
      totalSessions: visibleSessions.length,
      blockedPrompts: visibleSessions.filter((session) => session.status === 'blocked_bad_prompt').length,
      promotedRuns: promotedCount,
      generatedFileCount,
    },
    rewards: rewardListForProfile({ disciplineScore, longestStreak, rollbackCount, publicFailureCount, promptScores, quizPassRate, promotedCount, generatedFileCount, lifetimeGrannySkips }),
    recentSessions: [...visibleSessions].sort((left, right) => right.createdAt - left.createdAt).slice(0, 20).map(sessionView),
    publicPosts: [...visiblePosts].sort((left, right) => right.createdAt - left.createdAt).slice(0, 20).map(publicPostView),
  };
};

// Recompute and persist the leaderboard caches on the users row after a write that affects
// this user. Reads at most 500 sessions and 500 public posts (capped) via the by_user_created
// and by_username_created indexes for cheap recent-window scans.
recomputeUserCachesImpl = async (ctx: any, userId: any) => {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const [sessions, posts] = await Promise.all([
    ctx.db.query('sessions')
      .withIndex('by_user_created', (q: any) => q.eq('userId', userId))
      .order('desc')
      .take(500),
    ctx.db.query('publicPosts')
      .withIndex('by_username_created', (q: any) => q.eq('username', (user as any).username))
      .order('desc')
      .take(500),
  ]);
  const profile = computeProfile(user, sessions, posts);
  const now = Date.now();
  const currentWeek = weekKeyFor(now);
  const weekStart = (() => {
    // Sunday-aligned 7-day window for the cached weeklyScore. We additionally key by ISO week.
    return now - 7 * 24 * 60 * 60 * 1000;
  })();
  const weekSessions = sessions.filter((s: any) => s.createdAt >= weekStart && visibleSession(s));
  const weekScores = weekSessions
    .map((s: any) => Number(s.promptScore))
    .filter((n: number) => Number.isFinite(n));
  const weeklyScore = weekScores.length === 0
    ? 0
    : Math.round(weekScores.reduce((sum: number, n: number) => sum + n, 0) / weekScores.length);

  await ctx.db.patch(userId, stripUndefined({
    disciplineScore: profile.stats.disciplineScore,
    currentStreak: profile.stats.currentStreak,
    longestStreak: profile.stats.longestStreak,
    weeklyScore,
    weeklySessions: weekSessions.length,
    weekKey: currentWeek,
    lastScoredAt: now,
    updatedAt: now,
  }));
};

const collectVisiblePublicPosts = async (ctx: any, limit = 50) => {
  const requestedLimit = Math.max(0, Math.min(100, Math.floor(limit)));
  if (requestedLimit === 0) return [];

  const posts = await ctx.db.query('publicPosts').take(500);

  return posts
    .filter(visiblePost)
    .sort((left: any, right: any) => right.createdAt - left.createdAt)
    .slice(0, requestedLimit);
};

const buildLeaderboard = async (ctx: any, limit = 25) => {
  const requestedLimit = Math.max(0, Math.min(100, Math.floor(limit)));
  if (requestedLimit === 0) return [];

  const [users, sessions, posts] = await Promise.all([
    ctx.db.query('users').take(500),
    ctx.db.query('sessions').take(500),
    ctx.db.query('publicPosts').take(500),
  ]);
  const defaultPolicy = await getOrgPolicy(ctx, 'default');
  const publicUsers = users.filter((user: any) => (
    visibleUser(user)
    && (defaultPolicy.allowLocalUsersOnLeaderboard || !String(user.clerkUserId || '').startsWith('local:'))
  ));

  const sessionsByUserId = new Map<string, any[]>();
  for (const session of sessions.filter(visibleSession)) {
    const key = String(session.userId);
    const group = sessionsByUserId.get(key) ?? [];
    group.push(session);
    sessionsByUserId.set(key, group);
  }

  const postsByUserId = new Map<string, any[]>();
  const postsByUsername = new Map<string, any[]>();
  for (const post of posts.filter(visiblePost)) {
    if (post.userId) {
      const key = String(post.userId);
      const group = postsByUserId.get(key) ?? [];
      group.push(post);
      postsByUserId.set(key, group);
    }
    const usernameGroup = postsByUsername.get(post.username) ?? [];
    usernameGroup.push(post);
    postsByUsername.set(post.username, usernameGroup);
  }

  return publicUsers
    .map((user: any) => computeProfile(
      user,
      sessionsByUserId.get(String(user._id)) ?? [],
      postsByUserId.get(String(user._id)) ?? postsByUsername.get(user.username) ?? [],
    ))
    .sort((left: any, right: any) => (
      right.stats.disciplineScore - left.stats.disciplineScore
      || right.stats.longestStreak - left.stats.longestStreak
      || right.stats.perfectRuns - left.stats.perfectRuns
    ))
    .slice(0, requestedLimit);
};

const publicPostValidator = v.object({
  localPostId: v.optional(v.string()),
  clerkUserId: v.optional(v.string()),
  clerkOrgId: v.optional(v.string()),
  type: v.string(),
  title: v.string(),
  score: v.optional(v.number()),
  promptExcerpt: v.optional(v.string()),
  failureReasons: v.array(v.string()),
  suggestedRewrite: v.optional(v.string()),
  visibility: v.optional(v.union(v.literal('public'), v.literal('private'), v.literal('local_only'))),
  createdAt: v.number(),
});

const sessionValidator = v.object({
  localSessionId: v.optional(v.string()),
  opencodeSessionId: v.optional(v.string()),
  clerkUserId: v.optional(v.string()),
  clerkOrgId: v.optional(v.string()),
  displayName: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  email: v.optional(v.string()),
  username: v.string(),
  status: v.string(),
  prompt: v.string(),
  promptScore: v.number(),
  quizPassed: v.optional(v.boolean()),
  rollbackTriggered: v.boolean(),
  changedFiles: v.array(v.string()),
  reasons: v.array(v.string()),
  privacyMode: v.optional(v.union(v.literal('public'), v.literal('private'), v.literal('local_only'))),
  source: v.optional(v.union(v.literal('terminal'), v.literal('gui'), v.literal('http_ingest'), v.literal('unknown'))),
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
  // Cleanup must enumerate all records (smoke filtering or mode==='all' wipe); .take() would skip rows.
  const [sessions, posts, users, rewards, audits] = await Promise.all([
    ctx.db.query('sessions').collect(),
    ctx.db.query('publicPosts').collect(),
    ctx.db.query('users').collect(),
    ctx.db.query('rewards').collect(),
    ctx.db.query('adminAuditLog').collect(),
  ]);
  const before = {
    sessions: sessions.length,
    publicPosts: posts.length,
    users: users.length,
    rewards: rewards.length,
    adminAuditLog: audits.length,
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

  if (mode === 'all') {
    for (const audit of audits) {
      await ctx.db.delete(audit._id);
    }
  }

  // Post-cleanup counts: enumerate remaining rows so the result accurately reports zero/leftover.
  const [afterSessions, afterPosts, afterUsers, afterRewards, afterAudits] = await Promise.all([
    ctx.db.query('sessions').collect(),
    ctx.db.query('publicPosts').collect(),
    ctx.db.query('users').collect(),
    ctx.db.query('rewards').collect(),
    ctx.db.query('adminAuditLog').collect(),
  ]);

  return {
    before,
    after: {
      sessions: afterSessions.length,
      publicPosts: afterPosts.length,
      users: afterUsers.length,
      rewards: afterRewards.length,
      adminAuditLog: afterAudits.length,
    },
  };
};

const moderatePublicPost = async (
  ctx: any,
  args: {
    postId: any;
    moderationStatus: 'visible' | 'hidden' | 'deleted';
    reason?: string;
    visibility?: 'public' | 'private' | 'local_only';
  },
  actor: string,
) => {
  const post = await ctx.db.get(args.postId);
  if (!post) throw new Error('Public post not found');
  const now = Date.now();
  await ctx.db.patch(args.postId, stripUndefined({
    moderationStatus: args.moderationStatus,
    visibility: args.visibility,
    hiddenReason: args.moderationStatus === 'visible' ? undefined : args.reason,
    moderatedAt: now,
    moderatedBy: actor,
  }));
  await auditAdminAction(ctx, 'moderate_public_post', 'publicPosts', String(args.postId), actor, args.reason, {
    username: post.username,
    moderationStatus: args.moderationStatus,
    visibility: args.visibility,
  });
  return { ok: true, postId: args.postId, moderationStatus: args.moderationStatus };
};

const moderateUser = async (
  ctx: any,
  args: {
    userId: any;
    status?: 'active' | 'suspended' | 'deleted';
    publicProfileEnabled?: boolean;
    reason?: string;
  },
  actor: string,
) => {
  const user = await ctx.db.get(args.userId);
  if (!user) throw new Error('User not found');
  const now = Date.now();
  await ctx.db.patch(args.userId, stripUndefined({
    status: args.status,
    publicProfileEnabled: args.publicProfileEnabled,
    moderatedAt: now,
    moderatedBy: actor,
    moderationReason: args.reason,
    updatedAt: now,
  }));

  if (args.status === 'suspended' || args.status === 'deleted' || args.publicProfileEnabled === false) {
    // Mutation: capped at 200 per user; further records moderated lazily on subsequent queries.
    const [sessions, posts] = await Promise.all([
      ctx.db.query('sessions').withIndex('by_user', (q: any) => q.eq('userId', args.userId)).take(200),
      ctx.db.query('publicPosts').withIndex('by_username', (q: any) => q.eq('username', user.username)).take(200),
    ]);
    for (const session of sessions) {
      await ctx.db.patch(session._id, {
        moderationStatus: args.status === 'deleted' ? 'deleted' : 'hidden',
        moderatedAt: now,
        moderatedBy: actor,
        moderationReason: args.reason,
      });
    }
    for (const post of posts) {
      await ctx.db.patch(post._id, {
        moderationStatus: args.status === 'deleted' ? 'deleted' : 'hidden',
        hiddenReason: args.reason,
        moderatedAt: now,
        moderatedBy: actor,
      });
    }
  }

  await auditAdminAction(ctx, 'moderate_user', 'users', String(args.userId), actor, args.reason, {
    username: user.username,
    status: args.status,
    publicProfileEnabled: args.publicProfileEnabled,
  });
  return { ok: true, userId: args.userId, status: args.status ?? user.status ?? 'active' };
};

const resetUserData = async (
  ctx: any,
  args: {
    userId: any;
    mode: 'activity' | 'profile';
    reason?: string;
  },
  actor: string,
) => {
  const user = await ctx.db.get(args.userId);
  if (!user) throw new Error('User not found');
  // Mutation needs every record for this user to fully delete — partial reset would leave orphans.
  const [sessions, posts, rewards] = await Promise.all([
    ctx.db.query('sessions').withIndex('by_user', (q: any) => q.eq('userId', args.userId)).collect(),
    ctx.db.query('publicPosts').withIndex('by_username', (q: any) => q.eq('username', user.username)).collect(),
    ctx.db.query('rewards').withIndex('by_user', (q: any) => q.eq('userId', args.userId)).collect(),
  ]);

  for (const session of sessions) await ctx.db.delete(session._id);
  for (const post of posts) await ctx.db.delete(post._id);
  for (const reward of rewards) await ctx.db.delete(reward._id);
  if (args.mode === 'profile') await ctx.db.delete(args.userId);

  await auditAdminAction(ctx, 'reset_user_data', 'users', String(args.userId), actor, args.reason, {
    username: user.username,
    mode: args.mode,
    deleted: { sessions: sessions.length, publicPosts: posts.length, rewards: rewards.length },
  });

  return {
    ok: true,
    userId: args.userId,
    deleted: { sessions: sessions.length, publicPosts: posts.length, rewards: rewards.length, profile: args.mode === 'profile' },
  };
};

const setOrgSettings = async (
  ctx: any,
  args: {
    orgId: string;
    mode: 'public' | 'private' | 'local_only';
    secretScanningEnabled: boolean;
    publicPostingEnabled: boolean;
    requireClerkForPublicProfiles?: boolean;
    allowLocalUsersOnLeaderboard?: boolean;
    moderationMode?: 'manual' | 'auto_hide_flagged';
  },
  actor: string,
) => {
  const existing = await ctx.db
    .query('orgSettings')
    .withIndex('by_org', (q: any) => q.eq('orgId', args.orgId))
    .unique();
  const patch = stripUndefined({
    orgId: args.orgId,
    mode: args.mode,
    secretScanningEnabled: args.secretScanningEnabled,
    publicPostingEnabled: args.publicPostingEnabled,
    requireClerkForPublicProfiles: args.requireClerkForPublicProfiles ?? false,
    allowLocalUsersOnLeaderboard: args.allowLocalUsersOnLeaderboard ?? true,
    moderationMode: args.moderationMode ?? 'manual',
    updatedBy: actor,
    updatedAt: Date.now(),
  });
  const id = existing ? (await ctx.db.patch(existing._id, patch), existing._id) : await ctx.db.insert('orgSettings', patch);
  await auditAdminAction(ctx, 'set_org_settings', 'orgSettings', String(id), actor, undefined, patch);
  return { ok: true, orgSettingsId: id };
};

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const [users, posts, sessions] = await Promise.all([
      ctx.db.query('users').take(500),
      collectVisiblePublicPosts(ctx, 25),
      ctx.db.query('sessions').take(500),
    ]);

    const defaultPolicy = await getOrgPolicy(ctx, 'default');
    const publicUsers = users.filter((user) => (
      visibleUser(user)
      && (defaultPolicy.allowLocalUsersOnLeaderboard || !String(user.clerkUserId || '').startsWith('local:'))
    ));
    const visibleSessions = sessions.filter(visibleSession);
    const visiblePosts = posts.filter(visiblePost);

    const sessionsByUserId = new Map<string, any[]>();
    const sessionsByUsername = new Map<string, any[]>();
    for (const session of visibleSessions) {
      const userIdGroup = sessionsByUserId.get(String(session.userId)) ?? [];
      userIdGroup.push(session);
      sessionsByUserId.set(String(session.userId), userIdGroup);

      const group = sessionsByUsername.get(session.username) ?? [];
      group.push(session);
      sessionsByUsername.set(session.username, group);
    }
    const postsByUserId = new Map<string, any[]>();
    const postsByUsername = new Map<string, any[]>();
    for (const post of visiblePosts) {
      if (post.userId) {
        const userIdGroup = postsByUserId.get(String(post.userId)) ?? [];
        userIdGroup.push(post);
        postsByUserId.set(String(post.userId), userIdGroup);
      }
      const group = postsByUsername.get(post.username) ?? [];
      group.push(post);
      postsByUsername.set(post.username, group);
    }

    const profiles = publicUsers.map((user) => computeProfile(
      user,
      sessionsByUserId.get(String(user._id)) ?? sessionsByUsername.get(user.username) ?? [],
      postsByUserId.get(String(user._id)) ?? postsByUsername.get(user.username) ?? [],
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
      feed: visiblePosts.map(publicPostView),
      totals: {
        users: publicUsers.length,
        sessions: visibleSessions.length,
        publicFailures: visiblePosts.length,
        promotedRuns: visibleSessions.filter((session) => session.status === 'executed_quiz_passed').length,
      },
    };
  },
});

export const leaderboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => buildLeaderboard(ctx, args.limit ?? 25),
});

export const scoreboard = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => buildLeaderboard(ctx, args.limit ?? 25),
});

export const publicShameFeed = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const posts = await collectVisiblePublicPosts(ctx, args.limit ?? 50);
    return posts.map(publicPostView);
  },
});

export const wallOfShame = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const posts = await collectVisiblePublicPosts(ctx, args.limit ?? 50);
    return posts.map(publicPostView);
  },
});

export const currentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await findUserByIdentity(ctx, identity);
    if (!user) return emptyProfile(identityUsername(identity), {
      displayName: (identity as any).name,
      imageUrl: (identity as any).pictureUrl,
      authProvider: 'clerk',
      source: 'clerk',
    });
    return profileForUser(ctx, user);
  },
});

export const currentProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await findUserByIdentity(ctx, identity);
    if (!user) return emptyProfile(identityUsername(identity), {
      displayName: (identity as any).name,
      imageUrl: (identity as any).pictureUrl,
      authProvider: 'clerk',
      source: 'clerk',
    });
    return profileForUser(ctx, user);
  },
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await findUserByIdentity(ctx, identity);
    const profile = user
      ? await profileForUser(ctx, user)
      : emptyProfile(identityUsername(identity), {
        displayName: (identity as any).name,
        imageUrl: (identity as any).pictureUrl,
        authProvider: 'clerk',
        source: 'clerk',
      });

    return {
      id: user?._id,
      clerkUserId: identity.subject,
      username: profile.user.username,
      displayName: profile.user.displayName,
      imageUrl: profile.user.imageUrl,
      profile,
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
      return emptyProfile(username);
    }
    if (!visibleUser(user)) {
      return emptyProfile(username, {
        username,
        displayName: username,
        createdAt: user.createdAt,
        status: user.status ?? 'active',
        publicProfileEnabled: user.publicProfileEnabled ?? true,
      });
    }

    return profileForUser(ctx, user);
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
    return ensureUser(ctx, stripUndefined({
      clerkUserId: identity.subject,
      clerkOrgId: (identity as any).orgId,
      username,
      displayName: args.displayName ?? (identity as any).name,
      imageUrl: args.imageUrl ?? (identity as any).pictureUrl,
      email: (identity as any).email,
      source: 'clerk',
    }));
  },
});

export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [users, sessions, posts, rewards, audits, orgSettings] = await Promise.all([
      ctx.db.query('users').take(500),
      ctx.db.query('sessions').take(500),
      ctx.db.query('publicPosts').take(500),
      ctx.db.query('rewards').take(500),
      ctx.db.query('adminAuditLog').order('desc').take(100),
      ctx.db.query('orgSettings').take(100),
    ]);
    return {
      totals: {
        users: users.length,
        activeUsers: users.filter((user) => (user.status ?? 'active') === 'active').length,
        suspendedUsers: users.filter((user) => (user.status ?? 'active') === 'suspended').length,
        sessions: sessions.length,
        hiddenSessions: sessions.filter((session) => (session.moderationStatus ?? 'visible') !== 'visible').length,
        publicPosts: posts.length,
        hiddenPosts: posts.filter((post) => (post.moderationStatus ?? 'visible') !== 'visible').length,
        rewards: rewards.length,
      },
      users: users
        .slice()
        .sort((left, right) => (right.lastSeenAt ?? right.updatedAt ?? 0) - (left.lastSeenAt ?? left.updatedAt ?? 0))
        .slice(0, 100)
        .map((user) => ({
          id: user._id,
          clerkUserId: user.clerkUserId,
          clerkOrgId: user.clerkOrgId,
          username: user.username,
          displayName: user.displayName,
          imageUrl: user.imageUrl,
          email: user.email,
          authProvider: user.authProvider ?? (String(user.clerkUserId || '').startsWith('local:') ? 'local' : 'clerk'),
          role: user.role ?? 'user',
          status: user.status ?? 'active',
          publicProfileEnabled: user.publicProfileEnabled ?? true,
          source: user.source ?? 'local_ingest',
          firstSeenAt: user.firstSeenAt ?? user.createdAt,
          lastSeenAt: user.lastSeenAt ?? user.updatedAt,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
      moderationQueue: posts
        .filter((post) => (post.moderationStatus ?? 'visible') !== 'visible' || (post.reportCount ?? 0) > 0)
        .slice()
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, 100)
        .map(publicPostView),
      orgSettings,
      audits,
    };
  },
});

export const adminCleanupDevRecords = mutation({
  args: {
    mode: v.union(v.literal('smoke'), v.literal('all')),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    const result = await cleanupDevRecords(ctx, args.mode);
    await auditAdminAction(ctx, 'cleanup_dev_records', 'all', undefined, identity.subject, args.mode, result);
    return result;
  },
});

export const adminModeratePublicPost = mutation({
  args: {
    postId: v.id('publicPosts'),
    moderationStatus: v.union(v.literal('visible'), v.literal('hidden'), v.literal('deleted')),
    visibility: v.optional(v.union(v.literal('public'), v.literal('private'), v.literal('local_only'))),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    return moderatePublicPost(ctx, args, identity.subject);
  },
});

export const adminModerateUser = mutation({
  args: {
    userId: v.id('users'),
    status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('deleted'))),
    publicProfileEnabled: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    return moderateUser(ctx, args, identity.subject);
  },
});

export const adminResetUserData = mutation({
  args: {
    userId: v.id('users'),
    mode: v.union(v.literal('activity'), v.literal('profile')),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    return resetUserData(ctx, args, identity.subject);
  },
});

export const adminSetOrgSettings = mutation({
  args: {
    orgId: v.string(),
    mode: v.union(v.literal('public'), v.literal('private'), v.literal('local_only')),
    secretScanningEnabled: v.boolean(),
    publicPostingEnabled: v.boolean(),
    requireClerkForPublicProfiles: v.optional(v.boolean()),
    allowLocalUsersOnLeaderboard: v.optional(v.boolean()),
    moderationMode: v.optional(v.union(v.literal('manual'), v.literal('auto_hide_flagged'))),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdmin(ctx);
    return setOrgSettings(ctx, args, identity.subject);
  },
});

export const cleanupDevRecordsBySecret = internalMutation({
  args: {
    mode: v.union(v.literal('smoke'), v.literal('all')),
    actor: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await cleanupDevRecords(ctx, args.mode);
    await auditAdminAction(ctx, 'cleanup_dev_records_by_secret', 'all', undefined, args.actor, args.mode, result);
    return result;
  },
});

export const moderatePublicPostBySecret = internalMutation({
  args: {
    postId: v.id('publicPosts'),
    moderationStatus: v.union(v.literal('visible'), v.literal('hidden'), v.literal('deleted')),
    visibility: v.optional(v.union(v.literal('public'), v.literal('private'), v.literal('local_only'))),
    reason: v.optional(v.string()),
    actor: v.string(),
  },
  handler: async (ctx, args) => moderatePublicPost(ctx, args, args.actor),
});

export const moderateUserBySecret = internalMutation({
  args: {
    userId: v.id('users'),
    status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('deleted'))),
    publicProfileEnabled: v.optional(v.boolean()),
    reason: v.optional(v.string()),
    actor: v.string(),
  },
  handler: async (ctx, args) => moderateUser(ctx, args, args.actor),
});

export const resetUserDataBySecret = internalMutation({
  args: {
    userId: v.id('users'),
    mode: v.union(v.literal('activity'), v.literal('profile')),
    reason: v.optional(v.string()),
    actor: v.string(),
  },
  handler: async (ctx, args) => resetUserData(ctx, args, args.actor),
});

export const setOrgSettingsBySecret = internalMutation({
  args: {
    orgId: v.string(),
    mode: v.union(v.literal('public'), v.literal('private'), v.literal('local_only')),
    secretScanningEnabled: v.boolean(),
    publicPostingEnabled: v.boolean(),
    requireClerkForPublicProfiles: v.optional(v.boolean()),
    allowLocalUsersOnLeaderboard: v.optional(v.boolean()),
    moderationMode: v.optional(v.union(v.literal('manual'), v.literal('auto_hide_flagged'))),
    actor: v.string(),
  },
  handler: async (ctx, args) => setOrgSettings(ctx, args, args.actor),
});

export const ingestEvent = internalMutation({
  args: {
    eventId: v.optional(v.string()),
    kind: v.union(v.literal('blocked_prompt'), v.literal('approved_prompt'), v.literal('quiz_result')),
    session: sessionValidator,
    publicPost: v.optional(publicPostValidator),
    // Identity attached by /karen/ingest after verifying a device bearer token. When present,
    // these override whatever clerkUserId/username arrived in the payload — the token is the
    // source of truth for "who owns this row", not the wire body.
    authClerkUserId: v.optional(v.string()),
    authUserId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    const eventId = normalizeOptionalString(args.eventId)
      ?? fallbackEventId([args.session.localSessionId, args.session.createdAt, args.kind]);

    const existingEvent = await ctx.db
      .query('ingestEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique();
    if (existingEvent) {
      return { ok: true, deduped: true, eventId };
    }
    // ingestEvents row is written below once the sessionId is known so the wipe migration can
    // sweep events alongside their owning session.

    // SECURITY: when the HTTP layer verified a device token, use that identity unconditionally.
    // Otherwise fall back to the payload (shared-secret server-to-server path).
    const authedClerkUserId = normalizeOptionalString(args.authClerkUserId);
    let resolvedUserId: any = args.authUserId ?? null;
    let resolvedClerkUserId: string | undefined = authedClerkUserId;
    let resolvedUsername: string | undefined;
    let resolvedClerkOrgId: string | undefined;

    if (resolvedUserId) {
      const authedUser = await ctx.db.get(resolvedUserId);
      if (!authedUser) throw new Error('Authenticated user not found');
      resolvedUsername = (authedUser as any).username;
      resolvedClerkUserId = (authedUser as any).clerkUserId ?? resolvedClerkUserId;
      resolvedClerkOrgId = (authedUser as any).clerkOrgId;
    }

    const username = resolvedUsername ?? normalizeUsername(args.session.username);
    const effectiveClerkUserId = resolvedUserId
      ? resolvedClerkUserId
      : (resolvedClerkUserId ?? args.session.clerkUserId);
    const effectiveClerkOrgId = resolvedUserId ? resolvedClerkOrgId : args.session.clerkOrgId;
    const userId = resolvedUserId
      ?? (effectiveClerkUserId
        ? await ensureUser(ctx, {
          username,
          clerkUserId: effectiveClerkUserId,
          clerkOrgId: effectiveClerkOrgId,
          displayName: args.session.displayName,
          imageUrl: args.session.imageUrl,
          email: args.session.email,
          source: 'http_ingest',
        })
        : await ensureLocalUser(ctx, username));
    const now = Date.now();
    const localSessionId = args.session.localSessionId;
    const opencodeSessionId = args.session.opencodeSessionId;
    const promptRedaction = redactText(args.session.prompt);
    const reasonRedaction = redactList(args.session.reasons);
    const orgPolicy = await getOrgPolicy(ctx, effectiveClerkOrgId);
    const requestedPrivacyMode = args.session.privacyMode ?? orgPolicy.mode;
    const privacyMode = orgPolicy.mode === 'local_only' ? 'local_only' : requestedPrivacyMode;
    const canWritePublicPost = (
      privacyMode === 'public'
      && orgPolicy.publicPostingEnabled
      && (!orgPolicy.requireClerkForPublicProfiles || Boolean(effectiveClerkUserId))
    );

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

    // SECURITY: prevent cross-user hijack of an existing session row via guessed localSessionId.
    if (session && String((session as any).userId) !== String(userId)) {
      throw new Error('Session ownership mismatch');
    }

    const patch = stripUndefined({
      userId,
      localSessionId,
      opencodeSessionId,
      clerkUserId: effectiveClerkUserId,
      clerkOrgId: effectiveClerkOrgId,
      username,
      status: args.session.status,
      prompt: promptRedaction.value ?? '',
      promptRedacted: promptRedaction.redacted,
      promptScore: args.session.promptScore,
      quizPassed: args.session.quizPassed,
      rollbackTriggered: args.session.rollbackTriggered,
      changedFiles: args.session.changedFiles,
      reasons: reasonRedaction.value,
      privacyMode,
      source: args.session.source ?? 'http_ingest',
      moderationStatus: 'visible' as const,
      createdAt: args.session.createdAt || now,
      completedAt: args.session.completedAt,
    });

    const sessionId = session
      ? (await ctx.db.patch(session._id, patch), session._id)
      : await ctx.db.insert('sessions', patch);

    const publicPost = args.publicPost;
    if (publicPost && canWritePublicPost && (publicPost.visibility ?? 'public') === 'public') {
      const existingPost = publicPost.localPostId
        ? await ctx.db
          .query('publicPosts')
          .withIndex('by_username_local_post', (q) => q.eq('username', username).eq('localPostId', publicPost.localPostId))
          .first()
        : null;
      // SECURITY: a publicPosts row keyed on (username, localPostId) must belong to this user.
      if (existingPost && existingPost.userId && String(existingPost.userId) !== String(userId)) {
        throw new Error('Public post ownership mismatch');
      }
      const postPromptRedaction = redactText(publicPost.promptExcerpt);
      const postReasonRedaction = redactList(publicPost.failureReasons);
      const rewriteRedaction = redactText(publicPost.suggestedRewrite);
      const labels = [
        ...promptRedaction.labels,
        ...postPromptRedaction.labels,
        ...postReasonRedaction.labels,
        ...rewriteRedaction.labels,
      ];
      const publicPostPatch = stripUndefined({
        sessionId,
        userId,
        clerkUserId: effectiveClerkUserId ?? publicPost.clerkUserId,
        clerkOrgId: effectiveClerkOrgId ?? publicPost.clerkOrgId,
        username,
        localPostId: publicPost.localPostId,
        type: publicPost.type,
        title: publicPost.title,
        score: publicPost.score,
        promptExcerpt: postPromptRedaction.value,
        promptRedacted: postPromptRedaction.redacted || labels.length > 0,
        failureReasons: postReasonRedaction.value,
        suggestedRewrite: rewriteRedaction.value,
        visibility: 'public' as const,
        moderationStatus: labels.length > 0 ? 'hidden' as const : 'visible' as const,
        hiddenReason: labels.length > 0 ? 'Auto-hidden because Karen detected possible secrets.' : undefined,
        redactionSummary: labels.length > 0 ? [...new Set(labels)].join(',') : undefined,
        reportCount: existingPost?.reportCount ?? 0,
        createdAt: publicPost.createdAt,
      });
      if (existingPost) {
        await ctx.db.patch(existingPost._id, publicPostPatch);
      } else {
        await ctx.db.insert('publicPosts', publicPostPatch);
      }
    }

    await ctx.db.insert('ingestEvents', { eventId, processedAt: Date.now(), sessionId });

    // Refresh leaderboard caches for this user. Best-effort; bounded reads.
    await recomputeUserCaches(ctx, userId);

    return { ok: true, deduped: false, eventId, kind: args.kind, sessionId };
  },
});

// ===========================================================================
// Device-link flow (RFC 8628)
//
// Wire shape:
//   POST /karen/auth/device/start   -> { deviceCode, userCode, verificationUri, verificationUriComplete, expiresIn, interval }
//   POST /karen/auth/device/poll    -> { status: 'authorization_pending' | 'slow_down' | 'expired_token' | 'access_denied' }
//                                       or { connected: true, token, user }
//   Vercel /link page (Clerk-authed): calls approveDeviceLink({ userCode }) on the user's signed-in session.
//
// The opaque deviceCode and bearer token are never stored — only their sha256 hashes. The TUI
// holds the opaque token in its OS keychain and presents it as `Authorization: Bearer <token>`
// to /karen/ingest. The HTTP route hashes and looks up `deviceTokens.by_token_hash`.
// ===========================================================================

const DEVICE_CODE_TTL_MS = 10 * 60 * 1000;
const DEVICE_POLL_MIN_INTERVAL_MS = 4_500;
const DEVICE_POLL_SLOW_DOWN_AFTER = 3;

export const startDeviceLink = internalMutation({
  args: {
    deviceCodeHash: v.string(),
    userCode: v.string(),
    deviceLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + DEVICE_CODE_TTL_MS;
    await ctx.db.insert('deviceLinkCodes', stripUndefined({
      userCode: args.userCode,
      deviceCodeHash: args.deviceCodeHash,
      status: 'pending' as const,
      deviceLabel: args.deviceLabel,
      createdAt: now,
      expiresAt,
      pollAttempts: 0,
    }));
    return { userCode: args.userCode, expiresAt };
  },
});

export const userCodeExists = internalQuery({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }) => {
    const row = await ctx.db
      .query('deviceLinkCodes')
      .withIndex('by_user_code', (q) => q.eq('userCode', userCode))
      .unique();
    return Boolean(row);
  },
});

export const pollDeviceCode = internalMutation({
  args: { deviceCodeHash: v.string() },
  handler: async (ctx, { deviceCodeHash }) => {
    const row = await ctx.db
      .query('deviceLinkCodes')
      .withIndex('by_device_code_hash', (q) => q.eq('deviceCodeHash', deviceCodeHash))
      .unique();
    if (!row) return { status: 'access_denied' as const };

    const now = Date.now();
    if (row.expiresAt < now) {
      if (row.status === 'pending') {
        await ctx.db.patch(row._id, { status: 'expired' as const });
      }
      return { status: 'expired_token' as const };
    }

    // slow_down: only enforced when the device polls faster than the advertised interval.
    if (row.lastPollAt && now - row.lastPollAt < DEVICE_POLL_MIN_INTERVAL_MS && row.pollAttempts >= DEVICE_POLL_SLOW_DOWN_AFTER) {
      await ctx.db.patch(row._id, {
        pollAttempts: row.pollAttempts + 1,
        lastPollAt: now,
      });
      return { status: 'slow_down' as const };
    }

    await ctx.db.patch(row._id, {
      pollAttempts: row.pollAttempts + 1,
      lastPollAt: now,
    });

    if (row.status === 'approved') {
      return {
        status: 'ready' as const,
        clerkUserId: row.clerkUserId,
        clerkOrgId: row.clerkOrgId,
        deviceLabel: row.deviceLabel,
      };
    }
    if (row.status === 'denied') return { status: 'access_denied' as const };
    if (row.status === 'exchanged') return { status: 'access_denied' as const };
    if (row.status === 'expired') return { status: 'expired_token' as const };
    return { status: 'authorization_pending' as const };
  },
});

export const exchangeDeviceCode = internalMutation({
  args: {
    deviceCodeHash: v.string(),
    opaqueToken: v.string(),
    tokenHash: v.string(),
  },
  handler: async (ctx, { deviceCodeHash, opaqueToken, tokenHash }) => {
    const row = await ctx.db
      .query('deviceLinkCodes')
      .withIndex('by_device_code_hash', (q) => q.eq('deviceCodeHash', deviceCodeHash))
      .unique();
    if (!row) throw new Error('access_denied');
    if (row.status === 'exchanged') throw new Error('access_denied');
    if (row.status !== 'approved') throw new Error('authorization_pending');
    if (row.expiresAt < Date.now()) {
      await ctx.db.patch(row._id, { status: 'expired' as const });
      throw new Error('expired_token');
    }
    if (!row.clerkUserId) throw new Error('access_denied');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user', (q) => q.eq('clerkUserId', row.clerkUserId!))
      .unique();
    if (!user) throw new Error('access_denied');

    const now = Date.now();
    await ctx.db.insert('deviceTokens', stripUndefined({
      userId: user._id,
      clerkUserId: row.clerkUserId,
      tokenHash,
      deviceLabel: row.deviceLabel,
      createdAt: now,
    }));
    await ctx.db.patch(row._id, {
      status: 'exchanged' as const,
      exchangedAt: now,
    });

    return {
      token: opaqueToken,
      user: {
        id: user._id,
        clerkUserId: user.clerkUserId,
        username: user.username,
        displayName: user.displayName ?? user.username,
        imageUrl: user.imageUrl,
      },
    };
  },
});

export const verifyDeviceToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const token = await ctx.db
      .query('deviceTokens')
      .withIndex('by_token_hash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (!token) return null;
    if (token.revokedAt) return null;
    const user = await ctx.db.get(token.userId);
    if (!user) return null;
    if ((user as any).status && (user as any).status !== 'active') return null;
    return {
      tokenId: token._id,
      userId: token.userId,
      clerkUserId: token.clerkUserId,
      username: (user as any).username,
    };
  },
});

export const touchDeviceToken = internalMutation({
  args: { tokenId: v.id('deviceTokens') },
  handler: async (ctx, { tokenId }) => {
    await ctx.db.patch(tokenId, { lastUsedAt: Date.now() });
  },
});

export const approveDeviceLink = mutation({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const row = await ctx.db
      .query('deviceLinkCodes')
      .withIndex('by_user_code', (q) => q.eq('userCode', userCode))
      .unique();
    if (!row) throw new Error('Invalid code');
    if (row.status !== 'pending') throw new Error('Code already used or expired');
    if (row.expiresAt < Date.now()) {
      await ctx.db.patch(row._id, { status: 'expired' as const });
      throw new Error('Code expired');
    }
    const userId = await ensureUserFromIdentity(ctx, identity);
    await ctx.db.patch(row._id, stripUndefined({
      status: 'approved' as const,
      clerkUserId: identity.subject,
      clerkOrgId: (identity as any).orgId,
      approvedAt: Date.now(),
    }));
    const user = await ctx.db.get(userId);
    return { ok: true, username: (user as any)?.username, deviceLabel: row.deviceLabel };
  },
});

export const denyDeviceLink = mutation({
  args: { userCode: v.string() },
  handler: async (ctx, { userCode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const row = await ctx.db
      .query('deviceLinkCodes')
      .withIndex('by_user_code', (q) => q.eq('userCode', userCode))
      .unique();
    if (!row) throw new Error('Invalid code');
    if (row.status === 'exchanged') throw new Error('Code already exchanged');
    await ctx.db.patch(row._id, { status: 'denied' as const });
    return { ok: true };
  },
});

// ===========================================================================
// Rate limit (lightweight; backs the device-flow endpoints)
// ===========================================================================

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_LOCK_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 20;
const RATE_LIMIT_MAX_NO_IP = 5;

export const checkIpRateLimit = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const now = Date.now();
    const max = key === 'no-ip' ? RATE_LIMIT_MAX_NO_IP : RATE_LIMIT_MAX_PER_IP;
    const existing = await ctx.db
      .query('ipRateLimits')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();

    if (existing?.lockedUntil && existing.lockedUntil > now) {
      return { allowed: false, retryAfterMs: existing.lockedUntil - now };
    }
    if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
      if (existing) {
        await ctx.db.patch(existing._id, { count: 1, windowStart: now, lockedUntil: undefined });
      } else {
        await ctx.db.insert('ipRateLimits', { key, count: 1, windowStart: now });
      }
      return { allowed: true, retryAfterMs: 0 };
    }
    if (existing.count + 1 > max) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        lockedUntil: now + RATE_LIMIT_LOCK_MS,
      });
      return { allowed: false, retryAfterMs: RATE_LIMIT_LOCK_MS };
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { allowed: true, retryAfterMs: 0 };
  },
});

// ===========================================================================
// Public queries for the scoreboard / profile / share card
// ===========================================================================

const isLocalPlaceholder = (user: any) => String(user?.clerkUserId || '').startsWith('local:');

const toLeaderboardRow = (user: any, rank: number) => ({
  rank,
  username: user.username,
  displayName: user.displayName ?? user.username,
  imageUrl: user.imageUrl,
  disciplineScore: Math.round(Number(user.disciplineScore ?? 0)),
  currentStreak: Number(user.currentStreak ?? 0),
  longestStreak: Number(user.longestStreak ?? 0),
  weeklyScore: Math.round(Number(user.weeklyScore ?? 0)),
  weeklySessions: Number(user.weeklySessions ?? 0),
  weekKey: user.weekKey ?? null,
  level: levelForScore(Math.round(Number(user.disciplineScore ?? 0))),
});

export const profilePublic = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = normalizeUsername(username);
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', normalized))
      .first();
    if (!user) return null;
    if (isLocalPlaceholder(user)) return null;
    if ((user.status ?? 'active') !== 'active') return null;
    if (user.publicProfileEnabled === false) return null;

    const [sessions, posts] = await Promise.all([
      ctx.db.query('sessions')
        .withIndex('by_user_created', (q) => q.eq('userId', user._id))
        .order('desc')
        .take(40),
      ctx.db.query('publicPosts')
        .withIndex('by_username_created', (q) => q.eq('username', user.username))
        .order('desc')
        .take(40),
    ]);
    const profile = computeProfile(user, sessions, posts);
    return {
      user: {
        ...profile.user,
        bio: user.bio ?? null,
        links: user.links ?? null,
      },
      stats: {
        ...profile.stats,
        weeklyScore: Math.round(Number(user.weeklyScore ?? 0)),
        weeklySessions: Number(user.weeklySessions ?? 0),
        weekKey: user.weekKey ?? null,
      },
      rewards: profile.rewards,
      recentSessions: profile.recentSessions,
      publicPosts: profile.publicPosts,
    };
  },
});

export const leaderboardAllTime = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.max(1, Math.min(100, Math.floor(limit ?? 25)));
    const rows = await ctx.db
      .query('users')
      .withIndex('by_public_score', (q) => q.eq('publicProfileEnabled', true).eq('status', 'active'))
      .order('desc')
      .take(take * 2);
    const filtered = rows
      .filter((row) => !isLocalPlaceholder(row))
      .slice(0, take);
    return filtered.map((user, index) => toLeaderboardRow(user, index + 1));
  },
});

export const leaderboardWeekly = query({
  args: {
    weekKey: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { weekKey, limit }) => {
    const take = Math.max(1, Math.min(100, Math.floor(limit ?? 25)));
    const week = normalizeOptionalString(weekKey) ?? weekKeyFor(Date.now());
    const rows = await ctx.db
      .query('users')
      .withIndex('by_public_weekly_score', (q) => q
        .eq('publicProfileEnabled', true)
        .eq('status', 'active')
        .eq('weekKey', week))
      .order('desc')
      .take(take * 2);
    const filtered = rows
      .filter((row) => !isLocalPlaceholder(row))
      .slice(0, take);
    return {
      weekKey: week,
      rows: filtered.map((user, index) => toLeaderboardRow(user, index + 1)),
    };
  },
});

export const shareCardData = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = normalizeUsername(username);
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', normalized))
      .first();
    if (!user) return null;
    if (isLocalPlaceholder(user)) return null;
    if ((user.status ?? 'active') !== 'active') return null;
    if (user.publicProfileEnabled === false) return null;

    // Inline rank: scan up to 500 ranked rows to find this user's position. Bounded; the
    // far-tail case returns null and the UI can render an "Unranked" badge.
    const ranked = await ctx.db
      .query('users')
      .withIndex('by_public_score', (q) => q.eq('publicProfileEnabled', true).eq('status', 'active'))
      .order('desc')
      .take(500);
    let rank: number | null = null;
    for (let i = 0; i < ranked.length; i += 1) {
      if (String(ranked[i]._id) === String(user._id)) {
        rank = i + 1;
        break;
      }
    }

    const rewards = await ctx.db
      .query('rewards')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(10);
    const topReward = rewards.find((r) => r.tone === 'good') ?? rewards[0];

    return {
      username: user.username,
      displayName: user.displayName ?? user.username,
      imageUrl: user.imageUrl,
      disciplineScore: Math.round(Number(user.disciplineScore ?? 0)),
      level: levelForScore(Math.round(Number(user.disciplineScore ?? 0))),
      longestStreak: Number(user.longestStreak ?? 0),
      currentStreak: Number(user.currentStreak ?? 0),
      rank,
      topRewardLabel: topReward?.label ?? null,
    };
  },
});

export const updateMyProfile = mutation({
  args: {
    bio: v.optional(v.string()),
    links: v.optional(v.object({
      github: v.optional(v.string()),
      x: v.optional(v.string()),
      website: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const user = await findUserByIdentity(ctx, identity);
    if (!user) throw new Error('User not found — call upsertCurrentUser first');

    const sanitizeLink = (value: string | undefined): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      if (trimmed.length > 200) return undefined;
      if (!/^https?:\/\//i.test(trimmed)) return undefined;
      return trimmed;
    };

    const bio = typeof args.bio === 'string'
      ? args.bio.trim().slice(0, 200)
      : undefined;
    const links = args.links
      ? stripUndefined({
        github: sanitizeLink(args.links.github),
        x: sanitizeLink(args.links.x),
        website: sanitizeLink(args.links.website),
      })
      : undefined;

    await ctx.db.patch(user._id, stripUndefined({
      bio,
      links,
      updatedAt: Date.now(),
    }));
    return { ok: true };
  },
});

// ===========================================================================
// Wipe local placeholders (one-shot operator migration)
// ===========================================================================

export const wipeLocalPlaceholders = internalMutation({
  args: { actor: v.string(), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { actor, dryRun }) => {
    const users = await ctx.db.query('users').collect();
    const placeholders = users.filter(isLocalPlaceholder);

    let sessionsDeleted = 0;
    let postsDeleted = 0;
    let rewardsDeleted = 0;
    let ingestEventsDeleted = 0;
    let usersDeleted = 0;

    for (const user of placeholders) {
      const [sessions, posts, rewards] = await Promise.all([
        ctx.db.query('sessions')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect(),
        ctx.db.query('publicPosts')
          .withIndex('by_username', (q) => q.eq('username', user.username))
          .collect(),
        ctx.db.query('rewards')
          .withIndex('by_user', (q) => q.eq('userId', user._id))
          .collect(),
      ]);

      for (const session of sessions) {
        const sessionIngestEvents = await ctx.db
          .query('ingestEvents')
          .withIndex('by_session', (q) => q.eq('sessionId', session._id))
          .collect();
        for (const evt of sessionIngestEvents) {
          if (!dryRun) await ctx.db.delete(evt._id);
          ingestEventsDeleted += 1;
        }
        if (!dryRun) await ctx.db.delete(session._id);
        sessionsDeleted += 1;
      }
      for (const post of posts) {
        if (!post.userId || String(post.userId) === String(user._id)) {
          if (!dryRun) await ctx.db.delete(post._id);
          postsDeleted += 1;
        }
      }
      for (const reward of rewards) {
        if (!dryRun) await ctx.db.delete(reward._id);
        rewardsDeleted += 1;
      }
      if (!dryRun) await ctx.db.delete(user._id);
      usersDeleted += 1;
    }

    const result = {
      usersDeleted,
      sessionsDeleted,
      postsDeleted,
      rewardsDeleted,
      ingestEventsDeleted,
      dryRun: Boolean(dryRun),
    };
    await auditAdminAction(
      ctx,
      'wipe_local_placeholders',
      'users',
      undefined,
      actor,
      dryRun ? 'dry-run' : undefined,
      result,
    );
    return result;
  },
});


// ---------------------------------------------------------------------------
// Voice synthesis cache (server-side ElevenLabs for Vercel-side audio).
// Content-hashed: identical lines across users collapse to one MP3.
// ---------------------------------------------------------------------------

export const findCachedVoice = internalQuery({
  args: { contentHash: v.string() },
  handler: async (ctx, { contentHash }) => {
    const row = await ctx.db
      .query('voiceCacheEntries')
      .withIndex('by_hash', (q) => q.eq('contentHash', contentHash))
      .unique();
    return row ?? null;
  },
});

export const recordVoiceCache = internalMutation({
  args: {
    contentHash: v.string(),
    storageId: v.id('_storage'),
    voiceId: v.string(),
    mood: v.optional(v.string()),
    textPreview: v.string(),
    byteSize: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Defensive: another request may have written the same hash concurrently.
    const existing = await ctx.db
      .query('voiceCacheEntries')
      .withIndex('by_hash', (q) => q.eq('contentHash', args.contentHash))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { hits: existing.hits + 1, lastHitAt: now });
      // Drop the duplicate blob to save storage.
      try { await ctx.storage.delete(args.storageId); } catch {}
      return existing.storageId;
    }
    await ctx.db.insert('voiceCacheEntries', {
      contentHash: args.contentHash,
      storageId: args.storageId,
      voiceId: args.voiceId,
      mood: args.mood,
      textPreview: args.textPreview.slice(0, 80),
      byteSize: args.byteSize,
      createdAt: now,
      lastHitAt: now,
      hits: 0,
    });
    return args.storageId;
  },
});

export const bumpVoiceHits = internalMutation({
  args: { contentHash: v.string() },
  handler: async (ctx, { contentHash }) => {
    const row = await ctx.db
      .query('voiceCacheEntries')
      .withIndex('by_hash', (q) => q.eq('contentHash', contentHash))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, { hits: row.hits + 1, lastHitAt: Date.now() });
    return row.storageId;
  },
});

// Per-IP rate limit for the public voice endpoint. Reuses ipRateLimits table.
export const checkVoiceRateLimit = internalMutation({
  args: { key: v.string(), maxPerWindow: v.number(), windowMs: v.number() },
  handler: async (ctx, { key, maxPerWindow, windowMs }) => {
    const now = Date.now();
    const row = await ctx.db
      .query('ipRateLimits')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (row?.lockedUntil && row.lockedUntil > now) {
      return { ok: false, retryAfterMs: row.lockedUntil - now };
    }
    if (!row || now - row.windowStart > windowMs) {
      if (row) {
        await ctx.db.patch(row._id, { count: 1, windowStart: now, lockedUntil: undefined });
      } else {
        await ctx.db.insert('ipRateLimits', { key, count: 1, windowStart: now });
      }
      return { ok: true };
    }
    if (row.count + 1 > maxPerWindow) {
      await ctx.db.patch(row._id, { count: row.count + 1, lockedUntil: now + windowMs });
      return { ok: false, retryAfterMs: windowMs };
    }
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { ok: true };
  },
});
