import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    clerkOrgId: v.optional(v.string()),
    username: v.string(),
    displayName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    authProvider: v.optional(v.union(v.literal('clerk'), v.literal('local'), v.literal('ingest'))),
    role: v.optional(v.union(v.literal('user'), v.literal('admin'))),
    status: v.optional(v.union(v.literal('active'), v.literal('suspended'), v.literal('deleted'))),
    publicProfileEnabled: v.optional(v.boolean()),
    source: v.optional(v.union(v.literal('clerk'), v.literal('local_ingest'), v.literal('http_ingest'))),
    firstSeenAt: v.optional(v.number()),
    lastSeenAt: v.optional(v.number()),
    moderatedAt: v.optional(v.number()),
    moderatedBy: v.optional(v.string()),
    moderationReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clerk_user', ['clerkUserId'])
    .index('by_username', ['username'])
    .index('by_status', ['status'])
    .index('by_role', ['role']),

  sessions: defineTable({
    userId: v.id('users'),
    localSessionId: v.optional(v.string()),
    opencodeSessionId: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    clerkOrgId: v.optional(v.string()),
    username: v.string(),
    status: v.string(),
    prompt: v.string(),
    promptRedacted: v.optional(v.boolean()),
    promptScore: v.number(),
    quizPassed: v.optional(v.boolean()),
    rollbackTriggered: v.boolean(),
    changedFiles: v.array(v.string()),
    reasons: v.array(v.string()),
    privacyMode: v.optional(v.union(v.literal('public'), v.literal('private'), v.literal('local_only'))),
    source: v.optional(v.union(v.literal('terminal'), v.literal('gui'), v.literal('http_ingest'), v.literal('unknown'))),
    moderationStatus: v.optional(v.union(v.literal('visible'), v.literal('hidden'), v.literal('deleted'))),
    moderatedAt: v.optional(v.number()),
    moderatedBy: v.optional(v.string()),
    moderationReason: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_local_session', ['localSessionId'])
    .index('by_opencode_session', ['opencodeSessionId'])
    .index('by_created', ['createdAt'])
    .index('by_moderation', ['moderationStatus'])
    .index('by_privacy', ['privacyMode']),

  publicPosts: defineTable({
    sessionId: v.optional(v.id('sessions')),
    userId: v.optional(v.id('users')),
    localPostId: v.optional(v.string()),
    clerkUserId: v.optional(v.string()),
    clerkOrgId: v.optional(v.string()),
    username: v.string(),
    type: v.string(),
    title: v.string(),
    score: v.optional(v.number()),
    promptExcerpt: v.optional(v.string()),
    promptRedacted: v.optional(v.boolean()),
    failureReasons: v.array(v.string()),
    suggestedRewrite: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal('public'), v.literal('private'), v.literal('local_only'))),
    moderationStatus: v.optional(v.union(v.literal('visible'), v.literal('hidden'), v.literal('deleted'))),
    hiddenReason: v.optional(v.string()),
    moderatedAt: v.optional(v.number()),
    moderatedBy: v.optional(v.string()),
    redactionSummary: v.optional(v.string()),
    reportCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_created', ['createdAt'])
    .index('by_username', ['username'])
    .index('by_username_local_post', ['username', 'localPostId'])
    .index('by_moderation', ['moderationStatus'])
    .index('by_visibility', ['visibility']),

  rewards: defineTable({
    userId: v.id('users'),
    rewardId: v.string(),
    label: v.string(),
    tone: v.union(v.literal('good'), v.literal('bad')),
    visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
    revokeReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_reward', ['rewardId']),

  orgSettings: defineTable({
    orgId: v.string(),
    mode: v.union(v.literal('public'), v.literal('private'), v.literal('local_only')),
    secretScanningEnabled: v.boolean(),
    publicPostingEnabled: v.boolean(),
    requireClerkForPublicProfiles: v.optional(v.boolean()),
    allowLocalUsersOnLeaderboard: v.optional(v.boolean()),
    moderationMode: v.optional(v.union(v.literal('manual'), v.literal('auto_hide_flagged'))),
    updatedBy: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_org', ['orgId']),

  adminAuditLog: defineTable({
    actor: v.string(),
    action: v.string(),
    targetTable: v.string(),
    targetId: v.optional(v.string()),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_created', ['createdAt'])
    .index('by_actor', ['actor'])
    .index('by_action', ['action']),

  ingestEvents: defineTable({
    eventId: v.string(),
    processedAt: v.number(),
  }).index('by_eventId', ['eventId']),
});
