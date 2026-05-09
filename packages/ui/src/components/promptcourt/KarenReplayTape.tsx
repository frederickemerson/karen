import React from 'react';
import { cn } from '@/lib/utils';
import { KarenLogo } from './KarenLogo';

export type KarenReplayStepStatus = 'complete' | 'active' | 'pending' | 'failed';

export type KarenReplayStep = {
  id: string;
  label: string;
  description: string;
  detail: string;
  timestamp: string;
  status: KarenReplayStepStatus;
  metric?: string;
};

export type KarenReplayTapeProps = {
  className?: string;
  title?: string;
  subtitle?: string;
  outcome?: 'promoted' | 'deleted';
  steps?: KarenReplayStep[];
};

const baseSteps = (outcome: 'promoted' | 'deleted'): KarenReplayStep[] => [
  {
    id: 'prompt-submitted',
    label: 'Prompt submitted',
    description: 'Karen received a scoped request and checked it before execution.',
    detail: 'Scoped to the active repo with a prompt score attached.',
    timestamp: '00:00',
    status: 'complete',
    metric: '81/100',
  },
  {
    id: 'verdict',
    label: 'Verdict',
    description: 'Karen checked specificity, constraints, files, and test intent.',
    detail: 'Approved for sandbox execution only. The real repo stays untouched.',
    timestamp: '00:07',
    status: 'complete',
    metric: 'approved',
  },
  {
    id: 'sandbox-run',
    label: 'Sandbox run',
    description: 'The coding agent executed inside an isolated worktree.',
    detail: 'Model, tools, and file changes stay inside the run cage.',
    timestamp: '00:34',
    status: 'complete',
    metric: 'isolated',
  },
  {
    id: 'diff-generated',
    label: 'Diff generated',
    description: 'Karen found the patch and summarized the blast radius.',
    detail: '3 files changed, 84 additions, 19 deletions.',
    timestamp: '01:18',
    status: 'complete',
    metric: '3 files',
  },
  {
    id: 'quiz-answered',
    label: 'Quiz answered',
    description: 'User proved they read the code before keeping it.',
    detail: outcome === 'promoted'
      ? 'Quiz passed with file, symbol, and behavior questions answered.'
      : 'Quiz failed. Karen switched into lesson mode.',
    timestamp: '01:43',
    status: outcome === 'promoted' ? 'complete' : 'failed',
    metric: outcome === 'promoted' ? 'passed' : 'failed',
  },
  {
    id: 'patch-finalized',
    label: outcome === 'promoted' ? 'Patch promoted' : 'Patch deleted',
    description: outcome === 'promoted'
      ? 'The sandbox patch was applied back to the real repo.'
      : 'The sandbox worktree was discarded and the repo stayed clean.',
    detail: outcome === 'promoted'
      ? 'Ready for normal review, test, and commit flow.'
      : 'Replay retained the lesson, not the bad code.',
    timestamp: '01:55',
    status: outcome === 'promoted' ? 'complete' : 'failed',
    metric: outcome === 'promoted' ? 'kept' : 'reset',
  },
];

const statusClasses: Record<KarenReplayStepStatus, string> = {
  complete: 'border-[var(--status-success)]/35 bg-[var(--status-success)]/10 text-[var(--status-success)]',
  active: 'border-primary/35 bg-primary/10 text-primary',
  pending: 'border-border bg-muted/30 text-muted-foreground',
  failed: 'border-[var(--status-error)]/35 bg-[var(--status-error)]/10 text-[var(--status-error)]',
};

const statusDotClasses: Record<KarenReplayStepStatus, string> = {
  complete: 'border-[var(--status-success)] bg-[var(--status-success)]',
  active: 'border-primary bg-primary',
  pending: 'border-border bg-background',
  failed: 'border-[var(--status-error)] bg-[var(--status-error)]',
};

const speedOptions = ['0.5x', '1x', '1.5x', '2x'];

const StepBadge = ({ status }: { status: KarenReplayStepStatus }) => (
  <span className={cn('rounded-sm border px-2 py-1 typography-micro font-medium', statusClasses[status])}>
    {status}
  </span>
);

const ReplayFrame = ({ index, active }: { index: number; active: boolean }) => (
  <div
    className={cn(
      'h-8 min-w-8 rounded-sm border',
      active ? 'border-primary bg-primary/20' : 'border-border bg-muted/30',
    )}
    aria-hidden="true"
  >
    <div className="grid h-full grid-cols-3 gap-0.5 p-1">
      {Array.from({ length: 6 }).map((_, cellIndex) => (
        <span
          key={`${index}-${cellIndex}`}
          className={cn(
            'rounded-[1px]',
            (index + cellIndex) % 3 === 0 ? 'bg-foreground/50' : 'bg-foreground/15',
          )}
        />
      ))}
    </div>
  </div>
);

export const KarenReplayTape: React.FC<KarenReplayTapeProps> = ({
  className,
  title = 'Karen Replay Tape',
  subtitle = 'A replay of the guarded run, from prompt to patch outcome.',
  outcome = 'promoted',
  steps,
}) => {
  const replaySteps = React.useMemo(() => steps ?? baseSteps(outcome), [outcome, steps]);
  const firstActiveIndex = replaySteps.findIndex((step) => step.status === 'active' || step.status === 'failed');
  const initialIndex = firstActiveIndex >= 0 ? firstActiveIndex : replaySteps.length - 1;
  const [selectedIndex, setSelectedIndex] = React.useState(initialIndex);
  const [recording, setRecording] = React.useState(false);
  const [speed, setSpeed] = React.useState('1x');
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = React.useState<string | null>(null);
  const selectedStep = replaySteps[Math.min(selectedIndex, replaySteps.length - 1)];
  const progress = replaySteps.length > 1 ? (selectedIndex / (replaySteps.length - 1)) * 100 : 100;

  const exportReplay = async (format: 'mp4' | 'json') => {
    setExportingFormat(format);
    setExportStatus(`Preparing ${format.toUpperCase()} export...`);
    try {
      const response = await fetch('/api/promptcourt/replay/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          format,
          title,
          subtitle,
          outcome,
          steps: replaySteps,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Replay export failed');
      }
      const filename = payload.export?.artifact?.filename || 'replay manifest';
      setExportStatus(
        payload.export?.fallback
          ? `MP4 renderer not installed yet. Remotion manifest exported: ${filename}`
          : `${format.toUpperCase()} export ready: ${filename}`,
      );
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Replay export failed');
    } finally {
      setExportingFormat(null);
      window.setTimeout(() => setExportStatus(null), 5000);
    }
  };

  return (
    <section className={cn('overflow-hidden rounded-md border border-border bg-card p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <KarenLogo className="size-14 shrink-0" mood={outcome === 'deleted' ? 'mad' : 'calm'} />
          <div className="min-w-0">
            <div className="typography-ui-label text-muted-foreground">Replay desk</div>
            <h2 className="mt-1 text-xl font-semibold tracking-normal text-foreground">{title}</h2>
            <p className="mt-1 max-w-2xl typography-body text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRecording((value) => !value)}
            className={cn(
              'rounded-md border px-3 py-2 typography-ui-label',
              recording
                ? 'border-[var(--status-error)]/40 bg-[var(--status-error)]/10 text-[var(--status-error)]'
                : 'border-border bg-background text-foreground hover:bg-muted/45',
            )}
          >
            {recording ? 'Stop recording' : 'Record replay'}
          </button>
          <button
            type="button"
            onClick={() => exportReplay('mp4')}
            disabled={exportingFormat !== null}
            className="rounded-md border border-border bg-background px-3 py-2 typography-ui-label text-foreground hover:bg-muted/45"
          >
            {exportingFormat === 'mp4' ? 'Exporting...' : 'Export MP4'}
          </button>
          <button
            type="button"
            onClick={() => exportReplay('json')}
            disabled={exportingFormat !== null}
            className="rounded-md border border-border bg-background px-3 py-2 typography-ui-label text-foreground hover:bg-muted/45"
          >
            {exportingFormat === 'json' ? 'Exporting...' : 'Export JSON'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 rounded-md border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="typography-ui-label text-foreground">Tape controls</div>
              <div className="mt-1 typography-micro text-muted-foreground">
                Server export returns a replay contract now; MP4 rendering can plug into that contract next.
              </div>
            </div>
            <div className="flex shrink-0 rounded-md border border-border bg-card p-1">
              {speedOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSpeed(option)}
                  className={cn(
                    'rounded-sm px-2 py-1 typography-micro',
                    speed === option ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/45',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 max-w-full overflow-x-auto pb-2">
            <div className="flex min-w-[560px] gap-2">
              {replaySteps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className="group flex flex-1 flex-col items-stretch gap-2 text-left"
                >
                  <ReplayFrame index={index} active={index <= selectedIndex} />
                  <div className="relative h-2 rounded-full bg-muted">
                    <div
                      className={cn(
                        'absolute left-0 top-0 h-2 rounded-full',
                        step.status === 'failed' ? 'bg-[var(--status-error)]' : 'bg-primary',
                      )}
                      style={{ width: index <= selectedIndex ? '100%' : '0%' }}
                    />
                  </div>
                  <div className="typography-micro text-muted-foreground group-hover:text-foreground">{step.timestamp}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="typography-micro text-muted-foreground" htmlFor="karen-replay-scrubber">
              Scrub replay
            </label>
            <input
              id="karen-replay-scrubber"
              type="range"
              min={0}
              max={Math.max(0, replaySteps.length - 1)}
              value={selectedIndex}
              onChange={(event) => setSelectedIndex(Number(event.target.value))}
              className="mt-2 w-full accent-primary"
            />
            <div className="mt-2 h-1.5 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <aside className="rounded-md border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="typography-micro text-muted-foreground">{selectedStep.timestamp}</div>
              <h3 className="mt-1 typography-title text-foreground">{selectedStep.label}</h3>
            </div>
            <StepBadge status={selectedStep.status} />
          </div>
          <p className="mt-3 typography-body text-muted-foreground">{selectedStep.description}</p>
          <div className="mt-4 rounded-md border border-border bg-card p-3">
            <div className="typography-micro text-muted-foreground">Replay note</div>
            <p className="mt-1 typography-body text-foreground">{selectedStep.detail}</p>
          </div>
          {selectedStep.metric ? (
            <div className="mt-3 rounded-md border border-border bg-card p-3">
              <div className="typography-micro text-muted-foreground">Metric</div>
              <div className="mt-1 typography-title text-foreground">{selectedStep.metric}</div>
            </div>
          ) : null}
          {exportStatus ? (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 p-3 typography-micro text-primary">
              {exportStatus}
            </div>
          ) : null}
        </aside>
      </div>

      <ol className="mt-5 grid gap-3">
        {replaySteps.map((step, index) => (
          <li key={step.id} className="grid grid-cols-[28px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={cn('mt-1 size-4 rounded-full border-2', statusDotClasses[step.status])}
                aria-label={`Show replay step ${step.label}`}
              />
              {index < replaySteps.length - 1 ? <div className="mt-2 h-full min-h-8 w-px bg-border" /> : null}
            </div>
            <button
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={cn(
                'rounded-md border p-3 text-left transition-colors',
                index === selectedIndex ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/35',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="typography-ui-label font-semibold text-foreground">{step.label}</div>
                <div className="typography-micro text-muted-foreground">{step.timestamp}</div>
              </div>
              <p className="mt-1 typography-body text-muted-foreground">{step.description}</p>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default KarenReplayTape;
