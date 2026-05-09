export type KarenVoiceProvider = 'browser' | 'elevenlabs-ready';

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
}

export interface KarenVoicePreviewResult {
  ok: boolean;
  reason?: string;
  usedProvider: 'browser' | 'none';
}

export const KAREN_VOICE_STORAGE_KEY = 'karen_grandma_voice_settings';

export const DEFAULT_KAREN_VOICE_SETTINGS: KarenVoiceSettings = {
  provider: 'browser',
  voiceURI: '',
  rate: 0.92,
  pitch: 0.72,
  volume: 1,
  mood: 'spicy',
  elevenLabsVoiceId: 'grandma-karen-voice-id',
  elevenLabsModelId: 'eleven_multilingual_v2',
  elevenLabsStability: 0.62,
  elevenLabsSimilarityBoost: 0.78,
  elevenLabsStyle: 0.34,
};

export const KAREN_ELEVENLABS_PLACEHOLDER = {
  label: 'ElevenLabs ready',
  endpointTemplate: 'POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}',
  requiredSecret: 'ELEVENLABS_API_KEY',
  note: 'Karen does not store or send secret keys from this browser panel.',
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
  provider: value?.provider === 'elevenlabs-ready' ? 'elevenlabs-ready' : 'browser',
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
