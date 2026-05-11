import React from 'react';
import { motion } from 'motion/react';
import { RiArrowRightLine } from '@remixicon/react';

type Step = {
  label: string;
  detail: string;
  accent: string;
  glyph: string;
};

const steps: Step[] = [
  { label: 'prompt', detail: 'You write what you want.', accent: '#6ee7ff', glyph: '>' },
  { label: 'court', detail: 'Karen judges scope and intent.', accent: '#ffcc66', glyph: '§' },
  { label: 'worktree', detail: 'Agent runs in isolated branch.', accent: '#7bd88f', glyph: '⌥' },
  { label: 'quiz', detail: 'One question on the real diff.', accent: '#c89b2a', glyph: '?' },
  { label: 'verdict', detail: 'Promote, or git reset --hard.', accent: '#ff5a4d', glyph: '!' },
];

export const KarenPipelineStrip: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`relative overflow-hidden rounded-md border border-[#2a2521] bg-[#0a0907] p-5 sm:p-6 ${className}`}
  >
    <div className="absolute inset-0 -z-0 opacity-[0.04] [background-image:linear-gradient(rgba(246,242,232,0.6)_1px,transparent_1px)] [background-size:32px_32px]" />

    <div className="relative grid gap-3 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
      {steps.map((step, index) => (
        <React.Fragment key={step.label}>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
            className="relative rounded-sm border border-[#1d1915] bg-[#050403] p-3"
          >
            <div className="flex items-center justify-between">
              <span
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: step.accent }}
              >
                {String(index + 1).padStart(2, '0')} · {step.label}
              </span>
              <span
                className="font-mono text-base"
                style={{ color: step.accent }}
                aria-hidden="true"
              >
                {step.glyph}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#c9bca8]">{step.detail}</p>
            <motion.span
              className="absolute inset-x-3 bottom-2 h-px origin-left"
              style={{ background: step.accent, opacity: 0.4 }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 + 0.2, duration: 0.6 }}
            />
          </motion.div>
          {index < steps.length - 1 ? (
            <span className="hidden items-center justify-center lg:hidden">
              <RiArrowRightLine className="size-4 text-[#3a322b]" />
            </span>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  </div>
);

export default KarenPipelineStrip;
