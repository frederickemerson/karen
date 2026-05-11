import React from 'react';
import { Link } from 'react-router-dom';
import { RiGithubFill, RiBookOpenLine, RiAuctionLine } from '@remixicon/react';

const REPO_URL = 'https://github.com/frederickemerson/karen';
const DOCS_URL = 'https://github.com/frederickemerson/karen#readme';

export const LandingFooter: React.FC = () => (
  <footer className="bg-[#080705] py-12">
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
      <div className="max-w-md">
        <div className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#c9bca8]">
          <RiAuctionLine className="size-4 text-[#b7332c]" />
          karen · prompt court
        </div>
        <p className="mt-3 text-sm leading-6 text-[#7a6e60]">
          Built on OpenChamber. Local-first. Public records optional. Made by humans Karen has, reluctantly, approved of.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-sm border border-[#2a2521] bg-black/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8]"
        >
          <RiGithubFill className="size-4" />
          GitHub
        </a>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-sm border border-[#2a2521] bg-black/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8]"
        >
          <RiBookOpenLine className="size-4" />
          Docs
        </a>
        <Link
          to="/scoreboard"
          className="inline-flex items-center gap-2 rounded-sm border border-[#2a2521] bg-black/40 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8]"
        >
          Scoreboard
        </Link>
      </div>
    </div>

    <div className="mx-auto mt-10 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-[#1d1915] px-4 pt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-[#5b5247] sm:px-6 lg:px-8">
      <span>karen v1 · open source · MIT</span>
      <span>"if you can't defend the patch, you can't keep the patch."</span>
    </div>
  </footer>
);

export default LandingFooter;
