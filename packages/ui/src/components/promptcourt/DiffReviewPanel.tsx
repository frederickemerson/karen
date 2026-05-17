import React from 'react';
import { RiArrowRightLine, RiFileTextLine, RiAlertLine } from '@remixicon/react';
import type { KarenQuizRun } from './KarenQuizGameModal';
import { cn } from '@/lib/utils';

// Parses a unified diff blob into a per-file map of hunk lines. Done in the
// browser because the Karen run payload already ships the raw diff and we do
// not want to add a server call just to render it. Karen diff blobs are small.
type ParsedFile = {
  path: string;
  additions: number;
  deletions: number;
  lines: string[]; // raw lines including diff/index/@@/+/-/' ' headers
};

const parseDiff = (diff: string): ParsedFile[] => {
  if (!diff) return [];
  const files: ParsedFile[] = [];
  let current: ParsedFile | null = null;

  const flush = () => {
    if (current) files.push(current);
    current = null;
  };

  const lines = diff.split('\n');
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      // Path is typically `diff --git a/<path> b/<path>` — take the b/ path.
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      const path = match ? match[2] : line.slice('diff --git '.length).trim();
      current = { path, additions: 0, deletions: 0, lines: [line] };
      continue;
    }
    if (!current) {
      // Lines before the first diff --git (some patches start with --- / +++).
      // Treat them as a virtual entry so we never lose context.
      current = { path: '(preamble)', additions: 0, deletions: 0, lines: [] };
    }
    current.lines.push(line);
    if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
  }
  flush();
  return files;
};

const renderDiffLine = (text: string, key: number) => {
  if (text.startsWith('diff --git ') || text.startsWith('index ') || text.startsWith('--- ') || text.startsWith('+++ ')) {
    return <div key={key} className="text-muted-foreground">{text || ' '}</div>;
  }
  if (text.startsWith('@@')) {
    return <div key={key} className="text-[var(--status-info)]">{text}</div>;
  }
  if (text.startsWith('+')) {
    return <div key={key} className="bg-[var(--status-success)]/10 text-[var(--status-success)]">{text}</div>;
  }
  if (text.startsWith('-')) {
    return <div key={key} className="bg-[var(--status-error)]/10 text-[var(--status-error)]">{text}</div>;
  }
  return <div key={key} className="text-foreground/80">{text || ' '}</div>;
};

export type DiffReviewPanelProps = {
  run: KarenQuizRun | null;
  onStartQuiz: () => void;
};

// Frame 7 + frame 11 of the launch video: "Don't know what you changed?"
// diff-review screen rendered inside the PromptCourt panel BEFORE the quiz
// fires. The user reads the diff, then clicks "Take the read check →".
export const DiffReviewPanel: React.FC<DiffReviewPanelProps> = ({ run, onStartQuiz }) => {
  const files = React.useMemo(() => parseDiff(run?.diff ?? ''), [run?.diff]);
  const [activePath, setActivePath] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Reset selection when the run changes.
    setActivePath(files[0]?.path ?? null);
  }, [files]);

  const activeFile = files.find((file) => file.path === activePath) ?? files[0] ?? null;
  const questionCount = run?.quiz?.questions.length ?? 0;

  if (!run) {
    return null;
  }

  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="typography-ui-label text-muted-foreground">Don't know what you changed?</div>
          <h2 className="mt-1 text-xl font-semibold tracking-normal text-foreground">
            Review the diff before you defend it
          </h2>
          <p className="mt-1 typography-micro text-muted-foreground">
            Karen will ask you {questionCount || 'a few'} question{questionCount === 1 ? '' : 's'} about this diff.
            One miss and the sandbox gets reset. The real repo stays clean.
          </p>
        </div>
        {run.promptScore !== null && run.promptScore !== undefined ? (
          <span className="rounded-sm bg-muted px-2 py-1 typography-micro font-medium text-foreground">
            verdict {run.promptScore}/100
          </span>
        ) : null}
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(220px,0.28fr)_minmax(0,0.72fr)]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="px-4 py-3 typography-micro uppercase tracking-[0.18em] text-muted-foreground">
            Files in scope ({files.length})
          </div>
          <ul className="max-h-72 overflow-auto lg:max-h-[420px]">
            {files.length > 0 ? files.map((file) => {
              const isActive = activeFile?.path === file.path;
              return (
                <li key={file.path}>
                  <button
                    type="button"
                    onClick={() => setActivePath(file.path)}
                    className={cn(
                      'flex w-full items-start gap-2 px-4 py-2 text-left typography-micro hover:bg-muted/50',
                      isActive ? 'bg-muted/60 text-foreground' : 'text-foreground/80',
                    )}
                    aria-pressed={isActive}
                  >
                    <RiFileTextLine className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 break-words font-mono">{file.path}</span>
                    <span className="shrink-0 font-mono text-[10px]">
                      <span className="text-[var(--status-success)]">+{file.additions}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-[var(--status-error)]">-{file.deletions}</span>
                    </span>
                  </button>
                </li>
              );
            }) : (
              <li className="px-4 py-3 typography-micro text-muted-foreground">
                Karen did not return a diff for this run.
              </li>
            )}
          </ul>
        </aside>

        <div className="min-h-[280px] overflow-hidden">
          <div className="border-b border-border bg-background/60 px-4 py-2 typography-micro text-muted-foreground">
            {activeFile ? <span className="font-mono">{activeFile.path}</span> : 'No file selected'}
          </div>
          <pre className="max-h-72 overflow-auto bg-background/40 px-3 py-3 font-mono text-[12px] leading-5 lg:max-h-[420px]">
            {activeFile && activeFile.lines.length > 0
              ? activeFile.lines.map((line, index) => renderDiffLine(line, index))
              : <div className="text-muted-foreground">No diff lines for this file.</div>}
          </pre>
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 typography-micro text-foreground">
          <RiAlertLine className="mt-0.5 size-4 text-amber-500" />
          <span>
            Karen will ask you {questionCount || 'a few'} question{questionCount === 1 ? '' : 's'} about this diff.
            Wrong = <code className="font-mono">git reset --hard</code>.
          </span>
        </div>
        <button
          type="button"
          onClick={onStartQuiz}
          disabled={questionCount === 0}
          className={cn(
            'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 typography-ui-label font-semibold text-primary-foreground',
            'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          Take the read check
          <RiArrowRightLine className="size-4" />
        </button>
      </footer>
    </section>
  );
};

export default DiffReviewPanel;
