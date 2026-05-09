export type KarenVoiceProvider = 'browser' | 'elevenlabs';

export type KarenVoiceMood = 'warm' | 'spicy' | 'nuclear';

export interface KarenVoiceSettings {
  provider: KarenVoiceProvider;
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  mood: KarenVoiceMood;
  elevenLabsVoiceId: string;
  elevenLabsModelId: string;
  elevenLabsStability: number;
  elevenLabsSimilarityBoost: number;
  elevenLabsStyle: number;
  elevenLabsDemoMode: boolean;
}

export interface KarenVoicePreviewResult {
  ok: boolean;
  reason?: string;
  usedProvider: 'browser' | 'elevenlabs' | 'none';
  characterCost?: string;
  cacheHit?: boolean;
}

export interface KarenElevenLabsUsage {
  day: string;
  requests: number;
  characterCost: number;
  dailyCap: number;
  remaining: number;
  cacheEnabled: boolean;
  demoMode: boolean;
  cacheDir?: string;
}

export interface KarenElevenLabsStatus {
  configured: boolean;
  provider: 'elevenlabs';
  secretEnvVar: string;
  defaultVoiceId: string;
  usage?: KarenElevenLabsUsage;
  recommendedModels: Array<{ id: string; label: string; use: string }>;
  features: Array<{ id: string; label: string; status: string; detail: string }>;
}

export interface KarenElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  labels: Record<string, string>;
  highQualityBaseModelIds: string[];
}

export const KAREN_VOICE_STORAGE_KEY = 'karen_grandma_voice_settings';

export const DEFAULT_KAREN_VOICE_SETTINGS: KarenVoiceSettings = {
  provider: 'browser',
  voiceURI: '',
  rate: 0.92,
  pitch: 0.72,
  volume: 1,
  mood: 'spicy',
  elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
  elevenLabsModelId: 'eleven_v3',
  elevenLabsStability: 0.62,
  elevenLabsSimilarityBoost: 0.78,
  elevenLabsStyle: 0.34,
  elevenLabsDemoMode: false,
};

export const KAREN_ELEVENLABS_PLACEHOLDER = {
  label: 'ElevenLabs live',
  endpointTemplate: 'POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}',
  requiredSecret: 'ELEVENLABS_API_KEY',
  note: 'The browser talks only to Karen server routes. The ElevenLabs key stays server-side.',
};

const roastLines: Record<KarenVoiceMood, string[]> = {
  warm: [
    'Sweetheart, this prompt has the nutritional value of printer paper.',
    'I love ambition. I also love acceptance criteria. Try having both.',
    'This is almost a task. Put a file path in it and I may stop sighing.',
  ],
  spicy: [
    'Honey, "make it better" is not a prompt. It is a scented candle with a keyboard.',
    'I have seen casseroles with tighter scope than this request.',
    'You brought vibes to a diff fight. Adorable. Incorrect, but adorable.',
  ],
  nuclear: [
    'No files, no tests, no constraints. Did you write this prompt in a revolving door?',
    'This prompt is so vague it could be legally declared fog.',
    'The agent is not psychic, dear. It is just expensive autocomplete with posture.',
  ],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const isSpeechSynthesisAvailable = (): boolean =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof window.speechSynthesis?.speak === 'function' &&
  typeof window.SpeechSynthesisUtterance === 'function';

export const isKarenBrowserVoiceSupported = (): boolean => isSpeechSynthesisAvailable();

export const getKarenSpeechVoices = (): SpeechSynthesisVoice[] => {
  if (!isSpeechSynthesisAvailable()) {
    return [];
  }
  return window.speechSynthesis.getVoices();
};

export const waitForKarenSpeechVoices = (timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> => {
  if (!isSpeechSynthesisAvailable()) {
    return Promise.resolve([]);
  }

  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener?.('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };

    window.speechSynthesis.addEventListener?.('voiceschanged', finish);
    window.setTimeout(finish, timeoutMs);
  });
};

export const pickKarenGrandmaVoice = (
  voices: SpeechSynthesisVoice[],
  preferredVoiceURI = '',
): SpeechSynthesisVoice | null => {
  if (preferredVoiceURI) {
    const preferred = voices.find((voice) => voice.voiceURI === preferredVoiceURI || voice.name === preferredVoiceURI);
    if (preferred) return preferred;
  }

  const scored = voices
    .map((voice) => {
      const haystack = `${voice.name} ${voice.lang}`.toLowerCase();
      let score = 0;
      if (haystack.includes('female')) score += 6;
      if (haystack.includes('grand')) score += 6;
      if (haystack.includes('samantha')) score += 5;
      if (haystack.includes('victoria')) score += 4;
      if (haystack.includes('karen')) score += 4;
      if (haystack.includes('english') || haystack.includes('en-')) score += 3;
      if (voice.localService) score += 1;
      return { voice, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.voice ?? voices[0] ?? null;
};

export const buildKarenRoast = (mood: KarenVoiceMood, seed = Date.now()): string => {
  const lines = roastLines[mood] ?? roastLines.spicy;
  const index = Math.abs(Math.trunc(seed)) % lines.length;
  return lines[index];
};

export const normalizeKarenVoiceSettings = (value: Partial<KarenVoiceSettings> | null | undefined): KarenVoiceSettings => ({
  ...DEFAULT_KAREN_VOICE_SETTINGS,
  ...(value ?? {}),
  provider: value?.provider === 'elevenlabs' ? 'elevenlabs' : 'browser',
  voiceURI: typeof value?.voiceURI === 'string' ? value.voiceURI : DEFAULT_KAREN_VOICE_SETTINGS.voiceURI,
  rate: clamp(Number(value?.rate ?? DEFAULT_KAREN_VOICE_SETTINGS.rate), 0.55, 1.35),
  pitch: clamp(Number(value?.pitch ?? DEFAULT_KAREN_VOICE_SETTINGS.pitch), 0.35, 1.25),
  volume: clamp(Number(value?.volume ?? DEFAULT_KAREN_VOICE_SETTINGS.volume), 0, 1),
  mood: value?.mood === 'warm' || value?.mood === 'spicy' || value?.mood === 'nuclear'
    ? value.mood
    : DEFAULT_KAREN_VOICE_SETTINGS.mood,
  elevenLabsVoiceId: typeof value?.elevenLabsVoiceId === 'string' && value.elevenLabsVoiceId.trim()
    ? value.elevenLabsVoiceId.trim()
    : DEFAULT_KAREN_VOICE_SETTINGS.elevenLabsVoiceId,
  elevenLabsModelId: typeof value?.elevenLabsModelId === 'string' && value.elevenLabsModelId.trim()
    ? value.elevenLabsModelId.trim()
    : DEFAULT_KAREN_VOICE_SETTINGS.elevenLabsModelId,
  elevenLabsStability: clamp(Number(value?.elevenLabsStability ?? DEFAULT_KAREN_VOICE_SETTINGS.elevenLabsStability), 0, 1),
  elevenLabsSimilarityBoost: clamp(Number(value?.elevenLabsSimilarityBoost ?? DEFAULT_KAREN_VOICE_SETTINGS.elevenLabsSimilarityBoost), 0, 1),
  elevenLabsStyle: clamp(Number(value?.elevenLabsStyle ?? DEFAULT_KAREN_VOICE_SETTINGS.elevenLabsStyle), 0, 1),
  elevenLabsDemoMode: value?.elevenLabsDemoMode === true,
});

export const createElevenLabsConfigPreview = (settings: KarenVoiceSettings) => ({
  provider: 'elevenlabs',
  voiceId: settings.elevenLabsVoiceId,
  modelId: settings.elevenLabsModelId,
  voiceSettings: {
    stability: settings.elevenLabsStability,
    similarity_boost: settings.elevenLabsSimilarityBoost,
    style: settings.elevenLabsStyle,
    use_speaker_boost: true,
  },
  secretEnvVar: KAREN_ELEVENLABS_PLACEHOLDER.requiredSecret,
});

export const fetchKarenElevenLabsStatus = async (): Promise<KarenElevenLabsStatus> => {
  const response = await fetch('/api/karen/elevenlabs/status', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs status failed (${response.status})`);
  }
  return response.json() as Promise<KarenElevenLabsStatus>;
};

export const fetchKarenElevenLabsVoices = async (): Promise<KarenElevenLabsVoice[]> => {
  const response = await fetch('/api/karen/elevenlabs/voices', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `ElevenLabs voices failed (${response.status})`);
  }
  const payload = await response.json() as { voices?: KarenElevenLabsVoice[] };
  return Array.isArray(payload.voices) ? payload.voices : [];
};

export const fetchKarenElevenLabsUsage = async (): Promise<KarenElevenLabsUsage> => {
  const response = await fetch('/api/karen/elevenlabs/usage', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `ElevenLabs usage failed (${response.status})`);
  }
  return response.json() as Promise<KarenElevenLabsUsage>;
};

const postKarenElevenLabsAudio = async (
  endpoint: '/api/karen/elevenlabs/speech' | '/api/karen/elevenlabs/sound-effect',
  payload: unknown,
): Promise<{ blob: Blob; characterCost?: string; cacheHit?: boolean; usage?: Partial<KarenElevenLabsUsage> }> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorPayload.error || `ElevenLabs audio failed (${response.status})`);
  }

  return {
    blob: await response.blob(),
    characterCost: response.headers.get('x-elevenlabs-character-cost') || undefined,
    cacheHit: response.headers.get('x-karen-audio-cache') === 'hit',
    usage: {
      day: response.headers.get('x-karen-audio-usage-day') || undefined,
      characterCost: Number(response.headers.get('x-karen-audio-usage-character-cost') || NaN),
      dailyCap: Number(response.headers.get('x-karen-audio-usage-daily-cap') || NaN),
    },
  };
};

export const playKarenAudioBlob = async (blob: Blob): Promise<void> => {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error('Audio playback failed.'));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const speakKarenElevenLabsPreview = async (
  text: string,
  settings: KarenVoiceSettings,
): Promise<KarenVoicePreviewResult> => {
  const normalized = normalizeKarenVoiceSettings(settings);
  const message = text.trim() || buildKarenRoast(normalized.mood);

  if (normalized.elevenLabsDemoMode) {
    return speakKarenVoicePreview(message, { ...normalized, provider: 'browser' });
  }

  try {
    const result = await postKarenElevenLabsAudio('/api/karen/elevenlabs/speech', {
      text: message,
      voiceId: normalized.elevenLabsVoiceId,
      modelId: normalized.elevenLabsModelId,
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: normalized.elevenLabsStability,
        similarity_boost: normalized.elevenLabsSimilarityBoost,
        style: normalized.elevenLabsStyle,
        speed: normalized.rate,
        use_speaker_boost: true,
      },
    });
    await playKarenAudioBlob(result.blob);
    return { ok: true, usedProvider: 'elevenlabs', characterCost: result.characterCost, cacheHit: result.cacheHit };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'ElevenLabs speech preview failed.',
      usedProvider: 'elevenlabs',
    };
  }
};

export const playKarenSoundEffect = async (
  text: string,
  options: { durationSeconds?: number; promptInfluence?: number; loop?: boolean; demoMode?: boolean } = {},
): Promise<KarenVoicePreviewResult> => {
  if (options.demoMode) {
    await playKarenBlip(text.includes('rollback') || text.includes('failure') ? 'bad' : 'good');
    return { ok: true, usedProvider: 'browser' };
  }

  try {
    const result = await postKarenElevenLabsAudio('/api/karen/elevenlabs/sound-effect', {
      text,
      durationSeconds: options.durationSeconds ?? 1.2,
      promptInfluence: options.promptInfluence ?? 0.35,
      loop: options.loop === true,
      outputFormat: 'mp3_44100_128',
    });
    await playKarenAudioBlob(result.blob);
    return { ok: true, usedProvider: 'elevenlabs', characterCost: result.characterCost, cacheHit: result.cacheHit };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'ElevenLabs sound effect failed.',
      usedProvider: 'elevenlabs',
    };
  }
};

export type KarenAudioEvent =
  | 'prompt-blocked'
  | 'quiz-pass'
  | 'quiz-fail'
  | 'rollback'
  | 'badge-unlock'
  | 'final-boss-saved'
  | 'final-boss-deleted';

const eventAudioMap: Record<KarenAudioEvent, { line: string; sfx: string; tone: 'good' | 'bad' | 'neutral' }> = {
  'prompt-blocked': {
    line: 'Absolutely not. That prompt is going back to the kitchen for structure.',
    sfx: 'sharp courtroom gavel hit, dry wood crack, tiny dramatic room tail',
    tone: 'bad',
  },
  'quiz-pass': {
    line: 'Fine. You read the diff. The patch may live.',
    sfx: 'cute 8-bit achievement unlock sparkle, warm and victorious, very short',
    tone: 'good',
  },
  'quiz-fail': {
    line: 'Wrong. Sandbox deleted. Sit down and read what changed.',
    sfx: 'retro arcade failure sting with a short warning buzzer and descending synth bloop',
    tone: 'bad',
  },
  rollback: {
    line: 'Rollback complete. Your real repo remains unsullied by vibes.',
    sfx: 'short tape rewind into a stern courtroom gavel hit',
    tone: 'bad',
  },
  'badge-unlock': {
    line: 'Badge unlocked. A tiny receipt for doing the responsible thing.',
    sfx: 'cute pixel achievement chime with tiny sparkles, very short',
    tone: 'good',
  },
  'final-boss-saved': {
    line: 'You defended the patch with evidence. Grandma grants clemency.',
    sfx: 'victorious retro game show sting, short and bright',
    tone: 'good',
  },
  'final-boss-deleted': {
    line: 'No receipts, no mercy. The sandbox goes in the bin.',
    sfx: 'dramatic retro game over sting with a tiny trash can clank',
    tone: 'bad',
  },
};

export const readStoredKarenVoiceSettings = (): KarenVoiceSettings => {
  if (typeof window === 'undefined') return DEFAULT_KAREN_VOICE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KAREN_VOICE_STORAGE_KEY);
    return raw ? normalizeKarenVoiceSettings(JSON.parse(raw) as Partial<KarenVoiceSettings>) : DEFAULT_KAREN_VOICE_SETTINGS;
  } catch {
    return DEFAULT_KAREN_VOICE_SETTINGS;
  }
};

const playKarenBlip = async (tone: 'good' | 'bad' | 'neutral' = 'neutral'): Promise<void> => {
  if (typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
  gain.connect(ctx.destination);

  const frequencies = tone === 'good' ? [523, 659, 784] : tone === 'bad' ? [220, 174, 146] : [392, 392];
  frequencies.forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, now + index * 0.1);
    osc.connect(gain);
    osc.start(now + index * 0.1);
    osc.stop(now + index * 0.1 + 0.12);
  });

  await new Promise((resolve) => window.setTimeout(resolve, 430));
  await ctx.close().catch(() => {});
};

export const playKarenEventAudio = async (
  event: KarenAudioEvent,
  options: { voice?: boolean; sfx?: boolean; settings?: KarenVoiceSettings } = {},
): Promise<KarenVoicePreviewResult> => {
  const settings = normalizeKarenVoiceSettings(options.settings ?? readStoredKarenVoiceSettings());
  const config = eventAudioMap[event];
  const shouldPlayVoice = options.voice !== false;
  const shouldPlaySfx = options.sfx !== false;

  try {
    if (settings.provider === 'elevenlabs' && !settings.elevenLabsDemoMode) {
      if (shouldPlaySfx) {
        await playKarenSoundEffect(config.sfx, { durationSeconds: 1.1, promptInfluence: 0.35 });
      }
      if (shouldPlayVoice) {
        return speakKarenElevenLabsPreview(config.line, settings);
      }
      return { ok: true, usedProvider: 'elevenlabs' };
    }

    if (shouldPlaySfx) {
      await playKarenBlip(config.tone);
    }
    if (shouldPlayVoice) {
      return speakKarenVoicePreview(config.line, settings);
    }
    return { ok: true, usedProvider: 'browser' };
  } catch (error) {
    await playKarenBlip(config.tone).catch(() => {});
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Karen event audio failed.',
      usedProvider: settings.provider,
    };
  }
};

export const cancelKarenVoicePreview = (): void => {
  if (isSpeechSynthesisAvailable()) {
    window.speechSynthesis.cancel();
  }
};

export const speakKarenVoicePreview = async (
  text: string,
  settings: KarenVoiceSettings,
): Promise<KarenVoicePreviewResult> => {
  if (!isSpeechSynthesisAvailable()) {
    return {
      ok: false,
      reason: 'This browser does not expose speechSynthesis.',
      usedProvider: 'none',
    };
  }

  const normalized = normalizeKarenVoiceSettings(settings);
  const message = text.trim() || buildKarenRoast(normalized.mood);
  const voices = await waitForKarenSpeechVoices();
  const voice = pickKarenGrandmaVoice(voices, normalized.voiceURI);
  const utterance = new window.SpeechSynthesisUtterance(message);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = 'en-US';
  }

  utterance.rate = normalized.rate;
  utterance.pitch = normalized.pitch;
  utterance.volume = normalized.volume;

  return new Promise((resolve) => {
    utterance.onend = () => resolve({ ok: true, usedProvider: 'browser' });
    utterance.onerror = (event) => resolve({
      ok: false,
      reason: event.error || 'Speech preview failed.',
      usedProvider: 'browser',
    });
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
};
