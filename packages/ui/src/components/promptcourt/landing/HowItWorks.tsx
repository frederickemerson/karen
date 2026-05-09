import React from 'react';

import { KarenPipelineStrip } from './KarenPipelineStrip';
import { KarenCommitInterrupt } from './KarenCommitInterrupt';

const promptExamples = [
  ['fix this', 'allowed with side-eye', 'Allowed, but quiz pressure increases because your prompt had no useful scope.'],
  ['make this faster', 'allowed, flagged', 'Performance work is valid. Karen records weak acceptance criteria.'],
  ['do your magic', 'blocked', 'No intent, no target, no merge. Karen blocks before any run starts.'],
] as const;

export const HowItWorks: React.FC = () => (
  <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:px-8">
    <KarenPipelineStrip />

    <section className="rounded-md border border-[#d8d8d8] bg-white p-5">
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">prompt judge</div>
      <h2 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
        Karen rejects bad prompts before they touch your repo.
      </h2>
      <p className="mt-4 max-w-3xl text-lg leading-8 text-[#4d4d4d]">
        You do not need to write a novel. You need a real request. Karen blocks empty nonsense, warns on lazy prompts, and turns weak intent into harder diff questions.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {promptExamples.map(([prompt, verdict, detail]) => (
          <div key={prompt} className="rounded-sm border border-[#d8d8d8] bg-[#f7f7f4] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <code className="rounded-sm bg-[#111] px-2 py-1 font-mono text-sm text-[#7bd88f]">{prompt}</code>
              <span className="rounded-sm border border-[#111] px-2 py-1 font-mono text-xs uppercase tracking-[0.12em] text-[#111]">
                {verdict}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#555]">{detail}</p>
          </div>
        ))}
      </div>
    </section>

    <section>
      <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">kahoot on your diff</div>
      <h2 className="mb-5 text-4xl font-semibold tracking-normal sm:text-5xl">
        Commit gets interrupted until you can explain the interface change.
      </h2>
      <KarenCommitInterrupt />
    </section>
  </div>
);
