import React from 'react';
import { RiTerminalBoxLine, RiGitBranchLine, RiQuestionLine, RiCheckboxCircleFill } from '@remixicon/react';

const steps = [
  {
    icon: RiTerminalBoxLine,
    label: '01 · charge',
    title: 'You write a prompt.',
    body: 'Karen lints it for scope, target files, and expected behavior. Empty nonsense gets blocked before any token is spent.',
    snippet: '$ karen prompt "add empty-name guard\\n  to POST /api/users"\n> verdict: proceed (probation)',
  },
  {
    icon: RiGitBranchLine,
    label: '02 · sandbox',
    title: 'Karen forks the worktree.',
    body: 'Approved prompts run in an isolated git worktree. Your main branch stays clean while the agent writes its draft.',
    snippet: '$ karen run\n> worktree: .karen/wt-7f2a\n> agent: drafting patch...',
  },
  {
    icon: RiQuestionLine,
    label: '03 · quiz',
    title: 'You face one question on the diff.',
    body: 'Karen reads the diff and asks one Kahoot-style question about a real consequence of the change. No multiple-choice trivia. Real interface impact.',
    snippet: '$ karen quiz\n> q: which call sites break?\n> [A] [B] [C] [D]',
  },
  {
    icon: RiCheckboxCircleFill,
    label: '04 · verdict',
    title: 'Promote, or git reset --hard.',
    body: 'Pass and the patch promotes into the real branch. Fail and Karen rolls back the worktree and queues a public shame post.',
    snippet: '$ karen verdict\n> result: passed\n> promoting wt-7f2a → main',
  },
] as const;

export const HowItWorks: React.FC = () => (
  <div className="grid gap-4 lg:grid-cols-2">
    {steps.map((step) => {
      const Icon = step.icon;
      return (
        <article
          key={step.label}
          className="group flex flex-col gap-4 rounded-md border border-[#2a2521] bg-[#0a0907] p-5 transition hover:border-[#3a322b] sm:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-sm border border-[#3a322b] bg-black/50 text-[#ffcc66]">
              <Icon className="size-4" />
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a6e60]">
              {step.label}
            </span>
          </div>
          <h3 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-[#f6f2e8] sm:text-3xl">
            {step.title}
          </h3>
          <p className="text-sm leading-6 text-[#c9bca8]">{step.body}</p>
          <pre className="overflow-x-auto rounded-sm border border-[#1d1915] bg-[#050403] p-3 font-mono text-xs leading-5 text-[#7bd88f]">
            {step.snippet}
          </pre>
        </article>
      );
    })}
  </div>
);

export default HowItWorks;
