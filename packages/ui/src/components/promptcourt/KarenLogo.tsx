import React from 'react';
import { cn } from '@/lib/utils';

export const KarenLogo: React.FC<{ className?: string; mood?: 'calm' | 'mad' }> = ({ className, mood = 'calm' }) => {
  const isMad = mood === 'mad';
  const idBase = React.useId().replaceAll(':', '');
  const hairId = `${idBase}-karen-hair`;
  const cardiganId = `${idBase}-karen-cardigan`;
  const shadowId = `${idBase}-karen-shadow`;

  return (
    <div
      className={cn(
        'grid place-items-center overflow-hidden rounded-md border border-border bg-[#111] p-1 shadow-sm',
        className,
      )}
      aria-label={isMad ? 'Karen granny logo glaring over her glasses' : 'Karen granny logo with a smug smile'}
      role="img"
    >
      <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id={hairId} cx="50%" cy="35%" r="58%">
            <stop offset="0%" stopColor="#fff7df" />
            <stop offset="60%" stopColor="#eadcc3" />
            <stop offset="100%" stopColor="#c9bda8" />
          </radialGradient>
          <linearGradient id={cardiganId} x1="18" x2="78" y1="70" y2="96">
            <stop offset="0%" stopColor="#4f8f82" />
            <stop offset="100%" stopColor="#2f6f66" />
          </linearGradient>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="145%">
            <feDropShadow dx="0" dy="3" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
          </filter>
        </defs>

        <rect x="4" y="4" width="88" height="88" rx="18" fill="#17130f" />
        <g filter={`url(#${shadowId})`}>
          <path
            d="M24 76c4-12 14-19 25-19s22 7 26 19l3 16H21l3-16z"
            fill={`url(#${cardiganId})`}
          />
          <path
            d="M34 74c7 6 22 6 29 0l-3 18H37l-3-18z"
            fill="#f4c19c"
          />

          <circle cx="28" cy="29" r="12" fill={`url(#${hairId})`} />
          <circle cx="40" cy="20" r="13" fill={`url(#${hairId})`} />
          <circle cx="55" cy="20" r="13" fill={`url(#${hairId})`} />
          <circle cx="68" cy="30" r="12" fill={`url(#${hairId})`} />
          <circle cx="49" cy="16" r="11" fill={`url(#${hairId})`} />
          <circle cx="25" cy="46" r="10" fill={`url(#${hairId})`} />
          <circle cx="71" cy="46" r="10" fill={`url(#${hairId})`} />

          <path
            d="M24 43c0-17 11-28 25-28s25 11 25 28c0 18-10 30-25 30S24 61 24 43z"
            fill="#f3bf9a"
          />
          <path
            d="M25 40c2-11 10-18 22-20 6 7 15 11 27 11-3-13-13-21-25-21-15 0-27 12-24 30z"
            fill={`url(#${hairId})`}
          />

          <circle cx="34" cy="49" r="9" fill="none" stroke="#14100d" strokeWidth="3" />
          <circle cx="60" cy="49" r="9" fill="none" stroke="#14100d" strokeWidth="3" />
          <path d="M43 49h8" stroke="#14100d" strokeWidth="3" strokeLinecap="round" />
          <path d="M25 48h-7" stroke="#14100d" strokeWidth="3" strokeLinecap="round" />
          <path d="M69 48h8" stroke="#14100d" strokeWidth="3" strokeLinecap="round" />

          <path
            d={isMad ? 'M29 40l12 4M55 44l12-4' : 'M29 42c4-3 8-3 12 0M55 42c4-3 8-3 12 0'}
            stroke="#5b2b24"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="35" cy="50" r="2.2" fill="#241813" />
          <circle cx="61" cy="50" r="2.2" fill="#241813" />
          <path d="M49 50l-3 8h6" fill="none" stroke="#a46250" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={isMad ? 'M40 65c6-3 13-3 19 0' : 'M39 63c6 6 16 6 22-1'}
            fill="none"
            stroke="#7a2e28"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <path d="M27 77l13 15M70 77L56 92" stroke="#ffcc66" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
          <circle cx="75" cy="24" r="6" fill="#d94c42" />
          <text x="75" y="27" textAnchor="middle" fontSize="8" fontFamily="monospace" fontWeight="700" fill="#fff">
            !
          </text>
        </g>
      </svg>
    </div>
  );
};
