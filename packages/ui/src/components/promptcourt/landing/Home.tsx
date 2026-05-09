import React from 'react';
import { Link } from 'react-router-dom';
import { RiArrowRightLine } from '@remixicon/react';

import { KarenMascot } from '../KarenMascot';
import { KarenCommitInterrupt } from './KarenCommitInterrupt';

const REPO_URL = 'https://github.com/frederickemerson/karen';

export const Home: React.FC = () => (
  <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:px-8">
    <section className="grid min-h-[84dvh] items-center gap-10 lg:grid-cols-[1fr_420px]">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">proof of work for ai code</div>
        <h1 className="mt-5 text-6xl font-semibold leading-[0.9] tracking-normal sm:text-7xl lg:text-8xl">
          Did you read your f*ing code?
        </h1>
        <p className="mt-6 max-w-2xl text-xl leading-8 text-[#4d4d4d]">
          One Kahoot question. Click the wrong answer. We just git reset --hard.
        </p>
        <p className="mt-2 max-w-2xl text-xl leading-8 text-[#b7332c]">
          Then your failure goes to the scoreboard.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/install" className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-5 py-3 font-mono text-sm font-semibold text-[#f6f2e8]">
            Install Karen <RiArrowRightLine className="size-4" />
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm border border-[#111] px-5 py-3 font-mono text-sm font-semibold"
          >
            View on GitHub
          </a>
          <Link to="/scoreboard" className="rounded-sm border border-[#111] px-5 py-3 font-mono text-sm font-semibold">
            See scoreboard
          </Link>
        </div>
      </div>

      <div className="relative">
        <div className="absolute -left-8 top-8 z-10 hidden rounded-sm border border-[#111] bg-white px-4 py-3 font-mono text-xs shadow-[6px_6px_0_#111] lg:block">
          Read the diff. Defend the patch.
        </div>
        <KarenMascot className="h-[520px] max-h-[70dvh] border-[#111] bg-black shadow-[12px_12px_0_#111]" mood="mad" />
      </div>
    </section>

    <section>
      <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">live kahoot</div>
      <h2 className="mb-5 text-4xl font-semibold tracking-normal sm:text-5xl">
        Click the wrong answer.
      </h2>
      <KarenCommitInterrupt />
    </section>
  </div>
);
