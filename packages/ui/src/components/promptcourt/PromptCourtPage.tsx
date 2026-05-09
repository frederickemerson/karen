import React from 'react';
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';
import { useMutation, useQuery } from 'convex/react';
import {
  fetchPromptCourtOverview,
  fetchPromptCourtProfile,
  fetchPromptCourtRunEvents,
  getPromptCourtUsername,
  setPromptCourtUsername,
  type PromptCourtOverview,
  type PromptCourtProfile,
  type PromptCourtPublicPost,
  type PromptCourtRunEvent,
} from '@/lib/promptcourt';
import { cn } from '@/lib/utils';
import { KarenLogo } from './KarenLogo';
import { KarenMascot } from './KarenMascot';
import { isKarenAuthConfigured, isKarenCloudConfigured } from '@/lib/karenCloudConfig';
import { api } from '../../../../../convex/_generated/api';

const formatDate = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const statusLabel = (status: string): string => status.replaceAll('_', ' ');

const statusTone = (session: PromptCourtProfile['recentSessions'][number]): 'good' | 'bad' | 'default' => {
  if (session.status === 'executed_quiz_passed') return 'good';
  if (session.status === 'blocked_bad_prompt' || session.rollbackTriggered) return 'bad';
  return 'default';
};

const commandCards = [
  {
    label: 'Open Karen',
    command: 'karen',
    helper: 'Launch the terminal-first judge from any repo after installing.',
  },
  {
    label: 'Install command',
    command: 'bun run install:karen',
    helper: 'Creates the local karen command without leaving this repo.',
  },
  {
    label: 'Start GUI',
    command: 'OPENCHAMBER_PORT=3002 bun run dev',
    helper: 'Serves the local Karen dashboard and workspace shell.',
  },
  {
    label: 'OpenCode passthrough',
    command: '/oc providers list',
    helper: 'Run inside Karen when you need raw OpenCode commands.',
  },
];

const Stat = ({ label, value, tone = 'default' }: { label: string; value: React.ReactNode; tone?: 'default' | 'good' | 'bad' }) => (
  <div className={cn(
    'rounded-md border px-3 py-2',
    tone === 'good' ? 'border-[var(--status-success)]/30 bg-[var(--status-success)]/10' : '',
    tone === 'bad' ? 'border-[var(--status-error)]/30 bg-[var(--status-error)]/10' : '',
    tone === 'default' ? 'border-border bg-card' : '',
  )}>
    <div className="typography-micro text-muted-foreground">{label}</div>
    <div className="mt-1 typography-title text-foreground">{value}</div>
  </div>
);

const ScoreMeter = ({ score }: { score: number }) => (
  <div className="flex items-center gap-4">
    <div className="relative grid size-24 place-items-center rounded-full border border-border bg-card">
      <div
        className="absolute inset-2 rounded-full"
        style={{
          background: `conic-gradient(var(--status-success) ${Math.max(0, Math.min(100, score))}%, var(--muted) 0)`,
        }}
      />
      <div className="relative grid size-16 place-items-center rounded-full bg-background">
        <span className="text-2xl font-semibold tracking-normal text-foreground">{score}</span>
      </div>
    </div>
    <div>
      <div className="typography-ui-label text-muted-foreground">Karen rating</div>
      <div className="text-2xl font-semibold tracking-normal text-foreground">{score}/100</div>
    </div>
  </div>
);

const PublicPostCard = ({ post }: { post: PromptCourtPublicPost }) => (
  <article className="rounded-md border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="typography-ui-label font-semibold text-foreground">@{post.username}</div>
        <div className="typography-micro text-muted-foreground">{formatDate(post.createdAt)}</div>
      </div>
      <span className="rounded-sm bg-[var(--status-error)]/15 px-2 py-1 typography-micro font-medium text-[var(--status-error)]">
        {post.type === 'quiz_failed' ? 'quiz fail' : `${post.score ?? 0}/100`}
      </span>
    </div>
    <h2 className="mt-3 typography-title text-foreground">{post.title}</h2>
    {post.promptExcerpt ? (
      <p className="mt-2 typography-body rounded-md bg-muted/40 p-3 text-foreground">{post.promptExcerpt}</p>
    ) : null}
    {post.failureReasons && post.failureReasons.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {post.failureReasons.map((reason) => (
          <span key={reason} className="rounded-sm bg-background px-2 py-1 typography-micro text-muted-foreground">
            {reason}
          </span>
        ))}
      </div>
    ) : null}
  </article>
);

const CommandCard = ({ label, command, helper }: { label: string; command: string; helper: string }) => {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="typography-ui-label font-semibold text-foreground">{label}</div>
          <p className="mt-1 typography-micro text-muted-foreground">{helper}</p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-sm border border-border bg-background px-2 py-1 typography-micro text-foreground hover:bg-muted/50"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code className="mt-3 block rounded-sm bg-muted/45 px-2 py-2 font-mono text-xs text-foreground">{command}</code>
    </div>
  );
};

const LaunchControls = ({ profile, onRun, runPrompt, onRunPromptChange, runStatus, canRun }: {
  profile: PromptCourtProfile;
  onRun: () => void;
  runPrompt: string;
  onRunPromptChange: (value: string) => void;
  runStatus: string | null;
  canRun: boolean;
}) => (
  <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <KarenLogo className="size-14 shrink-0" mood={profile.stats.rollbackCount > 0 ? 'mad' : 'calm'} />
        <div>
          <div className="typography-ui-label text-muted-foreground">Launch desk</div>
          <h2 className="mt-1 text-xl font-semibold tracking-normal text-foreground">Run Karen where the code lives</h2>
          <p className="mt-2 typography-body text-muted-foreground">
            Start a guarded run here, or keep using the terminal when you want the full interactive quiz.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <textarea
          value={runPrompt}
          onChange={(event) => onRunPromptChange(event.target.value)}
          rows={4}
          placeholder="Ask Karen to run a scoped prompt..."
          className="min-h-28 resize-y rounded-md border border-border bg-background px-3 py-2 typography-body text-foreground outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            className="rounded-md border border-border bg-foreground px-3 py-2 typography-ui-label text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run guarded prompt
          </button>
          <a href="/" className="rounded-md border border-border px-3 py-2 typography-ui-label text-foreground hover:bg-muted/40">
            Open workspace
          </a>
          <a href="#karen-help" className="rounded-md border border-border px-3 py-2 typography-ui-label text-foreground hover:bg-muted/40">
            Command help
          </a>
        </div>
        {runStatus ? <div className="typography-micro text-muted-foreground">{runStatus}</div> : null}
      </div>
    </div>
    <div id="karen-help" className="grid gap-3 sm:grid-cols-2">
      {commandCards.map((card) => (
        <CommandCard key={card.command} {...card} />
      ))}
    </div>
  </section>
);

const runEventTone = (status: string): 'good' | 'bad' | 'default' => {
  if (status === 'quiz_passed' || status === 'synced') return 'good';
  if (status === 'blocked' || status === 'rollback' || status === 'failed') return 'bad';
  return 'default';
};

const LiveRunStream = ({ events }: { events: PromptCourtRunEvent[] }) => (
  <section className="rounded-md border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-normal text-foreground">Live Run Status</h2>
        <p className="mt-1 typography-micro text-muted-foreground">
          Browser stream from local Karen runs: running, blocked, quiz, rollback, sync, and launcher failures.
        </p>
      </div>
      <span className="rounded-sm bg-muted px-2 py-1 typography-micro text-muted-foreground">
        {events.length > 0 ? 'streaming' : 'waiting'}
      </span>
    </div>
    <div className="mt-4 grid gap-2">
      {events.length > 0 ? events.slice(0, 8).map((event) => {
        const tone = runEventTone(event.status);
        return (
          <div key={event.id} className="grid gap-3 rounded-md border border-border bg-background/50 p-3 md:grid-cols-[148px_1fr_auto]">
            <span className={cn(
              'w-fit rounded-sm px-2 py-1 typography-micro font-medium',
              tone === 'good' && 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
              tone === 'bad' && 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
              tone === 'default' && 'bg-muted text-muted-foreground',
            )}>
              {event.status.replaceAll('_', ' ')}
            </span>
            <div>
              <div className="typography-ui-label text-foreground">{event.label}</div>
              {event.details ? <div className="mt-1 typography-micro text-muted-foreground">{event.details}</div> : null}
            </div>
            <div className="typography-micro text-muted-foreground md:text-right">{formatDate(event.createdAt)}</div>
          </div>
        );
      }) : (
        <div className="rounded-md border border-dashed border-border bg-background/50 p-4 typography-body text-muted-foreground">
          Start a guarded prompt from the GUI or terminal. Karen will stream the verdict here.
        </div>
      )}
    </div>
  </section>
);

const Rewards = ({ profile }: { profile: PromptCourtProfile }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xl font-semibold tracking-normal text-foreground">Rewards</h2>
      <span className="typography-micro text-muted-foreground">{profile.rewards.length} unlocked</span>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {profile.rewards.length > 0 ? profile.rewards.map((reward) => (
        <div
          key={reward.id}
          className={cn(
            'rounded-md border p-3',
            reward.tone === 'bad'
              ? 'border-[var(--status-error)]/30 bg-[var(--status-error)]/10'
              : 'border-[var(--status-success)]/30 bg-[var(--status-success)]/10',
          )}
        >
          <div className="typography-ui-label font-semibold text-foreground">{reward.label}</div>
          <div className="mt-1 typography-micro text-muted-foreground">
            {reward.tone === 'bad' ? 'Visible on the record' : 'Counts toward clout'}
          </div>
        </div>
      )) : (
        <div className="rounded-md border border-border bg-card p-4 typography-body text-muted-foreground">
          No rewards yet. Karen is waiting.
        </div>
      )}
    </div>
  </section>
);

const QuizHistory = ({ profile }: { profile: PromptCourtProfile }) => {
  const quizSessions = profile.recentSessions.filter((session) => typeof session.quizPassed === 'boolean');
  const passCount = quizSessions.filter((session) => session.quizPassed).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Quiz History</h2>
          <p className="mt-1 typography-micro text-muted-foreground">Recent code-read checks from Karen terminal runs.</p>
        </div>
        <span className="typography-micro text-muted-foreground">
          {passCount}/{quizSessions.length || 0} passed
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-card">
        {quizSessions.length > 0 ? quizSessions.slice(0, 10).map((session) => {
          const tone = statusTone(session);
          return (
            <div key={session.id} className="grid gap-3 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[160px_1fr_auto]">
              <div>
                <span className={cn(
                  'rounded-sm px-2 py-1 typography-micro font-medium',
                  tone === 'good' && 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
                  tone === 'bad' && 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
                  tone === 'default' && 'bg-muted text-muted-foreground',
                )}>
                  {session.quizPassed ? 'passed' : 'failed'}
                </span>
                <div className="mt-2 typography-micro text-muted-foreground">{formatDate(session.completedAt ?? session.createdAt)}</div>
              </div>
              <div>
                <div className="typography-ui-label text-foreground">{statusLabel(session.status)}</div>
                {session.prompt ? (
                  <p className="mt-1 line-clamp-2 typography-body text-muted-foreground">{session.prompt}</p>
                ) : null}
                {session.changedFiles && session.changedFiles.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {session.changedFiles.slice(0, 4).map((file) => (
                      <span key={file} className="rounded-sm bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {file}
                      </span>
                    ))}
                    {session.changedFiles.length > 4 ? (
                      <span className="rounded-sm bg-background px-2 py-1 typography-micro text-muted-foreground">
                        +{session.changedFiles.length - 4}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="text-left md:text-right">
                <div className="typography-micro text-muted-foreground">Prompt score</div>
                <div className="typography-title text-foreground">{session.promptScore}/100</div>
              </div>
            </div>
          );
        }) : (
          <div className="p-4 typography-body text-muted-foreground">
            No quiz runs yet. Start Karen in the terminal and let it generate a patch.
          </div>
        )}
      </div>
    </section>
  );
};

const FailedResetLessons = ({ profile }: { profile: PromptCourtProfile }) => {
  const failedSessions = profile.recentSessions.filter((session) => session.rollbackTriggered || session.status === 'blocked_bad_prompt');
  const latestRewrite = profile.publicPosts.find((post) => post.suggestedRewrite)?.suggestedRewrite;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Failed Reset Lessons</h2>
          <p className="mt-1 typography-micro text-muted-foreground">What Karen wants you to fix before another run.</p>
        </div>
        <span className="typography-micro text-muted-foreground">{failedSessions.length} recent resets or blocks</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="typography-ui-label font-semibold text-foreground">Default recovery drill</div>
          <ol className="mt-3 grid gap-2 typography-body text-muted-foreground">
            <li>1. Read the changed files before answering the quiz.</li>
            <li>2. Name the risky file, changed symbol, and expected behavior.</li>
            <li>3. Rewrite vague prompts with files, constraints, tests, and done criteria.</li>
            <li>4. Keep prompts short enough for Karen to judge the intent.</li>
          </ol>
          {latestRewrite ? (
            <div className="mt-4 rounded-md bg-muted/45 p-3">
              <div className="typography-micro text-muted-foreground">Latest rewrite advice</div>
              <p className="mt-1 typography-body text-foreground">{latestRewrite}</p>
            </div>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {failedSessions.length > 0 ? failedSessions.slice(0, 5).map((session) => (
            <div key={session.id} className="border-b border-border px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-sm bg-[var(--status-error)]/15 px-2 py-1 typography-micro font-medium text-[var(--status-error)]">
                  {session.rollbackTriggered ? 'reset after quiz' : 'blocked before run'}
                </span>
                <span className="typography-micro text-muted-foreground">{formatDate(session.completedAt ?? session.createdAt)}</span>
              </div>
              {session.prompt ? (
                <p className="mt-2 line-clamp-2 typography-body text-foreground">{session.prompt}</p>
              ) : null}
              {session.reasons && session.reasons.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {session.reasons.slice(0, 3).map((reason) => (
                    <span key={reason} className="rounded-sm bg-background px-2 py-1 typography-micro text-muted-foreground">
                      {reason}
                    </span>
                  ))}
                </div>
              ) : null}
              {session.changedFiles && session.changedFiles.length > 0 ? (
                <div className="mt-2 typography-micro text-muted-foreground">
                  Reset touched {session.changedFiles.slice(0, 3).join(', ')}
                  {session.changedFiles.length > 3 ? ` +${session.changedFiles.length - 3}` : ''}
                </div>
              ) : null}
            </div>
          )) : (
            <div className="p-4 typography-body text-muted-foreground">
              No failed resets yet. Suspiciously clean.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const Leaderboard = ({ users }: { users: PromptCourtProfile[] }) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-xl font-semibold tracking-normal text-foreground">Leaderboard</h2>
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {users.length > 0 ? users.map((entry, index) => (
        <a
          key={entry.user.username}
          href={`/u/${encodeURIComponent(entry.user.username)}`}
          className="grid grid-cols-[48px_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/35"
        >
          <div className="typography-ui-label text-muted-foreground">#{index + 1}</div>
          <div>
            <div className="typography-ui-label font-semibold text-foreground">@{entry.user.username}</div>
            <div className="typography-micro text-muted-foreground">{entry.stats.level}</div>
          </div>
          <div className="text-right">
            <div className="typography-ui-label font-semibold text-foreground">{entry.stats.disciplineScore}</div>
            <div className="typography-micro text-muted-foreground">{entry.stats.longestStreak} streak</div>
          </div>
        </a>
      )) : (
        <div className="p-4 typography-body text-muted-foreground">No ranked users yet.</div>
      )}
    </div>
  </section>
);

const RecentSessions = ({ profile }: { profile: PromptCourtProfile }) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-xl font-semibold tracking-normal text-foreground">Recent Runs</h2>
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {profile.recentSessions.length > 0 ? profile.recentSessions.slice(0, 8).map((session) => (
        <div key={session.id} className="border-b border-border px-4 py-3 last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn(
              'rounded-sm px-2 py-1 typography-micro font-medium',
              statusTone(session) === 'good'
                ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
                : statusTone(session) === 'bad'
                  ? 'bg-[var(--status-error)]/15 text-[var(--status-error)]'
                  : 'bg-muted text-muted-foreground',
            )}>
              {statusLabel(session.status)}
            </span>
            <span className="typography-micro text-muted-foreground">{formatDate(session.createdAt)}</span>
          </div>
          {session.prompt ? (
            <p className="mt-2 line-clamp-2 typography-body text-foreground">{session.prompt}</p>
          ) : null}
          {session.changedFiles && session.changedFiles.length > 0 ? (
            <div className="mt-2 typography-micro text-muted-foreground">
              {session.changedFiles.slice(0, 3).join(', ')}
              {session.changedFiles.length > 3 ? ` +${session.changedFiles.length - 3}` : ''}
            </div>
          ) : null}
        </div>
      )) : (
        <div className="p-4 typography-body text-muted-foreground">No sessions yet.</div>
      )}
    </div>
  </section>
);

const ProfilePanel = ({ profile, overview }: { profile: PromptCourtProfile; overview: PromptCourtOverview | null }) => (
  <section className="grid gap-5 lg:grid-cols-[1.45fr_0.55fr]">
    <div className="grid gap-5 rounded-md border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <KarenLogo className="size-14 shrink-0" mood={profile.stats.publicFailureCount > 0 ? 'mad' : 'calm'} />
            <div>
              <div className="typography-ui-label text-muted-foreground">Karen GUI</div>
              <h1 className="mt-1 text-4xl font-semibold tracking-normal text-foreground">@{profile.user.username}</h1>
              <div className="mt-1 typography-body text-muted-foreground">{profile.stats.level}</div>
            </div>
          </div>
          <ScoreMeter score={profile.stats.disciplineScore} />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Prompt Avg" value={`${profile.stats.averagePromptScore}/100`} />
          <Stat label="Quiz Pass" value={`${profile.stats.quizPassRate}%`} tone="good" />
          <Stat label="Promoted Runs" value={profile.stats.promotedRuns} tone="good" />
          <Stat label="Public Fails" value={profile.stats.publicFailureCount} tone={profile.stats.publicFailureCount > 0 ? 'bad' : 'default'} />
          <Stat label="Current Streak" value={profile.stats.currentStreak} />
          <Stat label="Longest Streak" value={profile.stats.longestStreak} />
          <Stat label="Rollbacks" value={profile.stats.rollbackCount} tone={profile.stats.rollbackCount > 0 ? 'bad' : 'default'} />
          <Stat label="Files Survived" value={profile.stats.generatedFileCount} />
        </div>
      </div>
      <KarenMascot className="hidden min-h-[300px] lg:block" mood={profile.stats.publicFailureCount > 0 ? 'mad' : 'calm'} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <Stat label="Users Ranked" value={overview?.totals.users ?? 0} />
      <Stat label="Total Sessions" value={overview?.totals.sessions ?? 0} />
      <Stat label="Public Records" value={overview?.totals.publicFailures ?? 0} tone={(overview?.totals.publicFailures ?? 0) > 0 ? 'bad' : 'default'} />
      <Stat label="Promoted Patches" value={overview?.totals.promotedRuns ?? 0} tone="good" />
    </div>
  </section>
);

const KarenAuthBar = () => {
  if (!isKarenAuthConfigured) {
    return (
      <div className="typography-micro text-muted-foreground">
        Local profile mode
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button" className="rounded-md border border-border px-3 py-2 typography-ui-label text-foreground hover:bg-muted/40">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
};

const CurrentUserBinder = () => {
  const { isSignedIn, user } = useUser();
  const upsertCurrentUser = useMutation(api.karen.upsertCurrentUser);

  React.useEffect(() => {
    if (!isSignedIn || !user) return;
    const username = setPromptCourtUsername(
      user.username
      || user.primaryEmailAddress?.emailAddress?.split('@')[0]
      || user.id,
    );
    void upsertCurrentUser({
      username,
      displayName: user.fullName || user.username || undefined,
      imageUrl: user.imageUrl || undefined,
    });
  }, [isSignedIn, upsertCurrentUser, user]);

  return null;
};

const AuthBinder = () => isKarenAuthConfigured ? <CurrentUserBinder /> : null;

const runKarenPrompt = async (prompt: string): Promise<string> => {
  const response = await fetch('/api/promptcourt/run', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-promptcourt-user': getPromptCourtUsername(),
    },
    body: JSON.stringify({ prompt, username: getPromptCourtUsername() }),
  });
  const payload = await response.json().catch(() => ({})) as { message?: string; error?: string; verdict?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Karen run failed (${response.status})`);
  }
  return payload.message || payload.verdict || 'Karen run started.';
};

const PromptCourtLayout: React.FC<{
  profile: PromptCourtProfile | null;
  overview: PromptCourtOverview | null;
  error: string | null;
  source: 'cloud' | 'local';
}> = ({ profile, overview, error, source }) => {
  const [runPrompt, setRunPrompt] = React.useState('');
  const [runStatus, setRunStatus] = React.useState<string | null>(null);
  const [runEvents, setRunEvents] = React.useState<PromptCourtRunEvent[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const feed = overview?.feed ?? [];
  const canRun = runPrompt.trim().length > 0 && !isRunning;

  React.useEffect(() => {
    document.documentElement.classList.add('karen-document-scroll');
    return () => {
      document.documentElement.classList.remove('karen-document-scroll');
    };
  }, []);

  React.useEffect(() => {
    const username = profile?.user.username || getPromptCourtUsername();
    let cancelled = false;
    const addEvents = (events: PromptCourtRunEvent[]) => {
      if (cancelled || events.length === 0) return;
      setRunEvents((current) => {
        const byId = new Map(current.map((event) => [event.id, event]));
        for (const event of events) byId.set(event.id, event);
        return [...byId.values()]
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(0, 30);
      });
    };

    void fetchPromptCourtRunEvents({ username, limit: 30 }).then(addEvents).catch(() => {});

    const params = new URLSearchParams({ username });
    const events = new EventSource(`/api/promptcourt/runs/events?${params.toString()}`);
    events.addEventListener('run', (message) => {
      try {
        addEvents([JSON.parse((message as MessageEvent).data) as PromptCourtRunEvent]);
      } catch {
        // Ignore malformed stream events.
      }
    });
    events.onerror = () => {
      events.close();
    };
    return () => {
      cancelled = true;
      events.close();
    };
  }, [profile?.user.username]);

  const handleRun = async () => {
    const prompt = runPrompt.trim();
    if (!prompt) return;
    setIsRunning(true);
    setRunStatus('Karen is judging this prompt...');
    try {
      const message = await runKarenPrompt(prompt);
      setRunStatus(message);
      setRunPrompt('');
    } catch (nextError) {
      setRunStatus(nextError instanceof Error ? nextError.message : 'Karen run failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <AuthBinder />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="typography-ui-label text-primary hover:underline">Back to workspace</a>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/karen/landing" className="typography-micro text-primary hover:underline">Landing page</a>
            <div className="typography-micro text-muted-foreground">
              {source === 'cloud' ? 'Live Convex profile' : 'Local profile'} · Karen watches prompts, git diffs, quiz passes, and public failures.
            </div>
            <KarenAuthBar />
          </div>
        </div>
        {error ? (
          <div className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error)]/10 p-4 text-[var(--status-error)]">
            {error}
          </div>
        ) : null}
        {profile ? <ProfilePanel profile={profile} overview={overview} /> : null}
        {profile ? (
          <LaunchControls
            profile={profile}
            onRun={handleRun}
            runPrompt={runPrompt}
            onRunPromptChange={setRunPrompt}
            runStatus={runStatus}
            canRun={canRun}
          />
        ) : null}
        <LiveRunStream events={runEvents} />
        {profile ? <Rewards profile={profile} /> : null}
        {profile ? <QuizHistory profile={profile} /> : null}
        {profile ? <FailedResetLessons profile={profile} /> : null}
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Leaderboard users={overview?.leaderboard ?? []} />
          {profile ? <RecentSessions profile={profile} /> : null}
        </div>
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-normal text-foreground">Public Feed</h2>
            <span className="typography-micro text-muted-foreground">{feed.length} records</span>
          </div>
          {feed.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {feed.map((post) => <PublicPostCard key={post.id} post={post} />)}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-card p-6 typography-body text-muted-foreground">
              No public failures yet.
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

const LocalPromptCourtPage: React.FC<{ username?: string | null }> = ({ username }) => {
  const [overview, setOverview] = React.useState<PromptCourtOverview | null>(null);
  const [profile, setProfile] = React.useState<PromptCourtProfile | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const resolvedUsername = username || getPromptCourtUsername();

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [nextOverview, nextProfile] = await Promise.all([
          fetchPromptCourtOverview(),
          fetchPromptCourtProfile(resolvedUsername),
        ]);
        if (!cancelled) {
          setOverview(nextOverview);
          setProfile(nextProfile);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load Karen');
        }
      }
    };
    void run();
    const interval = window.setInterval(run, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [resolvedUsername]);

  return <PromptCourtLayout profile={profile} overview={overview} error={error} source="local" />;
};

const CloudPromptCourtPage: React.FC<{ username?: string | null }> = ({ username }) => {
  const resolvedUsername = username || getPromptCourtUsername();
  const overview = useQuery(api.karen.overview) as PromptCourtOverview | undefined;
  const profile = useQuery(api.karen.profile, { username: resolvedUsername }) as PromptCourtProfile | undefined;
  return (
    <PromptCourtLayout
      profile={profile ?? null}
      overview={overview ?? null}
      error={null}
      source="cloud"
    />
  );
};

export const PromptCourtPage: React.FC<{ username?: string | null }> = (props) => {
  if (isKarenCloudConfigured) {
    return <CloudPromptCourtPage {...props} />;
  }
  return <LocalPromptCourtPage {...props} />;
};
