// Karen voice client for the Vercel landing pages.
//
// Calls POST {VITE_CONVEX_SITE_URL}/karen/voice/synthesize with a short text
// payload and plays the returned MP3 in the browser. Per-text MP3 URLs are
// cached in an in-memory Map for the page lifetime; Convex itself caches the
// same text content-hashed across all visitors.

const SITE_URL = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_CONVEX_SITE_URL || '').replace(/\/+$/g, '');

const cache = new Map<string, string>();
let currentAudio: HTMLAudioElement | null = null;

export type KarenMood = 'angry' | 'standard' | 'deadpan';

export type KarenSpeakOptions = {
  voiceId?: string;
  mood?: KarenMood;
  cacheKey?: string;
};

export type KarenSpeakResult = {
  ok: boolean;
  source?: 'cache' | 'network' | 'memory';
  error?: string;
};

const cacheKey = (text: string, options: KarenSpeakOptions): string =>
  `${options.voiceId || 'default'}::${options.mood || 'standard'}::${text}`;

/** Pick a Karen mood from a 0-100 discipline score. Mirrors karen-voice.js. */
export const moodForScore = (score: number | null | undefined): KarenMood => {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'standard';
  if (value < 30) return 'angry';
  if (value >= 80) return 'deadpan';
  return 'standard';
};

/** Stop any currently-playing Karen audio. */
export const stopKaren = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // Ignore; element may already be detached.
    }
    currentAudio = null;
  }
};

/**
 * Fetch + play a Karen line. Returns once the request resolves (audio may
 * still be playing). If the same text was already fetched this page load,
 * replays the blob URL without a network round-trip.
 */
export const speakKaren = async (text: string, options: KarenSpeakOptions = {}): Promise<KarenSpeakResult> => {
  if (!text || typeof text !== 'string') return { ok: false, error: 'empty text' };
  if (!SITE_URL) return { ok: false, error: 'VITE_CONVEX_SITE_URL not configured' };

  const key = cacheKey(text, options);
  const cachedUrl = cache.get(key);
  if (cachedUrl) {
    return playUrl(cachedUrl).then(() => ({ ok: true, source: 'memory' as const }));
  }

  let response: Response;
  try {
    response = await fetch(`${SITE_URL}/karen/voice/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: text.slice(0, 280),
        voiceId: options.voiceId,
        mood: options.mood || 'standard',
        cacheKey: options.cacheKey,
      }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    return { ok: false, error: `HTTP ${response.status}: ${payload.slice(0, 120)}` };
  }

  const source: 'cache' | 'network' = response.headers.get('x-karen-voice-cache') === 'hit' ? 'cache' : 'network';
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  cache.set(key, url);

  await playUrl(url);
  return { ok: true, source };
};

const playUrl = async (url: string): Promise<void> => {
  stopKaren();
  const audio = new Audio(url);
  audio.preload = 'auto';
  currentAudio = audio;
  await audio.play().catch(() => {
    // Browser autoplay restrictions; silently drop, the caller will handle UX.
  });
};
