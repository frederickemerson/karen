import React from 'react';
import {
  RiCloseLine,
  RiMusic2Line,
  RiVolumeMuteLine,
  RiVolumeUpLine,
  RiCheckboxCircleFill,
  RiCloseCircleFill,
  RiTriangleFill,
  RiSquareFill,
  RiRecordCircleFill,
  RiRhythmLine,
  RiTrophyLine,
  RiSkullLine,
  RiSparklingLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  playKarenEventAudio,
  speakKarenElevenLabsPreview,
  cancelKarenVoicePreview,
  readStoredKarenVoiceSettings,
} from '@/lib/karenVoice';

export type KarenQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  evidence?: string;
  why?: string;
  source?: string;
};

export type KarenQuiz = {
  id: string;
  title: string;
  instructions: string;
  source: string;
  questions: KarenQuizQuestion[];
};

export type KarenQuizRun = {
  id: string;
  prompt?: string;
  promptExcerpt?: string;
  promptScore?: number | null;
  diff?: string | null;
  diffSource?: string | null;
  diffNote?: string | null;
  changedFiles?: string[];
  quiz: KarenQuiz;
};

export type KarenQuizModalProps = {
  open: boolean;
  run: KarenQuizRun | null;
  onClose: () => void;
  onPassed?: (run: KarenQuizRun) => void;
  onFailed?: (run: KarenQuizRun, wrongQuestion: KarenQuizQuestion) => void;
};

type AnswerState = {
  selected: number | null;
  correct: boolean | null;
  serverAnswer: number | null;
  explanation: string | null;
  inFlight: boolean;
  error: string | null;
};

const TILE_DEFINITIONS = [
  {
    bg: 'bg-rose-600 hover:bg-rose-500',
    text: 'text-white',
    accent: 'border-rose-300/50',
    icon: RiTriangleFill,
    label: 'Triangle',
  },
  {
    bg: 'bg-sky-600 hover:bg-sky-500',
    text: 'text-white',
    accent: 'border-sky-300/50',
    icon: RiRhythmLine,
    label: 'Diamond',
  },
  {
    bg: 'bg-amber-500 hover:bg-amber-400',
    text: 'text-black',
    accent: 'border-amber-200/60',
    icon: RiRecordCircleFill,
    label: 'Circle',
  },
  {
    bg: 'bg-emerald-600 hover:bg-emerald-500',
    text: 'text-white',
    accent: 'border-emerald-300/50',
    icon: RiSquareFill,
    label: 'Square',
  },
] as const;

const useKahootMusic = (enabled: boolean) => {
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const AudioCtor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return undefined;

    const context = new AudioCtor();
    const master = context.createGain();
    master.gain.value = 0.04;
    master.connect(context.destination);

    let index = 0;
    // Fast bouncy Kahoot-ish loop in C major.
    const notes = [392, 523.25, 659.25, 523.25, 440, 587.33, 698.46, 587.33, 392, 523.25, 783.99, 523.25];
    const tick = () => {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = notes[index % notes.length];
      const env = context.createGain();
      env.gain.setValueAtTime(0.0001, context.currentTime);
      env.gain.exponentialRampToValueAtTime(0.6, context.currentTime + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(env);
      env.connect(master);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      index += 1;
    };

    void context.resume().then(tick).catch(() => {});
    const interval = window.setInterval(tick, 240);

    return () => {
      window.clearInterval(interval);
      void context.close().catch(() => {});
    };
  }, [enabled]);
};

const submitGuiAnswer = async (
  runId: string,
  questionId: string,
  answerIndex: number,
): Promise<{ correct: boolean; answer: number; explanation: string | null }> => {
  const response = await fetch(`/api/promptcourt/gui-runs/${encodeURIComponent(runId)}/answer`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ questionId, answerIndex }),
  });
  const payload = await response.json().catch(() => ({})) as {
    ok?: boolean;
    correct?: boolean;
    answer?: number;
    explanation?: string;
    error?: string;
  };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Karen could not record the answer (${response.status}).`);
  }
  return {
    correct: payload.correct === true,
    answer: typeof payload.answer === 'number' ? payload.answer : 0,
    explanation: typeof payload.explanation === 'string' ? payload.explanation : null,
  };
};

const completeGuiQuiz = async (runId: string): Promise<void> => {
  const response = await fetch(`/api/promptcourt/gui-runs/${encodeURIComponent(runId)}/complete`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Karen could not finalize the quiz (${response.status}).`);
  }
};

const abandonGuiQuiz = async (runId: string, reason: string): Promise<void> => {
  await fetch(`/api/promptcourt/gui-runs/${encodeURIComponent(runId)}/abandon`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  }).catch(() => undefined);
};

const renderDiffLine = (text: string, key: number) => {
  if (text.startsWith('diff --git ') || text.startsWith('index ') || text.startsWith('--- ') || text.startsWith('+++ ')) {
    return <div key={key} className="text-zinc-400">{text}</div>;
  }
  if (text.startsWith('@@')) {
    return <div key={key} className="text-fuchsia-300">{text}</div>;
  }
  if (text.startsWith('+')) {
    return <div key={key} className="bg-emerald-900/30 text-emerald-200">{text}</div>;
  }
  if (text.startsWith('-')) {
    return <div key={key} className="bg-rose-900/30 text-rose-200">{text}</div>;
  }
  return <div key={key} className="text-zinc-200">{text}</div>;
};

const speakLine = async (text: string, enabled: boolean) => {
  if (!enabled || !text) return;
  try {
    const settings = readStoredKarenVoiceSettings();
    if (settings.provider === 'elevenlabs' && !settings.elevenLabsDemoMode) {
      await speakKarenElevenLabsPreview(text, settings);
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  } catch {
    // Voice failures are non-fatal; visual quiz keeps working.
  }
};

const stopSpeaking = () => {
  cancelKarenVoicePreview();
};

export const KarenQuizGameModal: React.FC<KarenQuizModalProps> = ({
  open,
  run,
  onClose,
  onPassed,
  onFailed,
}) => {
  const [stage, setStage] = React.useState<'intro' | 'question' | 'wrong' | 'passed'>('intro');
  const [questionIndex, setQuestionIndex] = React.useState(0);
  const [answerState, setAnswerState] = React.useState<AnswerState>({
    selected: null,
    correct: null,
    serverAnswer: null,
    explanation: null,
    inFlight: false,
    error: null,
  });
  const [musicEnabled, setMusicEnabled] = React.useState(true);
  const [voiceEnabled, setVoiceEnabled] = React.useState(true);
  const [wrongQuestion, setWrongQuestion] = React.useState<KarenQuizQuestion | null>(null);

  const questions = run?.quiz.questions ?? [];
  const totalQuestions = questions.length;
  const question = questions[questionIndex] ?? null;
  const musicActive = open && musicEnabled && stage === 'question';
  useKahootMusic(musicActive);

  const resetState = React.useCallback(() => {
    setStage('intro');
    setQuestionIndex(0);
    setWrongQuestion(null);
    setAnswerState({
      selected: null,
      correct: null,
      serverAnswer: null,
      explanation: null,
      inFlight: false,
      error: null,
    });
  }, []);

  React.useEffect(() => {
    if (!open) {
      stopSpeaking();
      resetState();
    }
  }, [open, resetState]);

  React.useEffect(() => {
    if (!open || stage !== 'question' || !question) return;
    void speakLine(`Question ${questionIndex + 1}. ${question.prompt}`, voiceEnabled);
    return () => {
      stopSpeaking();
    };
  }, [open, stage, question, questionIndex, voiceEnabled]);

  const handleStart = React.useCallback(() => {
    setStage('question');
    setQuestionIndex(0);
    setAnswerState({
      selected: null,
      correct: null,
      serverAnswer: null,
      explanation: null,
      inFlight: false,
      error: null,
    });
    void speakLine('Karen says: prove you read it.', voiceEnabled);
  }, [voiceEnabled]);

  const handleClose = React.useCallback(() => {
    if (run && stage === 'question') {
      void abandonGuiQuiz(run.id, 'closed_during_quiz');
    }
    stopSpeaking();
    onClose();
  }, [onClose, run, stage]);

  const handleAnswer = React.useCallback(async (index: number) => {
    if (!run || !question) return;
    if (answerState.selected !== null || answerState.inFlight) return;
    setAnswerState((current) => ({ ...current, selected: index, inFlight: true, error: null }));

    try {
      const result = await submitGuiAnswer(run.id, question.id, index);
      setAnswerState({
        selected: index,
        correct: result.correct,
        serverAnswer: result.answer,
        explanation: result.explanation,
        inFlight: false,
        error: null,
      });

      if (!result.correct) {
        setWrongQuestion(question);
        setStage('wrong');
        void playKarenEventAudio('quiz-fail');
        if (onFailed) onFailed(run, question);
        return;
      }

      void playKarenEventAudio('quiz-pass', { voice: false });

      window.setTimeout(() => {
        if (questionIndex >= totalQuestions - 1) {
          setStage('passed');
          void completeGuiQuiz(run.id).catch(() => undefined);
          void playKarenEventAudio('quiz-pass');
          if (onPassed) onPassed(run);
          return;
        }
        setQuestionIndex((value) => value + 1);
        setAnswerState({
          selected: null,
          correct: null,
          serverAnswer: null,
          explanation: null,
          inFlight: false,
          error: null,
        });
      }, 1300);
    } catch (error) {
      setAnswerState({
        selected: null,
        correct: null,
        serverAnswer: null,
        explanation: null,
        inFlight: false,
        error: error instanceof Error ? error.message : 'Karen could not record that answer.',
      });
    }
  }, [answerState.inFlight, answerState.selected, onFailed, onPassed, question, questionIndex, run, totalQuestions]);

  if (!open || !run || !run.quiz) return null;

  const diffLines = run.diff ? run.diff.split('\n') : [];

  return (
    <div className="fixed inset-0 z-[1100] bg-zinc-950 text-zinc-100">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-gradient-to-r from-violet-700 via-fuchsia-700 to-rose-600 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="rounded-sm bg-black/30 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white">
              Karen Court
            </div>
            <div>
              <div className="font-semibold tracking-tight text-white">{run.quiz.title}</div>
              <div className="font-mono text-xs text-white/80">
                {totalQuestions} questions • source {run.quiz.source}
                {run.diffSource ? ` • diff ${run.diffSource}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stage === 'question' ? (
              <span className="rounded-sm bg-black/30 px-2 py-1 font-mono text-xs text-white">
                Q {Math.min(questionIndex + 1, totalQuestions)}/{totalQuestions}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/30 bg-black/20 text-white hover:bg-black/40"
              onClick={() => setMusicEnabled((value) => !value)}
              aria-pressed={musicEnabled}
            >
              {musicEnabled ? <RiMusic2Line className="size-4" /> : <RiVolumeMuteLine className="size-4" />}
              <span className="ml-1 hidden sm:inline">Music</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/30 bg-black/20 text-white hover:bg-black/40"
              onClick={() => {
                setVoiceEnabled((value) => {
                  if (value) stopSpeaking();
                  return !value;
                });
              }}
              aria-pressed={voiceEnabled}
            >
              {voiceEnabled ? <RiVolumeUpLine className="size-4" /> : <RiVolumeMuteLine className="size-4" />}
              <span className="ml-1 hidden sm:inline">Voice</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white hover:bg-black/30"
              onClick={handleClose}
              aria-label="Close Karen quiz"
            >
              <RiCloseLine className="size-5" />
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(360px,0.92fr)_minmax(0,1.08fr)]">
          <section className="flex min-h-0 flex-col border-b border-zinc-800 lg:border-b-0 lg:border-r">
            <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">Generated diff</div>
              <div className="mt-1 font-semibold text-zinc-50">
                {run.changedFiles && run.changedFiles.length > 0
                  ? `${run.changedFiles.length} file${run.changedFiles.length === 1 ? '' : 's'} • read carefully`
                  : 'Read carefully before answering'}
              </div>
              {run.diffNote ? (
                <div className="mt-1 font-mono text-[11px] text-amber-300/80">Note: {run.diffNote}</div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-black px-3 py-3 font-mono text-[12px] leading-5">
              {diffLines.length > 0
                ? diffLines.map((diffLine, index) => renderDiffLine(diffLine, index))
                : <div className="text-zinc-500">Karen did not return a diff for this run.</div>}
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-4">
            {stage === 'intro' ? (
              <IntroPanel
                run={run}
                onStart={handleStart}
                voiceEnabled={voiceEnabled}
              />
            ) : null}

            {stage === 'question' && question ? (
              <QuestionPanel
                question={question}
                questionIndex={questionIndex}
                totalQuestions={totalQuestions}
                answerState={answerState}
                onAnswer={handleAnswer}
              />
            ) : null}

            {stage === 'wrong' && wrongQuestion ? (
              <WrongPanel
                question={wrongQuestion}
                serverAnswer={answerState.serverAnswer}
                explanation={answerState.explanation}
                onClose={handleClose}
              />
            ) : null}

            {stage === 'passed' ? (
              <PassedPanel run={run} onClose={handleClose} />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
};

const IntroPanel: React.FC<{
  run: KarenQuizRun;
  onStart: () => void;
  voiceEnabled: boolean;
}> = ({ run, onStart, voiceEnabled }) => {
  React.useEffect(() => {
    void speakLine(
      `Welcome to Karen Court. ${run.quiz.instructions}`,
      voiceEnabled,
    );
    return () => {
      stopSpeaking();
    };
  }, [run.quiz.instructions, voiceEnabled]);

  return (
    <div className="m-auto max-w-xl text-center">
      <div className="inline-flex items-center gap-2 rounded-sm bg-fuchsia-500/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-fuchsia-200">
        <RiSparklingLine className="size-3.5" />
        Read-before-promote
      </div>
      <h1 className="mt-5 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
        {run.quiz.title}
      </h1>
      <p className="mt-4 text-lg leading-7 text-zinc-300">
        {run.quiz.instructions}
      </p>
      <div className="mt-6 grid gap-2 text-left font-mono text-xs text-zinc-400">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <span className="text-zinc-500">Prompt:</span> {run.promptExcerpt || run.prompt || 'No prompt captured.'}
        </div>
        {run.changedFiles && run.changedFiles.length > 0 ? (
          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <span className="text-zinc-500">Files in scope:</span> {run.changedFiles.join(', ')}
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        size="lg"
        className="mt-8 bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/40 hover:bg-fuchsia-500"
        onClick={onStart}
      >
        Start quiz
      </Button>
      <div className="mt-4 font-mono text-[11px] text-zinc-500">
        One miss and Karen rolls the patch back.
      </div>
    </div>
  );
};

const QuestionPanel: React.FC<{
  question: KarenQuizQuestion;
  questionIndex: number;
  totalQuestions: number;
  answerState: AnswerState;
  onAnswer: (index: number) => void;
}> = ({ question, questionIndex, totalQuestions, answerState, onAnswer }) => {
  const locked = answerState.selected !== null || answerState.inFlight;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
        <span>Question {questionIndex + 1} / {totalQuestions}</span>
        <span>{question.source ? `source • ${question.source}` : ''}</span>
      </div>
      <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
        {question.prompt}
      </h2>
      {question.evidence ? (
        <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[11px] text-zinc-400">
          Evidence: {question.evidence}
        </div>
      ) : null}
      {answerState.error ? (
        <div className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {answerState.error}
        </div>
      ) : null}
      <div className="mt-6 grid flex-1 auto-rows-fr gap-3 sm:grid-cols-2">
        {question.options.map((option, index) => {
          const def = TILE_DEFINITIONS[index % TILE_DEFINITIONS.length];
          const isSelected = answerState.selected === index;
          const isCorrectChoice = answerState.serverAnswer === index;
          const reveal = answerState.serverAnswer !== null;
          const Icon = def.icon;

          return (
            <button
              key={`${question.id}-${index}`}
              type="button"
              onClick={() => onAnswer(index)}
              disabled={locked}
              className={cn(
                'group relative flex min-h-[120px] items-center gap-4 overflow-hidden rounded-xl border-2 px-5 py-4 text-left text-xl font-semibold tracking-tight transition-all',
                'shadow-lg shadow-black/40 active:scale-[0.99]',
                def.bg,
                def.text,
                def.accent,
                locked && !isSelected && !reveal && 'opacity-70',
                reveal && !isCorrectChoice && !isSelected && 'opacity-30 grayscale',
                reveal && isSelected && !isCorrectChoice && 'ring-4 ring-rose-200/80',
                reveal && isCorrectChoice && 'ring-4 ring-white scale-[1.02]',
              )}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-black/25">
                <Icon className="size-7" />
              </span>
              <span className="flex-1 break-words leading-snug">{option}</span>
              {reveal && isCorrectChoice ? (
                <RiCheckboxCircleFill className="size-7 text-white drop-shadow" />
              ) : null}
              {reveal && isSelected && !isCorrectChoice ? (
                <RiCloseCircleFill className="size-7 text-white drop-shadow" />
              ) : null}
            </button>
          );
        })}
      </div>
      {answerState.inFlight ? (
        <div className="mt-3 text-center font-mono text-xs text-zinc-400">Karen is checking your answer…</div>
      ) : null}
    </div>
  );
};

const WrongPanel: React.FC<{
  question: KarenQuizQuestion;
  serverAnswer: number | null;
  explanation: string | null;
  onClose: () => void;
}> = ({ question, serverAnswer, explanation, onClose }) => {
  const correctOption = serverAnswer != null ? question.options[serverAnswer] : null;
  return (
    <div className="m-auto flex max-w-xl flex-col items-center text-center">
      <RiSkullLine className="size-14 text-rose-300" />
      <h2 className="mt-4 text-5xl font-semibold tracking-tight text-rose-200">Thrown out</h2>
      <p className="mt-3 text-lg leading-7 text-zinc-200">
        Karen rolled the patch back. Read what changed before you defend it again.
      </p>
      <div className="mt-6 w-full rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-left font-mono text-sm text-rose-100">
        <div className="text-[11px] uppercase tracking-[0.18em] text-rose-300">Question</div>
        <div className="mt-1">{question.prompt}</div>
        {correctOption ? (
          <>
            <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-rose-300">Right answer</div>
            <div className="mt-1 text-emerald-200">{correctOption}</div>
          </>
        ) : null}
        {explanation || question.why ? (
          <>
            <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-rose-300">Why it matters</div>
            <div className="mt-1 text-zinc-200">{explanation || question.why}</div>
          </>
        ) : null}
      </div>
      <Button type="button" className="mt-6 bg-rose-600 hover:bg-rose-500" onClick={onClose}>
        Close
      </Button>
    </div>
  );
};

const PassedPanel: React.FC<{
  run: KarenQuizRun;
  onClose: () => void;
}> = ({ run, onClose }) => (
  <div className="m-auto flex max-w-xl flex-col items-center text-center">
    <div className="relative">
      <RiTrophyLine className="size-16 text-amber-300 drop-shadow-[0_0_24px_rgba(252,211,77,0.5)]" />
      <RiSparklingLine className="absolute -right-3 -top-3 size-6 text-fuchsia-300" />
    </div>
    <h2 className="mt-4 text-5xl font-semibold tracking-tight text-emerald-200">Patch promoted</h2>
    <p className="mt-3 text-lg leading-7 text-zinc-200">
      You explained every answer. Karen lets the patch live.
    </p>
    <div className="mt-6 grid w-full grid-cols-2 gap-3 text-left font-mono text-sm text-zinc-200">
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Quiz</div>
        <div className="mt-1">{run.quiz.questions.length} questions cleared</div>
      </div>
      <div className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Diff</div>
        <div className="mt-1">{run.changedFiles?.length ?? 0} files in scope</div>
      </div>
    </div>
    <Button type="button" className="mt-6 bg-emerald-600 hover:bg-emerald-500" onClick={onClose}>
      Done
    </Button>
  </div>
);
