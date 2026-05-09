import React from 'react';
import {
  RiCloseLine,
  RiMusic2Line,
  RiVolumeMuteLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type QuizQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
};

type CodeReadQuizModalProps = {
  open: boolean;
  files: string[];
  commitMessage: string;
  diffText: string;
  loadingDiff: boolean;
  diffError: string | null;
  onClose: () => void;
  onPassed: () => void;
};

const colorClasses = [
  'bg-red-500 hover:bg-red-500/90 text-white',
  'bg-blue-500 hover:bg-blue-500/90 text-white',
  'bg-yellow-500 hover:bg-yellow-500/90 text-black',
  'bg-green-500 hover:bg-green-500/90 text-white',
];

const uniqueOptions = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.slice(0, 4);
};

const countDiffLines = (diffText: string) => {
  let additions = 0;
  let deletions = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
};

const buildQuestions = (files: string[], commitMessage: string, diffText: string): QuizQuestion[] => {
  const fileCount = files.length;
  const firstFile = files[0] ?? 'No files selected';
  const { additions, deletions } = countDiffLines(diffText);
  const changeShape = additions > deletions
    ? 'More added lines than deleted lines'
    : deletions > additions
      ? 'More deleted lines than added lines'
      : 'Additions and deletions are balanced';

  return [
    {
      prompt: fileCount === 1 ? 'Which file are you about to commit?' : 'How many files are you about to commit?',
      options: fileCount === 1
        ? uniqueOptions([firstFile, 'README.md', 'package.json', 'No files'])
        : uniqueOptions([String(fileCount), String(Math.max(0, fileCount - 1)), String(fileCount + 1), '0']),
      correctIndex: 0,
    },
    {
      prompt: 'What did you claim in the commit message?',
      options: uniqueOptions([
        commitMessage.trim(),
        'A vague cleanup with no concrete behavior',
        'A dependency update only',
        'No commit message was written',
      ]),
      correctIndex: 0,
    },
    {
      prompt: 'What does the selected diff look like?',
      options: uniqueOptions([
        changeShape,
        additions > deletions ? 'More deleted lines than added lines' : 'More added lines than deleted lines',
        'No file changes are present',
        'Only binary files changed',
      ]),
      correctIndex: 0,
    },
    {
      prompt: 'What are you confirming before Git gets the commit?',
      options: [
        'I read the selected code diff myself',
        'The agent probably got it right',
        'The commit title sounds nice',
        'I only checked the file count',
      ],
      correctIndex: 0,
    },
  ];
};

const useKahootLoop = (enabled: boolean) => {
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const AudioCtor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return undefined;

    const context = new AudioCtor();
    const gain = context.createGain();
    gain.gain.value = 0.025;
    gain.connect(context.destination);

    let index = 0;
    const notes = [392, 523.25, 659.25, 523.25, 440, 587.33, 698.46, 587.33];
    const tick = () => {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = notes[index % notes.length];
      oscillator.connect(gain);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.11);
      index += 1;
    };

    void context.resume().then(tick).catch(() => {});
    const interval = window.setInterval(tick, 260);

    return () => {
      window.clearInterval(interval);
      void context.close().catch(() => {});
    };
  }, [enabled]);
};

export const CodeReadQuizModal: React.FC<CodeReadQuizModalProps> = ({
  open,
  files,
  commitMessage,
  diffText,
  loadingDiff,
  diffError,
  onClose,
  onPassed,
}) => {
  const [started, setStarted] = React.useState(false);
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [wrongAnswer, setWrongAnswer] = React.useState(false);
  const [musicEnabled, setMusicEnabled] = React.useState(true);
  const questions = React.useMemo(() => buildQuestions(files, commitMessage, diffText), [commitMessage, diffText, files]);
  const question = questions[questionIndex];

  useKahootLoop(open && started && musicEnabled && !wrongAnswer);

  React.useEffect(() => {
    if (!open) {
      setStarted(false);
      setQuestionIndex(0);
      setSelected(null);
      setWrongAnswer(false);
    }
  }, [open]);

  if (!open) return null;

  const handleAnswer = (index: number) => {
    if (!question || selected !== null) return;
    setSelected(index);
    window.setTimeout(() => {
      if (index !== question.correctIndex) {
        setWrongAnswer(true);
        return;
      }
      if (questionIndex === questions.length - 1) {
        onPassed();
        return;
      }
      setQuestionIndex((value) => value + 1);
      setSelected(null);
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-background text-foreground">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="typography-micro font-semibold uppercase text-primary">Karen commit trial</div>
            <h1 className="text-2xl font-semibold tracking-normal">I read my code</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setMusicEnabled((value) => !value)}>
              {musicEnabled ? <RiMusic2Line className="size-4" /> : <RiVolumeMuteLine className="size-4" />}
              Music
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close code read quiz">
              <RiCloseLine className="size-4" />
            </Button>
          </div>
        </header>

        {wrongAnswer ? (
          <div className="flex flex-1 items-center justify-center bg-[var(--status-error)]/10 p-6 text-center">
            <div className="max-w-xl rounded-md border border-[var(--status-error)]/30 bg-card p-8">
              <RiErrorWarningLine className="mx-auto size-10 text-[var(--status-error)]" />
              <h2 className="mt-4 text-3xl font-semibold tracking-normal text-foreground">Thrown out</h2>
              <p className="mt-2 typography-body text-muted-foreground">
                You missed the code-read check. Read the selected diff again before trying to commit.
              </p>
              <div className="mt-6 flex justify-center gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setWrongAnswer(false);
                    setStarted(false);
                    setQuestionIndex(0);
                    setSelected(null);
                  }}
                >
                  Read again
                </Button>
                <Button type="button" variant="outline" onClick={onClose}>Exit</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <section className="flex min-h-0 flex-col border-r border-border">
              <div className="border-b border-border px-4 py-3">
                <div className="typography-ui-label font-semibold text-foreground">Selected code</div>
                <div className="mt-1 typography-micro text-muted-foreground">
                  {files.length} file{files.length === 1 ? '' : 's'} selected
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-black p-4">
                {loadingDiff ? (
                  <div className="typography-body text-white/70">Loading the code you are about to commit...</div>
                ) : diffError ? (
                  <div className="typography-body text-red-300">{diffError}</div>
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-white">
                    {diffText || 'No diff text was available.'}
                  </pre>
                )}
              </div>
            </section>

            <section className="flex min-h-0 flex-col bg-muted/20 p-4">
              {!started ? (
                <div className="m-auto max-w-md text-center">
                  <div className="typography-micro font-semibold uppercase text-primary">Kahoot mode</div>
                  <h2 className="mt-2 text-4xl font-semibold tracking-normal text-foreground">Prove you read it</h2>
                  <p className="mt-3 typography-body text-muted-foreground">
                    The commit button is not a vibe check. Read the diff, answer the round, then Git gets the commit.
                  </p>
                  <Button
                    type="button"
                    className="mt-6"
                    disabled={loadingDiff}
                    onClick={() => setStarted(true)}
                  >
                    Start quiz
                  </Button>
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <span className="typography-ui-label text-muted-foreground">
                      Question {questionIndex + 1} of {questions.length}
                    </span>
                    <span className="rounded-sm bg-primary/15 px-2 py-1 typography-micro font-semibold text-primary">
                      Commit locked
                    </span>
                  </div>
                  <h2 className="mt-6 text-3xl font-semibold tracking-normal text-foreground">{question.prompt}</h2>
                  <div className="mt-6 grid flex-1 auto-rows-fr gap-3">
                    {question.options.map((option, index) => {
                      const isSelected = selected === index;
                      const isCorrect = index === question.correctIndex;
                      return (
                        <button
                          key={`${question.prompt}-${option}`}
                          type="button"
                          onClick={() => handleAnswer(index)}
                          disabled={selected !== null}
                          className={cn(
                            'min-h-24 rounded-md px-4 py-3 text-left text-lg font-semibold tracking-normal transition-transform active:scale-[0.99]',
                            colorClasses[index % colorClasses.length],
                            isSelected && isCorrect && 'ring-4 ring-white',
                            isSelected && !isCorrect && 'opacity-60 grayscale',
                          )}
                        >
                          <span className="flex items-center justify-between gap-3">
                            {option}
                            {isSelected && isCorrect ? <RiCheckboxCircleLine className="size-6" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
