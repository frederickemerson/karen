import React from 'react';
import { RiCheckLine, RiFileCopyLine, RiSkullLine } from '@remixicon/react';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { PromptCourtPublicPost } from '@/lib/promptcourt';
import { cn } from '@/lib/utils';
import {
  formatBadPromptShareText,
  karenChargeList,
  karenRewriteFor,
  karenVerdictLine,
} from '@/lib/karenCopy';

type BadPromptGraveyardProps = {
  posts: PromptCourtPublicPost[];
  className?: string;
  limit?: number;
  title?: string;
};

const formatDate = (value: number): string => {
  if (!Number.isFinite(value)) return 'unknown date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const scoreTone = (score?: number): 'awful' | 'weak' | 'appeal' => {
  const safeScore = Number.isFinite(score) ? Number(score) : 0;
  if (safeScore >= 60) return 'appeal';
  if (safeScore >= 35) return 'weak';
  return 'awful';
};

const scoreToneClass = (tone: ReturnType<typeof scoreTone>) => cn(
  'border px-2.5 py-1 typography-micro font-semibold',
  tone === 'awful' && 'border-[var(--status-error)]/40 bg-[var(--status-error)]/15 text-[var(--status-error)]',
  tone === 'weak' && 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  tone === 'appeal' && 'border-[var(--status-success)]/35 bg-[var(--status-success)]/12 text-[var(--status-success)]',
);

const ShareButton = ({ post }: { post: PromptCourtPublicPost }) => {
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = React.useCallback(async () => {
    const result = await copyTextToClipboard(formatBadPromptShareText(post));
    setState(result.ok ? 'copied' : 'failed');
    window.setTimeout(() => setState('idle'), 1400);
  }, [post]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 typography-micro font-medium text-foreground hover:bg-muted/60',
        state === 'failed' && 'border-[var(--status-error)]/40 text-[var(--status-error)]',
      )}
      aria-label="Copy bad prompt graveyard card"
    >
      {state === 'copied' ? <RiCheckLine className="size-3.5" /> : <RiFileCopyLine className="size-3.5" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Nope' : 'Copy roast'}
    </button>
  );
};

const GraveyardCard = ({ post }: { post: PromptCourtPublicPost }) => {
  const score = Number.isFinite(post.score) ? Number(post.score) : 0;
  const charges = karenChargeList(post).slice(0, 4);
  const rewrite = karenRewriteFor(post);
  const prompt = post.promptExcerpt?.trim() || 'Prompt missing. Karen still found it guilty.';
  const tone = scoreTone(score);

  return (
    <article className="grid gap-4 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground">
            <RiSkullLine className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="typography-ui-label font-semibold text-foreground">@{post.username}</span>
              <span className="typography-micro text-muted-foreground">{formatDate(post.createdAt)}</span>
            </div>
            <h3 className="mt-1 typography-title text-foreground">{post.title || 'Karen buried a prompt'}</h3>
            <p className="mt-1 typography-micro text-muted-foreground">{karenVerdictLine(score)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={scoreToneClass(tone)}>{score}/100</span>
          <ShareButton post={post} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-md border border-border bg-background/60 p-3">
          <div className="typography-micro font-semibold uppercase text-muted-foreground">Bad prompt</div>
          <p className="mt-2 whitespace-pre-wrap typography-body text-foreground">{prompt}</p>
        </div>
        <div className="rounded-md border border-[var(--status-success)]/25 bg-[var(--status-success)]/8 p-3">
          <div className="typography-micro font-semibold uppercase text-muted-foreground">Karen rewrite</div>
          <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-foreground">{rewrite}</p>
        </div>
      </div>

      <div>
        <div className="typography-micro font-semibold uppercase text-muted-foreground">Charges</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {charges.map((charge) => (
            <span
              key={charge}
              className="rounded-sm border border-border bg-background px-2 py-1 typography-micro text-muted-foreground"
            >
              {charge}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
};

export const BadPromptGraveyard: React.FC<BadPromptGraveyardProps> = ({
  posts,
  className,
  limit = 12,
  title = 'Bad Prompt Graveyard',
}) => {
  const badPrompts = React.useMemo(
    () => posts.filter((post) => post.type === 'bad_prompt').slice(0, limit),
    [limit, posts],
  );

  return (
    <section className={cn('grid gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-foreground">{title}</h2>
          <p className="mt-1 typography-micro text-muted-foreground">
            Bad prompts, Karen rewrites, and the charge sheet. Share responsibly. Or at least spell-check.
          </p>
        </div>
        <span className="rounded-sm bg-muted px-2 py-1 typography-micro text-muted-foreground">
          {badPrompts.length} buried
        </span>
      </div>

      {badPrompts.length > 0 ? (
        <div className="grid gap-3">
          {badPrompts.map((post) => (
            <GraveyardCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-card p-5">
          <div className="typography-ui-label text-foreground">No bad prompts buried yet.</div>
          <p className="mt-1 typography-body text-muted-foreground">
            Suspicious. Karen is checking the paperwork.
          </p>
        </div>
      )}
    </section>
  );
};

export default BadPromptGraveyard;
