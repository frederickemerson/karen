import React from 'react';
import { RiCheckboxCircleLine, RiCloseCircleLine, RiLoopRightLine, RiPlayLine, RiSparkling2Line } from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';

type DemoStage = 'intake' | 'judging' | 'blocked' | 'rewriting' | 'approved';

const demoStages: Array<{ id: DemoStage; label: string; helper: string }> = [
  { id: 'intake', label: 'Intake', helper: 'Prompt enters court' },
  { id: 'judging', label: 'Review', helper: 'Scope and evidence check' },
  { id: 'blocked', label: 'Verdict', helper: 'Bad prompt blocked' },
  { id: 'rewriting', label: 'Rewrite', helper: 'Karen drafts terms' },
  { id: 'approved', label: 'Approved', helper: 'Agent may proceed' },
];

const rewritePrompt = 'Update packages/ui/src/components/promptcourt/KarenLandingPage.tsx to add a live courtroom demo section using local React state only. Include the bad prompt, transcript, verdict, rewrite, and approved states. Keep Tailwind styling consistent and run the UI type-check.';

const transcriptByStage: Record<DemoStage, Array<{ speaker: string; text: string; tone: 'dev' | 'karen' | 'system' | 'good' }>> = {
  intake: [
    { speaker: 'Developer', text: 'fix landing page', tone: 'dev' },
    { speaker: 'Clerk', text: 'Case opened: Prompt v. Future Maintainer', tone: 'system' },
  ],
  judging: [
    { speaker: 'Developer', text: 'fix landing page', tone: 'dev' },
    { speaker: 'Karen', text: 'Reading for target files, constraints, tests, and done criteria.', tone: 'karen' },
    { speaker: 'Clerk', text: 'Evidence missing: scope, component behavior, verification plan.', tone: 'system' },
  ],
  blocked: [
    { speaker: 'Developer', text: 'fix landing page', tone: 'dev' },
    { speaker: 'Karen', text: 'Objection. That is a wish, not a work order.', tone: 'karen' },
    { speaker: 'Verdict', text: 'Blocked before the agent touches the repo.', tone: 'system' },
  ],
  rewriting: [
    { speaker: 'Karen', text: 'The court will accept a prompt that names the file, behavior, constraints, and checks.', tone: 'karen' },
    { speaker: 'Rewrite', text: rewritePrompt, tone: 'good' },
  ],
  approved: [
    { speaker: 'Developer', text: rewritePrompt, tone: 'dev' },
    { speaker: 'Karen', text: 'Fine. The agent gets a sandbox and exactly one hallway pass.', tone: 'karen' },
    { speaker: 'Clerk', text: 'Approved with receipts: target, scope, acceptance criteria, verification.', tone: 'good' },
  ],
};

const stageScore: Record<DemoStage, number> = {
  intake: 22,
  judging: 31,
  blocked: 18,
  rewriting: 74,
  approved: 94,
};

const stageTone: Record<DemoStage, { label: string; className: string; Icon: typeof RiCloseCircleLine }> = {
  intake: { label: 'RECEIVED', className: 'border-[#2a241c] bg-[#fffaf0] text-[#17130f]', Icon: RiSparkling2Line },
  judging: { label: 'IN REVIEW', className: 'border-[#ffcc66] bg-[#ffcc66] text-[#17130f]', Icon: RiLoopRightLine },
  blocked: { label: 'BLOCKED', className: 'border-[#b7332c] bg-[#b7332c] text-white', Icon: RiCloseCircleLine },
  rewriting: { label: 'REWRITE ORDERED', className: 'border-[#7aa2ff] bg-[#7aa2ff] text-[#17130f]', Icon: RiSparkling2Line },
  approved: { label: 'APPROVED', className: 'border-[#2f8f48] bg-[#7bd88f] text-[#17130f]', Icon: RiCheckboxCircleLine },
};

const acceptanceChecks = [
  'Names exact landing page files',
  'Keeps backend and mascot assets untouched',
  'Shows blocked, rewrite, and approved states',
  'Uses local state with motion transitions',
];

const getTranscript = (stage: DemoStage, prompt: string) => transcriptByStage[stage].map((line) => (
  line.speaker === 'Developer' && line.text === 'fix landing page' ? { ...line, text: prompt } : line
));

export const CourtroomDemo: React.FC = () => {
  const [prompt, setPrompt] = React.useState('fix landing page');
  const [stageIndex, setStageIndex] = React.useState(0);
  const stage = demoStages[stageIndex].id;
  const verdict = stageTone[stage];
  const VerdictIcon = verdict.Icon;
  const score = stageScore[stage];
  const transcript = React.useMemo(() => getTranscript(stage, prompt), [prompt, stage]);

  React.useEffect(() => {
    const delay = stage === 'approved' ? 3400 : stage === 'intake' ? 1100 : 2100;
    const timeout = window.setTimeout(() => {
      setStageIndex((current) => (current + 1) % demoStages.length);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [stage]);

  const restartDemo = () => {
    setPrompt('fix landing page');
    setStageIndex(0);
  };

  const applyRewrite = () => {
    setPrompt(rewritePrompt);
    setStageIndex(4);
  };

  return (
    <div className="relative overflow-hidden rounded-sm border border-[#2a241c] bg-[#fffaf0] shadow-[10px_10px_0_#17130f]">
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#17130f 1px, transparent 1px), linear-gradient(90deg, #17130f 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <div className="relative border-b border-[#2a241c] bg-[#17130f] px-4 py-3 text-[#f8f1e3]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#ffcc66]">Live demo mode</div>
            <h3 className="mt-1 text-2xl font-semibold tracking-normal">Karen Courtroom</h3>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7bd88f] opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-[#7bd88f]" />
            </span>
            hearing in session
          </div>
        </div>
      </div>

      <div className="relative grid gap-0 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="border-b border-[#2a241c]/15 p-4 lg:border-b-0 lg:border-r">
          <label className="font-mono text-xs uppercase tracking-[0.16em] text-[#b7332c]" htmlFor="courtroom-demo-prompt">
            Bad prompt exhibit
          </label>
          <textarea
            id="courtroom-demo-prompt"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setStageIndex(0);
            }}
            rows={5}
            className="mt-3 min-h-32 w-full resize-none rounded-sm border border-[#2a241c] bg-[#f8f1e3] px-3 py-3 font-mono text-sm leading-6 text-[#17130f] outline-none shadow-[4px_4px_0_#2a241c] focus:border-[#b7332c]"
          />

          <div className="mt-5 grid gap-2">
            {demoStages.map((item, index) => {
              const isActive = index === stageIndex;
              const isPast = index < stageIndex || stage === 'approved';
              return (
                <motion.div
                  key={item.id}
                  className={[
                    'grid grid-cols-[28px_1fr] gap-3 rounded-sm border px-3 py-2',
                    isActive ? 'border-[#b7332c] bg-[#b7332c]/10' : 'border-[#2a241c]/15 bg-[#f8f1e3]/70',
                  ].join(' ')}
                  animate={{ x: isActive ? [0, 4, 0] : 0 }}
                  transition={{ duration: 0.7, repeat: isActive ? Infinity : 0 }}
                >
                  <span className={[
                    'grid size-7 place-items-center rounded-sm border font-mono text-xs font-semibold',
                    isPast ? 'border-[#2f8f48] bg-[#7bd88f] text-[#17130f]' : 'border-[#2a241c]/30 bg-white text-[#5d564c]',
                    isActive ? 'border-[#b7332c] bg-[#b7332c] text-white' : '',
                  ].join(' ')}>
                    {index + 1}
                  </span>
                  <span>
                    <span className="block font-mono text-sm font-semibold text-[#17130f]">{item.label}</span>
                    <span className="block text-sm text-[#5d564c]">{item.helper}</span>
                  </span>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStageIndex(1)}
              className="inline-flex items-center gap-2 rounded-sm bg-[#17130f] px-3 py-2 font-mono text-xs font-semibold text-[#f8f1e3] shadow-[3px_3px_0_#b7332c] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              <RiPlayLine className="size-4" />
              Run hearing
            </button>
            <button
              type="button"
              onClick={restartDemo}
              className="inline-flex items-center gap-2 rounded-sm border border-[#2a241c] px-3 py-2 font-mono text-xs font-semibold text-[#17130f] shadow-[3px_3px_0_#17130f] hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-[#eadfca] hover:shadow-none"
            >
              <RiLoopRightLine className="size-4" />
              Reset demo
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4">
          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-sm border border-[#2a241c] bg-[#17130f] p-4 text-[#f8f1e3] shadow-[5px_5px_0_#b7332c]">
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-[#ffcc66]">Verdict meter</div>
              <div className="mt-4 grid place-items-center">
                <motion.div
                  key={stage}
                  initial={{ opacity: 0, scale: 0.72, rotate: -10 }}
                  animate={{ opacity: 1, scale: 1, rotate: stage === 'blocked' ? -6 : stage === 'approved' ? 5 : 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 17 }}
                  className={['inline-flex min-h-24 w-full items-center justify-center gap-2 rounded-sm border-2 px-4 py-5 text-center font-mono text-xl font-black tracking-normal shadow-[4px_4px_0_rgba(248,241,227,0.18)]', verdict.className].join(' ')}
                >
                  <VerdictIcon className={['size-6', stage === 'judging' ? 'animate-spin' : ''].join(' ')} />
                  {verdict.label}
                </motion.div>
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between font-mono text-xs text-[#c9bca8]">
                  <span>Prompt score</span>
                  <span>{score}/100</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-sm border border-[#f8f1e3]/20 bg-black">
                  <motion.div
                    className={stage === 'approved' ? 'h-full bg-[#7bd88f]' : stage === 'blocked' ? 'h-full bg-[#b7332c]' : 'h-full bg-[#ffcc66]'}
                    animate={{ width: `${score}%` }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </div>

            <div className="min-h-[260px] rounded-sm border border-[#2a241c]/20 bg-[#f8f1e3] p-4">
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-[#b7332c]">Court transcript</div>
              <div className="mt-3 grid gap-2">
                <AnimatePresence mode="popLayout">
                  {transcript.map((line, index) => (
                    <motion.div
                      key={`${stage}-${line.speaker}-${index}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ delay: index * 0.09 }}
                      className={[
                        'rounded-sm border px-3 py-2 font-mono text-xs leading-5',
                        line.tone === 'dev' ? 'border-[#7aa2ff]/45 bg-[#7aa2ff]/10 text-[#24406f]' : '',
                        line.tone === 'karen' ? 'border-[#ffcc66]/60 bg-[#ffcc66]/20 text-[#5e4210]' : '',
                        line.tone === 'system' ? 'border-[#b7332c]/35 bg-[#b7332c]/10 text-[#7c211c]' : '',
                        line.tone === 'good' ? 'border-[#2f8f48]/40 bg-[#7bd88f]/15 text-[#205c31]' : '',
                      ].join(' ')}
                    >
                      <span className="mr-2 font-semibold uppercase tracking-[0.14em] opacity-70">{line.speaker}</span>
                      {line.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {stage === 'rewriting' || stage === 'approved' ? (
              <motion.div
                key="rewrite"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="rounded-sm border border-[#2f8f48]/45 bg-[#7bd88f]/15 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs uppercase tracking-[0.16em] text-[#2f8f48]">Karen rewrite</div>
                    <p className="mt-2 font-mono text-sm leading-6 text-[#17130f]">{rewritePrompt}</p>
                  </div>
                  <button
                    type="button"
                    onClick={applyRewrite}
                    className="shrink-0 rounded-sm border border-[#2f8f48] bg-[#7bd88f] px-3 py-2 font-mono text-xs font-semibold text-[#17130f] shadow-[3px_3px_0_#2f8f48] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    Apply rewrite
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="grid gap-2 sm:grid-cols-2">
            {acceptanceChecks.map((check, index) => {
              const isApproved = stage === 'approved';
              return (
                <motion.div
                  key={check}
                  className={[
                    'flex items-start gap-2 rounded-sm border px-3 py-2 text-sm',
                    isApproved ? 'border-[#2f8f48]/40 bg-[#7bd88f]/15 text-[#205c31]' : 'border-[#2a241c]/15 bg-[#f8f1e3]/70 text-[#5d564c]',
                  ].join(' ')}
                  animate={{ opacity: isApproved ? 1 : 0.72, y: isApproved ? [0, -2, 0] : 0 }}
                  transition={{ delay: index * 0.08, duration: 0.35 }}
                >
                  <RiCheckboxCircleLine className={['mt-0.5 size-4 shrink-0', isApproved ? 'text-[#2f8f48]' : 'text-[#8e8374]'].join(' ')} />
                  <span>{check}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
