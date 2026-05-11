import React from 'react';
import { useQuery } from 'convex/react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';

import { api } from '../../../../../convex/_generated/api';
import type { PromptCourtOverview } from '@/lib/promptcourt';
import { isKarenCloudConfigured } from '@/lib/karenCloudConfig';
import { KarenLogo } from './KarenLogo';
import { LandingAuthCta } from './landing/LandingAuthCta';
import { Home } from './landing/Home';
import { Scoreboard } from './landing/Scoreboard';
import { Install } from './landing/Install';

const navItems = [
  ['Home', '/'],
  ['Scoreboard', '/scoreboard'],
  ['Install', '/install'],
] as const;

const InstallRoute: React.FC = () => (
  <div className="min-h-screen bg-[#0d0b09] text-[#f6f2e8]">
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <header className="mb-10 max-w-3xl">
        <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a6e60]">
          <span className="h-px w-6 bg-[#3a322b]" />
          install
        </div>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          One line. Then Karen judges every patch.
        </h1>
        <p className="mt-4 text-base leading-7 text-[#c9bca8] sm:text-lg">
          Karen runs local-first. Prompt verdicts, sandbox runs, and diff quizzes start on your machine.
        </p>
      </header>
      <Install />
    </div>
  </div>
);

const LandingShell: React.FC<{ overview?: PromptCourtOverview | null }> = ({ overview }) => {
  const location = useLocation();

  React.useEffect(() => {
    document.documentElement.classList.add('karen-document-scroll');
    document.documentElement.style.colorScheme = 'dark';
    return () => {
      document.documentElement.classList.remove('karen-document-scroll');
      document.documentElement.style.colorScheme = '';
    };
  }, []);

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#0d0b09] text-[#f6f2e8]">
      <header className="sticky top-0 z-40 border-b border-[#1d1915] bg-[#0d0b09]/85 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <KarenLogo className="size-9 border-[#3a322b]" mood="mad" />
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#f6f2e8]">
              karen<span className="text-[#7a6e60]">/</span>court
            </div>
          </Link>
          <div className="hidden items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] md:flex">
            {navItems.map(([label, href]) => {
              const isActive = location.pathname === href;
              return (
                <Link
                  key={href}
                  to={href}
                  className={`rounded-sm px-3 py-1.5 transition ${
                    isActive
                      ? 'bg-[#1d1915] text-[#f6f2e8]'
                      : 'text-[#c9bca8] hover:bg-[#1d1915] hover:text-[#f6f2e8]'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <LandingAuthCta />
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scoreboard" element={<Scoreboard overview={overview} />} />
          <Route path="/install" element={<InstallRoute />} />
        </Routes>
      </main>
    </div>
  );
};

const CloudKarenLandingPage: React.FC = () => {
  const overview = useQuery(api.karen.overview) as PromptCourtOverview | undefined;
  return <LandingShell overview={overview ?? null} />;
};

export const KarenLandingPage: React.FC = () => {
  if (isKarenCloudConfigured) return <CloudKarenLandingPage />;
  return <LandingShell />;
};
