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
import { HowItWorks } from './landing/HowItWorks';
import { Link as LinkRoute } from './landing/Link';
import { SignUp } from './landing/SignUp';
import { SignIn } from './landing/SignIn';
import { UserProfile } from './landing/UserProfile';
import { MyProfile } from './landing/MyProfile';

const navItems = [
  ['Home', '/'],
  ['Scoreboard', '/scoreboard'],
  ['How it works', '/how-it-works'],
  ['Install', '/install'],
] as const;

const LandingShell: React.FC<{ overview?: PromptCourtOverview | null }> = ({ overview }) => {
  const location = useLocation();

  React.useEffect(() => {
    document.documentElement.classList.add('karen-document-scroll');
    return () => {
      document.documentElement.classList.remove('karen-document-scroll');
    };
  }, []);

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#f6f2e8] text-[#111]">
      <header className="sticky top-0 z-40 border-b border-[#d8d8d8] bg-[#f6f2e8]/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <KarenLogo className="size-10 border-[#111]" mood="mad" />
            <div className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">Karen</div>
          </Link>
          <div className="hidden items-center gap-5 font-mono text-xs md:flex">
            {navItems.map(([label, href]) => (
              <Link
                key={href}
                to={href}
                className={location.pathname === href ? 'text-[#111]' : 'text-[#555] hover:text-[#111]'}
              >
                {label}
              </Link>
            ))}
          </div>
          <LandingAuthCta />
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scoreboard" element={<Scoreboard overview={overview} />} />
          <Route path="/install" element={<Install />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/link" element={<LinkRoute />} />
          <Route path="/signup/*" element={<SignUp />} />
          <Route path="/signin/*" element={<SignIn />} />
          <Route path="/u/:username" element={<UserProfile />} />
          <Route path="/profile" element={<MyProfile />} />
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
