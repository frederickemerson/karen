import React from 'react';
import { RiTerminalBoxLine, RiAlarmWarningLine } from '@remixicon/react';

import { DiffQuizShowcase, type QuizRound } from '../DiffQuizShowcase';

const taskMasterRounds: QuizRound[] = [
  {
    changedFile: 'apps/taskmaster/src/domain/task.ts',
    diffStat: '+18 -2',
    question: 'What did this change require from every existing call site that creates a Task?',
    options: [
      {
        id: 'A',
        label: 'Every Task literal now needs scheduledFor, or it fails to compile.',
        detail: 'Task now extends Schedulable with a required field.',
        correct: true,
      },
      {
        id: 'B',
        label: 'Nothing. extends does not add required fields.',
        detail: 'It absolutely does when fields are non-optional.',
      },
      {
        id: 'C',
        label: 'Only test files changed. Runtime is unchanged.',
        detail: 'Compile-time contracts changed for all call sites.',
      },
      {
        id: 'D',
        label: 'The agent migrated call sites silently. Nothing breaks.',
        detail: 'No migration commit was present in this diff.',
      },
    ],
  },
];

export const KarenCommitInterrupt: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section className={`grid gap-4 ${className}`}>
      <div className="overflow-hidden rounded-md border border-[#2a2521] bg-[#050403] font-mono text-sm">
        <div className="flex items-center justify-between gap-3 border-b border-[#1d1915] px-4 py-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#7a6e60]">
            <RiTerminalBoxLine className="size-3.5" />
            ~/work/taskmaster · main · zsh
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#b7332c]" />
            <span className="size-2 rounded-full bg-[#c89b2a]" />
            <span className="size-2 rounded-full bg-[#5fa572]" />
          </div>
        </div>
        <div className="space-y-1 px-4 py-4 leading-6 text-[#e8dfd0]">
          <div>
            <span className="text-[#7a6e60]">$ </span>git add -A
          </div>
          <div>
            <span className="text-[#7a6e60]">$ </span>git commit -m <span className="text-[#7bd88f]">"fix"</span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-sm border border-[#b7332c]/40 bg-[#b7332c]/10 px-3 py-2 text-[#ff5a4d]">
            <RiAlarmWarningLine className="size-4 shrink-0" />
            <span className="text-[10px] uppercase tracking-[0.18em]">
              karen interrupt · commit blocked pending diff quiz
            </span>
          </div>
          <div className="mt-2 text-xs text-[#c9bca8]">
            "Read your diff, dear. One question. Wrong answer and we{' '}
            <code className="rounded-sm bg-[#1d1915] px-1 text-[#ff5a4d]">git reset --hard</code>."
          </div>
        </div>
      </div>

      <DiffQuizShowcase
        rounds={taskMasterRounds}
        onWrongAnswerCaption="Wrong answer. We just git reset --hard."
      />
    </section>
  );
};

export default KarenCommitInterrupt;
