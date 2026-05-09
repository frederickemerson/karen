import React from 'react';
import {
  RiArrowDownLine,
  RiArrowUpLine,
  RiCheckboxCircleLine,
  RiGitBranchLine,
  RiLiveLine,
  RiPulseLine,
  RiTerminalBoxLine,
  RiTimeLine,
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';

export type LiveLeaderboardDeveloper = {
  id: string;
  name: string;
  handle: string;
  promptScore: number;
  quizPassRate: number;
  streak: number;
  rollbacksAvoided: number;
  rankDelta?: number;
  status?: 'live' | 'reviewing' | 'idle';
};

export type LiveLeaderboardEvent = {
  id: string;
  actor: string;
  label: string;
  detail: string;
  timestamp: string;
  scoreDelta?: number;
  tone?: 'pass' | 'warn' | 'ship';
};

type LiveLeaderboardShowcaseProps = {
  developers?: LiveLeaderboardDeveloper[];
  events?: LiveLeaderboardEvent[];
  className?: string;
  live?: boolean;
  title?: string;
  subtitle?: string;
  updatedLabel?: string;
};

const demoDevelopers: LiveLeaderboardDeveloper[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    handle: 'maya.c',
    promptScore: 98,
    quizPassRate: 96,
    streak: 18,
    rollbacksAvoided: 42,
    rankDelta: 2,
    status: 'live',
  },
  {
    id: 'eli',
    name: 'Eli Brooks',
    handle: 'eli.builds',
    promptScore: 94,
    quizPassRate: 91,
    streak: 12,
    rollbacksAvoided: 37,
    rankDelta: 1,
    status: 'reviewing',
  },
  {
    id: 'nora',
    name: 'Nora Singh',
    handle: 'nora.diff',
    promptScore: 91,
    quizPassRate: 89,
    streak: 9,
    rollbacksAvoided: 31,
    rankDelta: -1,
    status: 'live',
  },
  {
    id: 'jo',
    name: 'Jo Alvarez',
    handle: 'jo.tests',
    promptScore: 88,
    quizPassRate: 87,
    streak: 7,
    rollbacksAvoided: 26,
    rankDelta: 0,
    status: 'idle',
  },
];

const demoEvents: LiveLeaderboardEvent[] = [
  {
    id: 'evt-quiz-pass',
    actor: '@maya.c',
    label: 'diff quiz passed',
    detail: 'auth/session.ts behavior explained in 42s',
    timestamp: 'now',
    scoreDelta: 14,
    tone: 'pass',
  },
  {
    id: 'evt-rollback',
    actor: '@nora.diff',
    label: 'rollback avoided',
    detail: 'spotted a silent config drift before merge',
    timestamp: '18s',
    scoreDelta: 9,
    tone: 'ship',
  },
  {
    id: 'evt-streak',
    actor: '@eli.builds',
    label: 'streak extended',
    detail: '12 clean reads without a panic revert',
    timestamp: '31s',
    scoreDelta: 7,
    tone: 'pass',
  },
  {
    id: 'evt-warning',
    actor: '@jo.tests',
    label: 'prompt tightened',
    detail: 'Karen requested acceptance criteria',
    timestamp: '46s',
    scoreDelta: 3,
    tone: 'warn',
  },
];

const rankPlans = [
  ['maya', 'eli', 'nora', 'jo'],
  ['maya', 'nora', 'eli', 'jo'],
  ['eli', 'maya', 'nora', 'jo'],
  ['maya', 'eli', 'jo', 'nora'],
];

const deltaPlans: Record<string, number>[] = [
  { maya: 2, eli: 1, nora: -1, jo: 0 },
  { maya: 1, nora: 2, eli: -1, jo: 0 },
  { eli: 2, maya: -1, nora: 1, jo: 0 },
  { maya: 2, eli: 0, jo: 1, nora: -2 },
];

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const formatSigned = (value: number) => `${value > 0 ? '+' : ''}${value}`;

const getDemoDevelopers = (tick: number) => {
  const planIndex = tick % rankPlans.length;
  const rankPlan = rankPlans[planIndex];
  const deltas = deltaPlans[planIndex];
  const byId = new Map(demoDevelopers.map((developer) => [developer.id, developer]));
  const rankedDevelopers: LiveLeaderboardDeveloper[] = [];

  rankPlan.forEach((id, index) => {
    const developer = byId.get(id);
    if (!developer) return;
    const scoreLift = planIndex === 0 ? 0 : (rankPlan.length - index) * 2;
    rankedDevelopers.push({
      ...developer,
      promptScore: Math.min(100, developer.promptScore + scoreLift),
      rankDelta: deltas[id] ?? developer.rankDelta,
    });
  });

  return rankedDevelopers;
};

const getToneClasses = (tone: LiveLeaderboardEvent['tone']) => {
  if (tone === 'warn') return 'border-[#ffcc66]/35 bg-[#ffcc66]/10 text-[#ffe1a3]';
  if (tone === 'ship') return 'border-[#7bd88f]/35 bg-[#7bd88f]/10 text-[#b9f6c3]';
  return 'border-[#6ee7ff]/35 bg-[#6ee7ff]/10 text-[#b9f7ff]';
};

const RankDelta = ({ value = 0 }: { value?: number }) => {
  if (value === 0) {
    return (
      <span className="rounded-sm border border-[#f8f1e3]/15 px-1.5 py-0.5 text-[#c9bca8]">
        =
      </span>
    );
  }

  const isUp = value > 0;
  const Icon = isUp ? RiArrowUpLine : RiArrowDownLine;

  return (
    <motion.span
      key={value}
      initial={{ y: isUp ? 8 : -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm border px-1.5 py-0.5',
        isUp
          ? 'border-[#7bd88f]/35 bg-[#7bd88f]/10 text-[#7bd88f]'
          : 'border-[#ff6b5f]/35 bg-[#ff6b5f]/10 text-[#ff8a80]',
      )}
    >
      <Icon className="size-3" />
      {Math.abs(value)}
    </motion.span>
  );
};

const MetricBar = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
  <div>
    <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9bca8]">
      <span>{label}</span>
      <span>{clampPercent(value)}%</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-[#f8f1e3]/12">
      <motion.div
        className={cn('h-full rounded-full', tone)}
        initial={{ width: 0 }}
        animate={{ width: `${clampPercent(value)}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </div>
  </div>
);

const StatusPill = ({ live }: { live: boolean }) => (
  <div
    className={cn(
      'inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.14em]',
      live
        ? 'border-[#7bd88f]/40 bg-[#7bd88f]/12 text-[#b9f6c3]'
        : 'border-[#f8f1e3]/20 bg-[#f8f1e3]/8 text-[#c9bca8]',
    )}
  >
    <span className="relative flex size-2">
      {live ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#7bd88f] opacity-60" /> : null}
      <span className={cn('relative inline-flex size-2 rounded-full', live ? 'bg-[#7bd88f]' : 'bg-[#c9bca8]')} />
    </span>
    {live ? 'live convex feed' : 'preview data'}
  </div>
);

const LeaderboardRow = ({
  developer,
  rank,
}: {
  developer: LiveLeaderboardDeveloper;
  rank: number;
}) => {
  const statusLabel = developer.status === 'reviewing' ? 'reviewing diff' : developer.status === 'idle' ? 'idle' : 'live run';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-sm border border-[#f8f1e3]/14 bg-[#f8f1e3]/7 p-3 shadow-[4px_4px_0_rgba(248,241,227,0.06)]"
    >
      <div className="grid gap-3 sm:grid-cols-[44px_1fr_auto] sm:items-center">
        <div className="flex items-center gap-2 sm:block">
          <motion.div
            key={rank}
            initial={{ rotateX: 72, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            className={cn(
              'grid size-11 place-items-center rounded-sm border font-mono text-lg font-semibold',
              rank === 1
                ? 'border-[#ffcc66] bg-[#ffcc66] text-[#17130f]'
                : 'border-[#f8f1e3]/20 bg-black/25 text-[#f8f1e3]',
            )}
          >
            {rank}
          </motion.div>
          <div className="sm:hidden">
            <RankDelta value={developer.rankDelta} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-normal text-[#f8f1e3]">{developer.name}</h3>
            <span className="font-mono text-xs text-[#c9bca8]">@{developer.handle}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#c9bca8]">
            <span className="inline-flex items-center gap-1">
              <RiPulseLine className="size-3.5" />
              {statusLabel}
            </span>
            <span>{developer.streak}x streak</span>
            <span>{developer.rollbacksAvoided} rollbacks avoided</span>
          </div>
        </div>

        <div className="grid gap-2 sm:min-w-40">
          <div className="hidden justify-end sm:flex">
            <RankDelta value={developer.rankDelta} />
          </div>
          <div className="font-mono text-2xl font-semibold leading-none text-[#ffcc66]">
            {clampPercent(developer.promptScore)}
            <span className="ml-1 text-xs font-normal text-[#c9bca8]">pts</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <MetricBar label="prompt score" value={developer.promptScore} tone="bg-[#ffcc66]" />
        <MetricBar label="quiz pass rate" value={developer.quizPassRate} tone="bg-[#7bd88f]" />
      </div>
    </motion.li>
  );
};

const EventRow = ({ event, index }: { event: LiveLeaderboardEvent; index: number }) => (
  <motion.li
    key={event.id}
    layout
    initial={{ opacity: 0, x: 18 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -18 }}
    transition={{ duration: 0.3, delay: index * 0.04 }}
    className={cn('rounded-sm border p-3 font-mono text-xs', getToneClasses(event.tone))}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-[#f8f1e3]">{event.actor}</span>
          <span>{event.label}</span>
        </div>
        <p className="mt-1 leading-5 text-[#c9bca8]">{event.detail}</p>
      </div>
      <div className="shrink-0 text-right">
        {typeof event.scoreDelta === 'number' ? (
          <div className="text-[#7bd88f]">{formatSigned(event.scoreDelta)}</div>
        ) : null}
        <div className="mt-1 text-[#c9bca8]">{event.timestamp}</div>
      </div>
    </div>
  </motion.li>
);

export const LiveLeaderboardShowcase: React.FC<LiveLeaderboardShowcaseProps> = ({
  developers,
  events,
  className = '',
  live = true,
  title = 'Live leaderboard for people who read the diff.',
  subtitle = 'Convex-ready rankings surface prompt quality, quiz accuracy, streaks, and rollbacks avoided as the team ships.',
  updatedLabel = 'subscribed to promptcourt.leaderboard',
}) => {
  const usingDemoData = !developers?.length;
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!live) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 3200);
    return () => window.clearInterval(timer);
  }, [live]);

  const visibleDevelopers = React.useMemo(() => {
    if (developers?.length) {
      return [...developers].sort((a, b) => b.promptScore - a.promptScore).slice(0, 5);
    }
    return getDemoDevelopers(tick);
  }, [developers, tick]);

  const visibleEvents = React.useMemo(() => {
    const source = events?.length ? events : demoEvents;
    if (events?.length) return source.slice(0, 5);
    const offset = tick % source.length;
    return [...source.slice(offset), ...source.slice(0, offset)].slice(0, 4);
  }, [events, tick]);

  const aggregateStats = React.useMemo(() => {
    const totalRollbacksAvoided = visibleDevelopers.reduce((sum, developer) => sum + developer.rollbacksAvoided, 0);
    const averageQuizRate = visibleDevelopers.length
      ? Math.round(visibleDevelopers.reduce((sum, developer) => sum + developer.quizPassRate, 0) / visibleDevelopers.length)
      : 0;
    const bestStreak = Math.max(0, ...visibleDevelopers.map((developer) => developer.streak));

    return [
      ['quiz pass', `${averageQuizRate}%`, RiCheckboxCircleLine],
      ['best streak', `${bestStreak}x`, RiTimeLine],
      ['rollbacks saved', String(totalRollbacksAvoided), RiGitBranchLine],
    ] as const;
  }, [visibleDevelopers]);

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-md border border-[#2a241c] bg-[#17130f] p-4 text-[#f8f1e3] shadow-[8px_8px_0_#b7332c] sm:p-5',
        className,
      )}
      aria-label="Live Convex leaderboard showcase"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.11]"
        style={{
          backgroundImage: 'linear-gradient(#f8f1e3 1px, transparent 1px), linear-gradient(90deg, #f8f1e3 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <motion.div
        className="pointer-events-none absolute -right-24 top-10 h-48 w-48 rounded-full border border-[#7bd88f]/25"
        animate={{ scale: [1, 1.18, 1], opacity: [0.18, 0.36, 0.18] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="flex flex-col justify-between gap-5 rounded-sm border border-[#f8f1e3]/18 bg-black/24 p-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusPill live={live} />
              <div className="inline-flex items-center gap-2 font-mono text-xs text-[#c9bca8]">
                <RiTerminalBoxLine className="size-4" />
                {updatedLabel}
              </div>
            </div>

            <div className="mt-6">
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#ffcc66]">Feature 8</div>
              <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-normal text-[#f8f1e3] sm:text-4xl">
                {title}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#c9bca8] sm:text-base">{subtitle}</p>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {aggregateStats.map(([label, value, Icon]) => (
                <motion.div
                  key={label}
                  className="rounded-sm border border-[#f8f1e3]/14 bg-[#f8f1e3]/8 p-3"
                  whileHover={{ y: -2 }}
                >
                  <div className="flex items-center justify-between gap-2 text-[#c9bca8]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{label}</span>
                    <Icon className="size-4" />
                  </div>
                  <div className="mt-2 font-mono text-2xl font-semibold text-[#ffcc66]">{value}</div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="rounded-sm border border-[#7bd88f]/24 bg-[#07110c] p-3">
            <div className="mb-3 flex items-center justify-between gap-3 font-mono text-xs text-[#7bd88f]">
              <span className="inline-flex items-center gap-2">
                <RiLiveLine className="size-4" />
                recent court events
              </span>
              <span>{usingDemoData ? 'mock stream' : 'convex data'}</span>
            </div>
            <ul className="grid gap-2">
              <AnimatePresence mode="popLayout">
                {visibleEvents.map((event, index) => (
                  <EventRow key={event.id} event={event} index={index} />
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </div>

        <div className="rounded-sm border border-[#f8f1e3]/18 bg-[#fffaf0] p-4 text-[#17130f]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#b7332c]">top developers</div>
              <h3 className="mt-1 text-2xl font-semibold tracking-normal">PromptCourt standings</h3>
            </div>
            <div className="rounded-sm border border-[#2a241c] bg-[#ffcc66] px-2.5 py-1.5 font-mono text-xs font-semibold shadow-[2px_2px_0_#17130f]">
              rank updates pulse in
            </div>
          </div>

          <ol className="mt-4 grid gap-3">
            <AnimatePresence mode="popLayout">
              {visibleDevelopers.map((developer, index) => (
                <LeaderboardRow key={developer.id} developer={developer} rank={index + 1} />
              ))}
            </AnimatePresence>
          </ol>
        </div>
      </div>
    </section>
  );
};

export default LiveLeaderboardShowcase;
