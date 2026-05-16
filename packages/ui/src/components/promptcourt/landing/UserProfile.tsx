import React from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { RiGithubFill, RiGlobalLine, RiTwitterXLine } from '@remixicon/react';

import { api } from '../../../../../../convex/_generated/api';
import type { PromptCourtProfile } from '@/lib/promptcourt';
import { KarenLogo } from '../KarenLogo';
import { KarenMascot } from '../KarenMascot';
import { ProofProfileCard } from '../ProofProfileCard';
import { KarenBadgeWall } from '../KarenBadgeWall';
import { BadPromptGraveyard } from '../BadPromptGraveyard';

type PublicProfileResult = (PromptCourtProfile & {
  user: PromptCourtProfile['user'] & {
    _id?: string;
    imageUrl?: string;
    bio?: string;
    links?: { github?: string; x?: string; website?: string };
  };
  publicPosts: PromptCourtProfile['publicPosts'];
}) | null;

const formatDate = (value: number) => {
  if (!Number.isFinite(value)) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const setMeta = (property: string, content: string) => {
  if (typeof document === 'undefined') return;
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

const NotFound: React.FC<{ username?: string }> = ({ username }) => (
  <div className="mx-auto grid max-w-4xl gap-8 px-4 py-16 sm:px-6 lg:px-8 lg:grid-cols-[1fr_280px] lg:items-center">
    <div>
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">404</div>
      <h1 className="mt-3 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
        Karen does not know this person.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d4d4d]">
        {username ? <>No public record for <span className="font-mono">@{username}</span>. </> : null}
        Maybe they never typed a prompt. Maybe they typed a great one and you spelled their name wrong.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <RouterLink
          to="/scoreboard"
          className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-5 py-3 font-mono text-sm font-semibold text-[#f6f2e8]"
        >
          Back to scoreboard
        </RouterLink>
        <RouterLink to="/install" className="rounded-sm border border-[#111] px-5 py-3 font-mono text-sm font-semibold">
          Install Karen
        </RouterLink>
      </div>
    </div>
    <KarenMascot className="h-[320px] border-[#111] bg-black shadow-[10px_10px_0_#111]" mood="mad" />
  </div>
);

const LinkRow: React.FC<{ links?: { github?: string; x?: string; website?: string } }> = ({ links }) => {
  if (!links) return null;
  const items: Array<[string, string, React.ComponentType<{ className?: string }>]> = [];
  if (links.github) items.push(['GitHub', links.github, RiGithubFill]);
  if (links.x) items.push(['X', links.x, RiTwitterXLine]);
  if (links.website) items.push(['Website', links.website, RiGlobalLine]);
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-xs text-[#4d4d4d]">
      {items.map(([label, href, Icon]) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-sm border border-[#111] px-2.5 py-1 hover:bg-[#111] hover:text-[#f6f2e8]"
        >
          <Icon className="size-3.5" />
          {label}
        </a>
      ))}
    </div>
  );
};

export const UserProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const safeUsername = (username ?? '').trim();

  const profile = useQuery(api.karen.profilePublic, safeUsername ? { username: safeUsername } : 'skip') as
    | PublicProfileResult
    | undefined;

  React.useEffect(() => {
    if (!safeUsername) return;
    document.title = `@${safeUsername} on Karen`;
    setMeta('og:title', `@${safeUsername} on Karen`);
    setMeta('og:image', `/share/u/${encodeURIComponent(safeUsername)}.svg`);
    setMeta('og:type', 'profile');
  }, [safeUsername]);

  if (profile === undefined) {
    return (
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <div className="font-mono text-xs text-[#6f6f6f]">Karen is reading the file. One second.</div>
      </div>
    );
  }

  if (profile === null) {
    return <NotFound username={safeUsername} />;
  }

  const { user, stats, recentSessions, publicPosts } = profile;
  const displayName = user.displayName || user.username;

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <section className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
        <div>
          <div className="flex items-center gap-3">
            <KarenLogo className="size-12 border-[#111]" mood="calm" />
            <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
              public proof profile
            </div>
          </div>
          <h1 className="mt-5 text-6xl font-semibold leading-[0.9] tracking-normal sm:text-7xl">
            @{user.username}
          </h1>
          {displayName && displayName !== user.username ? (
            <div className="mt-2 text-xl text-[#4d4d4d]">{displayName}</div>
          ) : null}
          {user.bio ? (
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[#4d4d4d]">{user.bio}</p>
          ) : null}
          <LinkRow links={user.links} />
          <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-xs text-[#6f6f6f]">
            <span>{stats.level}</span>
            <span>·</span>
            <span>{stats.totalSessions} judged sessions</span>
            <span>·</span>
            <span>streak {stats.currentStreak}x</span>
            <span>·</span>
            <span>longest {stats.longestStreak}x</span>
          </div>
        </div>
        {user.imageUrl ? (
          <img
            src={user.imageUrl}
            alt={`@${user.username}`}
            className="size-44 justify-self-start rounded-md border border-[#111] object-cover shadow-[8px_8px_0_#111] lg:size-72 lg:justify-self-end"
          />
        ) : (
          <KarenMascot className="h-72 max-h-[50dvh] border-[#111] bg-black shadow-[10px_10px_0_#111]" mood="calm" />
        )}
      </section>

      <section>
        <ProofProfileCard profile={profile} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['Discipline', `${stats.disciplineScore}/100`, 'lifetime score'],
          ['Avg prompt', `${stats.averagePromptScore}/100`, 'before any code runs'],
          ['Quiz pass rate', `${stats.quizPassRate}%`, 'read-check pass'],
          ['Promoted runs', stats.promotedRuns, 'patches Karen let live'],
          ['Blocked prompts', stats.blockedPrompts, 'shouted down at the door'],
          ['Public failures', stats.publicFailureCount, 'on the wall'],
        ].map(([label, value, helper]) => (
          <div key={String(label)} className="rounded-md border border-[#d8d8d8] bg-white p-4 shadow-[4px_4px_0_#111]">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6f6f6f]">{label}</div>
            <div className="mt-2 text-3xl font-semibold tracking-normal">{value}</div>
            <div className="mt-1 text-xs leading-5 text-[#555]">{helper}</div>
          </div>
        ))}
      </section>

      <section>
        <KarenBadgeWall proofUrl={typeof window !== 'undefined' ? `${window.location.origin}/u/${encodeURIComponent(user.username)}` : `/u/${user.username}`} />
      </section>

      <section className="grid gap-4">
        <div>
          <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">public shame</div>
          <h2 className="mt-2 text-4xl font-semibold tracking-normal sm:text-5xl">
            What Karen had to say.
          </h2>
        </div>
        <div className="rounded-md border border-[#d8d8d8] bg-white p-4">
          <BadPromptGraveyard
            posts={publicPosts}
            limit={6}
            title={`Recent charges against @${user.username}`}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <div>
          <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">recent sessions</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">
            Latest runs through Karen.
          </h2>
        </div>
        {recentSessions.length > 0 ? (
          <ul className="grid gap-3">
            {recentSessions.slice(0, 6).map((session) => (
              <li
                key={session.id}
                className="rounded-md border border-[#d8d8d8] bg-white p-4 shadow-[3px_3px_0_#111]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#6f6f6f]">
                      {session.status.replace(/_/g, ' ')}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-[#222]">
                      {session.prompt || 'Prompt redacted.'}
                    </div>
                    {session.changedFiles && session.changedFiles.length > 0 ? (
                      <div className="mt-2 font-mono text-[11px] text-[#555]">
                        {session.changedFiles.slice(0, 3).join(', ')}
                        {session.changedFiles.length > 3 ? ` and ${session.changedFiles.length - 3} more` : ''}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right font-mono text-xs text-[#6f6f6f]">
                    <div>{session.promptScore}/100</div>
                    <div className="mt-1">{formatDate(session.createdAt)}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-[#b7332c]/40 bg-[#fff5f3] p-5 font-mono text-sm text-[#b7332c]">
            No recorded sessions yet. Karen has nothing to say. For now.
          </div>
        )}
      </section>

      <footer className="border-t border-[#d8d8d8] pt-6 font-mono text-xs text-[#6f6f6f]">
        Generated from PromptCourt records. Karen does not make these up.
      </footer>
    </div>
  );
};

export default UserProfile;
