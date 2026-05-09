import type { PromptCourtProfile } from '@/lib/promptcourt';
import { cn } from '@/lib/utils';

type ProofProfileCardProps = {
  profile: PromptCourtProfile;
  className?: string;
  proofBaseUrl?: string;
};

type ProofMetric = {
  label: string;
  value: string | number;
  helper: string;
  tone?: 'good' | 'warn' | 'default';
};

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const clampPercent = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const makeProofUrl = (username: string, proofBaseUrl?: string) => {
  const safeUser = encodeURIComponent(username || 'local-user');
  const base = proofBaseUrl?.replace(/\/$/, '') || 'https://karen.dev/proof';
  return `${base}/${safeUser}`;
};

const metricTone = (tone: ProofMetric['tone']) => {
  if (tone === 'good') return 'border-[var(--status-success)]/30 bg-[var(--status-success)]/10 text-[var(--status-success)]';
  if (tone === 'warn') return 'border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 text-[var(--status-warning)]';
  return 'border-border bg-muted/40 text-foreground';
};

const ProofMetricTile = ({ metric }: { metric: ProofMetric }) => (
  <div className={cn('rounded-md border p-3', metricTone(metric.tone))}>
    <div className="typography-micro uppercase text-muted-foreground">{metric.label}</div>
    <div className="mt-2 text-2xl font-semibold tracking-normal text-foreground">{metric.value}</div>
    <div className="mt-1 typography-micro text-muted-foreground">{metric.helper}</div>
  </div>
);

export const ProofProfileCard = ({ profile, className, proofBaseUrl }: ProofProfileCardProps) => {
  const stats = profile.stats;
  const rollbackAvoided = Math.max(0, stats.promotedRuns);
  const quizPassRate = clampPercent(stats.quizPassRate);
  const proofUrl = makeProofUrl(profile.user.username, proofBaseUrl);
  const badges = profile.rewards.length > 0
    ? profile.rewards
    : [{ id: 'new-profile', label: 'First proof pending', tone: 'bad' as const }];

  const metrics: ProofMetric[] = [
    {
      label: 'Prompt Avg',
      value: `${stats.averagePromptScore}/100`,
      helper: 'Average judge score before the agent runs.',
      tone: stats.averagePromptScore >= 80 ? 'good' : stats.averagePromptScore >= 55 ? 'default' : 'warn',
    },
    {
      label: 'Quiz Pass',
      value: `${quizPassRate}%`,
      helper: 'Code-read checks passed after generation.',
      tone: quizPassRate >= 80 ? 'good' : quizPassRate >= 50 ? 'default' : 'warn',
    },
    {
      label: 'Rollback Avoided',
      value: compactNumber.format(rollbackAvoided),
      helper: 'Generated patches you understood well enough to keep.',
      tone: rollbackAvoided > 0 ? 'good' : 'default',
    },
    {
      label: 'Files Survived',
      value: compactNumber.format(Math.max(0, stats.generatedFileCount)),
      helper: 'Changed files promoted through Karen.',
      tone: stats.generatedFileCount > 0 ? 'good' : 'default',
    },
  ];

  return (
    <article className={cn('overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm', className)}>
      <div className="border-b border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="typography-ui-label text-muted-foreground">Proof-of-Work Developer Profile</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">@{profile.user.username}</h2>
            <p className="mt-1 typography-body text-muted-foreground">
              {stats.level} · {stats.totalSessions} judged session{stats.totalSessions === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background px-3 py-2 text-right">
            <div className="typography-micro text-muted-foreground">Discipline</div>
            <div className="text-2xl font-semibold tracking-normal text-foreground">{stats.disciplineScore}/100</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <ProofMetricTile key={metric.label} metric={metric} />
        ))}
      </div>

      <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.75fr)]">
        <div>
          <div className="typography-ui-label text-muted-foreground">Badges</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge.id}
                className={cn(
                  'rounded-sm border px-2.5 py-1 typography-micro font-medium',
                  badge.tone === 'good'
                    ? 'border-[var(--status-success)]/30 bg-[var(--status-success)]/10 text-[var(--status-success)]'
                    : 'border-[var(--status-error)]/30 bg-[var(--status-error)]/10 text-[var(--status-error)]',
                )}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-dashed border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="typography-ui-label text-muted-foreground">Public Proof URL</div>
              <div className="mt-1 break-all font-mono text-sm text-foreground">{proofUrl}</div>
            </div>
            <span className="shrink-0 rounded-sm bg-muted px-2 py-1 typography-micro text-muted-foreground">mock</span>
          </div>
          <p className="mt-3 typography-micro text-muted-foreground">
            Shareable proof placeholder for prompt quality, quiz comprehension, and patches Karen allowed to survive.
          </p>
        </div>
      </div>
    </article>
  );
};

export default ProofProfileCard;
