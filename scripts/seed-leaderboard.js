#!/usr/bin/env node
/**
 * Seed the Convex leaderboard with realistic demo data.
 * Uses the same /karen/ingest HTTP endpoint the real CLI uses.
 *
 * Usage:
 *   CONVEX_HTTP_ACTIONS_URL=https://... KAREN_CLOUD_INGEST_SECRET=... node scripts/seed-leaderboard.js
 *   - or -
 *   bun run scripts/seed-leaderboard.js   (reads from .env.local automatically via dotenv)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Load .env.local when running locally
// ---------------------------------------------------------------------------
function loadEnv() {
  try {
    const path = resolve(process.cwd(), '.env.local');
    const lines = readFileSync(path, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // not present — rely on real env vars
  }
}

loadEnv();

const BASE_URL = (process.env.CONVEX_HTTP_ACTIONS_URL || '').replace(/\/$/, '');
const SECRET   = process.env.KAREN_CLOUD_INGEST_SECRET || '';

if (!BASE_URL || !SECRET) {
  console.error('Missing CONVEX_HTTP_ACTIONS_URL or KAREN_CLOUD_INGEST_SECRET');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const now = Date.now();
const hoursAgo = (h) => now - h * 60 * 60 * 1000;
const uid     = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

async function ingest(kind, session, publicPost) {
  // Strip fields the deployed validator doesn't accept yet
  const { privacyMode: _pm, source: _src, clerkUserId: _cu, clerkOrgId: _co,
          displayName: _dn, imageUrl: _iu, email: _em, ...cleanSession } = session;
  const cleanPost = publicPost ? (() => {
    const { visibility: _v, clerkUserId: _cu2, clerkOrgId: _co2, ...rest } = publicPost;
    return rest;
  })() : undefined;

  const body = { kind, session: cleanSession, ...(cleanPost ? { publicPost: cleanPost } : {}) };
  const res = await fetch(`${BASE_URL}/karen/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

function passed(username, prompt, score, files, reasons, createdAt, extra = {}) {
  return {
    localSessionId: uid(`ses-${username}`),
    username,
    status: 'executed_quiz_passed',
    prompt,
    promptScore: score,
    quizPassed: true,
    rollbackTriggered: false,
    changedFiles: files,
    reasons,
    privacyMode: 'public',
    source: 'terminal',
    createdAt,
    completedAt: createdAt + 45_000,
    ...extra,
  };
}

function blocked(username, prompt, score, files, reasons, createdAt) {
  return {
    localSessionId: uid(`ses-${username}`),
    username,
    status: 'blocked_bad_prompt',
    prompt,
    promptScore: score,
    rollbackTriggered: false,
    changedFiles: files,
    reasons,
    privacyMode: 'public',
    source: 'terminal',
    createdAt,
    completedAt: createdAt + 8_000,
  };
}

function rolledBack(username, prompt, score, files, reasons, createdAt) {
  return {
    localSessionId: uid(`ses-${username}`),
    username,
    status: 'executed_quiz_failed_rolled_back',
    prompt,
    promptScore: score,
    quizPassed: false,
    rollbackTriggered: true,
    changedFiles: files,
    reasons,
    privacyMode: 'public',
    source: 'terminal',
    createdAt,
    completedAt: createdAt + 120_000,
  };
}

function blockedPost(username, prompt, score, reasons, createdAt) {
  return {
    localPostId: uid(`post-${username}`),
    type: 'bad_prompt',
    title: `@${username} blocked — ${reasons[0] ?? 'Karen said no'}`,
    score,
    promptExcerpt: prompt.length > 120 ? prompt.slice(0, 117) + '…' : prompt,
    failureReasons: reasons,
    visibility: 'public',
    createdAt,
  };
}

function quizFailPost(username, prompt, score, reasons, createdAt) {
  return {
    localPostId: uid(`post-${username}`),
    type: 'quiz_failed',
    title: `@${username} failed the diff quiz — rolled back`,
    score,
    promptExcerpt: prompt.length > 120 ? prompt.slice(0, 117) + '…' : prompt,
    failureReasons: reasons,
    visibility: 'public',
    createdAt,
  };
}

// ---------------------------------------------------------------------------
// User data  — themed around the Karen / PromptCourt codebase itself
// ---------------------------------------------------------------------------

/**
 * maya-chen — #1
 * A disciplined prompter who almost always explains acceptance criteria and reads diffs cold.
 * Target disciplineScore: ~92
 */
const mayaSessions = [
  passed('maya-chen', 'Add Convex ingest idempotency for quiz_result events — same localSessionId should patch, not duplicate', 97,
    ['convex/karen.ts', 'convex/schema.ts'], [], hoursAgo(180)),
  passed('maya-chen', 'Refactor computeProfile to include lifetimeGrannySkips in reward eligibility', 96,
    ['convex/karen.ts'], [], hoursAgo(160)),
  passed('maya-chen', 'Wire LiveLeaderboardShowcase to allowPreviewData when overview is empty', 95,
    ['packages/ui/src/components/promptcourt/landing/Scoreboard.tsx'], [], hoursAgo(140)),
  passed('maya-chen', 'Add MetricBar animation to quiz pass rate column in LeaderboardRow', 94,
    ['packages/ui/src/components/promptcourt/LiveLeaderboardShowcase.tsx'], [], hoursAgo(120)),
  passed('maya-chen', 'Extract eventFromProfile mapping into Scoreboard — move logic out of LiveLeaderboardShowcase', 98,
    ['packages/ui/src/components/promptcourt/landing/Scoreboard.tsx',
     'packages/ui/src/components/promptcourt/LiveLeaderboardShowcase.tsx'], [], hoursAgo(110)),
  passed('maya-chen', 'Add privacy redaction for generic_assignment pattern to convex/karen.ts', 96,
    ['convex/karen.ts'], [], hoursAgo(96)),
  passed('maya-chen', 'Ship admin audit log append helper — both Clerk-gated and secret-gated paths write to adminAuditLog', 97,
    ['convex/karen.ts', 'convex/http.ts'], [], hoursAgo(84)),
  passed('maya-chen', 'Update KarenShameTweetWall to rotate deterministically off karenShameTweets.ts seed', 95,
    ['packages/ui/src/components/promptcourt/landing/KarenShameTweetWall.tsx',
     'packages/ui/src/components/promptcourt/landing/karenShameTweets.ts'], [], hoursAgo(72)),
  passed('maya-chen', 'Add BadPromptGraveyard score-tone classes: awful < 40, weak 40-69, appeal 70+', 96,
    ['packages/ui/src/components/promptcourt/BadPromptGraveyard.tsx'], [], hoursAgo(60)),
  passed('maya-chen', 'Fix streak counter — approved_pending_quiz must count the same as executed_quiz_passed', 98,
    ['convex/karen.ts'], [], hoursAgo(50)),
  passed('maya-chen', 'Tighten normalizeUsername — strip leading/trailing dash after collapse', 94,
    ['convex/karen.ts',
     'packages/web/server/lib/promptcourt/storage.js'], [], hoursAgo(40)),
  passed('maya-chen', 'Seed script: wire ingest POST to HTTP actions URL from .env.local', 95,
    ['scripts/seed-leaderboard.js'], [], hoursAgo(32)),
  passed('maya-chen', 'Make KarenLogo accept mood prop and render mad face on landing nav', 96,
    ['packages/ui/src/components/promptcourt/KarenLogo.tsx',
     'packages/ui/src/components/promptcourt/KarenLandingPage.tsx'], [], hoursAgo(24)),
  passed('maya-chen', 'Add Convex health check route GET /karen/health → { ok: true, service }', 97,
    ['convex/http.ts'], [], hoursAgo(16)),
  passed('maya-chen', 'Guard canWritePublicPost behind requireClerkForPublicProfiles org policy', 98,
    ['convex/karen.ts'], [], hoursAgo(8)),
  // one blocked to break perfection
  blocked('maya-chen', 'fix it', 22,
    [], ['No acceptance criteria', 'Prompt too vague to evaluate'], hoursAgo(100)),
  // then back on track
  passed('maya-chen', 'Follow-up: Add explicit acceptance criteria to quiz generation prompt', 97,
    ['packages/web/server/lib/promptcourt/quiz.js'], [], hoursAgo(99)),
  passed('maya-chen', 'DiffQuizShowcase: add countdown timer with AnimatePresence exit', 95,
    ['packages/ui/src/components/promptcourt/DiffQuizShowcase.tsx'], [], hoursAgo(4)),
  passed('maya-chen', 'Update DOCUMENTATION.md Files section — add seed script entry', 96,
    ['packages/ui/src/components/promptcourt/DOCUMENTATION.md'], [], hoursAgo(2)),
  passed('maya-chen', 'Final: type-check and lint clean before PR', 98,
    ['packages/karen/bin/karen.js'], [], hoursAgo(1)),
];

/**
 * eli-builds — #2
 * Solid engineer, occasional lapse in scoping. Had one quiz rollback.
 * Target disciplineScore: ~83
 */
const eliSessions = [
  passed('eli-builds', 'Scaffold KarenCloudProvider — wrap with ConvexProviderWithClerk when VITE_CONVEX_URL is set', 91,
    ['packages/ui/src/components/promptcourt/KarenCloudProvider.tsx'], [], hoursAgo(200)),
  passed('eli-builds', 'Add ProofProfileCard: single-card public profile summary with stats and badge row', 90,
    ['packages/ui/src/components/promptcourt/ProofProfileCard.tsx'], [], hoursAgo(170)),
  passed('eli-builds', 'Wire SSE hookup in PromptCourtPage to /api/promptcourt/runs/events', 93,
    ['packages/ui/src/components/promptcourt/PromptCourtPage.tsx',
     'packages/ui/src/hooks/useEventStream.ts'], [], hoursAgo(150)),
  passed('eli-builds', 'Add KarenBadgeWall with progress bars derived from PromptCourt rewards', 89,
    ['packages/ui/src/components/promptcourt/KarenBadgeWall.tsx'], [], hoursAgo(130)),
  blocked('eli-builds', 'can you refactor all the promptcourt stuff', 31,
    ['packages/ui/src/components/promptcourt/'], ['Scope too broad — no file boundary defined', 'Missing acceptance criteria'], hoursAgo(120)),
  passed('eli-builds', 'Narrowed: extract sessionView + publicPostView helpers from computeProfile in karen.ts', 91,
    ['convex/karen.ts'], [], hoursAgo(115)),
  passed('eli-builds', 'GrandmaVoicePanel: persist settings to localStorage under KAREN_VOICE_STORAGE_KEY', 88,
    ['packages/ui/src/components/promptcourt/GrandmaVoicePanel.tsx'], [], hoursAgo(100)),
  rolledBack('eli-builds', 'Migrate all Radix UI primitives to Base UI in promptcourt components in one shot', 52,
    ['packages/ui/src/components/promptcourt/PromptCourtPage.tsx',
     'packages/ui/src/components/promptcourt/KarenQuizGameModal.tsx',
     'packages/ui/src/components/promptcourt/BadPromptGraveyard.tsx',
     'packages/ui/src/components/promptcourt/DeleteOrDefend.tsx'], ['Scope too large for single session', 'No rollback plan defined'], hoursAgo(90)),
  passed('eli-builds', 'Incremental: migrate Radix Dialog → Base UI Dialog in KarenQuizGameModal only', 92,
    ['packages/ui/src/components/promptcourt/KarenQuizGameModal.tsx'], [], hoursAgo(80)),
  passed('eli-builds', 'Add CourtroomDemo scripted transcript for landing page', 90,
    ['packages/ui/src/components/promptcourt/CourtroomDemo.tsx'], [], hoursAgo(60)),
  blocked('eli-builds', 'Update everything in packages/karen', 28,
    ['packages/karen/'], ['Prompt too vague — no specific behaviour described', 'No success criteria'], hoursAgo(48)),
  passed('eli-builds', 'Add karen CLI: wire karen run → promptcourt judgment layer', 93,
    ['packages/karen/bin/karen.js',
     'packages/karen/src/run.js'], [], hoursAgo(40)),
  passed('eli-builds', 'Add DeleteOrDefend interactive mini-game with timer pressure', 90,
    ['packages/ui/src/components/promptcourt/DeleteOrDefend.tsx'], [], hoursAgo(24)),
  passed('eli-builds', 'Add KarenPipelineStrip — prompt → verdict visual flow on /how-it-works', 88,
    ['packages/ui/src/components/promptcourt/landing/KarenPipelineStrip.tsx'], [], hoursAgo(12)),
  passed('eli-builds', 'KarenCommitInterrupt: TaskMaster commit frame and quiz handoff layout', 91,
    ['packages/ui/src/components/promptcourt/landing/KarenCommitInterrupt.tsx'], [], hoursAgo(4)),
];

/**
 * nora-diff — #3
 * Strong on quiz, had a rough patch with two rollbacks. Recovered well.
 * Target disciplineScore: ~74
 */
const noraSessions = [
  passed('nora-diff', 'Add by_local_session and by_opencode_session indexes to sessions table', 90,
    ['convex/schema.ts'], [], hoursAgo(250)),
  passed('nora-diff', 'Wire LandingAuthCta to isKarenAuthConfigured — render gracefully when Clerk is absent', 88,
    ['packages/ui/src/components/promptcourt/landing/LandingAuthCta.tsx',
     'packages/ui/src/lib/karenCloudConfig.ts'], [], hoursAgo(220)),
  blocked('nora-diff', 'fix the leaderboard', 19,
    [], ['No acceptance criteria', 'No file boundary stated', 'Too vague to eval'], hoursAgo(200)),
  passed('nora-diff', 'Populate leaderboard with allowPreviewData when overview is empty', 89,
    ['packages/ui/src/components/promptcourt/landing/Scoreboard.tsx'], [], hoursAgo(195)),
  rolledBack('nora-diff', 'Rewrite all Tailwind color classes to theme tokens across the whole UI in one PR', 48,
    ['packages/ui/src/components/promptcourt/LiveLeaderboardShowcase.tsx',
     'packages/ui/src/components/promptcourt/BadPromptGraveyard.tsx',
     'packages/ui/src/components/promptcourt/KarenBadgeWall.tsx',
     'packages/ui/src/components/promptcourt/PromptCourtPage.tsx',
     'packages/ui/src/components/promptcourt/ProofProfileCard.tsx'],
    ['Scope not bounded — whole-UI refactor without file list', 'No rollback plan'], hoursAgo(160)),
  passed('nora-diff', 'Theme tokens: replace hardcoded hex in LiveLeaderboardShowcase with theme vars', 87,
    ['packages/ui/src/components/promptcourt/LiveLeaderboardShowcase.tsx'], [], hoursAgo(150)),
  passed('nora-diff', 'Theme tokens: replace hardcoded hex in BadPromptGraveyard', 88,
    ['packages/ui/src/components/promptcourt/BadPromptGraveyard.tsx'], [], hoursAgo(140)),
  rolledBack('nora-diff', 'Also update the KarenMascot animation timing AND the grid layout AND the mascot colours all at once', 41,
    ['packages/ui/src/components/promptcourt/KarenMascot.tsx'], ['Multiple unrelated changes — split into separate sessions'], hoursAgo(130)),
  passed('nora-diff', 'Focused: update KarenMascot animation timing only', 91,
    ['packages/ui/src/components/promptcourt/KarenMascot.tsx'], [], hoursAgo(120)),
  passed('nora-diff', 'Add Install route with install commands and CTA', 90,
    ['packages/ui/src/components/promptcourt/landing/Install.tsx'], [], hoursAgo(96)),
  passed('nora-diff', 'Add HowItWorks route: pipeline strip, prompt judge examples, commit-interrupt quiz', 87,
    ['packages/ui/src/components/promptcourt/landing/HowItWorks.tsx'], [], hoursAgo(72)),
  passed('nora-diff', 'Add org settings HTTP route POST /karen/admin/org-settings', 89,
    ['convex/http.ts', 'convex/karen.ts'], [], hoursAgo(48)),
  passed('nora-diff', 'Add by_moderation and by_privacy indexes to sessions; by_visibility to publicPosts', 92,
    ['convex/schema.ts'], [], hoursAgo(24)),
];

/**
 * jo-tests — #4
 * Writes tests, prompts are scoped but sometimes skips acceptance criteria.
 * Target disciplineScore: ~66
 */
const joSessions = [
  passed('jo-tests', 'Add cloud.test.js — assert server-to-Convex ingest contract: endpoint, headers, payload shape', 86,
    ['packages/web/server/lib/promptcourt/cloud.test.js'], [], hoursAgo(240)),
  blocked('jo-tests', 'can you help with the tests', 24,
    [], ['No test file specified', 'No scope boundary', 'Prompt too vague'], hoursAgo(220)),
  passed('jo-tests', 'Add routes.test.js — exercise server-side ingest path and verify ingest idempotency', 85,
    ['packages/web/server/lib/promptcourt/routes.test.js'], [], hoursAgo(210)),
  passed('jo-tests', 'Add karen-gui.spec.ts Playwright smoke — landing, scoreboard, install routes', 84,
    ['tests/karen-gui.spec.ts'], [], hoursAgo(180)),
  blocked('jo-tests', 'fix the failing tests please', 18,
    [], ['No failing test named', 'No reproduction steps', 'No acceptance criteria'], hoursAgo(160)),
  rolledBack('jo-tests', 'Update all test fixtures and mocks in one pass across cloud.test.js, routes.test.js, karen-gui.spec.ts', 55,
    ['packages/web/server/lib/promptcourt/cloud.test.js',
     'packages/web/server/lib/promptcourt/routes.test.js',
     'tests/karen-gui.spec.ts'],
    ['Batch update — three unrelated test files with no shared context', 'Diff too wide to explain'], hoursAgo(150)),
  passed('jo-tests', 'Fix cloud.test.js: update ingest fixture to include privacyMode field', 83,
    ['packages/web/server/lib/promptcourt/cloud.test.js'], [], hoursAgo(140)),
  passed('jo-tests', 'Add bun run test:karen-core script to package.json', 88,
    ['package.json'], [], hoursAgo(120)),
  blocked('jo-tests', 'make all tests pass', 16,
    [], ['Implies scope over every test file', 'No specific failure cited', 'No acceptance criteria'], hoursAgo(100)),
  passed('jo-tests', 'Fix routes.test.js: mock KAREN_CLOUD_INGEST_SECRET env var in test setup', 85,
    ['packages/web/server/lib/promptcourt/routes.test.js'], [], hoursAgo(90)),
  passed('jo-tests', 'Add bun run test:karen-gui to package.json — Playwright smoke', 86,
    ['package.json'], [], hoursAgo(60)),
];

/**
 * dan-commits — #5
 * Newer to the team, still learning prompt discipline. High rollback rate.
 * Target disciplineScore: ~52
 */
const danSessions = [
  blocked('dan-commits', 'add stuff to the landing page', 15,
    [], ['No component specified', 'No acceptance criteria', 'Scope undefined'], hoursAgo(300)),
  passed('dan-commits', 'Add KarenShameTweetWall mock feed to /scoreboard route', 80,
    ['packages/ui/src/components/promptcourt/landing/KarenShameTweetWall.tsx',
     'packages/ui/src/components/promptcourt/landing/karenShameTweets.ts'], [], hoursAgo(290)),
  blocked('dan-commits', 'update the docs', 12,
    [], ['No doc file specified', 'No target audience or section stated'], hoursAgo(270)),
  rolledBack('dan-commits', 'Overhaul convex/schema.ts — rename columns, remove unused indexes, add orgSettings table, add adminAuditLog, update all validators', 38,
    ['convex/schema.ts', 'convex/karen.ts', 'convex/http.ts'],
    ['Schema rename without migration plan', 'Removing indexes is a breaking change', 'No staged rollout described'], hoursAgo(250)),
  passed('dan-commits', 'Add orgSettings table and by_org index only — staged migration step 1', 78,
    ['convex/schema.ts'], [], hoursAgo(240)),
  blocked('dan-commits', 'fix the scoreboard page it looks wrong', 20,
    [], ['No specific visual issue described', 'No browser/state context given'], hoursAgo(220)),
  passed('dan-commits', 'Scoreboard: pass allowPreviewData when hasLiveData is false', 81,
    ['packages/ui/src/components/promptcourt/landing/Scoreboard.tsx'], [], hoursAgo(215)),
  rolledBack('dan-commits', 'Rewrite the entire karen.ts file to use a class-based architecture instead of standalone functions', 29,
    ['convex/karen.ts'],
    ['Architectural refactor with no decision record', 'No acceptance criteria', 'No rollback plan'], hoursAgo(180)),
  passed('dan-commits', 'Add adminAuditLog table and append helper to karen.ts', 80,
    ['convex/schema.ts', 'convex/karen.ts'], [], hoursAgo(150)),
  blocked('dan-commits', 'can you make the landing page look better', 11,
    [], ['No component named', 'No visual target described', 'Not a valid prompt for Karen'], hoursAgo(120)),
  passed('dan-commits', 'Improve Home hero: tighten type scale, add mascot motion on scroll', 79,
    ['packages/ui/src/components/promptcourt/landing/Home.tsx',
     'packages/ui/src/components/promptcourt/KarenMascot.tsx'], [], hoursAgo(96)),
];

// ---------------------------------------------------------------------------
// Build the event queue
// ---------------------------------------------------------------------------
const events = [];

for (const session of mayaSessions) {
  const isBlocked = session.status === 'blocked_bad_prompt';
  events.push({
    kind: isBlocked ? 'blocked_prompt' : 'approved_prompt',
    session,
    publicPost: isBlocked
      ? blockedPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt)
      : undefined,
  });
}

for (const session of eliSessions) {
  const isBlocked = session.status === 'blocked_bad_prompt';
  const isRolledBack = session.status === 'executed_quiz_failed_rolled_back';
  events.push({
    kind: isBlocked ? 'blocked_prompt' : isRolledBack ? 'quiz_result' : 'approved_prompt',
    session,
    publicPost: (isBlocked || isRolledBack)
      ? (isRolledBack
          ? quizFailPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt)
          : blockedPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt))
      : undefined,
  });
}

for (const session of noraSessions) {
  const isBlocked = session.status === 'blocked_bad_prompt';
  const isRolledBack = session.status === 'executed_quiz_failed_rolled_back';
  events.push({
    kind: isBlocked ? 'blocked_prompt' : isRolledBack ? 'quiz_result' : 'approved_prompt',
    session,
    publicPost: (isBlocked || isRolledBack)
      ? (isRolledBack
          ? quizFailPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt)
          : blockedPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt))
      : undefined,
  });
}

for (const session of joSessions) {
  const isBlocked = session.status === 'blocked_bad_prompt';
  const isRolledBack = session.status === 'executed_quiz_failed_rolled_back';
  events.push({
    kind: isBlocked ? 'blocked_prompt' : isRolledBack ? 'quiz_result' : 'approved_prompt',
    session,
    publicPost: (isBlocked || isRolledBack)
      ? (isRolledBack
          ? quizFailPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt)
          : blockedPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt))
      : undefined,
  });
}

for (const session of danSessions) {
  const isBlocked = session.status === 'blocked_bad_prompt';
  const isRolledBack = session.status === 'executed_quiz_failed_rolled_back';
  events.push({
    kind: isBlocked ? 'blocked_prompt' : isRolledBack ? 'quiz_result' : 'approved_prompt',
    session,
    publicPost: (isBlocked || isRolledBack)
      ? (isRolledBack
          ? quizFailPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt)
          : blockedPost(session.username, session.prompt, session.promptScore, session.reasons, session.createdAt))
      : undefined,
  });
}

// Sort chronologically so ingest sees sessions in order (streak counting is time-ordered)
events.sort((a, b) => a.session.createdAt - b.session.createdAt);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const users = [...new Set(events.map((e) => e.session.username))];
console.log(`Seeding ${events.length} sessions for ${users.length} users: ${users.join(', ')}`);
console.log(`Target: ${BASE_URL}/karen/ingest\n`);

let ok = 0;
let failed = 0;

for (const event of events) {
  const { username, status, promptScore, createdAt } = event.session;
  const age = Math.round((now - createdAt) / 3_600_000);
  process.stdout.write(`  [${username}] ${status} score=${promptScore} ${age}h ago … `);
  try {
    await ingest(event.kind, event.session, event.publicPost);
    console.log('ok');
    ok++;
  } catch (err) {
    console.log(`FAIL — ${err.message}`);
    failed++;
  }
}

console.log(`\nDone. ${ok} ingested, ${failed} failed.`);
if (failed > 0) process.exit(1);
