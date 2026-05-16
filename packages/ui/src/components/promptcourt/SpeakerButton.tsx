import React from 'react';
import { speakKaren, type KarenMood, type KarenSpeakOptions } from '../../lib/karenWebVoice';

type SpeakerButtonProps = {
  text: string;
  mood?: KarenMood;
  cacheKey?: string;
  voiceId?: string;
  /** Visible label after the speaker icon. Defaults to "Hear Karen". */
  label?: string;
  className?: string;
  /** When true, button is small with just the icon. */
  compact?: boolean;
};

/**
 * Click to play a Karen voice line synthesized server-side and cached by
 * content-hash. Falls back silently to a "Voice unavailable" tooltip if the
 * fetch fails (Convex offline, ElevenLabs budget exhausted, etc.).
 */
export const SpeakerButton: React.FC<SpeakerButtonProps> = ({
  text,
  mood,
  cacheKey,
  voiceId,
  label = 'Hear Karen',
  className = '',
  compact = false,
}) => {
  const [state, setState] = React.useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setState('loading');
    const options: KarenSpeakOptions = { mood, cacheKey, voiceId };
    const result = await speakKaren(text, options);
    if (!result.ok) {
      setState('error');
      setError(result.error || 'Voice unavailable');
      window.setTimeout(() => setState('idle'), 2500);
      return;
    }
    setState('playing');
    // We don't have a strict "ended" event on the audio object surfaced from
    // the lib, so we use a heuristic timeout proportional to the text length.
    // 90ms / char is a comfortable upper bound for the eleven_flash_v2_5 speed.
    const estimateMs = Math.min(text.length * 90 + 800, 15_000);
    window.setTimeout(() => setState('idle'), estimateMs);
  };

  const base = compact
    ? 'inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#111] bg-white text-sm hover:bg-[#f6f2e8]'
    : 'inline-flex items-center gap-2 rounded-sm border border-[#111] bg-white px-3 py-2 font-mono text-xs font-semibold text-[#111] hover:bg-[#f6f2e8]';

  const icon = state === 'loading' ? '…' : state === 'playing' ? '🔊' : state === 'error' ? '✕' : '🔊';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading' || state === 'playing'}
      aria-label={`${label}: ${text.slice(0, 80)}`}
      title={state === 'error' && error ? error : `${label}`}
      className={`${base} ${state === 'error' ? 'border-[#b7332c] text-[#b7332c]' : ''} ${className}`}
    >
      <span aria-hidden="true">{icon}</span>
      {compact ? null : <span>{state === 'playing' ? 'Karen speaking…' : label}</span>}
    </button>
  );
};

export default SpeakerButton;
