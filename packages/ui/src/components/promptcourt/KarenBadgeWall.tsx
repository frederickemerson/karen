import React from 'react';
import {
  RiCheckboxCircleLine,
  RiLock2Line,
  RiShareForwardLine,
  RiShieldCheckLine,
  RiTrophyLine,
  RiVerifiedBadgeLine,
} from '@remixicon/react';
import { motion } from 'motion/react';

import { playKarenEventAudio } from '@/lib/karenVoice';
import { cn } from '@/lib/utils';

export type BadgeStatus = 'unlocked' | 'locked';

export type KarenBadge = {
  id: string;
  title: string;
  label: string;
  description: string;
  progress: number;
  target: string;
  status: BadgeStatus;
  color: string;
  shadow: string;
};

export type KarenBadgeWallProps = {
  className?: string;
  badges?: KarenBadge[];
  proofUrl?: string;
  onShareProof?: (proofUrl: string) => void | Promise<void>;
};

const defaultBadges: KarenBadge[] = [
  {
    id: 'prompt-prosecutor',
    title: 'Prompt Prosecutor',
    label: 'A+ charge sheet',
    description: 'Writes prompts with files, constraints, tests, and done criteria before the agent touches code.',
    progress: 100,
    target: '12/12 prompts survived cross-exam',
    status: 'unlocked',
    color: '#ff6b5f',
    shadow: '#7f1d1d',
  },
  {
    id: 'diff-whisperer',
    title: 'Diff Whisperer',
    label: 'Symbol reader',
    description: 'Finds the real changed exports, imports, call sites, and side effects without guessing.',
    progress: 86,
    target: '43/50 quiz answers correct',
    status: 'unlocked',
    color: '#7aa2ff',
    shadow: '#172554',
  },
  {
    id: 'rollback-survivor',
    title: 'Rollback Survivor',
    label: 'Repo still clean',
    description: 'Failed a quiz, lost the sandbox patch, then came back with a better prompt and review.',
    progress: 72,
    target: '5 clean recoveries logged',
    status: 'unlocked',
    color: '#ffcc66',
    shadow: '#713f12',
  },
  {
    id: 'no-vibes-merged',
    title: 'No Vibes Merged',
    label: 'Receipts only',
    description: 'Promoted generated work only after reading the patch and passing the comprehension check.',
    progress: 61,
    target: '8/13 guarded merges',
    status: 'unlocked',
    color: '#7bd88f',
    shadow: '#14532d',
  },
  {
    id: 'grandma-approved',
    title: 'Grandma Approved',
    label: 'Final boss',
    description: 'Keeps a long streak of specific prompts, passing quizzes, and reviewable commits.',
    progress: 42,
    target: '21 more proof points',
    status: 'locked',
    color: '#f59e0b',
    shadow: '#78350f',
  },
  {
    id: 'maintenance-hero',
    title: 'Maintenance Hero',
    label: 'Future self paid',
    description: 'Explains generated code well enough that a teammate can maintain it next week.',
    progress: 28,
    target: '3 teammate reviews pending',
    status: 'locked',
    color: '#a78bfa',
    shadow: '#4c1d95',
  },
];

const stats = [
  ['Badge XP', '12,840', 'earned reading real diffs'],
  ['Quiz Streak', '9x', 'current proof chain'],
  ['Patch Saves', '31', 'rollbacks avoided'],
] as const;

const clampProgress = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const badgeInitials = (title: string) => title
  .split(' ')
  .map((part) => part[0])
  .join('')
  .slice(0, 2)
  .toUpperCase();

const arcadeGridStyle: React.CSSProperties = {
  backgroundImage: 'linear-gradient(#17130f 1px, transparent 1px), linear-gradient(90deg, #17130f 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

const ProgressBar = ({ value, color }: { value: number; color: string }) => {
  const progress = clampProgress(value);

  return (
    <div className="h-3 overflow-hidden rounded-sm border border-[#2a241c] bg-[#17130f] p-0.5" aria-hidden="true">
      <motion.div
        className="h-full origin-left rounded-[1px]"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: progress / 100 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.75, ease: 'easeOut' }}
        style={{ width: '100%', backgroundColor: color }}
      />
    </div>
  );
};

const BadgeCard = ({ badge, index }: { badge: KarenBadge; index: number }) => {
  const progress = clampProgress(badge.progress);
  const unlocked = badge.status === 'unlocked';

  return (
    <motion.article
      className={cn(
        'group relative overflow-hidden rounded-sm border border-[#2a241c] bg-[#fffaf0] p-4 text-[#17130f] shadow-[5px_5px_0_#17130f]',
        !unlocked && 'bg-[#eadfca] text-[#4f463b]',
      )}
      initial={{ opacity: 0, y: 18, rotate: index % 2 === 0 ? -0.7 : 0.7 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      whileHover={{ y: -6, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay: index * 0.04 }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={arcadeGridStyle} />
      {!unlocked ? (
        <div className="pointer-events-none absolute inset-0 bg-[#17130f]/8 backdrop-grayscale" />
      ) : null}

      <div className="relative z-10 flex items-start gap-4">
        <motion.div
          className="grid size-16 shrink-0 place-items-center rounded-sm border border-[#2a241c] font-mono text-xl font-black text-[#17130f] shadow-[4px_4px_0_var(--badge-shadow)]"
          style={{
            backgroundColor: unlocked ? badge.color : '#c9bca8',
            '--badge-shadow': unlocked ? badge.shadow : '#766d61',
            imageRendering: 'pixelated',
          } as React.CSSProperties}
          animate={unlocked ? { y: [0, -3, 0], rotate: [-1, 1, -1] } : undefined}
          transition={{ duration: 2.6 + index * 0.25, repeat: Infinity, ease: 'easeInOut' }}
        >
          {badgeInitials(badge.title)}
        </motion.div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]',
                unlocked
                  ? 'border-[#14532d]/30 bg-[#7bd88f]/20 text-[#14532d]'
                  : 'border-[#2a241c]/25 bg-[#17130f]/10 text-[#5d564c]',
              )}
            >
              {unlocked ? <RiCheckboxCircleLine className="size-3.5" /> : <RiLock2Line className="size-3.5" />}
              {unlocked ? 'unlocked' : 'locked'}
            </span>
            <span className="font-mono text-xs text-[#b7332c]">{badge.label}</span>
          </div>

          <h3 className="mt-3 text-xl font-semibold leading-tight tracking-normal text-[#17130f]">{badge.title}</h3>
          <p className="mt-2 min-h-[72px] text-sm leading-6 text-[#5d564c]">{badge.description}</p>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3 font-mono text-xs">
              <span>{badge.target}</span>
              <span className="font-semibold text-[#17130f]">{progress}%</span>
            </div>
            <ProgressBar value={progress} color={unlocked ? badge.color : '#766d61'} />
          </div>
        </div>
      </div>
    </motion.article>
  );
};

export const KarenBadgeWall: React.FC<KarenBadgeWallProps> = ({
  className,
  badges = defaultBadges,
  proofUrl = 'https://karen.dev/proof/grandma-approved',
  onShareProof,
}) => {
  const [shareState, setShareState] = React.useState<'idle' | 'copied'>('idle');
  const unlockedCount = badges.filter((badge) => badge.status === 'unlocked').length;
  const totalProgress = badges.length
    ? Math.round(badges.reduce((sum, badge) => sum + clampProgress(badge.progress), 0) / badges.length)
    : 0;

  const handleShare = async () => {
    try {
      await onShareProof?.(proofUrl);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(proofUrl);
      }
      void playKarenEventAudio('badge-unlock', { voice: false });
      setShareState('copied');
      globalThis.setTimeout(() => setShareState('idle'), 1800);
    } catch {
      setShareState('idle');
    }
  };

  return (
    <section
      className={cn('relative overflow-hidden border-y border-[#2a241c]/15 bg-[#efe4d0] px-4 py-16 text-[#17130f] sm:px-6 lg:px-8', className)}
      aria-labelledby="karen-badge-wall-title"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={arcadeGridStyle} />
      <motion.div
        className="pointer-events-none absolute left-0 top-8 h-4 w-full bg-[#ffcc66]"
        animate={{ x: ['-50%', '0%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, #17130f 0 12px, transparent 12px 28px)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <div className="font-mono text-sm text-[#b7332c]">proof arcade</div>
            <h2 id="karen-badge-wall-title" className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
              Grandma's badge wall rewards people who actually read the code.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#4f463b]">
              Every shiny square is earned from specific prompts, passed diff quizzes, clean rollbacks, and patches you can explain after the agent is done.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {stats.map(([label, value, helper]) => (
                <div key={label} className="rounded-sm border border-[#2a241c] bg-[#fffaf0] p-4 shadow-[4px_4px_0_#17130f]">
                  <div className="font-mono text-xs uppercase tracking-[0.16em] text-[#766d61]">{label}</div>
                  <div className="mt-2 text-3xl font-semibold tracking-normal text-[#17130f]">{value}</div>
                  <div className="mt-1 text-xs leading-5 text-[#5d564c]">{helper}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-sm border border-[#2a241c] bg-[#17130f] p-4 text-[#f8f1e3] shadow-[6px_6px_0_#b7332c]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-[#ffcc66]">
                    <RiShieldCheckLine className="size-4" />
                    public proof card
                  </div>
                  <div className="mt-3 break-all font-mono text-sm text-[#c9bca8]">{proofUrl}</div>
                </div>
                <div className="grid size-14 shrink-0 place-items-center rounded-sm border border-[#f8f1e3]/25 bg-[#f8f1e3]/10">
                  <RiVerifiedBadgeLine className="size-7 text-[#7bd88f]" />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3 font-mono text-xs text-[#c9bca8]">
                  <span>{unlockedCount}/{badges.length} badges unlocked</span>
                  <span>{totalProgress}% wall complete</span>
                </div>
                <ProgressBar value={totalProgress} color="#ffcc66" />
              </div>

              <motion.button
                type="button"
                onClick={handleShare}
                className="mt-5 inline-flex items-center gap-2 rounded-sm bg-[#ffcc66] px-4 py-3 font-mono text-sm font-semibold text-[#17130f] shadow-[4px_4px_0_#7f1d1d] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8f1e3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17130f]"
                whileTap={{ scale: 0.97 }}
              >
                <RiShareForwardLine className="size-4" />
                {shareState === 'copied' ? 'Proof copied' : 'Share proof'}
              </motion.button>
            </div>
          </div>

          <div className="grid content-start gap-4 md:grid-cols-2">
            <motion.div
              className="rounded-sm border border-[#2a241c] bg-[#17130f] p-4 text-[#f8f1e3] shadow-[5px_5px_0_#b7332c] md:col-span-2"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs uppercase tracking-[0.16em] text-[#ffcc66]">season pass</div>
                  <div className="mt-2 text-2xl font-semibold tracking-normal">Code Reading League</div>
                </div>
                <div className="flex items-center gap-2 rounded-sm border border-[#f8f1e3]/20 bg-[#f8f1e3]/10 px-3 py-2 font-mono text-sm text-[#7bd88f]">
                  <RiTrophyLine className="size-5" />
                  level 14
                </div>
              </div>
            </motion.div>

            {badges.map((badge, index) => (
              <BadgeCard key={badge.id} badge={badge} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default KarenBadgeWall;
