import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

type QuizOption = {
  id: 'A' | 'B' | 'C' | 'D';
  label: string;
  detail: string;
  correct?: boolean;
};

export type QuizRound = {
  changedFile: string;
  diffStat: string;
  question: string;
  options: QuizOption[];
};

const rounds: QuizRound[] = [
  {
    changedFile: 'packages/web/server/lib/auth/session.ts',
    diffStat: '+42 -8',
    question: 'Which behavior did the agent actually change?',
    options: [
      { id: 'A', label: 'Expired sessions now fail closed', detail: 'JWT expiry is checked before route handoff.', correct: true },
      { id: 'B', label: 'OAuth signup was deleted', detail: 'No OAuth provider code moved.' },
      { id: 'C', label: 'Billing limits were raised', detail: 'Quota files were untouched.' },
      { id: 'D', label: 'The app switched databases', detail: 'No schema or driver changed.' },
    ],
  },
  {
    changedFile: 'packages/ui/src/components/views/GitView.tsx',
    diffStat: '+63 -19',
    question: 'What should you inspect before Karen keeps this patch?',
    options: [
      { id: 'A', label: 'The generated commit gate', detail: 'The patch changes commit flow ownership.', correct: true },
      { id: 'B', label: 'The marketing footer', detail: 'No footer render path changed.' },
      { id: 'C', label: 'Only package metadata', detail: 'This is UI behavior, not metadata.' },
      { id: 'D', label: 'Nothing, tests passed spiritually', detail: 'Karen heard that and made a face.' },
    ],
  },
  {
    changedFile: 'packages/karen/bin/karen.js',
    diffStat: '+91 -13',
    question: 'What happens if you miss the diff quiz?',
    options: [
      { id: 'A', label: 'The isolated patch is discarded', detail: 'The real repo keeps its pre-run state.', correct: true },
      { id: 'B', label: 'Karen force pushes main', detail: 'Absolutely not.' },
      { id: 'C', label: 'The prompt is silently retried', detail: 'No hidden second attempt.' },
      { id: 'D', label: 'The wrong answer is ignored', detail: 'Receipts matter.' },
    ],
  },
];

const optionTone: Record<QuizOption['id'], string> = {
  A: 'border-[#ef4444] bg-[#ef4444] text-white shadow-[5px_5px_0_#7f1d1d]',
  B: 'border-[#2563eb] bg-[#2563eb] text-white shadow-[5px_5px_0_#172554]',
  C: 'border-[#eab308] bg-[#eab308] text-[#17130f] shadow-[5px_5px_0_#713f12]',
  D: 'border-[#22c55e] bg-[#22c55e] text-[#17130f] shadow-[5px_5px_0_#14532d]',
};

const useKahootMusic = (enabled: boolean) => {
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const AudioCtor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return undefined;

    const context = new AudioCtor();
    const master = context.createGain();
    master.gain.value = 0.04;
    master.connect(context.destination);

    let index = 0;
    // Fast bouncy Kahoot-ish loop in C major.
    const notes = [392, 523.25, 659.25, 523.25, 440, 587.33, 698.46, 587.33, 392, 523.25, 783.99, 523.25];
    const tick = () => {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = notes[index % notes.length];
      const env = context.createGain();
      env.gain.setValueAtTime(0.0001, context.currentTime);
      env.gain.exponentialRampToValueAtTime(0.6, context.currentTime + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(env);
      env.connect(master);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      index += 1;
    };

    void context.resume().then(tick).catch(() => {});
    const interval = window.setInterval(tick, 240);

    return () => {
      window.clearInterval(interval);
      void context.close().catch(() => {});
    };
  }, [enabled]);
};

export const DiffQuizShowcase: React.FC<{
  className?: string;
  rounds?: QuizRound[];
  onWrongAnswerCaption?: string;
}> = ({
  className = '',
  rounds: roundsProp,
  onWrongAnswerCaption = 'The sandbox gets tossed. The real repo stays clean. Karen opens the lesson screen next.',
}) => {
  const [roundIndex, setRoundIndex] = React.useState(0);
  const [countdown, setCountdown] = React.useState(7);
  const [, setScore] = React.useState(0);
  const [, setStreak] = React.useState(2);
  const [skipTokens, setSkipTokens] = React.useState(0);
  const [soundEnabled] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<QuizOption['id'] | null>(null);
  const [rollback, setRollback] = React.useState(false);
  const [celebrating, setCelebrating] = React.useState(false);
  const [skipMessage, setSkipMessage] = React.useState<string | null>(null);
  useKahootMusic(soundEnabled);

  const activeRounds = roundsProp?.length ? roundsProp : rounds;
  const round = activeRounds[roundIndex % activeRounds.length];
  const isLocked = selectedId !== null || rollback || celebrating;

  React.useEffect(() => {
    if (isLocked) return undefined;
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          if (skipTokens > 0) {
            setSkipTokens((tokens) => Math.max(0, tokens - 1));
            setSkipMessage('Granny skip spent. Patch gets one more question.');
            setCelebrating(true);
            return 0;
          }
          setSelectedId(null);
          setRollback(true);
          setStreak(0);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isLocked, roundIndex, skipTokens, soundEnabled]);

  const resetForNextRound = React.useCallback(() => {
    setRoundIndex((value) => value + 1);
    setCountdown(7);
    setSelectedId(null);
    setRollback(false);
    setCelebrating(false);
    setSkipMessage(null);
  }, []);

  React.useEffect(() => {
    if (!rollback) return undefined;
    const timer = window.setTimeout(resetForNextRound, 2200);
    return () => window.clearTimeout(timer);
  }, [resetForNextRound, rollback]);

  React.useEffect(() => {
    if (!celebrating) return undefined;
    const timer = window.setTimeout(resetForNextRound, 1200);
    return () => window.clearTimeout(timer);
  }, [celebrating, resetForNextRound]);

  const answer = (option: QuizOption) => {
    if (isLocked) return;
    setSelectedId(option.id);
    if (option.correct) {
      setScore((value) => value + 250 + countdown * 10);
      setStreak((value) => {
        const next = value + 1;
        if (next % 3 === 0) {
          setSkipTokens((tokens) => tokens + 1);
          setSkipMessage('Three in a row. Karen grants one granny skip.');
        }
        return next;
      });
      setCelebrating(true);
    } else {
      if (skipTokens > 0) {
        setSkipTokens((tokens) => Math.max(0, tokens - 1));
        setSkipMessage('Granny skip spent. Karen pretends she did not see that.');
        setCelebrating(true);
        return;
      }
      setRollback(true);
      setStreak(0);
    }
  };

  return (
    <section
      className={[
        'relative overflow-hidden rounded-md border border-[#2a241c] bg-[#f8f1e3] p-4 text-[#17130f] shadow-[8px_8px_0_#17130f] sm:p-5',
        className,
      ].join(' ')}
      aria-label="Diff quiz game show preview"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'linear-gradient(#17130f 1px, transparent 1px), linear-gradient(90deg, #17130f 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 grid min-w-0 gap-4">
        <div className="relative min-w-0 rounded-sm border border-[#2a241c] bg-[#fffaf0] p-4">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#b7332c]">question {roundIndex + 1}</div>
              <h3 className="mt-2 text-2xl font-semibold tracking-normal text-[#17130f]">{round.question}</h3>
            </div>
            <motion.div
              className="grid size-16 shrink-0 place-items-center rounded-full border border-[#2a241c] bg-[#ffcc66] font-mono text-2xl font-semibold shadow-[3px_3px_0_#17130f]"
              animate={countdown <= 3 && !isLocked ? { scale: [1, 1.12, 1] } : undefined}
              transition={{ duration: 0.45, repeat: countdown <= 3 ? Infinity : 0 }}
            >
              {countdown}
            </motion.div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {round.options.map((option) => {
              const picked = selectedId === option.id;
              const revealCorrect = (selectedId !== null || celebrating) && option.correct;
              const dimWrong = selectedId !== null && !option.correct;
              return (
                <motion.button
                  key={option.id}
                  type="button"
                  data-testid={`karen-quiz-option-${option.id}`}
                  onClick={() => answer(option)}
                  className={[
                    'min-h-32 rounded-sm border-2 p-4 text-left transition-opacity',
                    optionTone[option.id],
                    dimWrong ? 'opacity-55' : '',
                    revealCorrect ? 'ring-4 ring-[#17130f]' : '',
                  ].join(' ')}
                  whileHover={!isLocked ? { y: -3 } : undefined}
                  whileTap={!isLocked ? { scale: 0.98 } : undefined}
                  animate={picked && !option.correct ? { x: [0, -8, 8, -6, 0] } : undefined}
                  disabled={isLocked}
                >
                  <div className="font-mono text-sm font-semibold">{option.id}</div>
                  <div className="mt-3 text-xl font-semibold tracking-normal">{option.label}</div>
                  <div className="mt-2 font-mono text-xs opacity-80">{option.detail}</div>
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence>
            {celebrating ? (
              <motion.div
                className="absolute inset-4 grid place-items-center rounded-sm border border-[#14532d] bg-[#22c55e]/95 p-6 text-center text-[#17130f]"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <div>
                  <div className="font-mono text-sm uppercase tracking-[0.18em]">{skipMessage ? 'granny skip' : 'patch survives'}</div>
                  <div className="mt-2 text-4xl font-semibold tracking-normal">{skipMessage ? 'One free pass.' : 'Correct.'}</div>
                  <p className="mt-2 max-w-sm font-mono text-sm">
                    {skipMessage || 'Karen promotes the diff because you proved you read it.'}
                  </p>
                </div>
              </motion.div>
            ) : null}

            {rollback ? (
              <motion.div
                className="absolute inset-4 overflow-hidden rounded-sm border border-[#7f1d1d] bg-[#ef4444] p-6 text-center text-white shadow-[6px_6px_0_#7f1d1d]"
                initial={{ opacity: 0, rotate: -2, scale: 0.92 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <motion.div
                  className="absolute inset-x-0 top-1/2 h-3 bg-white/80"
                  initial={{ x: '-120%' }}
                  animate={{ x: '120%' }}
                  transition={{ duration: 0.9, repeat: 1, ease: 'easeInOut' }}
                />
                <div className="relative z-10 grid h-full place-items-center">
                  <div>
                    <div className="font-mono text-sm uppercase tracking-[0.2em]">wrong answer</div>
                    <motion.div
                      className="mt-2 text-5xl font-semibold tracking-normal"
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 0.5, repeat: 2 }}
                    >
                      git reset --hard
                    </motion.div>
                    <p className="mx-auto mt-3 max-w-sm font-mono text-sm">{onWrongAnswerCaption}</p>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};
