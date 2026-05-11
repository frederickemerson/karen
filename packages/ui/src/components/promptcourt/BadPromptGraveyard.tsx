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
  tone === 'awful' && 'border-[#b7332c]/45 bg-[#b7332c]/15 text-[#ff5a4d]',
  tone === 'weak' && 'border-[#c89b2a]/45 bg-[#c89b2a]/15 text-[#ffcc66]',
  tone === 'appeal' && 'border-[#5fa572]/40 bg-[#5fa572]/15 text-[#a8e0b5]',
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
        'inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-[#2a2521] bg-[#0a0907] px-2.5 typography-micro font-medium text-[#f6f2e8] hover:border-[#c9bca8] hover:bg-black/60',
        state === 'failed' && 'border-[#b7332c]/50 text-[#ff5a4d]',
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
    <article className="grid gap-4 rounded-md border border-[#2a2521] bg-[#0a0907] p-4 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md border border-[#2a2521] bg-[#0d0b09] text-[#7a6e60]">
            <RiSkullLine className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="typography-ui-label font-semibold text-[#f6f2e8]">@{post.username}</span>
              <span className="typography-micro text-[#7a6e60]">{formatDate(post.createdAt)}</span>
            </div>
            <h3 className="mt-1 typography-title text-[#f6f2e8]">{post.title || 'Karen buried a prompt'}</h3>
            <p className="mt-1 typography-micro text-[#c9bca8]">{karenVerdictLine(score)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={scoreToneClass(tone)}>{score}/100</span>
          <ShareButton post={post} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-md border border-[#2a2521] bg-[#0d0b09]/70 p-3">
          <div className="typography-micro font-semibold uppercase text-[#7a6e60]">Bad prompt</div>
          <p className="mt-2 whitespace-pre-wrap typography-body text-[#e8dfd0]">{prompt}</p>
        </div>
        <div className="rounded-md border border-[#5fa572]/30 bg-[#5fa572]/10 p-3">
          <div className="typography-micro font-semibold uppercase text-[#a8e0b5]">Karen rewrite</div>
          <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-[#e8dfd0]">{rewrite}</p>
        </div>
      </div>

      <div>
        <div className="typography-micro font-semibold uppercase text-[#7a6e60]">Charges</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {charges.map((charge) => (
            <span
              key={charge}
              className="rounded-sm border border-[#3a322b] bg-black/40 px-2 py-1 typography-micro text-[#c9bca8]"
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
    () => posts.filter((post) => post.type === 'bad_prompt' || post.type === 'quiz_failed').slice(0, limit),
    [limit, posts],
  );

  return (
    <section className={cn('grid gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-[#f6f2e8]">{title}</h2>
          <p className="mt-1 typography-micro text-[#7a6e60]">
            Public PromptCourt charges from all users. Share responsibly. Or at least spell-check.
          </p>
        </div>
        <span className="rounded-sm border border-[#3a322b] bg-black/40 px-2 py-1 typography-micro text-[#c9bca8]">
          {badPrompts.length} public
        </span>
      </div>

      {badPrompts.length > 0 ? (
        <div className="grid gap-3">
          {badPrompts.map((post) => (
            <GraveyardCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#2a2521] bg-[#0a0907] p-5">
          <div className="typography-ui-label text-[#f6f2e8]">No bad prompts buried yet.</div>
          <p className="mt-1 typography-body text-[#c9bca8]">
            No public blocked prompts or quiz failures have been synced from Convex yet.
          </p>
        </div>
      )}
    </section>
  );
};

export default BadPromptGraveyard;
