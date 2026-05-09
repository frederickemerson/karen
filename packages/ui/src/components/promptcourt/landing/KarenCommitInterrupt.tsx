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
      <div className="rounded-md border border-[#17130f] bg-[#111] p-4 font-mono text-xs uppercase tracking-[0.14em] text-[#ffcc66] shadow-[8px_8px_0_#17130f]">
        click the wrong answer
      </div>

      <DiffQuizShowcase
        rounds={taskMasterRounds}
        onWrongAnswerCaption="Wrong answer. We just git reset --hard."
      />
    </section>
  );
};
