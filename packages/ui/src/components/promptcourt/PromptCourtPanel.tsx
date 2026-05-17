import React from 'react';
import { SignInButton, SignUpButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';
import { useMutation, useQuery } from 'convex/react';
import { RiFireLine, RiPulseLine } from '@remixicon/react';
import {
  fetchPromptCourtOverview,
  fetchPromptCourtProfile,
  fetchPromptCourtRunEvents,
  getPromptCourtUsername,
  setPromptCourtUsername,
  type PromptCourtOverview,
  type PromptCourtProfile,
  type PromptCourtRunEvent,
} from '@/lib/promptcourt';
import { cn } from '@/lib/utils';
import { playKarenEventAudio, type KarenAudioEvent } from '@/lib/karenVoice';
import { isKarenAuthConfigured, isKarenCloudConfigured } from '@/lib/karenCloudConfig';
import { KarenLogo } from './KarenLogo';
import { KarenQuizGameModal, type KarenQuizRun } from './KarenQuizGameModal';
import { BadPromptGraveyard } from './BadPromptGraveyard';
import { DiffReviewPanel, type DiffReviewRun } from './DiffReviewPanel';
import { api } from '../../../../../convex/_generated/api';

// Convex's generated api.d.ts lags behind `convex/karen.ts` at times. The
// PromptCourtPage uses the same pattern.
const apiAny = api as any;

type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_CAP_MS = 30000;

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

const sessionStatusTone = (session: PromptCourtProfile['recentSessions'][number]): 'good' | 'bad' | 'default' => {
  if (session.status === 'executed_quiz_passed') return 'good';
  if (session.status === 'blocked_bad_prompt' || session.rollbackTriggered) return 'bad';
  return 'default';
};

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

const KarenAuthBar: React.FC = () => {
  if (!isKarenAuthConfigured) {
    return <div className="typography-micro text-muted-foreground">Local profile mode</div>;
  }
  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 typography-ui-label text-foreground hover:bg-muted/40"
          >
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button
            type="button"
            className="rounded-md border border-border bg-foreground px-3 py-1.5 typography-ui-label text-background hover:opacity-90"
          >
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

const CurrentUserBinder: React.FC = () => {
  const { isSignedIn, user } = useUser();
  const upsertCurrentUser = useMutation(apiAny.karen.upsertCurrentUser);

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

const AuthBinder: React.FC = () => (isKarenAuthConfigured ? <CurrentUserBinder /> : null);

const Pill: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: 'good' | 'bad' | 'default';
  icon?: React.ReactNode;
}> = ({ label, value, tone = 'default', icon }) => (
  <div
    className={cn(
      'flex items-center gap-2 rounded-md border px-3 py-1.5',
      tone === 'good' && 'border-[var(--status-success)]/30 bg-[var(--status-success)]/10',
      tone === 'bad' && 'border-[var(--status-error)]/30 bg-[var(--status-error)]/10',
      tone === 'default' && 'border-border bg-card',
    )}
  >
    {icon}
    <div className="leading-tight">
      <div className="typography-micro text-muted-foreground">{label}</div>
      <div className="typography-ui-label font-semibold text-foreground">{value}</div>
    </div>
  </div>
);

const LiveRunsFeed: React.FC<{
  events: PromptCourtRunEvent[];
  connectionStatus: ConnectionStatus;
}> = ({ events, connectionStatus }) => (
  <section className="rounded-md border border-border bg-card">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <RiPulseLine className="size-4 text-[var(--status-info)]" />
        <span className="typography-ui-label font-semibold text-foreground">Live runs</span>
      </div>
      <div className="flex items-center gap-2">
        {connectionStatus === 'reconnecting' ? (
          <span className="rounded-sm bg-[var(--status-warning)]/15 px-2 py-0.5 typography-micro font-medium text-[var(--status-warning)]">
            reconnecting…
          </span>
        ) : null}
        <span className="rounded-sm bg-muted px-2 py-0.5 typography-micro text-muted-foreground">
          {connectionStatus === 'open'
            ? events.length > 0
              ? 'streaming'
              : 'waiting'
            : connectionStatus === 'connecting'
              ? 'connecting'
              : connectionStatus === 'reconnecting'
                ? 'offline'
                : 'idle'}
        </span>
      </div>
    </header>
    <div className="grid gap-2 p-3">
      {events.length > 0 ? (
        events.slice(0, 8).map((event) => {
          const tone = runEventTone(event.status);
          return (
            <div
              key={event.id}
              className="grid gap-2 rounded-md border border-border bg-background/50 p-2 md:grid-cols-[140px_1fr_auto]"
            >
              <span
                className={cn(
                  'w-fit rounded-sm px-2 py-0.5 typography-micro font-medium',
                  tone === 'good' && 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
                  tone === 'bad' && 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
                  tone === 'default' && 'bg-muted text-muted-foreground',
                )}
              >
                {statusLabel(event.status)}
              </span>
              <div className="min-w-0">
                <div className="truncate typography-ui-label text-foreground">{event.label}</div>
                {event.details ? (
                  <div className="mt-0.5 line-clamp-2 typography-micro text-muted-foreground">{event.details}</div>
                ) : null}
              </div>
              <div className="shrink-0 typography-micro text-muted-foreground md:text-right">
                {formatDate(event.createdAt)}
              </div>
            </div>
          );
        })
      ) : (
        <div className="rounded-md border border-dashed border-border bg-background/40 p-3 typography-body text-muted-foreground">
          No runs yet. Karen is bored.
        </div>
      )}
    </div>
  </section>
);

const RecentVerdicts: React.FC<{ profile: PromptCourtProfile | null }> = ({ profile }) => (
  <section className="rounded-md border border-border bg-card">
    <header className="flex items-center justify-between border-b border-border px-3 py-2">
      <span className="typography-ui-label font-semibold text-foreground">Recent verdicts</span>
      <span className="typography-micro text-muted-foreground">
        {profile?.recentSessions?.length ?? 0} records
      </span>
    </header>
    <div className="divide-y divide-border">
      {profile && profile.recentSessions.length > 0 ? (
        profile.recentSessions.slice(0, 6).map((session) => {
          const tone = sessionStatusTone(session);
          return (
            <div key={session.id} className="px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={cn(
                    'rounded-sm px-2 py-0.5 typography-micro font-medium',
                    tone === 'good' && 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
                    tone === 'bad' && 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
                    tone === 'default' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {statusLabel(session.status)}
                </span>
                <span className="typography-micro text-muted-foreground">{formatDate(session.createdAt)}</span>
              </div>
              {session.prompt ? (
                <p className="mt-1 line-clamp-2 typography-body text-foreground">{session.prompt}</p>
              ) : null}
            </div>
          );
        })
      ) : (
        <div className="px-3 py-3 typography-body text-muted-foreground">
          Nothing on the docket yet.
        </div>
      )}
    </div>
  </section>
);

// Cloud-mode data source (Convex queries). Hooks run unconditionally; the
// 'skip' sentinel disables the query when cloud isn't configured.
const useCloudPromptCourtData = () => {
  const overview = useQuery(
    apiAny.karen.overview,
    isKarenCloudConfigured ? {} : ('skip' as any),
  ) as PromptCourtOverview | undefined;
  const profile = useQuery(
    apiAny.karen.profile,
    isKarenCloudConfigured ? { username: getPromptCourtUsername() } : ('skip' as any),
  ) as PromptCourtProfile | undefined;
  return {
    overview: overview ?? null,
    profile: profile ?? null,
    loading: isKarenCloudConfigured ? overview === undefined || profile === undefined : false,
  };
};

// Local fallback (HTTP polling). Runs unconditionally; reads are cheap and the
// effect is a no-op once cloud takes over.
const useLocalPromptCourtData = () => {
  const [overview, setOverview] = React.useState<PromptCourtOverview | null>(null);
  const [profile, setProfile] = React.useState<PromptCourtProfile | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (isKarenCloudConfigured) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      try {
        const [nextOverview, nextProfile] = await Promise.all([
          fetchPromptCourtOverview(),
          fetchPromptCourtProfile(),
        ]);
        if (!cancelled) {
          setOverview(nextOverview);
          setProfile(nextProfile);
        }
      } catch {
        // Network errors leave previous data in place.
      } finally {
        if (!cancelled) {
          setLoaded(true);
          timer = window.setTimeout(tick, 8000);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return { overview, profile, loading: !loaded };
};

const usePromptCourtData = (): {
  overview: PromptCourtOverview | null;
  profile: PromptCourtProfile | null;
  loading: boolean;
} => {
  const cloud = useCloudPromptCourtData();
  const local = useLocalPromptCourtData();
  return isKarenCloudConfigured ? cloud : local;
};

export const PromptCourtPanel: React.FC = () => {
  const { overview, profile, loading } = usePromptCourtData();
  const [runEvents, setRunEvents] = React.useState<PromptCourtRunEvent[]>([]);
  const [runStreamStatus, setRunStreamStatus] = React.useState<ConnectionStatus>('connecting');
  const [activeGuiRun, setActiveGuiRun] = React.useState<GuiRun | null>(null);
  const [quizModalOpen, setQuizModalOpen] = React.useState(false);
  const lastAutoOpenedRunId = React.useRef<string | null>(null);
  const announcedRunEvents = React.useRef<Set<string>>(new Set());

  // SSE: global live runs stream + initial historical events.
  React.useEffect(() => {
    const username = profile?.user.username || getPromptCourtUsername();
    let cancelled = false;

    const merge = (events: PromptCourtRunEvent[], announce: boolean) => {
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

    void fetchPromptCourtRunEvents({ username, limit: 30 })
      .then((events) => merge(events, false))
      .catch(() => {});

    const params = new URLSearchParams({ username });
    const cleanup = createReconnectingEventSource(`/api/promptcourt/runs/events?${params.toString()}`, {
      eventName: 'run',
      onStatus: (status) => {
        if (cancelled) return;
        setRunStreamStatus(status);
      },
      onMessage: (message) => {
        try {
          merge([JSON.parse((message as MessageEvent).data) as PromptCourtRunEvent], true);
        } catch {
          // Ignore malformed events.
        }
      },
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [profile?.user.username]);

  // If the SPA URL carries a `?run=<id>` query, the inline panel hydrates that
  // guarded run so the diff-review surface can light up. Mirrors the
  // standalone /karen route handling without forcing a navigation.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('run');
    if (!id) return;
    if (activeGuiRun?.id === id) return;
    void fetchGuiRun(id)
      .then((run) => setActiveGuiRun(run))
      .catch(() => undefined);
  }, [activeGuiRun?.id]);

  // Subscribe to the per-run SSE stream when we're tracking an active run.
  React.useEffect(() => {
    if (!activeGuiRun?.id) return;
    const cleanup = createReconnectingEventSource(
      `/api/promptcourt/gui-runs/${encodeURIComponent(activeGuiRun.id)}/events`,
      {
        eventName: 'gui-run',
        onMessage: (message) => {
          try {
            const payload = JSON.parse((message as MessageEvent).data) as { event: PromptCourtRunEvent; run: GuiRun };
            setActiveGuiRun(payload.run);
          } catch {
            // Ignore.
          }
        },
      },
    );
    return cleanup;
  }, [activeGuiRun?.id]);

  const showDiffReview = Boolean(
    activeGuiRun
      && activeGuiRun.status === 'quiz_required'
      && activeGuiRun.quiz?.questions?.length,
  );

  const diffReviewRun: DiffReviewRun | null = activeGuiRun
    ? {
      id: activeGuiRun.id,
      prompt: activeGuiRun.prompt,
      promptExcerpt: activeGuiRun.promptExcerpt,
      diff: activeGuiRun.diff,
      diffSource: activeGuiRun.diffSource,
      diffNote: activeGuiRun.diffNote,
      changedFiles: activeGuiRun.changedFiles,
    }
    : null;

  const quizRun: KarenQuizRun | null = activeGuiRun?.quiz
    ? {
      id: activeGuiRun.id,
      prompt: activeGuiRun.prompt,
      promptExcerpt: activeGuiRun.promptExcerpt,
      promptScore: activeGuiRun.promptScore ?? null,
      diff: activeGuiRun.diff ?? null,
      diffSource: activeGuiRun.diffSource ?? null,
      diffNote: activeGuiRun.diffNote ?? null,
      changedFiles: activeGuiRun.changedFiles ?? [],
      quiz: activeGuiRun.quiz,
    }
    : null;

  // Auto-open the quiz once per run when no review surface is needed (e.g. the
  // user has already seen the diff page and the run flips back into quiz mode).
  React.useEffect(() => {
    if (!showDiffReview) return;
    if (!activeGuiRun?.id) return;
    if (lastAutoOpenedRunId.current === activeGuiRun.id) return;
    // Don't auto-open: the diff-review page is shown first; user clicks
    // "Take the read check →" to enter the quiz.
    lastAutoOpenedRunId.current = activeGuiRun.id;
  }, [activeGuiRun?.id, showDiffReview]);

  const profileScore = profile?.stats.disciplineScore ?? 0;
  const currentStreak = profile?.stats.currentStreak ?? 0;
  const feed = overview?.feed ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <AuthBinder />

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <KarenLogo className="size-10 shrink-0" mood={profile && profile.stats.publicFailureCount > 0 ? 'mad' : 'calm'} />
          <div className="leading-tight">
            <div className="typography-micro uppercase tracking-[0.18em] text-muted-foreground">
              Karen control room
            </div>
            <h1 className="typography-title text-foreground">PromptCourt</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill
            label="Discipline"
            value={`${profileScore}/100`}
            tone={profileScore >= 70 ? 'good' : profileScore < 40 ? 'bad' : 'default'}
          />
          <Pill
            label="Streak"
            value={currentStreak}
            tone={currentStreak > 0 ? 'good' : 'default'}
            icon={<RiFireLine className="size-4 text-[var(--status-warning)]" />}
          />
          <KarenAuthBar />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
          {showDiffReview && diffReviewRun ? (
            <DiffReviewPanel run={diffReviewRun} onStartQuiz={() => setQuizModalOpen(true)} />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <LiveRunsFeed events={runEvents} connectionStatus={runStreamStatus} />
                <RecentVerdicts profile={profile} />
              </div>
              {loading && !profile ? (
                <div className="rounded-md border border-dashed border-border bg-card p-4 typography-body text-muted-foreground">
                  Karen is warming up…
                </div>
              ) : null}
              <BadPromptGraveyard
                posts={feed}
                limit={6}
                title="Public bad-prompt feed"
              />
            </>
          )}
        </div>
      </div>

      <KarenQuizGameModal
        open={quizModalOpen && Boolean(quizRun)}
        run={quizRun}
        onClose={() => setQuizModalOpen(false)}
      />
    </div>
  );
};

export default PromptCourtPanel;
