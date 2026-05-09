import React from 'react';

import { DiffQuizShowcase, type QuizRound } from '../DiffQuizShowcase';

const taskMasterRounds: QuizRound[] = [
  {
    changedFile: 'apps/taskmaster/src/domain/task.ts',
    diffStat: '+18 -2',
    question: 'What did this change require from every existing call site that creates a Task?',
    options: [
      { id: 'A', label: 'Every Task literal now needs scheduledFor, or it fails to compile.', detail: 'Task now extends Schedulable with a required field.', correct: true },
      { id: 'B', label: "Nothing. extends does not add required fields.", detail: 'It absolutely does when fields are non-optional.' },
      { id: 'C', label: 'Only test files changed. Runtime is unchanged.', detail: 'Compile-time contracts changed for all call sites.' },
      { id: 'D', label: 'The agent migrated call sites silently. Nothing breaks.', detail: 'No migration commit was present in this diff.' },
    ],
  },
];

export const KarenCommitInterrupt: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section className={`grid gap-4 ${className}`}>
      <div className="rounded-md border border-[#17130f] bg-[#111] p-4 font-mono text-sm text-[#f8f1e3] shadow-[8px_8px_0_#17130f]">
        <div className="text-[#7bd88f]">$ git commit -m \"feat(tasks): make Task implement Schedulable\"</div>
        <div className="mt-4 rounded-sm border border-white/15 bg-black/40 p-3 text-xs leading-6">
          <div className="text-[#c9bca8]">diff --git a/apps/taskmaster/src/domain/task.ts b/apps/taskmaster/src/domain/task.ts</div>
          <div className="text-[#ff8a80]">- export interface Task {'{'} id: string; title: string; {'}'}</div>
          <div className="text-[#7bd88f]">+ export interface Schedulable {'{'} scheduledFor: string; {'}'}</div>
          <div className="text-[#7bd88f]">+ export interface Task extends Schedulable {'{'} id: string; title: string; {'}'}</div>
        </div>
        <div className="mt-3 text-[#ffcc66]">KAREN: commit interrupted. Answer the diff quiz first.</div>
      </div>

      <DiffQuizShowcase
        rounds={taskMasterRounds}
        onWrongAnswerCaption="The sandbox gets tossed. git reset --hard origin/main. Tweet queued: @karen-code."
      />
    </section>
  );
};
