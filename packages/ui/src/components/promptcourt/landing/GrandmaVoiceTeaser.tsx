import React from 'react';
import { RiPlayLine, RiStopLine, RiVolumeUpLine, RiSettings3Line } from '@remixicon/react';

const ROAST_LINES = [
  '"Oh sweetie, you didn\'t even read the file you changed."',
  '"You called this a fix? In my day a fix had at least one test."',
  '"That prompt was four words. Four. I\'ve had stronger arguments with the toaster."',
  '"You shipped the interface change without the migration. We do not do that here."',
];

const GrandmaSvg: React.FC = () => (
  <img
    src="/karen-granny-half.svg"
    alt="Karen as a stern grandmother judge"
    className="h-full w-full object-cover object-top"
    onError={(event) => {
      // graceful fallback if the asset isn't served
      (event.currentTarget as HTMLImageElement).style.display = 'none';
    }}
  />
);

// Lazy-load GrandmaVoicePanel only when the user opens advanced controls.
// Otherwise the landing page would pull the full voice subsystem and its
// network calls just to show a hero teaser.
const GrandmaVoicePanelLazy = React.lazy(() =>
  import('../GrandmaVoicePanel').then((mod) => ({ default: mod.GrandmaVoicePanel })),
);

export const GrandmaVoiceTeaser: React.FC = () => {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [lineIndex, setLineIndex] = React.useState(0);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const handlePreview = React.useCallback(() => {
    if (!speechSupported) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    const nextIndex = (lineIndex + 1) % ROAST_LINES.length;
    const utterance = new SpeechSynthesisUtterance(ROAST_LINES[nextIndex]);
    utterance.rate = 0.92;
    utterance.pitch = 0.7;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setLineIndex(nextIndex);
    setIsPlaying(true);
  }, [isPlaying, lineIndex, speechSupported]);

  React.useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="relative overflow-hidden rounded-md border border-[#2a2521] bg-[#0a0907]">
        <div className="aspect-[4/5] w-full bg-gradient-to-b from-[#1a140e] to-[#0a0907]">
          <GrandmaSvg />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0907] via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[#c9bca8]">
          <span>judge karen · grandma cast</span>
          <span className="rounded-sm border border-[#3a322b] bg-black/60 px-2 py-0.5">v0.9</span>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-6 rounded-md border border-[#2a2521] bg-[#0a0907] p-5 sm:p-6">
        <div>
          <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a6e60]">
            <RiVolumeUpLine className="size-3.5" />
            roast preview
          </div>
          <p className="mt-4 font-serif text-2xl italic leading-snug text-[#f6f2e8] sm:text-3xl">
            {ROAST_LINES[lineIndex]}
          </p>
          <p className="mt-3 text-sm leading-6 text-[#c9bca8]">
            Browser voice for the demo. Real Karen runs through the server-side ElevenLabs proxy with caching, sound effects, and a daily character cap.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={!speechSupported}
            className="inline-flex items-center gap-2 rounded-sm bg-[#b7332c] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#fff8ec] shadow-[0_4px_0_#7a1e19] transition active:translate-y-[2px] active:shadow-[0_2px_0_#7a1e19] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPlaying ? <RiStopLine className="size-4" /> : <RiPlayLine className="size-4" />}
            {isPlaying ? 'Mute Karen' : 'Hear the verdict'}
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced((value) => !value)}
            className="inline-flex items-center gap-2 rounded-sm border border-[#3a322b] bg-black/40 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8]"
          >
            <RiSettings3Line className="size-4" />
            {showAdvanced ? 'Hide voice settings' : 'Open voice settings'}
          </button>
          {!speechSupported ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">
              browser voice unavailable here
            </span>
          ) : null}
        </div>

        {showAdvanced ? (
          <React.Suspense
            fallback={
              <div className="rounded-md border border-[#2a2521] bg-black/30 p-4 font-mono text-xs text-[#7a6e60]">
                Loading voice controls...
              </div>
            }
          >
            <div className="rounded-md border border-[#2a2521] bg-[#100c08] p-3">
              <GrandmaVoicePanelLazy />
            </div>
          </React.Suspense>
        ) : null}
      </div>
    </div>
  );
};

export default GrandmaVoiceTeaser;
