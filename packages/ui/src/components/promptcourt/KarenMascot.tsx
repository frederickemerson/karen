import React from 'react';
import { cn } from '@/lib/utils';

export const KarenMascot: React.FC<{ className?: string; mood?: 'calm' | 'mad' }> = ({ className, mood = 'calm' }) => {
  const isMad = mood === 'mad';
  const idBase = React.useId().replaceAll(':', '');
  const hairId = `${idBase}-hair`;
  const cardiganId = `${idBase}-cardigan`;
  const shadowId = `${idBase}-shadow`;
  const cheekId = `${idBase}-cheek`;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border border-border bg-[#17130f]',
        className,
      )}
      aria-label={isMad ? 'Karen grandma mascot glaring over her glasses' : 'Karen grandma mascot with a sly smile'}
      role="img"
    >
      <svg viewBox="0 0 320 420" className="h-full w-full" aria-hidden="true">
        <style>
          {`
            @keyframes karen-float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-5px); }
            }
            @keyframes karen-brow-check {
              0%, 78%, 100% { transform: translateY(0); }
              84%, 92% { transform: translateY(-4px); }
            }
            .karen-mascot-body {
              animation: karen-float 4.5s ease-in-out infinite;
              transform-origin: 160px 230px;
            }
            .karen-mascot-brows {
              animation: karen-brow-check 3.6s ease-in-out infinite;
              transform-origin: 160px 132px;
            }
            @media (prefers-reduced-motion: reduce) {
              .karen-mascot-body,
              .karen-mascot-brows {
                animation: none;
              }
            }
          `}
        </style>
        <defs>
          <radialGradient id={hairId} cx="50%" cy="22%" r="65%">
            <stop offset="0%" stopColor="#fff9e8" />
            <stop offset="58%" stopColor="#e6dac4" />
            <stop offset="100%" stopColor="#b9ad9b" />
          </radialGradient>
          <linearGradient id={cardiganId} x1="54" x2="266" y1="244" y2="404">
            <stop offset="0%" stopColor="#78c6ba" />
            <stop offset="100%" stopColor="#34796f" />
          </linearGradient>
          <radialGradient id={cheekId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e98b77" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#e98b77" stopOpacity="0" />
          </radialGradient>
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="145%">
            <feDropShadow dx="0" dy="12" stdDeviation="8" floodColor="#000" floodOpacity="0.32" />
          </filter>
        </defs>

        <rect width="320" height="420" rx="26" fill="#17130f" />
        <path d="M24 375c42-35 86-51 134-51s94 16 138 51v45H24v-45z" fill="#0e0c0a" opacity="0.55" />

        <g className="karen-mascot-body" filter={`url(#${shadowId})`}>
          <path d="M72 278c-24 22-38 59-42 112h76l18-104-52-8z" fill="#4e9f92" />
          <path d="M248 278c24 22 38 59 42 112h-76l-18-104 52-8z" fill="#34796f" />
          <path d="M72 252c18-23 47-34 88-34s70 11 88 34l20 152H52l20-152z" fill={`url(#${cardiganId})`} />
          <path d="M124 244c14 13 58 13 72 0l-14 160h-44l-14-160z" fill="#fff3e1" />
          <path d="M139 272h42M142 304h36M144 336h32" stroke="#d8c5ae" strokeWidth="5" strokeLinecap="round" />
          <circle cx="160" cy="292" r="5" fill="#d94c42" />
          <circle cx="160" cy="326" r="5" fill="#d94c42" />

          <path d="M112 224c13 18 83 18 96 0v39c-22 18-74 18-96 0v-39z" fill="#efb88f" />
          <path d="M82 128c0-52 34-88 78-88s78 36 78 88c0 61-29 103-78 103s-78-42-78-103z" fill="#f0bc92" />
          <path d="M78 139c-15-2-26 8-24 24 2 17 17 28 34 22l-2-45-8-1z" fill="#efb88f" />
          <path d="M242 139c15-2 26 8 24 24-2 17-17 28-34 22l2-45 8-1z" fill="#efb88f" />

          <circle cx="84" cy="84" r="30" fill={`url(#${hairId})`} />
          <circle cx="110" cy="50" r="33" fill={`url(#${hairId})`} />
          <circle cx="151" cy="38" r="35" fill={`url(#${hairId})`} />
          <circle cx="194" cy="51" r="33" fill={`url(#${hairId})`} />
          <circle cx="232" cy="86" r="31" fill={`url(#${hairId})`} />
          <circle cx="72" cy="126" r="28" fill={`url(#${hairId})`} />
          <circle cx="248" cy="126" r="28" fill={`url(#${hairId})`} />
          <path
            d="M78 122c5-38 30-65 74-75 17 21 45 34 83 36-12-34-40-55-75-55-51 0-89 40-82 94z"
            fill={`url(#${hairId})`}
          />

          <ellipse cx="119" cy="148" rx="18" ry="23" fill="#fff9ef" />
          <ellipse cx="201" cy="148" rx="18" ry="23" fill="#fff9ef" />
          <path d="M101 149h37M182 149h37M138 148h44M101 148H78M219 148h23" stroke="#16110e" strokeWidth="7" strokeLinecap="round" />
          <circle cx="123" cy="151" r="5" fill="#221611" />
          <circle cx="197" cy="151" r="5" fill="#221611" />
          <path
            className="karen-mascot-brows"
            d={isMad ? 'M95 125l43 13M183 138l42-13' : 'M98 130c15-9 29-8 40 3M183 133c12-11 26-12 40-3'}
            stroke="#5a2b23"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path d="M160 145c-6 16-11 28-2 34 5 3 13 1 17-3" fill="none" stroke="#a6624f" strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="106" cy="178" rx="22" ry="12" fill={`url(#${cheekId})`} />
          <ellipse cx="215" cy="178" rx="22" ry="12" fill={`url(#${cheekId})`} />
          <path
            d={isMad ? 'M128 202c22-12 43-12 64 0' : 'M123 199c18 20 57 19 73-1'}
            fill="none"
            stroke="#6f2b25"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path d="M118 219c22 10 62 10 84 0" stroke="#cf936f" strokeWidth="5" strokeLinecap="round" opacity="0.5" />

          <circle cx="55" cy="178" r="9" fill="#f4c75f" />
          <circle cx="265" cy="178" r="9" fill="#f4c75f" />
          <path d="M39 332c19-4 36 2 48 17M281 332c-20-4-37 2-49 17" stroke="#efb88f" strokeWidth="26" strokeLinecap="round" />
          <path d="M66 320l-7-39M254 320l7-39" stroke="#2f6f66" strokeWidth="32" strokeLinecap="round" />

          <g transform="translate(211 64) rotate(8)">
            <rect x="0" y="0" width="78" height="42" rx="7" fill="#fff7df" />
            <path d="M7 10h54M7 22h38M7 34h51" stroke="#17130f" strokeWidth="4" strokeLinecap="round" />
            <path d="M24 42l-12 18 28-18" fill="#fff7df" />
          </g>
        </g>

        {isMad ? (
          <g>
            <rect x="218" y="24" width="68" height="32" rx="6" fill="#d94c42" />
            <text x="252" y="46" textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="17" fontWeight="800" fill="#fff">
              NO.
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
};
