import React from 'react';
import { RiAlertLine, RiArrowDownSLine, RiArrowRightSLine, RiFileLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Shape required by the diff review surface. Mirrors the GuiRun payload that
// PromptCourtPage receives — only the diff-related fields are needed here.
export type DiffReviewRun = {
  id: string;
  prompt?: string;
  promptExcerpt?: string;
  diff?: string | null;
  diffSource?: string | null;
  diffNote?: string | null;
  changedFiles?: string[];
};

export type DiffReviewPanelProps = {
  run: DiffReviewRun;
  onStartQuiz: () => void;
};

type FileHunk = {
  header: string;
  lines: string[];
};

type ParsedFile = {
  path: string;
  additions: number;
  deletions: number;
  hunks: FileHunk[];
};

const parseUnifiedDiff = (diff: string): ParsedFile[] => {
  if (!diff) return [];
  const lines = diff.split('\n');
  const files: ParsedFile[] = [];
  let current: ParsedFile | null = null;
  let currentHunk: FileHunk | null = null;

  const finalizeHunk = () => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk);
      currentHunk = null;
    }
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      finalizeHunk();
      if (current) files.push(current);
      // diff --git a/path b/path -- take the b/ side.
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const path = match ? match[2] : line.replace(/^diff --git /, '');
      current = { path, additions: 0, deletions: 0, hunks: [] };
      continue;
    }
    if (!current) {
      // Diff with no `diff --git` header (e.g., synthesized). Synthesize a file.
      current = { path: '(unknown)', additions: 0, deletions: 0, hunks: [] };
    }
    if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('index ')) {
      continue;
    }
    if (line.startsWith('@@')) {
      finalizeHunk();
      currentHunk = { header: line, lines: [] };
      continue;
    }
    if (currentHunk) {
      currentHunk.lines.push(line);
    }
    if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
  }
  finalizeHunk();
  if (current) files.push(current);

  // De-dup against changedFiles passed separately is done by caller.
  return files;
};

const renderDiffLine = (text: string, key: number) => {
  if (text.startsWith('@@')) {
    return (
      <div key={key} className="text-[var(--status-info)]">
        {text}
      </div>
    );
  }
  if (text.startsWith('+')) {
    return (
      <div key={key} className="bg-[var(--status-success)]/10 text-[var(--status-success)]">
        {text}
      </div>
    );
  }
  if (text.startsWith('-')) {
    return (
      <div key={key} className="bg-[var(--status-error)]/10 text-[var(--status-error)]">
        {text}
      </div>
    );
  }
  return (
    <div key={key} className="text-foreground">
      {text || ' '}
    </div>
  );
};

const FileRow: React.FC<{
  file: ParsedFile;
  expanded: boolean;
  onToggle: () => void;
}> = ({ file, expanded, onToggle }) => (
  <div className="border-b border-border last:border-b-0">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      aria-expanded={expanded}
    >
      {expanded ? (
        <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <RiArrowRightSLine className="size-4 shrink-0 text-muted-foreground" />
      )}
      <RiFileLine className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{file.path}</span>
      <span className="shrink-0 typography-micro font-medium text-[var(--status-success)]">+{file.additions}</span>
      <span className="shrink-0 typography-micro font-medium text-[var(--status-error)]">-{file.deletions}</span>
    </button>
    {expanded ? (
      <div className="border-t border-border bg-background/60">
        {file.hunks.length > 0 ? (
          file.hunks.map((hunk, hunkIndex) => (
            <div key={`${file.path}-hunk-${hunkIndex}`} className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-5">
              <div className="text-[var(--status-info)]">{hunk.header}</div>
              {hunk.lines.map((diffLine, lineIndex) => renderDiffLine(diffLine, lineIndex))}
            </div>
          ))
        ) : (
          <div className="px-3 py-2 typography-micro text-muted-foreground">No hunk text recorded.</div>
        )}
      </div>
    ) : null}
  </div>
);

export const DiffReviewPanel: React.FC<DiffReviewPanelProps> = ({ run, onStartQuiz }) => {
  const parsedFiles = React.useMemo(() => parseUnifiedDiff(run.diff ?? ''), [run.diff]);

  // Fold changedFiles that aren't in the parsed diff back in as zero-stat entries
  // so the list always lines up with the run's declared changed files.
  const files = React.useMemo<ParsedFile[]>(() => {
    if (!run.changedFiles || run.changedFiles.length === 0) return parsedFiles;
    const known = new Set(parsedFiles.map((file) => file.path));
    const extras: ParsedFile[] = run.changedFiles
      .filter((path) => !known.has(path))
      .map((path) => ({ path, additions: 0, deletions: 0, hunks: [] }));
    return [...parsedFiles, ...extras];
  }, [parsedFiles, run.changedFiles]);

  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => {
    // First file open by default; rest collapsed.
    if (files.length === 0) return {};
    return { [files[0].path]: true };
  });

  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <div className="grid gap-4">
      <header className="rounded-md border border-border bg-card p-4">
        <div className="typography-micro uppercase tracking-[0.18em] text-muted-foreground">
          Don't know what you changed?
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
          Karen wants you to read it first
        </h1>
        <p className="mt-2 typography-body text-muted-foreground">
          This patch is sitting in a sandbox. Skim every file — Karen quizzes you on the diff before anything
          touches the real repo.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="rounded-sm bg-muted px-2 py-1 typography-micro text-muted-foreground">
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
          <span className="rounded-sm bg-[var(--status-success)]/15 px-2 py-1 typography-micro font-medium text-[var(--status-success)]">
            +{totalAdditions}
          </span>
          <span className="rounded-sm bg-[var(--status-error)]/15 px-2 py-1 typography-micro font-medium text-[var(--status-error)]">
            -{totalDeletions}
          </span>
          {run.diffSource ? (
            <span className="rounded-sm bg-background px-2 py-1 typography-micro text-muted-foreground">
              diff source: {run.diffSource}
            </span>
          ) : null}
        </div>
        {run.diffNote ? (
          <div className="mt-3 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 px-3 py-2 typography-micro text-[var(--status-warning)]">
            Note: {run.diffNote}
          </div>
        ) : null}
      </header>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        {files.length > 0 ? (
          files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              expanded={Boolean(expanded[file.path])}
              onToggle={() => {
                setExpanded((current) => ({ ...current, [file.path]: !current[file.path] }));
              }}
            />
          ))
        ) : (
          <div className="p-4 typography-body text-muted-foreground">
            Karen did not return a diff for this run.
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-md border border-[var(--status-warning)]/40',
          'bg-[var(--status-warning)]/10 px-3 py-2',
        )}
      >
        <RiAlertLine className="size-4 shrink-0 text-[var(--status-warning)]" />
        <p className="min-w-0 flex-1 typography-micro text-[var(--status-warning)]">
          Karen will ask you 5 questions about this diff. Wrong = git reset --hard.
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="lg"
          onClick={onStartQuiz}
          className="bg-foreground text-background hover:opacity-90"
        >
          Take the read check →
        </Button>
      </div>
    </div>
  );
};

export default DiffReviewPanel;
