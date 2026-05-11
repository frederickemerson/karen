import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

type Verdict = {
  prompt: string;
  ruling: 'BLOCKED' | 'PROBATION' | 'PROCEED';
  reason: string;
  charge: string;
};

const verdicts: Verdict[] = [
  {
    prompt: '"fix the bug"',
    ruling: 'BLOCKED',
    reason: 'No target file. No expected behavior. No bug, dear.',
    charge: 'PC-001 · vague intent',
  },
  {
    prompt: '"do your magic"',
    ruling: 'BLOCKED',
    reason: 'Karen does not do magic. Karen does work.',
    charge: 'PC-007 · abdication of scope',
  },
  {
    prompt: '"make it faster"',
    ruling: 'PROBATION',
    reason: 'Allowed with quiz pressure. Define "faster" or eat the diff quiz.',
    charge: 'PC-014 · unmeasured outcome',
  },
  {
    prompt: '"refactor everything"',
    ruling: 'BLOCKED',
    reason: 'Everything is not a noun. Pick a module.',
    charge: 'PC-022 · scope creep, charged',
  },
  {
    prompt: '"add validation to /api/users POST, reject empty name"',
    ruling: 'PROCEED',
    reason: 'Concrete file, concrete behavior. Karen approves. Quiz still applies.',
    charge: 'PC-000 · charges dismissed',
  },
  {
    prompt: '"clean up the code"',
    ruling: 'BLOCKED',
    reason: 'The code is not dirty. You are lazy.',
    charge: 'PC-003 · cosmetic dressed as substance',
  },
];

const RULING_STYLES: Record<Verdict['ruling'], { chip: string; ring: string; label: string }> = {
  BLOCKED: {
    chip: 'bg-[#b7332c] text-[#fff8ec]',
    ring: 'ring-[#b7332c]/40',
    label: 'denied',
  },
  PROBATION: {
    chip: 'bg-[#c89b2a] text-[#1a140a]',
    ring: 'ring-[#c89b2a]/40',
    label: 'probation',
  },
  PROCEED: {
    chip: 'bg-[#5fa572] text-[#0a1a0e]',
    ring: 'ring-[#5fa572]/40',
    label: 'approved',
  },
};

export const HeroVerdict: React.FC = () => {
  const [index, setIndex] = React.useState(0);
  const reduceMotion = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const interval = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % verdicts.length);
    }, 4200);
    return () => window.clearInterval(interval);
  }, []);

  const current = verdicts[index];
  const style = RULING_STYLES[current.ruling];

  return (
    <div className="w-full max-w-md">
      <div className={`relative overflow-hidden rounded-md border border-[#2a2521] bg-[#0a0907] p-5 ring-1 ${style.ring} shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]`}>
        {/* terminal title bar */}
        <div className="flex items-center justify-between border-b border-[#1d1915] pb-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a6e60]">
            <span className="size-2 rounded-full bg-[#b7332c]" />
            <span className="size-2 rounded-full bg-[#c89b2a]" />
            <span className="size-2 rounded-full bg-[#5fa572]" />
            <span className="ml-2">karen://court</span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a6e60]">live</div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="mt-4"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a6e60]">incoming prompt</div>
            <div className="mt-2 font-mono text-sm leading-6 text-[#f6f2e8]">
              <span className="text-[#7a6e60]">$ </span>
              {current.prompt}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-sm px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] ${style.chip}`}>
                verdict {style.label}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">{current.charge}</span>
            </div>

            <p className="mt-3 font-serif text-base italic leading-7 text-[#e8dfd0]">
              "{current.reason}"
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-5 flex items-center justify-between border-t border-[#1d1915] pt-3">
          <div className="flex items-center gap-1.5">
            {verdicts.map((_, i) => (
              <span
                key={i}
                className={`h-1 transition-all ${i === index ? 'w-6 bg-[#b7332c]' : 'w-1.5 bg-[#2a2521]'}`}
              />
            ))}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a6e60]">
            judge: karen
          </div>
        </div>
      </div>

      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">
        rotating real-world verdicts
      </p>
    </div>
  );
};

export default HeroVerdict;
