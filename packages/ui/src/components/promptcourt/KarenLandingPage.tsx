import React from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import {
  RiArrowRightLine,
  RiCheckboxCircleLine,
  RiCommandLine,
  RiGitBranchLine,
  RiPlayCircleLine,
  RiShieldCheckLine,
  RiTimerFlashLine,
} from '@remixicon/react';
import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';

import { DiffQuizShowcase } from './DiffQuizShowcase';
import { KarenMascot } from './KarenMascot';
import { KarenLogo } from './KarenLogo';
import { KarenReplayTape } from './KarenReplayTape';
import { isKarenAuthConfigured } from '@/lib/karenCloudConfig';

const REPO_URL = 'https://github.com/frederickemerson/karen';

const navItems = [
  ['Problem', '#problem'],
  ['Replay', '#replay'],
  ['Quiz', '#quiz'],
  ['CLI', '#cli'],
] as const;

const metrics = [
  ['Prompt gate', 'before code'],
  ['Sandbox', 'before merge'],
  ['AI quiz', 'before promote'],
  ['Profile', 'after proof'],
] as const;

const promptExamples = [
  ['fix this', 'allowed with side-eye', 'Karen lets it run, then asks sharper quiz questions because you gave her no map.'],
  ['make this faster', 'allowed, flagged', 'Performance work is valid. Karen records that the acceptance criteria were thin.'],
  ['do your magic', 'blocked', 'No action, no scope, no intent. Grandma shuts the laptop.'],
  ['refactor auth without changing login behavior', 'approved', 'Clear area, clear risk, clear thing to preserve.'],
] as const;

const workflow = [
  {
    icon: RiCommandLine,
    title: 'Start in terminal or GUI',
    body: 'Type `karen`, use `/tui`, or start a guarded browser run from the dashboard. One run stream. One profile. One trail of receipts.',
  },
  {
    icon: RiShieldCheckLine,
    title: 'Karen judges the prompt first',
    body: 'Lazy-but-actionable prompts can run with warnings. Empty nonsense gets blocked before an agent touches the repo.',
  },
  {
    icon: RiGitBranchLine,
    title: 'Agent works in a sandbox',
    body: 'Approved prompts run in an isolated worktree. Your real codebase stays clean until the quiz is passed.',
  },
  {
    icon: RiTimerFlashLine,
    title: 'You defend the diff',
    body: 'Parser evidence and a strong model turn the diff into questions about behavior, APIs, imports, tests, and risk.',
  },
] as const;

const commands = [
  ['Install', 'bun run install:karen'],
  ['Open shell', 'karen'],
  ['Guard TUI', '/tui'],
  ['Open GUI', '/gui'],
] as const;

const replayRows = [
  ['00:00', 'Prompt submitted', 'Update session auth with tests'],
  ['00:04', 'Karen verdict', 'Approved: scoped files and done criteria'],
  ['00:11', 'Agent sandbox', '3 files changed, +84 -12'],
  ['00:28', 'Quiz generated', 'exports, calls, config impact'],
  ['00:45', 'Patch promoted', 'User passed code-read check'],
] as const;

const ScrollBar = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return <motion.div className="fixed left-0 top-0 z-50 h-0.5 w-full origin-left bg-[#111]" style={{ scaleX }} />;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
    {children}
  </div>
);

const ScrollReveal = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 42, scale: 0.98 }}
    whileInView={{ opacity: 1, y: 0, scale: 1 }}
    viewport={{ once: true, amount: 0.22 }}
    transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
);

const PromptJudgeShowcase = () => (
  <div className="grid gap-3 md:grid-cols-2">
    {promptExamples.map(([prompt, verdict, detail], index) => (
      <motion.div
        key={prompt}
        className="rounded-md border border-[#d8d8d8] bg-[#f7f7f4] p-4"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.08 }}
        whileHover={{ y: -4 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <code className="rounded-sm bg-[#111] px-2 py-1 font-mono text-sm text-[#7bd88f]">{prompt}</code>
          <span className="rounded-sm border border-[#111] px-2 py-1 font-mono text-xs uppercase tracking-[0.12em] text-[#111]">
            {verdict}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#555]">{detail}</p>
      </motion.div>
    ))}
  </div>
);

const DemoCinema = () => (
  <div className="relative overflow-hidden rounded-md border border-[#111] bg-[#111] p-4 text-[#f6f2e8] shadow-[10px_10px_0_#111]">
    <div className="pointer-events-none absolute inset-0 opacity-20">
      <motion.div
        className="h-full w-[45%] bg-gradient-to-r from-transparent via-[#ffcc66] to-transparent"
        animate={{ x: ['-120%', '260%'] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
      />
    </div>
    <div className="relative z-10 flex items-center justify-between border-b border-white/15 pb-3 font-mono text-xs">
      <span>karen-demo-render.mov</span>
      <span className="text-[#ffcc66]">00:45</span>
    </div>
    <div className="relative z-10 mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="min-h-[260px] overflow-hidden rounded-sm border border-white/15 bg-black p-4 font-mono text-sm">
        {[
          '$ karen "make auth faster"',
          'WARN lazy prompt: allowed, quiz difficulty raised',
          'SANDBOX agent run started',
          'DIFF 3 files changed',
          'QUIZ What behavior changed?',
          'STREAK 3x -> granny skip earned',
        ].map((line, index) => (
          <motion.div
            key={line}
            className={index === 1 ? 'text-[#ffcc66]' : index === 5 ? 'text-[#7bd88f]' : 'text-[#f6f2e8]'}
            initial={{ opacity: 0, x: -18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.18 }}
          >
            {line}
          </motion.div>
        ))}
      </div>
      <div className="grid content-between gap-4 rounded-sm border border-white/15 bg-white/[0.06] p-4">
        <div>
          <SectionLabel>video demo flow</SectionLabel>
          <h3 className="mt-3 text-3xl font-semibold tracking-normal">Looks like a clip, backed by run data.</h3>
          <p className="mt-3 text-sm leading-6 text-[#c9c9c9]">
            The replay contract already has the scenes: prompt, verdict, sandbox, diff, quiz, reward, rollback. Remotion can turn the same data into an MP4 export.
          </p>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 18 }).map((_, index) => (
            <motion.span
              key={index}
              className="h-10 rounded-[2px] bg-[#ffcc66]"
              animate={{ opacity: [0.35, 1, 0.35], scaleY: [0.55, 1, 0.65] }}
              transition={{ duration: 1, repeat: Infinity, delay: index * 0.04 }}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
);

const RunFilm = () => (
  <div className="overflow-hidden rounded-md border border-[#d8d8d8] bg-[#f7f7f4] shadow-[0_24px_80px_rgba(17,17,17,0.12)]">
    <div className="flex items-center justify-between border-b border-[#d8d8d8] bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-[#ff5f57]" />
        <span className="size-2 rounded-full bg-[#ffbd2e]" />
        <span className="size-2 rounded-full bg-[#28c840]" />
      </div>
      <div className="font-mono text-xs text-[#6f6f6f]">karen-run-042.mov</div>
      <RiPlayCircleLine className="size-5 text-[#111]" />
    </div>
    <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
      <div className="bg-[#111] p-5 font-mono text-sm text-[#f6f2e8]">
        <div className="text-[#7bd88f]">$ karen "Update session auth with tests"</div>
        <div className="mt-5 grid gap-3">
          {replayRows.map(([time, label, detail], index) => (
            <motion.div
              key={label}
              className="grid grid-cols-[52px_1fr] gap-3 border-l border-[#3b3b3b] pl-3"
              initial={{ opacity: 0.35 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 }}
            >
              <span className="text-[#ffcc66]">{time}</span>
              <span>
                <span className="text-white">{label}</span>
                <span className="block text-[#a9a9a9]">{detail}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="grid content-between gap-6 bg-white p-5">
        <div>
          <SectionLabel>recorded proof</SectionLabel>
          <h3 className="mt-3 text-2xl font-semibold tracking-normal text-[#111]">Every agent run becomes a replayable receipt.</h3>
          <p className="mt-3 text-sm leading-6 text-[#555]">
            Prompt, sandbox diff, quiz answers, rollback, and promotion are packaged into a replay contract that can become a shareable clip.
          </p>
        </div>
        <div className="grid gap-2 font-mono text-xs">
          {['queued', 'running', 'quiz_passed', 'synced'].map((status) => (
            <div key={status} className="flex items-center justify-between rounded-sm border border-[#dededb] px-3 py-2">
              <span>{status}</span>
              <RiCheckboxCircleLine className="size-4 text-[#177245]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const KarenLandingAuthCta: React.FC = () => {
  if (!isKarenAuthConfigured) {
    return (
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#f6f2e8]"
      >
        GitHub <RiArrowRightLine className="size-4" />
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal" forceRedirectUrl="/promptcourt">
          <button
            type="button"
            className="rounded-sm border border-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#111]"
          >
            Sign in
          </button>
        </SignInButton>
        <SignInButton mode="modal" forceRedirectUrl="/promptcourt">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#f6f2e8]"
          >
            Sign up <RiArrowRightLine className="size-4" />
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <a
          href="/promptcourt"
          className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#f6f2e8]"
        >
          My profile <RiArrowRightLine className="size-4" />
        </a>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
};

export const KarenLandingPage: React.FC = () => {
  React.useEffect(() => {
    document.documentElement.classList.add('karen-document-scroll');
    return () => {
      document.documentElement.classList.remove('karen-document-scroll');
    };
  }, []);

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#f6f2e8] text-[#111]">
      <ScrollBar />
      <header className="sticky top-0 z-40 border-b border-[#d8d8d8] bg-[#f6f2e8]/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <KarenLogo className="size-10 border-[#111]" mood="mad" />
            <div className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">Karen</div>
          </a>
          <div className="hidden items-center gap-6 font-mono text-xs text-[#555] md:flex">
            {navItems.map(([label, href]) => (
              <a key={href} href={href} className="hover:text-[#111]">{label}</a>
            ))}
          </div>
          <KarenLandingAuthCta />
        </nav>
      </header>

      <main>
        <section className="mx-auto grid min-h-[88dvh] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
          <div>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <SectionLabel>proof of work for AI coding</SectionLabel>
              <h1 className="mt-5 max-w-5xl text-6xl font-semibold leading-[0.92] tracking-normal sm:text-7xl lg:text-8xl">
                Make AI-written patches earn their keep.
              </h1>
              <p className="mt-6 max-w-2xl text-xl leading-8 text-[#4d4d4d]">
                Karen sits between your coding agent and your repo. She rejects lazy prompts, runs approved work in a sandbox, quizzes you on the diff, and rolls back code you cannot explain.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#cli"
                  className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-5 py-3 font-mono text-sm font-semibold text-[#f6f2e8]"
                >
                  Install Karen
                  <RiArrowRightLine className="size-4" />
                </a>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm border border-[#111] px-5 py-3 font-mono text-sm font-semibold"
                >
                  View on GitHub
                </a>
              </div>
            </motion.div>
            <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-4">
              {metrics.map(([label, value]) => (
                <div key={label} className="border-t border-[#111] pt-3">
                  <div className="font-mono text-xs text-[#6f6f6f]">{label}</div>
                  <div className="mt-1 text-sm font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </div>
          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.5 }}
          >
            <div className="absolute -left-8 top-8 z-10 hidden rounded-sm border border-[#111] bg-white px-4 py-3 font-mono text-xs shadow-[6px_6px_0_#111] lg:block">
              "Sweetheart, I need files, tests, and a reason this should exist."
            </div>
            <KarenMascot className="h-[520px] max-h-[70dvh] border-[#111] bg-black shadow-[12px_12px_0_#111]" mood="mad" />
          </motion.div>
        </section>

        <section className="border-y border-[#d8d8d8] bg-white px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr]">
            <div>
              <SectionLabel>prompt judge</SectionLabel>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
                Karen is strict about nonsense, not about typing a novel.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#4d4d4d]">
                Hackathon users will type messy prompts. That is fine. Karen now flags lazy prompts, raises the quiz pressure, and only hard-blocks requests with no real coding intent.
              </p>
            </div>
            <PromptJudgeShowcase />
          </ScrollReveal>
        </section>

        <section id="problem" className="border-y border-[#d8d8d8] bg-white px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <SectionLabel>why this exists</SectionLabel>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
                AI made code cheaper. It did not make maintenance free.
              </h2>
            </div>
            <div className="grid gap-4 text-lg leading-8 text-[#444]">
              <p>
                The problem is not that agents write code. The problem is that teams accept patches without building a mental model of what changed.
              </p>
              <p>
                Karen makes comprehension visible: prompt quality, changed files, quiz results, rollback history, and a profile score. It is proof of work for your real codebase, and the prize is code you can still maintain next month.
              </p>
            </div>
          </ScrollReveal>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto max-w-7xl">
            <DemoCinema />
          </ScrollReveal>
        </section>

        <section id="replay" className="px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <SectionLabel>session recording</SectionLabel>
                <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
                  Every run should leave evidence.
                </h2>
              </div>
              <div className="max-w-sm text-sm leading-6 text-[#555]">
                The GUI and terminal stream the same lifecycle: queued, blocked, running, quiz, rollback, synced.
              </div>
            </div>
            <RunFilm />
          </ScrollReveal>
        </section>

        <section className="border-y border-[#d8d8d8] bg-[#111] px-4 py-16 text-[#f6f2e8] sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item) => {
              const Icon = item.icon;
              return (
                <motion.article
                  key={item.title}
                  className="rounded-md border border-white/15 bg-white/[0.04] p-5"
                  whileHover={{ y: -4 }}
                >
                  <Icon className="size-6 text-[#ffcc66]" />
                  <h3 className="mt-5 text-xl font-semibold tracking-normal">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#c9c9c9]">{item.body}</p>
                </motion.article>
              );
            })}
          </ScrollReveal>
        </section>

        <section id="quiz" className="bg-[#ece5d8] px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto max-w-7xl">
            <div className="mb-8 max-w-3xl">
              <SectionLabel>quiz execution</SectionLabel>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
                The patch survives only if you can defend it.
              </h2>
              <p className="mt-4 text-lg leading-8 text-[#4d4d4d]">
                Terminal Karen now generates model-backed questions from AST and diff evidence. The GUI keeps the run visible: launch, stream, replay, and proof.
              </p>
            </div>
            <DiffQuizShowcase />
          </ScrollReveal>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto max-w-7xl">
            <KarenReplayTape />
          </ScrollReveal>
        </section>

        <section id="cli" className="border-t border-[#d8d8d8] bg-white px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <SectionLabel>install</SectionLabel>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
                Three commands to get Karen on your machine.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#4d4d4d]">
                Karen runs local-first. Clone, install, and launch. The same profile syncs to your Karen account.
              </p>
              <div className="mt-6 rounded-md border border-[#111] bg-[#111] p-5 font-mono text-sm text-[#f6f2e8] shadow-[8px_8px_0_#111]">
                <div className="text-[#6f6f6f]"># Requires Node 20+, Bun, and OpenCode CLI</div>
                <div className="mt-2 text-[#7bd88f]">git clone https://github.com/frederickemerson/karen.git</div>
                <div className="text-[#7bd88f]">cd karen</div>
                <div className="text-[#7bd88f]">bun install</div>
                <div className="text-[#7bd88f]">bun run install:karen</div>
                <div className="text-[#7bd88f]">karen</div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#555]">
                Questions or issues? <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">Open a GitHub issue</a> or star the repo to follow along.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {commands.map(([label, command]) => (
                <div key={label} className="rounded-md border border-[#d8d8d8] bg-[#f7f7f4] p-5">
                  <div className="font-mono text-xs uppercase tracking-[0.16em] text-[#6f6f6f]">{label}</div>
                  <code className="mt-4 block rounded-sm bg-[#111] px-3 py-3 font-mono text-sm text-[#7bd88f]">{command}</code>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </section>
      </main>
    </div>
  );
};
