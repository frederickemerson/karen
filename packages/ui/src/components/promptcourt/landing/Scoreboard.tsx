import React from 'react';

import type { PromptCourtOverview, PromptCourtProfile, PromptCourtPublicPost } from '@/lib/promptcourt';
import { isKarenCloudConfigured } from '@/lib/karenCloudConfig';
import { LiveLeaderboardShowcase, type LiveLeaderboardDeveloper, type LiveLeaderboardEvent } from '../LiveLeaderboardShowcase';
import { BadPromptGraveyard } from '../BadPromptGraveyard';

const timeAgo = (value: number) => {
  if (!Number.isFinite(value)) return 'unknown';
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

const latestSessionAt = (profile: PromptCourtProfile) =>
  Math.max(0, ...profile.recentSessions.map((session) => session.createdAt));

const statusForProfile = (profile: PromptCourtProfile): LiveLeaderboardDeveloper['status'] => {
  const latest = profile.recentSessions[0];
  if (!latest) return 'idle';
  if (Date.now() - latest.createdAt < 5 * 60 * 1000) return 'live';
  if (latest.status.includes('quiz') || latest.status.includes('approved')) return 'reviewing';
  return 'idle';
};

const developerFromProfile = (profile: PromptCourtProfile, index: number): LiveLeaderboardDeveloper => ({
  id: profile.user.username,
  name: profile.user.displayName || profile.user.username,
  handle: profile.user.username,
  promptScore: profile.stats.disciplineScore,
  quizPassRate: profile.stats.quizPassRate,
  streak: profile.stats.currentStreak || profile.stats.longestStreak,
  rollbacksAvoided: profile.stats.promotedRuns,
  rankDelta: index === 0 ? 1 : 0,
  status: statusForProfile(profile),
});

const eventFromPost = (post: PromptCourtPublicPost): LiveLeaderboardEvent => ({
  id: post.id,
  actor: `@${post.username}`,
  label: post.type === 'quiz_failed' ? 'quiz failed' : 'prompt blocked',
  detail: post.title || post.promptExcerpt || 'Karen recorded a public court event.',
  timestamp: timeAgo(post.createdAt),
  scoreDelta: typeof post.score === 'number' ? Math.max(-25, Math.round((post.score - 70) / 3)) : undefined,
  tone: 'warn',
});

const eventFromProfile = (profile: PromptCourtProfile): LiveLeaderboardEvent | null => {
  const session = profile.recentSessions[0];
  if (!session) return null;
  const passed = session.quizPassed === true || session.status === 'executed_quiz_passed';
  return {
    id: session.id,
    actor: `@${profile.user.username}`,
    label: passed ? 'diff quiz passed' : session.status.replace(/_/g, ' '),
    detail: session.changedFiles?.length
      ? `${session.changedFiles.slice(0, 2).join(', ')}${session.changedFiles.length > 2 ? ' and more' : ''}`
      : session.prompt || 'PromptCourt session recorded.',
    timestamp: timeAgo(session.createdAt),
    scoreDelta: passed ? 12 : typeof session.promptScore === 'number' ? Math.round((session.promptScore - 70) / 5) : undefined,
    tone: passed ? 'pass' : session.rollbackTriggered ? 'warn' : 'ship',
  };
};

const landingDataFromOverview = (overview: PromptCourtOverview | null | undefined) => {
  const ranked = overview?.leaderboard ?? [];
  const developers = ranked.map(developerFromProfile).slice(0, 5);
  const sessionEvents = (overview?.users ?? [])
    .slice()
    .sort((left, right) => latestSessionAt(right) - latestSessionAt(left))
    .map(eventFromProfile)
    .filter((event): event is LiveLeaderboardEvent => Boolean(event));
  const postEvents = (overview?.feed ?? []).map(eventFromPost);
  return {
    developers,
    events: [...sessionEvents, ...postEvents].slice(0, 5),
    posts: overview?.feed ?? [],
    hasLiveData: developers.length > 0 || postEvents.length > 0,
  };
};

export const Scoreboard: React.FC<{ overview?: PromptCourtOverview | null }> = ({ overview }) => {
  const { developers, events, posts, hasLiveData } = React.useMemo(() => landingDataFromOverview(overview), [overview]);

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">public scoreboard</div>
        <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
          We keep score. We name and shame.
        </h2>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-[#4d4d4d]">
          If you fail the read check, the court records it. The feed calls out what you missed and who missed it.
        </p>
      </div>

      <LiveLeaderboardShowcase
        developers={developers}
        events={events}
        live={isKarenCloudConfigured}
        updatedLabel={hasLiveData ? 'karen.overview live' : 'no public records yet'}
        title={hasLiveData ? 'Live leaderboard for people who read the diff.' : 'Leaderboard ready for first public run.'}
        subtitle={hasLiveData ? 'PromptCourt standings are pulled from Convex public records.' : 'Karen is wired up. Nobody has shipped a public run yet. Be the first name on the wall.'}
      />

      <div className="rounded-md border border-[#d8d8d8] bg-white p-4">
        <BadPromptGraveyard posts={posts} limit={6} title="Recent Public Failures" />
      </div>
    </div>
  );
};
