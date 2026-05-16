import React from 'react';
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';
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
import { playKarenEventAudio, type KarenAudioEvent } from '@/lib/karenVoice';
import { KarenLogo } from './KarenLogo';
import { KarenMascot } from './KarenMascot';
import { KarenQuizGameModal, type KarenQuizRun } from './KarenQuizGameModal';
import { PublicProfileView, PublicProfileNotFound, PublicProfileLoading } from './PublicProfileView';
import { isKarenAuthConfigured, isKarenCloudConfigured } from '@/lib/karenCloudConfig';
import { api } from '../../../../../convex/_generated/api';

// Module-scoped counter for the `karen-document-scroll` class. Multiple Karen
// components can mount/unmount in quick succession during route swaps; without
// a counter the last unmount can strip the class while another consumer is
// still on screen. Increment on mount, decrement on unmount; only remove when
// the count is zero.
let karenScrollClassCount = 0;
const acquireKarenScrollClass = () => {
  karenScrollClassCount += 1;
  if (karenScrollClassCount === 1) {
    document.documentElement.classList.add('karen-document-scroll');
  }
};
const releaseKarenScrollClass = () => {
  karenScrollClassCount = Math.max(0, karenScrollClassCount - 1);
  if (karenScrollClassCount === 0) {
    document.documentElement.classList.remove('karen-document-scroll');
  }
};

// EventSource with exponential-backoff reconnect. Returns a cleanup function
// and exposes a status callback so the UI can render a "reconnecting" pill.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_CAP_MS = 30000;

type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const createReconnectingEventSource = (
  url: string,
  options: {
    onMessage: (event: MessageEvent) => void;
    eventName: string;
    onStatus?: (status: ConnectionStatus) => void;
  },
): (() => void) => {
  let attempt = 0;
  let cancelled = false;
  let source: EventSource | null = null;
  let retryTimer: number | null = null;

  const setStatus = (status: ConnectionStatus) => {
    options.onStatus?.(status);
  };

  const connect = () => {
    if (cancelled) return;
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
    try {
      source = new EventSource(url);
    } catch {
      scheduleRetry();
      return;
    }
    source.addEventListener(options.eventName, options.onMessage as EventListener);
    source.onopen = () => {
      attempt = 0;
      setStatus('open');
    };
    source.onerror = () => {
      if (!source) return;
      source.close();
      source = null;
      scheduleRetry();
    };
  };

  const scheduleRetry = () => {
    if (cancelled) return;
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_CAP_MS);
    attempt += 1;
    setStatus('reconnecting');
    retryTimer = window.setTimeout(connect, delay);
  };

  connect();

  return () => {
    cancelled = true;
    setStatus('closed');
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (source) {
      source.close();
      source = null;
    }
  };
};

// Subscribe to SPA location changes. App.tsx parses paths manually (no
// react-router at this level), so we synthesize location updates by listening
// to popstate plus monkey-patching pushState/replaceState. Re-runs the
// subscriber any time the URL changes.
const useLocationSearch = (): string => {
  const [search, setSearch] = React.useState(() =>
    typeof window === 'undefined' ? '' : window.location.search,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setSearch(window.location.search);
    const handlePop = () => update();
    window.addEventListener('popstate', handlePop);
    window.addEventListener('hashchange', handlePop);
    // Also poll on a slow interval as a defensive net for SPA navigations
    // that don't dispatch a synthetic event.
    const id = window.setInterval(update, 500);
    return () => {
      window.removeEventListener('popstate', handlePop);
      window.removeEventListener('hashchange', handlePop);
      window.clearInterval(id);
    };
  }, []);

  return search;
};

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
    helper: 'Start the terminal judge from any repo after installation.',
  },
  {
    label: 'Install command',
    command: 'bun run install:karen',
    helper: 'Creates the local `karen` command without leaving this repo.',
  },
  {
    label: 'Start GUI',
    command: 'OPENCHAMBER_PORT=3002 bun run dev',
    helper: 'Runs the local Karen dashboard and workspace shell.',
  },
  {
    label: 'Agent passthrough',
    command: '/oc providers list',
    helper: 'Run raw agent commands from inside Karen when you need them.',
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

const ScoreMeter = ({ score }: { score: number }) => {
  const clamped = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid size-24 place-items-center rounded-full border border-border bg-card">
        <div
          className="absolute inset-2 rounded-full"
          style={{
            background: `conic-gradient(var(--status-success) ${clamped}%, var(--muted) 0)`,
          }}
        />
        <div className="relative grid size-16 place-items-center rounded-full bg-background">
          <span className="text-2xl font-semibold tracking-normal text-foreground">{clamped}</span>
        </div>
      </div>
      <div>
        <div className="typography-ui-label text-muted-foreground">Karen rating</div>
        <div className="text-2xl font-semibold tracking-normal text-foreground">{clamped}/100</div>
      </div>
    </div>
  );
};

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
          <h2 className="mt-1 text-xl font-semibold tracking-normal text-foreground">Let Karen judge the run before it touches your repo</h2>
          <p className="mt-2 typography-body text-muted-foreground">
            The GUI starts a guarded browser job, records the verdict, and streams the quiz gate. Use terminal `/tui` when you need live interception inside the agent UI.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <textarea
          value={runPrompt}
          onChange={(event) => onRunPromptChange(event.target.value)}
          rows={4}
          placeholder="Tell Karen exactly what to change, where to change it, and how you will verify it."
          className="min-h-28 resize-y rounded-md border border-border bg-background px-3 py-2 typography-body text-foreground outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRun}
          disabled={!canRun}
          className="rounded-md border border-border bg-foreground px-3 py-2 typography-ui-label text-background disabled:cursor-not-allowed disabled:opacity-50"
        >
            Start guarded run
          </button>
          <a href="/" className="rounded-md border border-border px-3 py-2 typography-ui-label text-foreground hover:bg-muted/40">
            Open workspace
          </a>
          <a href="#karen-help" className="rounded-md border border-border px-3 py-2 typography-ui-label text-foreground hover:bg-muted/40">
            Terminal commands
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
  if (status === 'quiz_required' || status === 'quiz_passed' || status === 'completed' || status === 'synced') return 'good';
  if (status === 'blocked' || status === 'rollback' || status === 'failed') return 'bad';
  return 'default';
};

const audioEventForRunStatus = (status: string): KarenAudioEvent | null => {
  if (status === 'blocked') return 'prompt-blocked';
  if (status === 'quiz_required' || status === 'quiz_passed' || status === 'completed' || status === 'synced') return 'quiz-pass';
  if (status === 'rollback') return 'rollback';
  if (status === 'failed') return 'quiz-fail';
  return null;
};

const LiveRunStream = ({ events, connectionStatus }: { events: PromptCourtRunEvent[]; connectionStatus: ConnectionStatus }) => (
  <section className="rounded-md border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-normal text-foreground">Live Run Status</h2>
        <p className="mt-1 typography-micro text-muted-foreground">
          Live events from Karen runs: queued, judged, blocked, running, quiz required, rollback, and sync.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {connectionStatus === 'reconnecting' ? (
          <span className="rounded-sm bg-[var(--status-warning)]/15 px-2 py-1 typography-micro font-medium text-[var(--status-warning)]">
            reconnecting…
          </span>
        ) : null}
        <span className="rounded-sm bg-muted px-2 py-1 typography-micro text-muted-foreground">
          {connectionStatus === 'open'
            ? events.length > 0 ? 'streaming' : 'waiting'
            : connectionStatus === 'connecting' ? 'connecting' : connectionStatus === 'reconnecting' ? 'offline' : 'idle'}
        </span>
      </div>
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
          No runs yet. Karen is bored. Type a prompt; let her decide if it's worth her time.
        </div>
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
        <div className="p-4 typography-body text-muted-foreground">Nothing on the docket. Karen is suspicious.</div>
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
              <div className="typography-ui-label text-muted-foreground">Karen control room</div>
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
          <Stat label="Granny Skips" value={profile.stats.grannySkips ?? 0} tone={(profile.stats.grannySkips ?? 0) > 0 ? 'good' : 'default'} />
          <Stat label="Rollbacks" value={profile.stats.rollbackCount} tone={profile.stats.rollbackCount > 0 ? 'bad' : 'default'} />
          <Stat label="Files Survived" value={profile.stats.generatedFileCount} />
        </div>
      </div>
      <KarenMascot className="w-24 self-start lg:w-auto lg:min-h-[300px]" mood={profile.stats.publicFailureCount > 0 ? 'mad' : 'calm'} />
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
        <SignUpButton mode="modal">
          <button type="button" className="rounded-md border border-border bg-foreground px-3 py-2 typography-ui-label text-background hover:opacity-90">
            Sign up
          </button>
        </SignUpButton>
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

type GuiRun = {
  id: string;
  sessionId?: string | null;
  username: string;
  status: string;
  promptExcerpt?: string;
  promptScore?: number | null;
  verdict?: string | null;
  reasons?: string[];
  quiz?: {
    id: string;
    title: string;
    instructions: string;
    source: string;
    questions: Array<{
      id: string;
      prompt: string;
      options: string[];
      answer: number;
      evidence?: string;
      why?: string;
      source?: string;
    }>;
  } | null;
  diff?: string | null;
  diffSource?: string | null;
  diffNote?: string | null;
  changedFiles?: string[];
  result?:
    | { passed: boolean; completedAt: number; wrongQuestionId?: string | null }
    | { status: 'approved'; intent: 'conversational' | 'exploration' | 'no_changes'; message: string }
    | null;
  prompt?: string;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
};

type GuiRunEvent = PromptCourtRunEvent & {
  runId: string;
};

const runKarenPrompt = async (prompt: string): Promise<{ message: string; run: GuiRun }> => {
  const response = await fetch('/api/promptcourt/gui-runs', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-promptcourt-user': getPromptCourtUsername(),
    },
    body: JSON.stringify({ prompt, username: getPromptCourtUsername() }),
  });
  const payload = await response.json().catch(() => ({})) as { message?: string; error?: string; run?: GuiRun };
  if (!response.ok) {
    throw new Error(payload.error || `Karen run failed (${response.status})`);
  }
  if (!payload.run) {
    throw new Error('Karen did not return a GUI run id.');
  }
  return {
    message: payload.message || 'Karen queued a guarded browser run.',
    run: payload.run,
  };
};

const fetchGuiRun = async (runId: string): Promise<GuiRun> => {
  const response = await fetch(`/api/promptcourt/gui-runs/${encodeURIComponent(runId)}`, {
    headers: { accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; run?: GuiRun };
  if (!response.ok) {
    throw new Error(payload.error || `Karen run lookup failed (${response.status})`);
  }
  if (!payload.run) {
    throw new Error('Karen did not return that guarded run.');
  }
  return payload.run;
};

const KarenLoadingState: React.FC = () => (
  <div className="min-h-[100dvh] bg-background text-foreground">
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href="/" className="typography-ui-label text-primary hover:underline">Back to workspace</a>
        <span className="typography-micro text-muted-foreground">Karen is warming up…</span>
      </div>
      <div className="flex items-start gap-4 rounded-md border border-border bg-card/60 p-5">
        <KarenMascot className="w-24 lg:w-32" mood="calm" />
        <div className="flex-1 space-y-3">
          <div className="h-6 w-1/3 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted/40" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <div className="h-32 animate-pulse rounded-md border border-border bg-card/40" />
      <div className="h-48 animate-pulse rounded-md border border-border bg-card/40" />
      <div className="h-32 animate-pulse rounded-md border border-border bg-card/40" />
    </main>
  </div>
);

const KarenEmptyState: React.FC<{ username: string }> = ({ username }) => (
  <div className="min-h-[100dvh] bg-background text-foreground">
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <a href="/" className="typography-ui-label text-primary hover:underline">Back to workspace</a>
        <KarenAuthBar />
      </div>
      <section className="rounded-md border border-border bg-card p-8 text-center">
        <KarenMascot className="mx-auto w-32 lg:w-48" mood="mad" />
        <h1 className="mt-4 text-3xl font-semibold tracking-normal text-foreground">No record on file</h1>
        <p className="mt-3 typography-body text-muted-foreground">
          Karen is suspicious. Run your first prompt — let her decide if you're worth recording.
        </p>
        <div className="mx-auto mt-6 max-w-md rounded-md border border-border bg-background p-3">
          <div className="typography-micro text-muted-foreground">Install command</div>
          <code className="mt-2 block rounded-sm bg-muted/45 px-2 py-2 font-mono text-xs text-foreground">
            bun run install:karen
          </code>
        </div>
        <p className="mt-4 typography-micro text-muted-foreground">@{username}</p>
      </section>
    </main>
  </div>
);

const isProfileEmpty = (profile: PromptCourtProfile | null): boolean => {
  if (!profile) return true;
  const s = profile.stats;
  return (
    (s.totalSessions ?? 0) === 0
    && (s.promotedRuns ?? 0) === 0
    && (s.blockedPrompts ?? 0) === 0
    && (s.generatedFileCount ?? 0) === 0
    && (profile.recentSessions?.length ?? 0) === 0
    && (profile.publicPosts?.length ?? 0) === 0
  );
};

const PromptCourtLayout: React.FC<{
  profile: PromptCourtProfile | null;
  overview: PromptCourtOverview | null;
  error: string | null;
  source: 'cloud' | 'local';
  loading?: boolean;
  username?: string;
  isOwnProfile?: boolean;
}> = ({ profile, overview, error, source, loading = false, username, isOwnProfile = true }) => {
  const [runPrompt, setRunPrompt] = React.useState('');
  const [runStatus, setRunStatus] = React.useState<string | null>(null);
  const [runEvents, setRunEvents] = React.useState<PromptCourtRunEvent[]>([]);
  const [runStreamStatus, setRunStreamStatus] = React.useState<ConnectionStatus>('connecting');
  const [activeGuiRun, setActiveGuiRun] = React.useState<GuiRun | null>(null);
  const [activeGuiRunEvents, setActiveGuiRunEvents] = React.useState<GuiRunEvent[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [quizModalOpen, setQuizModalOpen] = React.useState(false);
  const lastAutoOpenedRunId = React.useRef<string | null>(null);
  const loadedRunFromRoute = React.useRef<string | null>(null);
  const announcedRunEvents = React.useRef(new Set<string>());
  const feed = overview?.feed ?? [];
  const canRun = runPrompt.trim().length > 0 && !isRunning;
  const locationSearch = useLocationSearch();

  React.useEffect(() => {
    acquireKarenScrollClass();
    return () => {
      releaseKarenScrollClass();
    };
  }, []);

  React.useEffect(() => {
    const username = profile?.user.username || getPromptCourtUsername();
    let cancelled = false;
    const addEvents = (events: PromptCourtRunEvent[], announce = false) => {
      if (cancelled || events.length === 0) return;
      if (announce) {
        for (const event of events) {
          if (announcedRunEvents.current.has(event.id)) continue;
          announcedRunEvents.current.add(event.id);
          const audioEvent = audioEventForRunStatus(event.status);
          if (audioEvent) void playKarenEventAudio(audioEvent);
        }
      } else {
        for (const event of events) announcedRunEvents.current.add(event.id);
      }
      setRunEvents((current) => {
        const byId = new Map(current.map((event) => [event.id, event]));
        for (const event of events) byId.set(event.id, event);
        return [...byId.values()]
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(0, 30);
      });
    };

    void fetchPromptCourtRunEvents({ username, limit: 30 }).then((events) => addEvents(events, false)).catch(() => {});

    const params = new URLSearchParams({ username });
    const cleanup = createReconnectingEventSource(`/api/promptcourt/runs/events?${params.toString()}`, {
      eventName: 'run',
      onStatus: (status) => {
        if (cancelled) return;
        setRunStreamStatus(status);
      },
      onMessage: (message) => {
        try {
          addEvents([JSON.parse((message as MessageEvent).data) as PromptCourtRunEvent], true);
        } catch {
          // Ignore malformed stream events.
        }
      },
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [profile?.user.username]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const routeRunId = new URLSearchParams(locationSearch).get('run');
    if (!routeRunId || loadedRunFromRoute.current === routeRunId) return;
    loadedRunFromRoute.current = routeRunId;
    setIsRunning(true);
    setRunStatus('Karen is opening the guarded run...');
    void fetchGuiRun(routeRunId)
      .then((run) => {
        setActiveGuiRun(run);
        setActiveGuiRunEvents([]);
        if (run.status === 'quiz_required' && run.quiz?.questions.length && lastAutoOpenedRunId.current !== run.id) {
          lastAutoOpenedRunId.current = run.id;
          setQuizModalOpen(true);
        }
        if (run.status === 'blocked' || run.status === 'failed' || run.status === 'completed' || run.status === 'quiz_required') {
          setIsRunning(false);
        }
        if (run.status === 'quiz_required') {
          setRunStatus('Karen reached the quiz gate. Time to defend the diff.');
        } else if (run.status === 'blocked') {
          setRunStatus('Karen blocked that prompt before it touched the code.');
        } else if (run.status === 'failed') {
          setRunStatus(run.error || 'Karen GUI run failed.');
        } else if (run.status === 'completed') {
          setRunStatus('Karen approved — no quiz required.');
        } else {
          setRunStatus('Karen is following the guarded run lifecycle.');
        }
      })
      .catch((nextError) => {
        setRunStatus(nextError instanceof Error ? nextError.message : 'Karen could not open that guarded run.');
        setIsRunning(false);
      });
  }, [locationSearch]);

  React.useEffect(() => {
    if (!activeGuiRun?.id) return;
    const cleanup = createReconnectingEventSource(
      `/api/promptcourt/gui-runs/${encodeURIComponent(activeGuiRun.id)}/events`,
      {
        eventName: 'gui-run',
        onMessage: (message) => {
          try {
            const payload = JSON.parse((message as MessageEvent).data) as { event: GuiRunEvent; run: GuiRun };
            setActiveGuiRun(payload.run);
            setActiveGuiRunEvents((current) => {
              const byId = new Map(current.map((event) => [event.id, event]));
              byId.set(payload.event.id, payload.event);
              return [...byId.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, 12);
            });
            setRunEvents((current) => {
              const byId = new Map(current.map((event) => [event.id, event]));
              byId.set(payload.event.id, payload.event);
              return [...byId.values()].sort((left, right) => right.createdAt - left.createdAt).slice(0, 30);
            });
            if (payload.run.status === 'quiz_required') {
              setIsRunning(false);
              setRunStatus('Karen reached the quiz gate. Time to defend the diff.');
              if (payload.run.quiz && payload.run.quiz.questions.length > 0 && lastAutoOpenedRunId.current !== payload.run.id) {
                lastAutoOpenedRunId.current = payload.run.id;
                setQuizModalOpen(true);
              }
            } else if (payload.run.status === 'blocked') {
              setIsRunning(false);
              setRunStatus('Karen blocked that prompt before it touched the code.');
            } else if (payload.run.status === 'failed') {
              setIsRunning(false);
              setRunStatus(payload.run.error || 'Karen GUI run failed.');
            } else if (payload.run.status === 'completed') {
              setIsRunning(false);
              const completedResult = payload.run.result;
              const completedMessage = completedResult && 'message' in completedResult
                ? completedResult.message
                : 'Karen approved — no quiz required.';
              setRunStatus(completedMessage);
            } else {
              setRunStatus(payload.event.label);
            }
          } catch {
            // Ignore malformed stream events.
          }
        },
      },
    );
    return cleanup;
  }, [activeGuiRun?.id]);

  const handleRun = async () => {
    const prompt = runPrompt.trim();
    if (!prompt) return;
    setIsRunning(true);
    setActiveGuiRun(null);
    setActiveGuiRunEvents([]);
    setRunStatus('Karen is queuing this guarded browser run...');
    try {
      const { message, run } = await runKarenPrompt(prompt);
      setActiveGuiRun(run);
      setActiveGuiRunEvents([]);
      setRunStatus(message);
      setRunPrompt('');
    } catch (nextError) {
      setRunStatus(nextError instanceof Error ? nextError.message : 'Karen run failed.');
      setIsRunning(false);
    }
  };

  // Read-only branch: visitor is looking at someone else's profile. Render the
  // public profile shell with no launch controls, terminal bridge, or auth
  // mutations.
  if (!isOwnProfile) {
    if (loading) {
      return <PublicProfileLoading username={username || ''} />;
    }
    if (!profile) {
      return <PublicProfileNotFound username={username || ''} />;
    }
    return <PublicProfileView profile={profile} username={username || profile.user.username} />;
  }

  // Loading: data is still in flight. Show skeleton, not empty state.
  if (loading && !profile && !overview) {
    return <KarenLoadingState />;
  }

  // Empty: data resolved but Karen has nothing on this user yet.
  if (!loading && isProfileEmpty(profile)) {
    return (
      <>
        <AuthBinder />
        <KarenEmptyState username={username || profile?.user.username || getPromptCourtUsername()} />
      </>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <AuthBinder />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a href="/" className="typography-ui-label text-primary hover:underline">Back to workspace</a>
          <div className="flex flex-wrap items-center gap-3">
            <a href="/karen/voice" className="typography-micro text-primary hover:underline">Voice settings</a>
            <a href="/karen/landing" className="typography-micro text-primary hover:underline">Landing page</a>
            <div className="typography-micro text-muted-foreground">
              {source === 'cloud' ? 'Live Convex profile' : 'Local profile'} · GUI runs and terminal `/tui` sessions share this record.
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
        {activeGuiRun ? (
          <section className="rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-normal text-foreground">Browser Run</h2>
                <p className="mt-1 typography-micro text-muted-foreground">
                  GUI job <code className="font-mono text-foreground">{activeGuiRun.id}</code> is following the guarded run lifecycle.
                </p>
              </div>
              <span className={cn(
                'rounded-sm px-2 py-1 typography-micro font-medium',
                runEventTone(activeGuiRun.status) === 'good' && 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
                runEventTone(activeGuiRun.status) === 'bad' && 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
                runEventTone(activeGuiRun.status) === 'default' && 'bg-muted text-muted-foreground',
              )}>
                {activeGuiRun.status.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="typography-micro text-muted-foreground">Verdict</div>
                <div className="mt-1 typography-title text-foreground">
                  {activeGuiRun.promptScore === null || activeGuiRun.promptScore === undefined
                    ? 'Pending'
                    : `${activeGuiRun.promptScore}/100`}
                </div>
                {activeGuiRun.reasons && activeGuiRun.reasons.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {activeGuiRun.reasons.slice(0, 4).map((reason) => (
                      <span key={reason} className="rounded-sm bg-muted px-2 py-1 typography-micro text-muted-foreground">
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="rounded-md border border-border bg-background/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="typography-micro text-muted-foreground">Quiz Gate</div>
                    {activeGuiRun.quiz ? (
                      <div className="mt-1">
                        <div className="typography-ui-label text-foreground">{activeGuiRun.quiz.title}</div>
                        <p className="mt-1 typography-body text-muted-foreground">{activeGuiRun.quiz.instructions}</p>
                        <p className="mt-1 typography-micro text-muted-foreground">
                          {activeGuiRun.quiz.questions.length} questions • {activeGuiRun.quiz.source}
                          {activeGuiRun.diffSource ? ` • diff ${activeGuiRun.diffSource}` : ''}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 typography-body text-muted-foreground">
                        Waiting for Karen to judge the prompt and hand the run to the quiz gate.
                      </p>
                    )}
                  </div>
                  {activeGuiRun.status === 'quiz_required' && activeGuiRun.quiz?.questions.length ? (
                    <button
                      type="button"
                      onClick={() => setQuizModalOpen(true)}
                      className="shrink-0 rounded-sm bg-primary px-3 py-1.5 typography-ui-label font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Open quiz
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {activeGuiRunEvents.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {activeGuiRunEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/50 px-3 py-2">
                    <div>
                      <span className="typography-ui-label text-foreground">{event.label}</span>
                      {event.details ? <span className="ml-2 typography-micro text-muted-foreground">{event.details}</span> : null}
                    </div>
                    <span className="typography-micro text-muted-foreground">{formatDate(event.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <LiveRunStream events={runEvents} connectionStatus={runStreamStatus} />
          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="text-xl font-semibold tracking-normal text-foreground">Terminal Bridge</h2>
            <p className="mt-2 typography-body text-muted-foreground">
              Run `karen` for guarded prompts, `/tui` for live agent interception, and `/gui` to reopen this control room.
            </p>
            <div className="mt-4 grid gap-2">
              {commandCards.slice(0, 4).map((card) => (
                <CommandCard key={card.command} {...card} />
              ))}
            </div>
          </section>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {profile ? <RecentSessions profile={profile} /> : null}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-normal text-foreground">Public Feed</h2>
              <span className="typography-micro text-muted-foreground">{feed.length} records</span>
            </div>
            {feed.length > 0 ? (
              <div className="grid gap-3">
                {feed.slice(0, 4).map((post) => <PublicPostCard key={post.id} post={post} />)}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-card p-6 typography-body text-muted-foreground">
                The graveyard's empty. For now. Karen is patient.
              </div>
            )}
          </section>
        </div>
      </main>
      <KarenQuizGameModal
        open={quizModalOpen && !!activeGuiRun?.quiz?.questions.length}
        run={activeGuiRun?.quiz ? {
          id: activeGuiRun.id,
          prompt: activeGuiRun.prompt,
          promptExcerpt: activeGuiRun.promptExcerpt,
          promptScore: activeGuiRun.promptScore ?? null,
          diff: activeGuiRun.diff ?? null,
          diffSource: activeGuiRun.diffSource ?? null,
          diffNote: activeGuiRun.diffNote ?? null,
          changedFiles: activeGuiRun.changedFiles ?? [],
          quiz: activeGuiRun.quiz,
        } as KarenQuizRun : null}
        onClose={() => setQuizModalOpen(false)}
      />
    </div>
  );
};

const POLL_BASE_MS = 5000;
const POLL_MAX_MS = 60000;

const LocalPromptCourtPage: React.FC<{ username?: string | null; isOwnProfile?: boolean }> = ({ username, isOwnProfile = true }) => {
  const [overview, setOverview] = React.useState<PromptCourtOverview | null>(null);
  const [profile, setProfile] = React.useState<PromptCourtProfile | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const resolvedUsername = username || getPromptCourtUsername();

  React.useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let currentDelay = POLL_BASE_MS;

    const run = async () => {
      // Skip polling when the tab is hidden to save bandwidth; resume on
      // visibilitychange.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        scheduleNext(currentDelay);
        return;
      }
      try {
        const [nextOverview, nextProfile] = await Promise.all([
          fetchPromptCourtOverview(),
          fetchPromptCourtProfile(resolvedUsername),
        ]);
        if (!cancelled) {
          setOverview(nextOverview);
          setProfile(nextProfile);
          setError(null);
          setLoaded(true);
          currentDelay = POLL_BASE_MS;
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load Karen');
          setLoaded(true);
          currentDelay = Math.min(currentDelay * 2, POLL_MAX_MS);
        }
      }
      if (!cancelled) {
        scheduleNext(currentDelay);
      }
    };

    const scheduleNext = (delay: number) => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void run();
      }, delay);
    };

    const handleVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      void run();
    };

    void run();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [resolvedUsername]);

  return (
    <PromptCourtLayout
      profile={profile}
      overview={overview}
      error={error}
      source="local"
      loading={!loaded}
      username={resolvedUsername}
      isOwnProfile={isOwnProfile}
    />
  );
};

const CloudPromptCourtPage: React.FC<{ username?: string | null; viewerUsername: string; isOwnProfile: boolean }> = ({
  username,
  viewerUsername,
  isOwnProfile,
}) => {
  const resolvedUsername = username || viewerUsername;
  const overview = useQuery(api.karen.overview) as PromptCourtOverview | undefined;
  // For other people's profiles, use the public-only query. Convex agent ships
  // `profilePublic` separately; until `_generated/api.d.ts` includes it, the
  // cast below silences the missing-key error. Returns `null` for placeholder /
  // suspended / private profiles.
  const apiAny = api as any;
  const ownProfile = useQuery(
    apiAny.karen.profile,
    isOwnProfile ? { username: resolvedUsername } : 'skip' as any,
  ) as PromptCourtProfile | undefined;
  const publicProfile = useQuery(
    apiAny.karen.profilePublic ?? apiAny.karen.profile,
    !isOwnProfile ? { username: resolvedUsername } : 'skip' as any,
  ) as PromptCourtProfile | null | undefined;
  const profile = isOwnProfile ? ownProfile : publicProfile;
  const loading = profile === undefined;
  return (
    <PromptCourtLayout
      profile={profile ?? null}
      overview={overview ?? null}
      error={null}
      source="cloud"
      loading={loading}
      username={resolvedUsername}
      isOwnProfile={isOwnProfile}
    />
  );
};

const ClerkViewerUsername: React.FC<{ onChange: (value: string) => void }> = ({ onChange }) => {
  const { isSignedIn, user } = useUser();
  React.useEffect(() => {
    if (!isSignedIn || !user) return;
    const next = (user.username
      || user.primaryEmailAddress?.emailAddress?.split('@')[0]
      || user.id
      || getPromptCourtUsername()).toString();
    onChange(next);
  }, [isSignedIn, onChange, user]);
  return null;
};

// Hook that returns the viewer's username. Always reads the local fallback;
// when Clerk is configured, a child component pushes the Clerk identity into
// the state on sign-in. Keeps hook order stable in both auth-on/off modes.
const useViewerUsername = (): [string, React.ReactNode] => {
  const [viewerUsername, setViewerUsername] = React.useState<string>(() => getPromptCourtUsername());
  const sync = React.useCallback((value: string) => {
    setViewerUsername((current) => (current === value ? current : value));
  }, []);
  const clerkSync = isKarenAuthConfigured ? <ClerkViewerUsername onChange={sync} /> : null;
  return [viewerUsername, clerkSync];
};

export const PromptCourtPage: React.FC<{ username?: string | null }> = (props) => {
  // Reading viewer identity needs Clerk (when configured) and the local fallback.
  // We always render the same component tree to keep hook order stable.
  const [viewerUsername, clerkSync] = useViewerUsername();
  const requestedUsername = (props.username || viewerUsername).toString();
  const isOwnProfile = !props.username || requestedUsername === viewerUsername;

  if (isKarenCloudConfigured) {
    return (
      <>
        {clerkSync}
        <CloudPromptCourtPage
          username={props.username}
          viewerUsername={viewerUsername}
          isOwnProfile={isOwnProfile}
        />
      </>
    );
  }
  return (
    <>
      {clerkSync}
      <LocalPromptCourtPage username={props.username} isOwnProfile={isOwnProfile} />
    </>
  );
};
