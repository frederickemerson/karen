import React from 'react';
import { Link } from 'react-router-dom';
import { RiArrowRightLine, RiAuctionLine, RiGithubFill } from '@remixicon/react';
import { motion } from 'motion/react';
import { useQuery } from 'convex/react';

import { api } from '../../../../../../convex/_generated/api';
import type { PromptCourtOverview } from '@/lib/promptcourt';
import { isKarenCloudConfigured } from '@/lib/karenCloudConfig';
import { KarenCommitInterrupt } from './KarenCommitInterrupt';
import { KarenPipelineStrip } from './KarenPipelineStrip';
import { KarenShameTweetWall } from './KarenShameTweetWall';
import { HowItWorks } from './HowItWorks';
import { Install } from './Install';
import { GrandmaVoiceTeaser } from './GrandmaVoiceTeaser';
import { HeroVerdict } from './HeroVerdict';
import { ProblemPromptCompare } from './ProblemPromptCompare';
import { LandingFooter } from './LandingFooter';

const REPO_URL = 'https://github.com/frederickemerson/karen';

type HeroStats = ReadonlyArray<readonly [string, string]>;

const PLACEHOLDER_STATS: HeroStats = [
  ['prompts blocked', '12,431'],
  ['quizzes failed', '3,892'],
  ['verdicts issued', '2,107'],
  ['developers on trial', '418'],
];

const statsFromOverview = (overview: PromptCourtOverview): HeroStats => {
  const { totals } = overview;
  const blocked = Math.max(0, totals.sessions - totals.promotedRuns);
  return [
    ['prompts blocked', blocked.toLocaleString()],
    ['quizzes failed', totals.publicFailures.toLocaleString()],
    ['verdicts issued', totals.sessions.toLocaleString()],
    ['developers on trial', totals.users.toLocaleString()],
  ];
};

// useQuery requires a ConvexProvider in the tree. landing-main.tsx skips the
// provider entirely when Convex isn't configured, so split into two variants
// rather than calling useQuery conditionally.
const CloudHome: React.FC = () => {
  const overview = useQuery(api.karen.overview) as PromptCourtOverview | undefined;
  const stats = overview ? statsFromOverview(overview) : PLACEHOLDER_STATS;
  return <HomeBody stats={stats} />;
};

export const Home: React.FC = () => {
  if (isKarenCloudConfigured) return <CloudHome />;
  return <HomeBody stats={PLACEHOLDER_STATS} />;
};

const HomeBody: React.FC<{ stats: HeroStats }> = ({ stats }) => (
  <div className="bg-[#0d0b09] text-[#f6f2e8]">
    {/* HERO */}
    <section className="relative overflow-hidden border-b border-[#1d1915]">
      <div className="absolute inset-0 -z-0 bg-[radial-gradient(circle_at_30%_30%,rgba(183,51,44,0.18),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(255,204,102,0.08),transparent_55%)]" />
      <div className="absolute inset-0 -z-0 opacity-[0.04] [background-image:linear-gradient(rgba(246,242,232,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(246,242,232,0.6)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pt-24 lg:pb-28">
        <div className="flex flex-col justify-center">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-[#2a2521] bg-black/40 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c9bca8]">
            <RiAuctionLine className="size-3.5 text-[#b7332c]" />
            <span>karen v1 · prompt court · in session</span>
          </div>

          <h1 className="mt-6 font-serif text-5xl font-semibold leading-[0.95] tracking-tight text-[#f6f2e8] sm:text-6xl lg:text-7xl">
            Your prompts go on
            <span className="relative ml-3 inline-block">
              <span className="relative z-10 text-[#ff5a4d]">trial.</span>
              <span className="absolute -inset-1 -z-0 bg-[#b7332c]/15 blur-md" aria-hidden="true" />
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-[#c9bca8]">
            Karen is a judgment layer for your coding agent. She rejects lazy prompts, runs approved work in an isolated worktree, then quizzes you on the diff. Pass and ship. Fail and{' '}
            <code className="rounded-sm bg-[#1d1915] px-1.5 py-0.5 font-mono text-sm text-[#ff5a4d]">git reset --hard</code>.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/install"
              className="group inline-flex items-center gap-2 rounded-sm bg-[#b7332c] px-5 py-3 font-mono text-sm font-semibold uppercase tracking-[0.14em] text-[#fff8ec] shadow-[0_6px_0_#7a1e19] transition active:translate-y-[2px] active:shadow-[0_3px_0_#7a1e19]"
            >
              Install Karen
              <RiArrowRightLine className="size-4 transition group-hover:translate-x-0.5" />
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-[#3a322b] bg-black/40 px-5 py-3 font-mono text-sm font-semibold uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8] hover:bg-black/60"
            >
              <RiGithubFill className="size-4" />
              View on GitHub
            </a>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#1d1915] pt-6 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label}>
                <div className="font-mono text-xl font-semibold tabular-nums text-[#f6f2e8]">{value}</div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="flex items-center justify-center"
        >
          <HeroVerdict />
        </motion.div>
      </div>
    </section>

    {/* THE PROBLEM */}
    <SectionShell eyebrow="the problem" title="Your prompt is vibes. Karen wants a charge sheet.">
      <ProblemPromptCompare />
    </SectionShell>

    {/* HOW IT WORKS */}
    <SectionShell eyebrow="how it works" title="One flow. No fluff.">
      <HowItWorks />
    </SectionShell>

    {/* PIPELINE STRIP */}
    <SectionShell eyebrow="pipeline" title="Prompt to verdict, in five stops." compact>
      <KarenPipelineStrip />
    </SectionShell>

    {/* COMMIT INTERRUPT */}
    <SectionShell
      eyebrow="commit interrupt"
      title="git commit -m 'fix'"
      subtitle="Karen interrupts the commit with one Kahoot question on the actual diff. Wrong answer, the patch dies."
    >
      <KarenCommitInterrupt />
    </SectionShell>

    {/* SCOREBOARD PREVIEW */}
    <SectionShell
      eyebrow="public scoreboard"
      title="We keep score. We name and shame."
      subtitle="When you fail the read check on a public profile, the court records it."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/scoreboard"
          className="inline-flex items-center gap-2 rounded-sm border border-[#3a322b] bg-black/40 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8]"
        >
          Open the scoreboard
          <RiArrowRightLine className="size-3.5" />
        </Link>
        <div className="font-mono text-xs text-[#7a6e60]">Convex-backed, falls back to a demo set when no public sessions are live.</div>
      </div>
    </SectionShell>

    {/* SHAME WALL */}
    <SectionShell eyebrow="@karen-code on x" title="Today's shame timeline.">
      <KarenShameTweetWall />
    </SectionShell>

    {/* INSTALL */}
    <SectionShell eyebrow="install" title="One line. Then Karen judges every patch.">
      <Install />
    </SectionShell>

    {/* GRANDMA VOICE TEASER */}
    <SectionShell
      eyebrow="grandma voice"
      title="Hear Karen judge you in your grandmother's voice."
      subtitle="ElevenLabs cast as a courtroom matriarch. Browser voice for offline shame."
    >
      <GrandmaVoiceTeaser />
    </SectionShell>

    {/* FOOTER */}
    <LandingFooter />
  </div>
);

const SectionShell: React.FC<{
  eyebrow: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
  children: React.ReactNode;
}> = ({ eyebrow, title, subtitle, compact = false, children }) => (
  <section className={`border-b border-[#1d1915] ${compact ? 'py-12' : 'py-16 sm:py-20'}`}>
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <header className="mb-8 max-w-3xl">
        <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a6e60]">
          <span className="h-px w-6 bg-[#3a322b]" />
          {eyebrow}
        </div>
        <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-tight text-[#f6f2e8] sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        {subtitle ? <p className="mt-3 max-w-2xl text-base leading-7 text-[#c9bca8] sm:text-lg">{subtitle}</p> : null}
      </header>
      <div>{children}</div>
    </div>
  </section>
);

export default Home;
