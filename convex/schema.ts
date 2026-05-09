import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    username: v.string(),
    displayName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_clerk_user', ['clerkUserId'])
    .index('by_username', ['username']),

  sessions: defineTable({
    userId: v.id('users'),
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
  })
    .index('by_user', ['userId'])
    .index('by_local_session', ['localSessionId'])
    .index('by_opencode_session', ['opencodeSessionId'])
    .index('by_created', ['createdAt']),

  publicPosts: defineTable({
    sessionId: v.optional(v.id('sessions')),
    userId: v.optional(v.id('users')),
    localPostId: v.optional(v.string()),
    username: v.string(),
    type: v.string(),
    title: v.string(),
    score: v.optional(v.number()),
    promptExcerpt: v.optional(v.string()),
    failureReasons: v.array(v.string()),
    suggestedRewrite: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_created', ['createdAt'])
    .index('by_username', ['username']),

  rewards: defineTable({
    userId: v.id('users'),
    rewardId: v.string(),
    label: v.string(),
    tone: v.union(v.literal('good'), v.literal('bad')),
    createdAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_reward', ['rewardId']),

  orgSettings: defineTable({
    orgId: v.string(),
    mode: v.union(v.literal('public'), v.literal('private'), v.literal('local_only')),
    secretScanningEnabled: v.boolean(),
    publicPostingEnabled: v.boolean(),
    updatedAt: v.number(),
  }).index('by_org', ['orgId']),
});
