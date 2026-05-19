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
  type PromptCourtRunEvent,
} from '@/lib/promptcourt';
import { isKarenAuthConfigured, isKarenCloudConfigured } from '@/lib/karenCloudConfig';
import { cn } from '@/lib/utils';
import { playKarenEventAudio, type KarenAudioEvent } from '@/lib/karenVoice';
import { KarenLogo } from './KarenLogo';
import { BadPromptGraveyard } from './BadPromptGraveyard';
import { DiffReviewPanel } from './DiffReviewPanel';
import { KarenQuizGameModal, type KarenQuizRun } from './KarenQuizGameModal';
// Convex generated types may not include karen.* until codegen runs; cast at
// the call site to keep this file compiling against current generated api.d.ts.
import { api } from '../../../../../convex/_generated/api';

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

  const setStatus = (status: ConnectionStatus) => options.onStatus?.(status);

  const scheduleRetry = () => {
    if (cancelled) return;
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_CAP_MS);
    attempt += 1;
    setStatus('reconnecting');
    retryTimer = window.setTimeout(connect, delay);
  };

  function connect() {
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
  }

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

type GuiRun = {
  id: string;
  username: string;
  status: string;
  promptExcerpt?: string;
  promptScore?: number | null;
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
  prompt?: string;
  error?: string | null;
  createdAt: number;
  updatedAt: number;
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

const audioEventForRunStatus = (status: string): KarenAudioEvent | null => {
  if (status === 'blocked') return 'prompt-blocked';
  if (status === 'quiz_required' || status === 'quiz_passed' || status === 'completed' || status === 'synced') return 'quiz-pass';
  if (status === 'rollback') return 'rollback';
  if (status === 'failed') return 'quiz-fail';
  return null;
};

const runEventTone = (status: string): 'good' | 'bad' | 'default' => {
  if (status === 'quiz_required' || status === 'quiz_passed' || status === 'completed' || status === 'synced') return 'good';
  if (status === 'blocked' || status === 'rollback' || status === 'failed') return 'bad';
  return 'default';
};

const statusLabel = (status: string): string => status.replaceAll('_', ' ');

const KarenAuthBar: React.FC = () => {
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
          <button type="button" className="rounded-md border border-border bg-background px-3 py-1.5 typography-ui-label text-foreground hover:bg-muted/40">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className="rounded-md border border-border bg-primary px-3 py-1.5 typography-ui-label font-medium text-primary-foreground hover:opacity-90">
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

const AuthBinder: React.FC = () => isKarenAuthConfigured ? <CurrentUserBinder /> : null;

// Inline polling-based data source used when Convex is not configured. Lighter
// than spinning up the full PromptCourtPage flow.
const POLL_BASE_MS = 5000;
const POLL_MAX_MS = 60000;

const useLocalKarenData = (username: string) => {
  const [overview, setOverview] = React.useState<PromptCourtOverview | null>(null);
  const [profile, setProfile] = React.useState<PromptCourtProfile | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let currentDelay = POLL_BASE_MS;

    const scheduleNext = (delay: number) => {
      if (cancelled) return;
      timer = window.setTimeout(() => { void run(); }, delay);
    };

    const run = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        scheduleNext(currentDelay);
        return;
      }
      try {
        const [nextOverview, nextProfile] = await Promise.all([
          fetchPromptCourtOverview(),
          fetchPromptCourtProfile(username),
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
      if (!cancelled) scheduleNext(currentDelay);
    };

    void run();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [username]);

  return { overview, profile, error, loading: !loaded };
};

const useCloudKarenData = (username: string) => {
  const overview = useQuery(api.karen.overview) as PromptCourtOverview | undefined;
  const profile = useQuery(api.karen.profile, { username }) as PromptCourtProfile | undefined;
  return {
    overview: overview ?? null,
    profile: profile ?? null,
    error: null as string | null,
    loading: profile === undefined,
  };
};

// Branch on cloud config at the hook layer so we always call the same hook
// shape per render.
const useKarenData = (username: string) => {
  if (isKarenCloudConfigured) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useCloudKarenData(username);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useLocalKarenData(username);
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: 'default' | 'good' | 'bad' }> = ({ label, value, tone = 'default' }) => (
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

export const PromptCourtPanel: React.FC = () => {
  // Stable viewer identity: localStorage seed + Clerk override when signed in.
  const [viewerUsername] = React.useState<string>(() => getPromptCourtUsername());

  const { overview, profile, error, loading } = useKarenData(viewerUsername);

  const [runEvents, setRunEvents] = React.useState<PromptCourtRunEvent[]>([]);
  const [runStreamStatus, setRunStreamStatus] = React.useState<ConnectionStatus>('connecting');
  const [activeGuiRun, setActiveGuiRun] = React.useState<GuiRun | null>(null);
  const [quizStarted, setQuizStarted] = React.useState(false);
  const [quizModalOpen, setQuizModalOpen] = React.useState(false);
  const announcedRunEvents = React.useRef(new Set<string>());

  const feed = overview?.feed ?? [];

  // SSE live run feed.
  React.useEffect(() => {
    const username = profile?.user.username || viewerUsername;
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
          .slice(0, 20);
      });
    };

    void fetchPromptCourtRunEvents({ username, limit: 20 })
      .then((events) => addEvents(events, false))
      .catch(() => {});

    const params = new URLSearchParams({ username });
    const cleanup = createReconnectingEventSource(`/api/promptcourt/runs/events?${params.toString()}`, {
      eventName: 'run',
      onStatus: (status) => { if (!cancelled) setRunStreamStatus(status); },
      onMessage: (message) => {
        try {
          addEvents([JSON.parse((message as MessageEvent).data) as PromptCourtRunEvent], true);
        } catch {
          // ignore malformed event
        }
      },
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [profile?.user.username, viewerUsername]);

  // Subscribe to the active guarded run lifecycle. When the run reaches
  // quiz_required, surface the DiffReviewPanel first; the user clicks "Take
  // the read check" to open KarenQuizGameModal.
  React.useEffect(() => {
    if (!activeGuiRun?.id) return;
    const cleanup = createReconnectingEventSource(
      `/api/promptcourt/gui-runs/${encodeURIComponent(activeGuiRun.id)}/events`,
      {
        eventName: 'gui-run',
        onMessage: (message) => {
          try {
            const payload = JSON.parse((message as MessageEvent).data) as { run: GuiRun };
            setActiveGuiRun(payload.run);
          } catch {
            // ignore malformed event
          }
        },
      },
    );
    return cleanup;
  }, [activeGuiRun?.id]);

  // Build the KarenQuizRun shape used by both DiffReviewPanel and the modal.
  const quizRun = React.useMemo<KarenQuizRun | null>(() => {
    if (!activeGuiRun || !activeGuiRun.quiz) return null;
    return {
      id: activeGuiRun.id,
      prompt: activeGuiRun.prompt,
      promptExcerpt: activeGuiRun.promptExcerpt,
      promptScore: activeGuiRun.promptScore ?? null,
      diff: activeGuiRun.diff ?? null,
      diffSource: activeGuiRun.diffSource ?? null,
      diffNote: activeGuiRun.diffNote ?? null,
      changedFiles: activeGuiRun.changedFiles ?? [],
      quiz: activeGuiRun.quiz,
    };
  }, [activeGuiRun]);

  // Reset diff-review/quiz state whenever the active run id changes.
  React.useEffect(() => {
    setQuizStarted(false);
    setQuizModalOpen(false);
  }, [activeGuiRun?.id]);

  const showDiffReview = quizRun
    && activeGuiRun?.status === 'quiz_required'
    && !quizStarted;

  // Stats summary block.
  const stats = profile?.stats;

  return (
    <div className="h-full overflow-auto bg-background">
      <AuthBinder />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <KarenLogo className="size-10 shrink-0" mood={stats?.publicFailureCount && stats.publicFailureCount > 0 ? 'mad' : 'calm'} />
            <div>
              <div className="typography-ui-label text-muted-foreground">PromptCourt</div>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-normal text-foreground">
                Karen's read-check court is in session
              </h1>
              <p className="mt-1 typography-micro text-muted-foreground">
                {isKarenCloudConfigured ? 'Live Convex profile' : 'Local profile mode'} ·
                {' '}Wrong = git reset --hard.
              </p>
            </div>
          </div>
          <KarenAuthBar />
        </header>

        {error ? (
          <div className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error)]/10 p-3 typography-micro text-[var(--status-error)]">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Discipline score"
            value={loading ? '…' : `${stats?.disciplineScore ?? 0}/100`}
            tone={(stats?.disciplineScore ?? 0) >= 70 ? 'good' : (stats?.disciplineScore ?? 0) < 40 ? 'bad' : 'default'}
          />
          <Stat
            label="Current streak"
            value={loading ? '…' : stats?.currentStreak ?? 0}
          />
          <Stat
            label="Quiz pass rate"
            value={loading ? '…' : `${stats?.quizPassRate ?? 0}%`}
            tone="good"
          />
          <Stat
            label="Public fails"
            value={loading ? '…' : stats?.publicFailureCount ?? 0}
            tone={(stats?.publicFailureCount ?? 0) > 0 ? 'bad' : 'default'}
          />
        </section>

        {/* TASK #17: Diff review panel shown when a run reaches quiz_required.
            Frame 7 + frame 11. The big red "wrong" full-screen is owned by the
            modal itself. */}
        {showDiffReview ? (
          <DiffReviewPanel
            run={quizRun}
            onStartQuiz={() => {
              setQuizStarted(true);
              setQuizModalOpen(true);
            }}
          />
        ) : null}

        {/* Live runs feed. */}
        <section className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-normal text-foreground">Live runs</h2>
              <p className="typography-micro text-muted-foreground">
                Streaming verdicts from Karen runs in this workspace.
              </p>
            </div>
            <span className={cn(
              'rounded-sm px-2 py-1 typography-micro',
              runStreamStatus === 'open' ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
                : runStreamStatus === 'reconnecting' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                : 'bg-muted text-muted-foreground',
            )}>
              {runStreamStatus}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {runEvents.length > 0 ? runEvents.slice(0, 6).map((event) => {
              const tone = runEventTone(event.status);
              return (
                <div key={event.id} className="grid grid-cols-[120px_1fr_auto] items-start gap-3 rounded-md border border-border bg-background/40 px-3 py-2">
                  <span className={cn(
                    'w-fit rounded-sm px-2 py-0.5 typography-micro font-medium',
                    tone === 'good' && 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
                    tone === 'bad' && 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
                    tone === 'default' && 'bg-muted text-muted-foreground',
                  )}>
                    {statusLabel(event.status)}
                  </span>
                  <div className="min-w-0">
                    <div className="typography-ui-label text-foreground">{event.label}</div>
                    {event.details ? (
                      <div className="mt-0.5 typography-micro text-muted-foreground">{event.details}</div>
                    ) : null}
                  </div>
                  <div className="typography-micro text-muted-foreground">{formatDate(event.createdAt)}</div>
                </div>
              );
            }) : (
              <div className="rounded-md border border-dashed border-border bg-background/30 p-3 typography-micro text-muted-foreground">
                No runs yet. Karen is bored.
              </div>
            )}
          </div>
        </section>

        {/* Recent verdicts. */}
        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="text-base font-semibold tracking-normal text-foreground">Recent verdicts</h2>
          <p className="typography-micro text-muted-foreground">Sessions Karen has already ruled on.</p>
          <div className="mt-3 overflow-hidden rounded-md border border-border">
            {profile && profile.recentSessions.length > 0 ? profile.recentSessions.slice(0, 6).map((session) => {
              const tone: 'good' | 'bad' | 'default' = session.status === 'executed_quiz_passed'
                ? 'good'
                : session.status === 'blocked_bad_prompt' || session.rollbackTriggered
                  ? 'bad'
                  : 'default';
              return (
                <div key={session.id} className="border-b border-border bg-background/30 px-3 py-2 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={cn(
                      'rounded-sm px-2 py-0.5 typography-micro font-medium',
                      tone === 'good' && 'bg-[var(--status-success)]/15 text-[var(--status-success)]',
                      tone === 'bad' && 'bg-[var(--status-error)]/15 text-[var(--status-error)]',
                      tone === 'default' && 'bg-muted text-muted-foreground',
                    )}>
                      {statusLabel(session.status)}
                    </span>
                    <span className="typography-micro text-muted-foreground">{formatDate(session.createdAt)}</span>
                  </div>
                  {session.prompt ? (
                    <p className="mt-1 line-clamp-2 typography-micro text-foreground/90">{session.prompt}</p>
                  ) : null}
                </div>
              );
            }) : (
              <div className="px-3 py-3 typography-micro text-muted-foreground">Nothing on the docket yet.</div>
            )}
          </div>
        </section>

        {/* Public feed. */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-normal text-foreground">Public feed</h2>
            <span className="typography-micro text-muted-foreground">{feed.length} records</span>
          </div>
          <BadPromptGraveyard posts={feed} limit={4} />
        </section>
      </main>

      <KarenQuizGameModal
        open={quizModalOpen && !!quizRun}
        run={quizRun}
        onClose={() => setQuizModalOpen(false)}
      />
    </div>
  );
};

export default PromptCourtPanel;
