import React from 'react';
import type { PromptCourtProfile, PromptCourtPublicPost } from '@/lib/promptcourt';
import { cn } from '@/lib/utils';
import { KarenLogo } from './KarenLogo';
import { KarenMascot } from './KarenMascot';
import { ProofProfileCard } from './ProofProfileCard';

/**
 * Read-only public profile view for `/u/:username` when the visitor is NOT the
 * profile owner. Renders identity, proof card, recent sessions, and public
 * posts. Never renders launch controls, terminal bridge, auth bar, or any
 * mutation-capable surface.
 */

const formatDate = (value: number): string => {
  if (!Number.isFinite(value)) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const statusLabel = (status: string): string => status.replaceAll('_', ' ');

const sessionTone = (session: PromptCourtProfile['recentSessions'][number]): 'good' | 'bad' | 'default' => {
  if (session.status === 'executed_quiz_passed') return 'good';
  if (session.status === 'blocked_bad_prompt' || session.rollbackTriggered) return 'bad';
  return 'default';
};

const PublicPostCard: React.FC<{ post: PromptCourtPublicPost }> = ({ post }) => (
  <article className="rounded-md border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="typography-ui-label font-semibold text-foreground">@{post.username}</div>
        <div className="typography-micro text-muted-foreground">{formatDate(post.createdAt)}</div>
      </div>
      <span className="rounded-sm bg-[var(--status-error)]/15 px-2 py-1 typography-micro font-medium text-[var(--status-error)]">
        {post.type === 'quiz_failed' ? 'quiz fail' : `${post.score ?? 0}/100`}
      </span>
    </div>
    <h2 className="mt-3 typography-title text-foreground">{post.title}</h2>
    {post.promptExcerpt ? (
      <p className="mt-2 typography-body rounded-md bg-muted/40 p-3 text-foreground">{post.promptExcerpt}</p>
    ) : null}
    {post.failureReasons && post.failureReasons.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {post.failureReasons.map((reason) => (
          <span key={reason} className="rounded-sm bg-background px-2 py-1 typography-micro text-muted-foreground">
            {reason}
          </span>
        ))}
      </div>
    ) : null}
  </article>
);

export type PublicProfileViewProps = {
  profile: PromptCourtProfile;
  username: string;
};

export const PublicProfileView: React.FC<PublicProfileViewProps> = ({ profile, username }) => {
  const recentSessions = profile.recentSessions ?? [];
  const publicPosts = profile.publicPosts ?? [];
  const mood = profile.stats.publicFailureCount > 0 ? 'mad' : 'calm';

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <a href="/karen/landing" className="typography-ui-label text-primary hover:underline">
            ← Karen
          </a>
          <span className="rounded-sm border border-border bg-muted/40 px-2 py-1 typography-micro text-muted-foreground">
            public profile · read only
          </span>
        </header>

        <section className="rounded-md border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <KarenLogo className="size-14 shrink-0" mood={mood} />
              <div>
                <div className="typography-ui-label text-muted-foreground">Karen profile</div>
                <h1 className="mt-1 text-4xl font-semibold tracking-normal text-foreground">@{profile.user.username}</h1>
                <div className="mt-1 typography-body text-muted-foreground">{profile.stats.level}</div>
              </div>
            </div>
            <KarenMascot className="w-24 lg:w-48" mood={mood} />
          </div>
        </section>

        <ProofProfileCard profile={profile} />

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-normal text-foreground">Recent Runs</h2>
            <div className="overflow-hidden rounded-md border border-border bg-card">
              {recentSessions.length > 0 ? recentSessions.slice(0, 8).map((session) => (
                <div key={session.id} className="border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={cn(
                      'rounded-sm px-2 py-1 typography-micro font-medium',
                      sessionTone(session) === 'good'
                        ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
                        : sessionTone(session) === 'bad'
                          ? 'bg-[var(--status-error)]/15 text-[var(--status-error)]'
                          : 'bg-muted text-muted-foreground',
                    )}>
                      {statusLabel(session.status)}
                    </span>
                    <span className="typography-micro text-muted-foreground">{formatDate(session.createdAt)}</span>
                  </div>
                  {session.prompt ? (
                    <p className="mt-2 line-clamp-2 typography-body text-foreground">{session.prompt}</p>
                  ) : null}
                  {session.changedFiles && session.changedFiles.length > 0 ? (
                    <div className="mt-2 typography-micro text-muted-foreground">
                      {session.changedFiles.slice(0, 3).join(', ')}
                      {session.changedFiles.length > 3 ? ` +${session.changedFiles.length - 3}` : ''}
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="p-4 typography-body text-muted-foreground">
                  Nothing on the docket. Karen is suspicious.
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-normal text-foreground">Public Record</h2>
              <span className="typography-micro text-muted-foreground">{publicPosts.length} records</span>
            </div>
            {publicPosts.length > 0 ? (
              <div className="grid gap-3">
                {publicPosts.slice(0, 6).map((post) => <PublicPostCard key={post.id} post={post} />)}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-card p-6 typography-body text-muted-foreground">
                The graveyard's empty. For now. Karen is patient.
              </div>
            )}
          </section>
        </div>

        <footer className="rounded-md border border-dashed border-border bg-background/40 p-4 typography-micro text-muted-foreground">
          You are viewing @{username}'s public Karen profile. Karen renders verdicts derived from PromptCourt records — no live composer here.
        </footer>
      </main>
    </div>
  );
};

export const PublicProfileNotFound: React.FC<{ username: string }> = ({ username }) => (
  <div className="min-h-[100dvh] bg-background text-foreground">
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6 lg:px-8">
      <a href="/karen/landing" className="typography-ui-label text-primary hover:underline">
        ← Karen
      </a>
      <section className="rounded-md border border-border bg-card p-8 text-center">
        <KarenLogo className="mx-auto size-20" mood="mad" />
        <h1 className="mt-6 text-3xl font-semibold tracking-normal text-foreground">No record of @{username}</h1>
        <p className="mt-3 typography-body text-muted-foreground">
          Karen has no record of this person. Either they never showed up, or they were thrown out.
        </p>
        <a
          href="/karen/landing"
          className="mt-6 inline-flex items-center rounded-md border border-border bg-foreground px-4 py-2 typography-ui-label text-background hover:opacity-90"
        >
          Back to Karen
        </a>
      </section>
    </main>
  </div>
);

export const PublicProfileLoading: React.FC<{ username: string }> = ({ username }) => (
  <div className="min-h-[100dvh] bg-background text-foreground">
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between">
        <a href="/karen/landing" className="typography-ui-label text-primary hover:underline">
          ← Karen
        </a>
        <span className="rounded-sm border border-border bg-muted/40 px-2 py-1 typography-micro text-muted-foreground">
          loading @{username}
        </span>
      </header>
      <div className="grid gap-4">
        <div className="h-32 animate-pulse rounded-md border border-border bg-card/60" />
        <div className="h-48 animate-pulse rounded-md border border-border bg-card/60" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-md border border-border bg-card/60" />
          <div className="h-64 animate-pulse rounded-md border border-border bg-card/60" />
        </div>
      </div>
    </main>
  </div>
);

export default PublicProfileView;
