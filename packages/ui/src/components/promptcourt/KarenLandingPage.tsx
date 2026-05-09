import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import type { PromptCourtProfile, PromptCourtPublicPost } from '@/lib/promptcourt';
import { BadPromptGraveyard } from './BadPromptGraveyard';
import { KarenMascot } from './KarenMascot';
import { CourtroomDemo } from './CourtroomDemo';
import { DeleteOrDefend } from './DeleteOrDefend';
import { DiffQuizShowcase } from './DiffQuizShowcase';
import { GrandmaVoicePanel } from './GrandmaVoicePanel';
import { KarenBadgeWall } from './KarenBadgeWall';
import { KarenReplayTape } from './KarenReplayTape';
import { LiveLeaderboardShowcase } from './LiveLeaderboardShowcase';
import { ProofProfileCard } from './ProofProfileCard';

const badPrompts = [
  'fix auth',
  'make it better',
  'clean this up',
  'add dashboard stuff',
  'ship the feature',
  'whatever seems right',
];

const courtSteps = [
  ['01', 'She reads the prompt first', 'No files? No tests? No acceptance criteria? Karen blocks it before the agent can create mystery meat.'],
  ['02', 'The agent runs in a sandbox', 'Approved prompts execute in an isolated worktree. The real repo stays clean until you prove you understand the patch.'],
  ['03', 'You get quizzed on the diff', 'Karen asks about actual changed files, exports, imports, calls, configs, and tests. This is not trivia. This is ownership.'],
  ['04', 'Your profile becomes receipts', 'Passed runs build a reputation. Failed quizzes become lessons. Bad prompts become a little public character development.'],
];

const roastLines = [
  ['Bad prompt', 'fix it'],
  ['Karen', 'Fix what, sweetheart? Your chakras?'],
  ['Better prompt', 'Update auth/session.ts to reject expired Clerk sessions, keep OAuth behavior, and add route tests.'],
  ['Karen', 'Fine. I will allow the machine to touch the keyboard.'],
];

const commands = [
  ['Install', 'bun run install:karen'],
  ['Start', 'karen'],
  ['Guard the TUI', '/tui'],
  ['Open dashboard', '/gui'],
];

const tapeItems = [
  'PROMPT COURT',
  'SANDBOX RUN',
  'CODE QUIZ',
  'ROLLBACK IF WRONG',
  'PROFILE RECEIPTS',
  'NO MORE VIBE DEBT',
];

const demoProfile: PromptCourtProfile = {
  user: {
    username: 'future-maintainer',
    displayName: 'Future Maintainer',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
  },
  stats: {
    disciplineScore: 91,
    level: 'Senior Diff Attorney',
    averagePromptScore: 88,
    quizPassRate: 94,
    currentStreak: 9,
    longestStreak: 17,
    rollbackCount: 3,
    publicFailureCount: 2,
    perfectRuns: 8,
    totalSessions: 42,
    blockedPrompts: 11,
    promotedRuns: 31,
    generatedFileCount: 126,
  },
  rewards: [
    { id: 'prompt-prosecutor', label: 'Prompt Prosecutor', tone: 'good' },
    { id: 'diff-whisperer', label: 'Diff Whisperer', tone: 'good' },
    { id: 'grandma-approved', label: 'Grandma Approved', tone: 'good' },
    { id: 'vibe-ticket', label: 'One public shame incident', tone: 'bad' },
  ],
  recentSessions: [],
  publicPosts: [],
};

const demoPublicPosts: PromptCourtPublicPost[] = [
  {
    id: 'grave-1',
    username: 'rush-hour-dev',
    type: 'bad_prompt',
    title: 'The court rejects "fix the thing"',
    score: 18,
    promptExcerpt: 'fix the auth thing and make it production ready',
    failureReasons: ['No target files', 'No acceptance criteria', 'No test plan'],
    suggestedRewrite: 'Update packages/web/server/lib/auth/session.ts to reject expired Clerk sessions, preserve OAuth login, and add route coverage for expired and valid tokens.',
    createdAt: Date.now() - 1000 * 60 * 8,
  },
  {
    id: 'grave-2',
    username: 'shipit-sam',
    type: 'bad_prompt',
    title: 'Karen finds vibes in evidence',
    score: 27,
    promptExcerpt: 'make the dashboard nicer and add whatever stats are useful',
    failureReasons: ['Vague UX goal', 'No data contract', 'No verification'],
    suggestedRewrite: 'Revise the Karen dashboard stats panel to show prompt average, quiz pass rate, current streak, and rollbacks avoided using existing PromptCourtOverview fields. Keep layout responsive and run UI type-check.',
    createdAt: Date.now() - 1000 * 60 * 21,
  },
  {
    id: 'grave-3',
    username: 'cursor-cowboy',
    type: 'bad_prompt',
    title: 'A heroic absence of details',
    score: 33,
    promptExcerpt: 'refactor the backend cleanly',
    failureReasons: ['No boundary', 'No rollback strategy', 'No definition of clean'],
    suggestedRewrite: 'Refactor packages/web/server/lib/promptcourt storage helpers only. Keep public API responses unchanged, add unit coverage for profile aggregation, and do not touch Convex routes.',
    createdAt: Date.now() - 1000 * 60 * 43,
  },
];

const ScrollProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <motion.div
      className="fixed left-0 top-0 z-50 h-1 origin-left bg-[#b7332c]"
      style={{ scaleX, width: '100%' }}
    />
  );
};

const Eyebrow = ({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) => (
  <div className={dark ? 'font-mono text-sm text-[#ffcc66]' : 'font-mono text-sm text-[#b7332c]'}>
    {children}
  </div>
);

const Section = ({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.section
    id={id}
    initial={{ opacity: 1, y: 0 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-120px' }}
    className={className}
  >
    {children}
  </motion.section>
);

const MarqueeTape = () => (
  <div className="overflow-hidden border-y border-[#2a241c]/20 bg-[#ffcc66] py-3 font-mono text-sm font-semibold text-[#17130f]">
    <motion.div
      className="flex min-w-max gap-8"
      animate={{ x: ['0%', '-50%'] }}
      transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
    >
      {[...tapeItems, ...tapeItems, ...tapeItems].map((item, index) => (
        <span key={`${item}-${index}`}>{item}</span>
      ))}
    </motion.div>
  </div>
);

export const KarenLandingPage: React.FC = () => {
  React.useEffect(() => {
    document.documentElement.classList.add('karen-document-scroll');
    return () => {
      document.documentElement.classList.remove('karen-document-scroll');
    };
  }, []);

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#f8f1e3] text-[#17130f]">
      <ScrollProgress />
      <header className="sticky top-0 z-40 border-b border-[#2a241c]/15 bg-[#f8f1e3]/92 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/karen/landing" className="flex items-center gap-3">
            <motion.img
              src="/mascots/karen-grandma.png"
              alt=""
              className="size-11 rounded-sm border border-[#2a241c] bg-black object-contain p-0.5 shadow-[3px_3px_0_#17130f]"
              style={{ imageRendering: 'pixelated' }}
              whileHover={{ rotate: [-2, 2, -2], transition: { duration: 0.22 } }}
            />
            <div>
              <div className="font-mono text-lg font-semibold tracking-normal">Karen</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#766d61]">diffs with receipts</div>
            </div>
          </a>
          <div className="hidden items-center gap-5 font-mono text-xs text-[#5d564c] sm:flex">
            <a href="#court" className="hover:text-[#17130f]">court</a>
            <a href="#quiz" className="hover:text-[#17130f]">quiz</a>
            <a href="#proof" className="hover:text-[#17130f]">proof</a>
            <a href="#cli" className="hover:text-[#17130f]">cli</a>
            <a href="/karen" className="rounded-sm border border-[#2a241c] px-3 py-1.5 text-[#17130f] shadow-[2px_2px_0_#17130f] hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-[#17130f] hover:text-[#f8f1e3] hover:shadow-none">
              dashboard
            </a>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#2a241c]/15">
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(#17130f 1px, transparent 1px), linear-gradient(90deg, #17130f 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="mx-auto grid min-h-[88dvh] max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_430px] lg:px-8">
            <div className="relative z-10 max-w-4xl">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                <Eyebrow>the agent is fast. your future self is suing.</Eyebrow>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.5 }}
                className="mt-5 max-w-5xl text-6xl font-semibold leading-[0.93] tracking-normal text-[#17130f] sm:text-7xl lg:text-8xl"
              >
                Stop merging code you only spiritually understand.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16, duration: 0.5 }}
                className="mt-6 max-w-2xl text-xl leading-8 text-[#4f463b]"
              >
                Karen is the mean little proof-of-work layer for AI coding. She judges your prompt, runs the agent in a sandbox, quizzes you on the diff, and throws away code you cannot explain.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.5 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <a href="/karen" className="rounded-sm bg-[#17130f] px-5 py-3 font-mono text-sm font-semibold text-[#f8f1e3] shadow-[4px_4px_0_#b7332c] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
                  Open the courtroom
                </a>
                <a href="#cli" className="rounded-sm border border-[#2a241c] px-5 py-3 font-mono text-sm font-semibold text-[#17130f] shadow-[4px_4px_0_#17130f] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#eadfca] hover:shadow-none">
                  Watch the CLI
                </a>
              </motion.div>

              <div className="mt-8 flex max-w-2xl flex-wrap gap-2 font-mono text-xs">
                {badPrompts.map((prompt, index) => (
                  <motion.span
                    key={prompt}
                    className="rounded-sm border border-[#b7332c]/30 bg-[#b7332c]/10 px-2 py-1 text-[#b7332c]"
                    animate={{ y: index % 2 === 0 ? [0, -4, 0] : [0, 4, 0] }}
                    transition={{ duration: 2.8 + index * 0.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    blocked: {prompt}
                  </motion.span>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96, rotate: -1 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: 0.18, duration: 0.55, ease: 'easeOut' }}
              className="relative z-10"
            >
              <motion.div
                className="absolute -left-10 top-8 z-10 hidden max-w-[210px] rounded-sm border border-[#2a241c] bg-[#fffaf0] p-3 font-mono text-xs leading-5 text-[#17130f] shadow-[5px_5px_0_#b7332c] lg:block"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                I read your diff and I have concerns.
              </motion.div>
              <motion.div
                animate={{ y: [0, -6, 0], rotate: [-0.4, 0.4, -0.4] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <KarenMascot className="h-[520px] max-h-[70dvh] border-[#2a241c] bg-black shadow-[12px_12px_0_#17130f]" mood="mad" />
              </motion.div>
            </motion.div>
          </div>
        </section>

        <MarqueeTape />

        <Section id="court" className="border-b border-[#2a241c]/15 bg-[#17130f] px-4 py-16 text-[#f8f1e3] sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.76fr_1.24fr]">
              <div>
                <Eyebrow dark>the problem</Eyebrow>
                <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">Vibe coding is fun until the repo starts blinking.</h2>
                <p className="mt-5 text-lg leading-8 text-[#c9bca8]">
                  AI made code cheap. Understanding it is still expensive. Karen makes comprehension part of the workflow, so the team is not left maintaining a patch nobody actually read.
                </p>
              </div>
              <div className="grid gap-3 font-mono text-sm">
                {roastLines.map(([speaker, text]) => (
                  <motion.div
                    key={`${speaker}-${text}`}
                    className={[
                      'grid gap-2 rounded-sm border px-4 py-3 shadow-[5px_5px_0_rgba(248,241,227,0.14)] sm:grid-cols-[120px_1fr]',
                      speaker === 'Karen' ? 'border-[#ffcc66]/50 bg-[#ffcc66]/10 text-[#ffe1a3]' : '',
                      speaker === 'Bad prompt' ? 'border-[#ff6b5f]/50 bg-[#ff6b5f]/10 text-[#ffb0a8]' : '',
                      speaker === 'Better prompt' ? 'border-[#7bd88f]/50 bg-[#7bd88f]/10 text-[#b9f6c3]' : '',
                    ].join(' ')}
                    whileHover={{ x: 4 }}
                  >
                    <span className="uppercase tracking-[0.16em] opacity-70">{speaker}</span>
                    <span>{text}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="mt-10">
              <CourtroomDemo />
            </div>
          </div>
        </Section>

        <Section id="proof" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <Eyebrow>the loop</Eyebrow>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">Like LeetCode, except the puzzle is your real production mess.</h2>
              <p className="mt-5 text-lg leading-8 text-[#4f463b]">
                Karen does not ask toy questions. She asks about the files and symbols your agent just changed. If you pass, you learned something while building. If you fail, the code goes in the bin and the lesson stays.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {courtSteps.map(([number, title, body], index) => (
                <motion.article
                  key={title}
                  className="rounded-sm border border-[#2a241c]/20 bg-[#fffaf0] p-5 shadow-[5px_5px_0_#2a241c]"
                  whileHover={{ y: -4, rotate: index % 2 === 0 ? -0.4 : 0.4 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                >
                  <div className="font-mono text-xs text-[#b7332c]">{number}</div>
                  <h3 className="mt-3 text-xl font-semibold tracking-normal">{title}</h3>
                  <p className="mt-3 leading-7 text-[#5d564c]">{body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </Section>

        <Section id="quiz" className="border-y border-[#2a241c]/15 bg-[#efe4d0] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div>
              <Eyebrow>kahoot mode for diffs</Eyebrow>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">A tiny game show before the patch gets keys to the house.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#4f463b]">
                Music, pressure, colored answers, and zero patience for guessing. Karen uses parser data where she can, then falls back to diff structure when the language gets weird.
              </p>
            </div>
            <DiffQuizShowcase className="mt-8" />
          </div>
        </Section>

        <Section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.76fr_1.24fr] lg:items-start">
            <div>
              <Eyebrow>proof profile</Eyebrow>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">Your new resume line: I can explain what my agent shipped.</h2>
              <p className="mt-5 text-lg leading-8 text-[#4f463b]">
                Karen turns code reading into a visible score: prompt quality, quiz pass rate, clean rollbacks, files survived, and badges that mean more than "I prompted real hard."
              </p>
            </div>
            <ProofProfileCard profile={demoProfile} proofBaseUrl="https://karen.dev/proof" />
          </div>
        </Section>

        <KarenBadgeWall />

        <Section className="border-y border-[#2a241c]/15 bg-[#f2e5ce] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div>
              <Eyebrow>run recorder</Eyebrow>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">Every session becomes a tape.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-[#4f463b]">
                The dashboard streams the run state: queued, running, blocked, quiz passed, rollback, synced, failed. No hand-wavy "the agent did stuff" fog.
              </p>
            </div>
            <KarenReplayTape className="mt-8" />
          </div>
        </Section>

        <Section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <LiveLeaderboardShowcase />
          </div>
        </Section>

        <Section className="border-y border-[#2a241c]/15 bg-[#efe4d0] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
            <div>
              <Eyebrow>public shame, private learning</Eyebrow>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">Bad prompts get buried with a rewrite attached.</h2>
              <p className="mt-5 text-lg leading-8 text-[#4f463b]">
                The point is not cruelty. The point is receipts. Karen shows why the prompt failed, gives the better version, and turns a miss into a training artifact.
              </p>
            </div>
            <BadPromptGraveyard posts={demoPublicPosts} limit={3} />
          </div>
        </Section>

        <Section className="bg-[#f8f1e3] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <GrandmaVoicePanel />
          </div>
        </Section>

        <DeleteOrDefend />

        <Section id="cli" className="bg-[#17130f] px-4 py-16 text-[#f8f1e3] sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <Eyebrow dark>cli first</Eyebrow>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">Use it where you already argue with your computer.</h2>
              <p className="mt-5 text-lg leading-8 text-[#c9bca8]">
                Karen wraps your agent workflow without turning your editor into a compliance portal. Terminal, guarded TUI, dashboard, and profile all point at the same local record.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {commands.map(([label, command]) => (
                <motion.div
                  key={label}
                  className="rounded-sm border border-[#f8f1e3]/20 bg-[#f8f1e3]/5 p-4 shadow-[5px_5px_0_rgba(248,241,227,0.12)]"
                  whileHover={{ y: -4 }}
                >
                  <div className="font-mono text-xs text-[#ffcc66]">{label}</div>
                  <code className="mt-3 block rounded-sm bg-black px-3 py-3 font-mono text-sm text-[#7bd88f]">{command}</code>
                </motion.div>
              ))}
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
};
