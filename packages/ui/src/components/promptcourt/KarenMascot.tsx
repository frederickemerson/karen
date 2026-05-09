import React from 'react';
import { cn } from '@/lib/utils';

export const KarenMascot: React.FC<{ className?: string; mood?: 'calm' | 'mad' }> = ({ className, mood = 'calm' }) => (
  <div
    className={cn(
      'relative overflow-hidden rounded-md border border-border bg-card',
      className,
    )}
    aria-label={mood === 'mad' ? 'Karen pixel grandma mascot looking stern' : 'Karen pixel grandma mascot'}
    role="img"
  >
    <img
      src="/mascots/karen-grandma.png"
      alt=""
      className={cn('h-full w-full object-contain p-3', mood === 'mad' && 'saturate-125 contrast-110')}
      style={{ imageRendering: 'pixelated' }}
      draggable={false}
    />
    {mood === 'mad' ? (
      <div className="absolute right-4 top-4 rounded-sm bg-[var(--status-error)] px-2 py-1 font-mono text-xs font-semibold text-white">
        NO.
      </div>
    ) : null}
  </div>
);
