import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { playKarenEventAudio } from '@/lib/karenVoice';

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

const codeLines = [
  '- return allowSession(session)',
  '+ if (isExpired(session)) return denySession()',
  '+ auditTrail.record("session_rejected")',
  '+ return allowSession(session)',
];

const clampCountdown = (value: number) => Math.max(0, Math.min(7, value));

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
  const [score, setScore] = React.useState(0);
  const [streak, setStreak] = React.useState(2);
  const [skipTokens, setSkipTokens] = React.useState(0);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<QuizOption['id'] | null>(null);
  const [rollback, setRollback] = React.useState(false);
  const [celebrating, setCelebrating] = React.useState(false);
  const [skipMessage, setSkipMessage] = React.useState<string | null>(null);

  const activeRounds = roundsProp?.length ? roundsProp : rounds;
  const round = activeRounds[roundIndex % activeRounds.length];
  const isLocked = selectedId !== null || rollback || celebrating;
  const countdownRatio = clampCountdown(countdown) / 7;

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
          if (soundEnabled) void playKarenEventAudio('quiz-fail');
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
      if (soundEnabled) void playKarenEventAudio('quiz-pass');
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
      if (soundEnabled) void playKarenEventAudio('quiz-fail');
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

      <div className="relative z-10 grid min-w-0 gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="min-w-0 rounded-sm border border-[#2a241c] bg-[#17130f] p-4 text-[#f8f1e3]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#ffcc66]">Karen live quiz</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Read the diff or lose the patch.</h2>
            </div>
            <motion.button
              type="button"
              onClick={() => setSoundEnabled((value) => !value)}
              className="shrink-0 rounded-sm border border-[#f8f1e3]/30 px-3 py-2 font-mono text-xs text-[#f8f1e3] hover:bg-[#f8f1e3] hover:text-[#17130f]"
              whileTap={{ scale: 0.96 }}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? 'sound on' : 'sound off'}
            </motion.button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 font-mono text-xs">
            <div className="rounded-sm border border-[#f8f1e3]/20 bg-[#f8f1e3]/10 p-3">
              <div className="text-[#c9bca8]">score</div>
              <div className="mt-1 text-2xl font-semibold text-[#ffcc66]">{score}</div>
            </div>
            <div className="rounded-sm border border-[#f8f1e3]/20 bg-[#f8f1e3]/10 p-3">
              <div className="text-[#c9bca8]">streak</div>
              <div className="mt-1 text-2xl font-semibold text-[#7bd88f]">{streak}x</div>
            </div>
            <div className="rounded-sm border border-[#f8f1e3]/20 bg-[#f8f1e3]/10 p-3">
              <div className="text-[#c9bca8]">timer</div>
              <div className="mt-1 text-2xl font-semibold text-[#ff6b5f]">{countdown}s</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-sm border border-[#f8f1e3]/20 bg-[#f8f1e3]/10 p-3 font-mono text-xs text-[#f8f1e3]">
            <span className="rounded-sm bg-[#ffcc66] px-2 py-1 font-semibold text-[#17130f]">
              {skipTokens} granny skip{skipTokens === 1 ? '' : 's'}
            </span>
            <span>Earn one every 3 correct answers. It saves one bad click or timeout.</span>
          </div>

          <div className="mt-5 rounded-sm border border-[#f8f1e3]/20 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 font-mono text-xs text-[#c9bca8]">
              <span className="min-w-0 break-all">{round.changedFile}</span>
              <span>{round.diffStat}</span>
            </div>
            <div className="space-y-1 overflow-hidden font-mono text-xs leading-5">
              {codeLines.map((line, index) => (
                <motion.div
                  key={`${line}-${index}`}
                  className={line.startsWith('+') ? 'text-[#7bd88f]' : 'text-[#ff8a80]'}
                  animate={rollback ? { x: [0, -6, 6, -4, 0], opacity: [1, 0.7, 1] } : undefined}
                  transition={{ duration: 0.45, delay: index * 0.04 }}
                >
                  {line}
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f8f1e3]/15">
            <motion.div
              className="h-full origin-left bg-[#ffcc66]"
              animate={{ scaleX: countdownRatio }}
              transition={{ duration: 0.25 }}
              style={{ width: '100%' }}
            />
          </div>

          {soundEnabled ? (
            <div className="mt-4 flex h-8 items-end gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((bar) => (
                <motion.span
                  key={bar}
                  className="w-2 rounded-t-sm bg-[#ffcc66]"
                  animate={{ height: [8, 24 - (bar % 3) * 4, 10] }}
                  transition={{ duration: 0.45, repeat: Infinity, delay: bar * 0.06 }}
                />
              ))}
              <span className="ml-2 self-center font-mono text-xs text-[#c9bca8]">browser UI only</span>
            </div>
          ) : (
            <div className="mt-4 font-mono text-xs text-[#c9bca8]">silent mode still judges you.</div>
          )}
        </div>

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
                      ROLLBACK
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
