import React from 'react';
import { RiArrowRightLine } from '@remixicon/react';

const steps = [
  { label: 'Prompt', detail: 'You ask an agent to change real code.', tone: 'text-[#6ee7ff]' },
  { label: 'Karen judges', detail: 'Weak prompt gets roasted before execution.', tone: 'text-[#ffcc66]' },
  { label: 'Sandbox run', detail: 'Patch happens in isolated worktree only.', tone: 'text-[#7bd88f]' },
  { label: 'Quiz interrupt', detail: 'Commit is blocked by a diff question.', tone: 'text-[#ff6b5f]' },
  { label: 'Verdict', detail: 'Pass ships. Fail = git reset --hard + scoreboard shame.', tone: 'text-[#ff6b5f]' },
] as const;

export const KarenPipelineStrip: React.FC<{ className?: string }> = ({ className = '' }) => (
  <section className={`rounded-md border border-[#17130f] bg-[#17130f] p-4 text-[#f8f1e3] shadow-[8px_8px_0_#b7332c] sm:p-5 ${className}`}>
    <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#ffcc66]">how it works</div>
    <h2 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">One flow. No fluff.</h2>
    <div className="mt-5 grid gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
      {steps.map((step, index) => (
        <div key={step.label} className="rounded-sm border border-[#f8f1e3]/15 bg-black/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-mono text-xs uppercase tracking-[0.14em] ${step.tone}`}>{step.label}</span>
            {index < steps.length - 1 ? <RiArrowRightLine className="size-4 text-[#c9bca8]" /> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#c9bca8]">{step.detail}</p>
        </div>
      ))}
    </div>
  </section>
);
