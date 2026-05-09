import React from 'react';
import { cn } from '@/lib/utils';

export const KarenLogo: React.FC<{ className?: string; mood?: 'calm' | 'mad' }> = ({ className, mood = 'calm' }) => (
  <div
    className={cn(
      'grid place-items-center rounded-md border border-border bg-card p-1',
      className,
    )}
    aria-label="Karen pixel granny logo"
    role="img"
  >
    <div className="grid grid-cols-8 gap-0.5">
      {[
        '00222200',
        '02222220',
        '22111122',
        '21311312',
        mood === 'mad' ? '21155112' : '21133112',
        '21111112',
        '22333322',
        '00444400',
      ].join('').split('').map((cell, index) => (
        <span
          key={index}
          className={cn(
            'block size-1.5 sm:size-2',
            cell === '0' && 'bg-transparent',
            cell === '1' && 'bg-[#f5c6a5]',
            cell === '2' && 'bg-[#d9d2c3]',
            cell === '3' && 'bg-[#5b3a2e]',
            cell === '4' && 'bg-[#7fc7b9]',
            cell === '5' && 'bg-[var(--status-error)]',
          )}
        />
      ))}
    </div>
  </div>
);
