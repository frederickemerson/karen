import React from 'react';
import {
  RiAlarmWarningLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBin6Line,
  RiFireLine,
  RiLockUnlockLine,
  RiRestartLine,
  RiShieldCheckLine,
  RiSkull2Line,
  RiSparkling2Line,
  RiTimerFlashLine,
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';

type BossState = 'defending' | 'saved' | 'deleted';

type Challenge = {
  id: string;
  file: string;
  question: string;
  answers: [string, string, string];
  correct: number;
  receipt: string;
  wrongVerdict: string;
};

const challenges: Challenge[] = [
  {
    id: 'scope',
    file: 'packages/ui/src/components/promptcourt/KarenLandingPage.tsx',
    question: 'What did the patch actually add to the landing page?',
    answers: [
      'A local React demo section for Karen final-boss patch defense',
      'A new Convex mutation for deleting production runs',
      'A Tauri file watcher that edits the real repository',
    ],
    correct: 0,
    receipt: 'Correct. You read the surface area instead of spiritually waving at it.',
    wrongVerdict: 'No, dear. That answer has the structural integrity of wet toast.',
  },
  {
    id: 'state',
    file: 'DeleteOrDefend.tsx',
    question: 'Where does the final challenge store its verdict and answers?',
    answers: [
      'In browser local state for the demo only',
      'In the PromptCourt public feed API',
      'In git config because that sounds official',
    ],
    correct: 0,
    receipt: 'Yes. Local state. Karen is dramatic, not a database migration.',
    wrongVerdict: 'Absolutely not. Grandma can smell accidental persistence through drywall.',
  },
  {
    id: 'intent',
    file: 'sandbox worktree',
    question: 'Why does Karen delete the sandbox when you cannot defend the patch?',
    answers: [
      'Because generated code is only allowed to survive if somebody understands it',
      'Because CSS animations need a villain',
      'Because deleting the user repository is faster than writing tests',
    ],
    correct: 0,
    receipt: 'That is the whole trial. Ownership first, merge button second.',
    wrongVerdict: 'Sweetheart, that answer goes straight into the casserole of consequences.',
  },
];

const grandmaVerdicts = {
  saved: [
    'Fine. Keep your little patch. I can tell you actually read it.',
    'Three receipts, no guessing. Grandma grants sandbox clemency.',
    'The patch may live. Do not make me come back in curlers.',
  ],
  deleted: [
    'Sandbox deleted. The lesson remains, like glitter in carpet.',
    'I asked for understanding and got jazz hands. Into the bin.',
    'No receipts, no mercy. Grandma has emptied the sandbox.',
  ],
  pressure: [
    'Tick tock, darling. The diff is not going to explain itself.',
    'Answer with evidence or I start labeling folders "misc".',
    'Grandma has a delete key and excellent posture.',
  ],
} as const;

const answerLetters = ['A', 'B', 'C'] as const;

const createEmptyAnswers = (): Array<number | null> => Array.from({ length: challenges.length }, () => null);

const getChallenge = (index: number): Challenge => challenges[index] ?? challenges[0]!;

const countCorrectAnswers = (selectedAnswers: Array<number | null>) => selectedAnswers.reduce<number>((total, answer, index) => (
  answer === getChallenge(index).correct ? total + 1 : total
), 0);

const pickLine = (lines: readonly string[], seed: number) => lines[Math.abs(seed) % lines.length] ?? lines[0] ?? '';

export const DeleteOrDefend: React.FC = () => {
  const [answers, setAnswers] = React.useState<Array<number | null>>(() => createEmptyAnswers());
  const [bossState, setBossState] = React.useState<BossState>('defending');
  const [activeQuestion, setActiveQuestion] = React.useState(0);
  const [pulse, setPulse] = React.useState(0);

  const activeChallenge = getChallenge(activeQuestion);
  const correctCount = countCorrectAnswers(answers);
  const answeredCount = answers.filter((answer) => answer !== null).length;
  const wrongCount = answeredCount - correctCount;
  const countdown = Math.max(0, 3 - answeredCount);
  const pressure = countdown === 0 ? 100 : Math.round((answeredCount / challenges.length) * 100);
  const stateSeed = answers.reduce<number>((total, answer, index) => total + (answer ?? index) + index, 0) + pulse;

  const resetTrial = () => {
    setAnswers(createEmptyAnswers());
    setBossState('defending');
    setActiveQuestion(0);
    setPulse((current) => current + 1);
  };

  const chooseAnswer = (questionIndex: number, answerIndex: number) => {
    if (bossState !== 'defending') return;

    setAnswers((currentAnswers) => {
      const nextAnswers = [...currentAnswers];
      nextAnswers[questionIndex] = answerIndex;

      const nextCorrectCount = countCorrectAnswers(nextAnswers);
      const nextAnsweredCount = nextAnswers.filter((answer) => answer !== null).length;

      if (nextAnsweredCount === challenges.length) {
        setBossState(nextCorrectCount === challenges.length ? 'saved' : 'deleted');
      } else {
        const nextOpen = nextAnswers.findIndex((answer) => answer === null);
        setActiveQuestion(nextOpen === -1 ? questionIndex : nextOpen);
      }

      return nextAnswers;
    });
  };

  const forceDelete = () => {
    setAnswers((currentAnswers) => currentAnswers.map((answer, index) => (
      answer === null ? (getChallenge(index).correct + 1) % getChallenge(index).answers.length : answer
    )));
    setBossState('deleted');
    setPulse((current) => current + 1);
  };

  const forceDefend = () => {
    setAnswers(challenges.map((challenge) => challenge.correct));
    setBossState('saved');
    setPulse((current) => current + 1);
  };

  const verdictLine = bossState === 'saved'
    ? pickLine(grandmaVerdicts.saved, stateSeed)
    : bossState === 'deleted'
      ? pickLine(grandmaVerdicts.deleted, stateSeed)
      : pickLine(grandmaVerdicts.pressure, activeQuestion + answeredCount + pulse);

  return (
    <section className="relative overflow-hidden border-y border-[#2a241c] bg-[#160f12] text-[#fff7df]">
      <div
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage: 'linear-gradient(#ffcc66 1px, transparent 1px), linear-gradient(90deg, #ffcc66 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <motion.div
        className={[
          'absolute inset-x-0 top-0 h-1',
          bossState === 'saved' ? 'bg-[#7bd88f]' : bossState === 'deleted' ? 'bg-[#f2554a]' : 'bg-[#ffcc66]',
        ].join(' ')}
        animate={{ opacity: bossState === 'defending' ? [0.35, 1, 0.35] : 1 }}
        transition={{ duration: 0.9, repeat: bossState === 'defending' ? Infinity : 0 }}
      />

      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="flex min-h-[560px] flex-col justify-between gap-8">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#ffcc66]/50 bg-[#ffcc66]/10 px-3 py-2 font-mono text-xs font-semibold uppercase text-[#ffcc66]">
              <RiSkull2Line className="size-4" />
              Feature 10 final boss
            </div>
            <h2 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-normal text-[#fff7df] sm:text-5xl">
              Delete or Defend
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#d9cab2] sm:text-lg">
              Karen caught a patch that passed the robot but failed the human. Answer three code-reading receipts or the sandbox gets ceremonially deleted.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="border border-[#ffcc66]/35 bg-[#25191c] p-4 shadow-[8px_8px_0_rgba(255,204,102,0.14)]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-xs font-semibold uppercase text-[#ffcc66]">Sandbox countdown</div>
                  <div className="mt-2 flex items-end gap-3">
                    <AnimatePresence mode="popLayout">
                      <motion.span
                        key={`${bossState}-${countdown}`}
                        initial={{ opacity: 0, y: -10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        className="font-mono text-6xl font-black leading-none text-[#ffcc66]"
                      >
                        {bossState === 'defending' ? countdown : bossState === 'saved' ? 'OK' : '00'}
                      </motion.span>
                    </AnimatePresence>
                    <span className="pb-2 font-mono text-sm text-[#a99981]">
                      {bossState === 'defending' ? 'answers left' : 'verdict locked'}
                    </span>
                  </div>
                </div>
                <motion.div
                  className={[
                    'grid size-20 place-items-center border',
                    bossState === 'saved' ? 'border-[#7bd88f] bg-[#7bd88f]/15 text-[#7bd88f]' : '',
                    bossState === 'deleted' ? 'border-[#f2554a] bg-[#f2554a]/15 text-[#f2554a]' : '',
                    bossState === 'defending' ? 'border-[#ffcc66] bg-[#ffcc66]/10 text-[#ffcc66]' : '',
                  ].join(' ')}
                  animate={bossState === 'defending' ? { rotate: [-2, 2, -2], scale: [1, 1.04, 1] } : { rotate: 0, scale: 1 }}
                  transition={{ duration: 0.75, repeat: bossState === 'defending' ? Infinity : 0 }}
                >
                  {bossState === 'saved' ? <RiShieldCheckLine className="size-10" /> : null}
                  {bossState === 'deleted' ? <RiDeleteBin6Line className="size-10" /> : null}
                  {bossState === 'defending' ? <RiTimerFlashLine className="size-10" /> : null}
                </motion.div>
              </div>

              <div className="mt-5 h-4 overflow-hidden border border-[#ffcc66]/30 bg-black">
                <motion.div
                  className={[
                    'h-full',
                    bossState === 'saved' ? 'bg-[#7bd88f]' : bossState === 'deleted' ? 'bg-[#f2554a]' : 'bg-[#ffcc66]',
                  ].join(' ')}
                  animate={{ width: `${pressure}%` }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              {challenges.map((challenge, index) => {
                const selected = answers[index];
                const isCorrect = selected === challenge.correct;
                const isWrong = selected !== null && !isCorrect;

                return (
                  <button
                    type="button"
                    key={challenge.id}
                    onClick={() => setActiveQuestion(index)}
                    className={[
                      'min-h-20 border p-3 text-left transition',
                      activeQuestion === index ? 'border-[#ffcc66] bg-[#ffcc66]/15 text-[#fff7df]' : 'border-[#fff7df]/15 bg-[#fff7df]/5 text-[#d9cab2]',
                      isCorrect ? 'border-[#7bd88f] bg-[#7bd88f]/15 text-[#7bd88f]' : '',
                      isWrong ? 'border-[#f2554a] bg-[#f2554a]/15 text-[#ffb3ad]' : '',
                    ].join(' ')}
                  >
                    <span className="block text-lg font-black">0{index + 1}</span>
                    <span className="mt-1 block leading-5">{selected === null ? 'unanswered' : isCorrect ? 'defended' : 'cracked'}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={forceDefend}
                className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#7bd88f] bg-[#7bd88f] px-4 py-3 font-mono text-xs font-black uppercase text-[#17130f] shadow-[4px_4px_0_#fff7df] transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
              >
                <RiShieldCheckLine className="size-4" />
                Defend patch
              </button>
              <button
                type="button"
                onClick={forceDelete}
                className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#f2554a] bg-[#f2554a] px-4 py-3 font-mono text-xs font-black uppercase text-white shadow-[4px_4px_0_#fff7df] transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
              >
                <RiDeleteBin6Line className="size-4" />
                Delete sandbox
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="border border-[#fff7df]/20 bg-[#fff7df] text-[#17130f] shadow-[12px_12px_0_#5d1210]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a241c] bg-[#17130f] px-4 py-3 text-[#fff7df]">
              <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase text-[#ffcc66]">
                <RiAlarmWarningLine className="size-4" />
                comprehension hearing
              </div>
              <div className="font-mono text-xs text-[#d9cab2]">
                {correctCount}/3 receipts accepted
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[1fr_240px]">
              <div className="border-b border-[#2a241c] p-4 lg:border-b-0 lg:border-r">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeChallenge.id}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.22 }}
                  >
                    <div className="font-mono text-xs font-semibold uppercase text-[#b7332c]">
                      evidence file
                    </div>
                    <div className="mt-2 break-all border border-[#2a241c]/20 bg-[#f8f1e3] px-3 py-2 font-mono text-xs text-[#4f463b]">
                      {activeChallenge.file}
                    </div>
                    <h3 className="mt-5 text-2xl font-semibold leading-snug tracking-normal">
                      {activeChallenge.question}
                    </h3>

                    <div className="mt-5 grid gap-3">
                      {activeChallenge.answers.map((answer, answerIndex) => {
                        const selected = answers[activeQuestion] === answerIndex;
                        const locked = answers[activeQuestion] !== null || bossState !== 'defending';
                        const isCorrect = answerIndex === activeChallenge.correct;
                        const showCorrect = locked && isCorrect;
                        const showWrong = selected && !isCorrect;

                        return (
                          <motion.button
                            type="button"
                            key={answer}
                            onClick={() => chooseAnswer(activeQuestion, answerIndex)}
                            disabled={locked}
                            className={[
                              'grid min-h-16 grid-cols-[36px_1fr_auto] items-center gap-3 border px-3 py-3 text-left transition',
                              selected ? 'border-[#17130f] bg-[#ffcc66]/35 shadow-[4px_4px_0_#17130f]' : 'border-[#2a241c]/20 bg-white hover:border-[#17130f]',
                              showCorrect ? 'border-[#2f8f48] bg-[#7bd88f]/25 text-[#133d21]' : '',
                              showWrong ? 'border-[#b7332c] bg-[#f2554a]/15 text-[#5d1210]' : '',
                              locked ? 'cursor-default' : 'cursor-pointer',
                            ].join(' ')}
                            whileHover={locked ? undefined : { x: 3 }}
                          >
                            <span className="grid size-9 place-items-center border border-current font-mono text-sm font-black">
                              {answerLetters[answerIndex]}
                            </span>
                            <span className="text-sm font-semibold leading-5 sm:text-base">{answer}</span>
                            {showCorrect ? <RiCheckLine className="size-5 text-[#2f8f48]" /> : null}
                            {showWrong ? <RiCloseLine className="size-5 text-[#b7332c]" /> : null}
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="bg-[#f8f1e3] p-4">
                <div className="font-mono text-xs font-semibold uppercase text-[#b7332c]">Grandma verdict</div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${bossState}-${activeQuestion}-${answers[activeQuestion]}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4 min-h-40 border border-[#2a241c] bg-[#17130f] p-4 text-[#fff7df] shadow-[5px_5px_0_#b7332c]"
                  >
                    <div className="flex items-center gap-2 font-mono text-xs text-[#ffcc66]">
                      <RiSparkling2Line className="size-4" />
                      Karen says
                    </div>
                    <p className="mt-3 text-lg font-semibold leading-7 tracking-normal">{verdictLine}</p>
                  </motion.div>
                </AnimatePresence>

                <div className="mt-5 grid gap-2 font-mono text-xs">
                  <div className="flex items-center justify-between border border-[#2a241c]/15 bg-white px-3 py-2">
                    <span>Wrong answers</span>
                    <span className={wrongCount > 0 ? 'font-black text-[#b7332c]' : 'font-black text-[#2f8f48]'}>{wrongCount}</span>
                  </div>
                  <div className="flex items-center justify-between border border-[#2a241c]/15 bg-white px-3 py-2">
                    <span>Sandbox lock</span>
                    <span className="font-black">{bossState === 'saved' ? 'open' : bossState === 'deleted' ? 'purged' : 'armed'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {bossState === 'defending' ? (
              <motion.div
                key="receipt"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="border border-[#ffcc66]/35 bg-[#ffcc66]/10 p-4 text-[#ffe4a3]"
              >
                <div className="font-mono text-xs font-semibold uppercase">Active receipt</div>
                <p className="mt-2 text-sm leading-6">
                  {answers[activeQuestion] === null
                    ? 'Pick the answer you can defend from the diff. Guessing is how sandboxes meet the bin.'
                    : answers[activeQuestion] === activeChallenge.correct
                      ? activeChallenge.receipt
                      : activeChallenge.wrongVerdict}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={bossState}
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.98 }}
                className={[
                  'relative overflow-hidden border p-5 shadow-[10px_10px_0_rgba(255,247,223,0.18)]',
                  bossState === 'saved' ? 'border-[#7bd88f] bg-[#12351f] text-[#dfffe6]' : 'border-[#f2554a] bg-[#3b1110] text-[#ffe0dc]',
                ].join(' ')}
              >
                <motion.div
                  className="absolute inset-0 opacity-20"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                  style={{
                    background: bossState === 'saved'
                      ? 'linear-gradient(90deg, transparent, #7bd88f, transparent)'
                      : 'linear-gradient(90deg, transparent, #f2554a, transparent)',
                  }}
                />
                <div className="relative flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs font-semibold uppercase">
                      {bossState === 'saved' ? 'Patch defended' : 'Sandbox deleted'}
                    </div>
                    <h3 className="mt-2 text-3xl font-black leading-tight tracking-normal">
                      {bossState === 'saved' ? 'Karen stamps it: survived.' : 'Karen hits delete with both hands.'}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6">
                      {bossState === 'saved'
                        ? 'The demo ends with receipts, confidence, and a sandbox still standing.'
                        : 'The repo is safe. The disposable sandbox is gone. The next prompt will be more specific.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="grid size-16 place-items-center border border-current bg-black/20"
                      animate={bossState === 'saved' ? { rotate: [0, 6, -4, 0] } : { y: [0, -8, 0], rotate: [0, -8, 8, 0] }}
                      transition={{ duration: 0.65, repeat: 2 }}
                    >
                      {bossState === 'saved' ? <RiLockUnlockLine className="size-9" /> : <RiFireLine className="size-9" />}
                    </motion.div>
                    <button
                      type="button"
                      onClick={resetTrial}
                      className="inline-flex min-h-12 items-center justify-center gap-2 border border-current px-4 py-3 font-mono text-xs font-black uppercase transition hover:bg-white hover:text-[#17130f]"
                    >
                      <RiRestartLine className="size-4" />
                      Retry
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default DeleteOrDefend;
