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

import { DiffQuizShowcase } from './DiffQuizShowcase';
import { KarenMascot } from './KarenMascot';
import { KarenReplayTape } from './KarenReplayTape';

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

const workflow = [
  {
    icon: RiCommandLine,
    title: 'Start in terminal or GUI',
    body: 'Type `karen`, `/tui`, or launch a guarded run from the dashboard. Same run stream, same profile, same receipts.',
  },
  {
    icon: RiShieldCheckLine,
    title: 'Prompt gets judged first',
    body: 'Karen blocks vague prompts before OpenCode touches the repo. No files, no tests, no acceptance criteria, no run.',
  },
  {
    icon: RiGitBranchLine,
    title: 'Agent works in a sandbox',
    body: 'Approved prompts run in an isolated worktree. Your real codebase stays clean until the quiz is passed.',
  },
  {
    icon: RiTimerFlashLine,
    title: 'You defend the diff',
    body: 'Parser evidence plus a top model generates questions about changed behavior, APIs, imports, tests, and risk.',
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
  ['00:11', 'OpenCode sandbox', '3 files changed, +84 -12'],
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
            This is the Remotion-ready surface: prompt, sandbox diff, quiz answers, rollback, and promotion can be rendered into a shareable clip.
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
          <a href="/karen/landing" className="flex items-center gap-3">
            <img
              src="/mascots/karen-grandma.png"
              alt=""
              className="size-10 rounded-sm border border-[#111] bg-black object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">Karen</div>
          </a>
          <div className="hidden items-center gap-6 font-mono text-xs text-[#555] md:flex">
            {navItems.map(([label, href]) => (
              <a key={href} href={href} className="hover:text-[#111]">{label}</a>
            ))}
          </div>
          <a href="/karen" className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#f6f2e8]">
            Dashboard <RiArrowRightLine className="size-4" />
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid min-h-[88dvh] max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
          <div>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <SectionLabel>proof-of-work for AI coding</SectionLabel>
              <h1 className="mt-5 max-w-5xl text-6xl font-semibold leading-[0.92] tracking-normal sm:text-7xl lg:text-8xl">
                Make developers prove they read the code.
              </h1>
              <p className="mt-6 max-w-2xl text-xl leading-8 text-[#4d4d4d]">
                Karen sits on top of OpenCode, judges vague prompts, runs agents in a sandbox, generates code-reading quizzes, and rolls back patches nobody can explain.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="/karen" className="rounded-sm bg-[#111] px-5 py-3 font-mono text-sm font-semibold text-[#f6f2e8]">
                  Open GUI
                </a>
                <a href="#cli" className="rounded-sm border border-[#111] px-5 py-3 font-mono text-sm font-semibold">
                  See terminal flow
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
              "nice prompt. shame if nobody read the diff."
            </div>
            <KarenMascot className="h-[520px] max-h-[70dvh] border-[#111] bg-black shadow-[12px_12px_0_#111]" mood="mad" />
          </motion.div>
        </section>

        <section id="problem" className="border-y border-[#d8d8d8] bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <SectionLabel>why this exists</SectionLabel>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
                AI made code cheap. Maintenance did not get cheaper.
              </h2>
            </div>
            <div className="grid gap-4 text-lg leading-8 text-[#444]">
              <p>
                The failure mode is not that agents write code. The failure mode is that teams stop forming a mental model of what changed.
              </p>
              <p>
                Karen turns comprehension into a visible step: prompt quality, changed files, diff quiz, rollback record, and profile score. It is LeetCode for your real codebase, except the reward is code you can maintain next month.
              </p>
            </div>
          </div>
        </section>

        <section id="replay" className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <SectionLabel>session recording</SectionLabel>
                <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
                  A run should look like evidence, not vibes.
                </h2>
              </div>
              <div className="max-w-sm text-sm leading-6 text-[#555]">
                The GUI and terminal stream the same lifecycle: queued, blocked, running, quiz, rollback, synced.
              </div>
            </div>
            <RunFilm />
          </div>
        </section>

        <section className="border-y border-[#d8d8d8] bg-[#111] px-4 py-16 text-[#f6f2e8] sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          </div>
        </section>

        <section id="quiz" className="bg-[#ece5d8] px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 max-w-3xl">
              <SectionLabel>quiz execution</SectionLabel>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
                The patch survives only if you can defend it.
              </h2>
              <p className="mt-4 text-lg leading-8 text-[#4d4d4d]">
                Terminal Karen now generates model-backed questions from real AST and diff evidence. The GUI stays focused on launch, stream, replay, and proof.
              </p>
            </div>
            <DiffQuizShowcase />
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <KarenReplayTape />
          </div>
        </section>

        <section id="cli" className="border-t border-[#d8d8d8] bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <SectionLabel>one workflow</SectionLabel>
              <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
                TUI and GUI are linked by the same run stream.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#4d4d4d]">
                Use the terminal for live guarded execution. Use the GUI for launching, status, replay, profile, and proof. No second product, no duplicate state.
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
          </div>
        </section>
      </main>
    </div>
  );
};
