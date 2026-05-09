import React from 'react';
import { RiPlayLine, RiStopLine, RiVolumeUpLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  DEFAULT_KAREN_VOICE_SETTINGS,
  KAREN_ELEVENLABS_PLACEHOLDER,
  KAREN_VOICE_STORAGE_KEY,
  buildKarenRoast,
  cancelKarenVoicePreview,
  createElevenLabsConfigPreview,
  fetchKarenElevenLabsStatus,
  fetchKarenElevenLabsUsage,
  fetchKarenElevenLabsVoices,
  isKarenBrowserVoiceSupported,
  normalizeKarenVoiceSettings,
  playKarenSoundEffect,
  speakKarenElevenLabsPreview,
  speakKarenVoicePreview,
  waitForKarenSpeechVoices,
  type KarenElevenLabsStatus,
  type KarenElevenLabsUsage,
  type KarenElevenLabsVoice,
  type KarenVoiceMood,
  type KarenVoiceProvider,
  type KarenVoiceSettings,
} from '@/lib/karenVoice';

const moodOptions: Array<{ value: KarenVoiceMood; label: string; helper: string }> = [
  { value: 'warm', label: 'Warm', helper: 'Disappointed but still bringing snacks.' },
  { value: 'spicy', label: 'Spicy', helper: 'Default courtroom seasoning.' },
  { value: 'nuclear', label: 'Nuclear', helper: 'For prompts that arrived wearing clown shoes.' },
];

const providerOptions: Array<{ value: KarenVoiceProvider; label: string; helper: string }> = [
  { value: 'browser', label: 'Browser preview', helper: 'Local Web Speech API. Zero network, maximum scolding.' },
  { value: 'elevenlabs', label: 'ElevenLabs live', helper: 'Server-side API calls. Voice, gavel stings, and rollback audio.' },
];

const karenSoundEffects = [
  {
    label: 'Gavel smack',
    prompt: 'sharp courtroom gavel hit, dry wood crack, tiny dramatic room tail',
  },
  {
    label: 'Rollback siren',
    prompt: 'retro arcade failure sting with a short warning buzzer and descending synth bloop',
  },
  {
    label: 'Badge unlock',
    prompt: 'cute 8-bit achievement unlock sparkle, warm and victorious, very short',
  },
] as const;

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const readInitialSettings = (): KarenVoiceSettings => {
  if (typeof window === 'undefined') {
    return DEFAULT_KAREN_VOICE_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(KAREN_VOICE_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_KAREN_VOICE_SETTINGS;
    }
    return normalizeKarenVoiceSettings(JSON.parse(raw) as Partial<KarenVoiceSettings>);
  } catch {
    return DEFAULT_KAREN_VOICE_SETTINGS;
  }
};

export const GrandmaVoicePanel: React.FC<{ className?: string }> = ({ className }) => {
  const [settings, setSettings] = React.useState<KarenVoiceSettings>(() => readInitialSettings());
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const [elevenLabsStatus, setElevenLabsStatus] = React.useState<KarenElevenLabsStatus | null>(null);
  const [elevenLabsUsage, setElevenLabsUsage] = React.useState<KarenElevenLabsUsage | null>(null);
  const [elevenLabsVoices, setElevenLabsVoices] = React.useState<KarenElevenLabsVoice[]>([]);
  const [previewText, setPreviewText] = React.useState(() => buildKarenRoast(DEFAULT_KAREN_VOICE_SETTINGS.mood, 1));
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isLoadingVoices, setIsLoadingVoices] = React.useState(false);
  const [status, setStatus] = React.useState<string>('');
  const browserSupported = isKarenBrowserVoiceSupported();

  React.useEffect(() => {
    let cancelled = false;

    waitForKarenSpeechVoices().then((nextVoices) => {
      if (!cancelled) {
        setVoices(nextVoices);
      }
    });

    const refreshVoices = () => {
      if (!cancelled && typeof window !== 'undefined') {
        setVoices(window.speechSynthesis.getVoices());
      }
    };

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
    }

    return () => {
      cancelled = true;
      cancelKarenVoicePreview();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoices);
      }
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KAREN_VOICE_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  React.useEffect(() => {
    let cancelled = false;
    fetchKarenElevenLabsStatus()
      .then((nextStatus) => {
        if (cancelled) return;
        setElevenLabsStatus(nextStatus);
        setElevenLabsUsage(nextStatus.usage ?? null);
        setSettings((current) => {
          if (current.elevenLabsVoiceId && current.elevenLabsVoiceId !== DEFAULT_KAREN_VOICE_SETTINGS.elevenLabsVoiceId) {
            return current;
          }
          return normalizeKarenVoiceSettings({ ...current, elevenLabsVoiceId: nextStatus.defaultVoiceId });
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Could not read ElevenLabs status.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = React.useCallback((patch: Partial<KarenVoiceSettings>) => {
    setSettings((current) => normalizeKarenVoiceSettings({ ...current, ...patch }));
  }, []);

  const refreshUsage = React.useCallback(async () => {
    try {
      setElevenLabsUsage(await fetchKarenElevenLabsUsage());
    } catch {
      // Usage is a dashboard nicety; audio controls still work without it.
    }
  }, []);

  const elevenLabsConfig = React.useMemo(() => createElevenLabsConfigPreview(settings), [settings]);
  const activeMood = moodOptions.find((option) => option.value === settings.mood) ?? moodOptions[1];
  const activeProvider = providerOptions.find((option) => option.value === settings.provider) ?? providerOptions[0];
  const elevenLabsConfigured = elevenLabsStatus?.configured === true;

  const loadElevenLabsVoices = React.useCallback(async () => {
    setIsLoadingVoices(true);
    setStatus('Asking ElevenLabs who can play Karen...');
    try {
      const nextVoices = await fetchKarenElevenLabsVoices();
      setElevenLabsVoices(nextVoices);
      setStatus(nextVoices.length > 0
        ? `Loaded ${nextVoices.length} ElevenLabs voices. Pick the sternest one.`
        : 'ElevenLabs returned no voices. Karen is judging the casting department.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load ElevenLabs voices.');
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  const handlePreview = React.useCallback(async () => {
    if (isPlaying) {
      cancelKarenVoicePreview();
      setIsPlaying(false);
      setStatus('Karen has been muted. For now.');
      return;
    }

    setIsPlaying(true);
    setStatus(settings.provider === 'elevenlabs'
      ? 'Calling ElevenLabs. Karen is putting on her courtroom cardigan.'
      : 'Grandma is clearing her throat.');

    const result = settings.provider === 'elevenlabs'
      ? await speakKarenElevenLabsPreview(previewText, settings)
      : await speakKarenVoicePreview(previewText, settings);
    if (settings.provider === 'elevenlabs') void refreshUsage();
    setIsPlaying(false);
    setStatus(result.ok
      ? result.cacheHit
        ? 'Preview complete from cache. Zero fresh credits burned.'
        : result.characterCost
          ? `Preview complete. ElevenLabs billed ${result.characterCost} character units.`
        : 'Preview complete. The prompt has been emotionally processed.'
      : result.reason || 'Preview failed before Karen could judge anyone.');
  }, [isPlaying, previewText, refreshUsage, settings]);

  const randomizeRoast = React.useCallback(() => {
    setPreviewText(buildKarenRoast(settings.mood, Date.now()));
  }, [settings.mood]);

  const copyConfig = React.useCallback(async () => {
    const text = JSON.stringify(elevenLabsConfig, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied ElevenLabs-ready config. Still no keys. Karen raised you correctly.');
    } catch {
      setStatus('Could not copy config. The clipboard is being dramatic.');
    }
  }, [elevenLabsConfig]);

  const playSoundEffect = React.useCallback(async (prompt: string) => {
    setIsPlaying(true);
    setStatus('Generating Karen courtroom sound design...');
    const result = await playKarenSoundEffect(prompt, { demoMode: settings.elevenLabsDemoMode });
    void refreshUsage();
    setIsPlaying(false);
    setStatus(result.ok
      ? result.cacheHit
        ? 'Sound effect played from cache. Karen approves of fiscal discipline.'
        : result.characterCost
          ? `Sound effect played. ElevenLabs billed ${result.characterCost} character units.`
        : 'Sound effect played. The courtroom is now less boring.'
      : result.reason || 'Sound effect failed.');
  }, [refreshUsage, settings.elevenLabsDemoMode]);

  const usageRatio = elevenLabsUsage && elevenLabsUsage.dailyCap > 0
    ? Math.min(100, Math.round((elevenLabsUsage.characterCost / elevenLabsUsage.dailyCap) * 100))
    : 0;

  return (
    <section className={cn('rounded-md border border-border bg-card p-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 typography-ui-label text-muted-foreground">
            <RiVolumeUpLine className="size-4" />
            Grandma Voice Roasts
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-normal text-foreground">Make Karen audible, not legally actionable</h2>
          <p className="mt-2 max-w-2xl typography-body text-muted-foreground">
            Preview roast lines locally or cast Karen through the server-side ElevenLabs proxy. The proxy caches clips, tracks daily character cost, and keeps the API key off the browser.
          </p>
        </div>
        <span className={cn(
          'rounded-sm px-2 py-1 typography-micro font-medium',
          settings.provider === 'elevenlabs'
            ? elevenLabsConfigured
              ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
              : 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]'
            : browserSupported
            ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]'
            : 'bg-[var(--status-warning)]/15 text-[var(--status-warning)]',
        )}>
          {settings.provider === 'elevenlabs'
            ? elevenLabsConfigured ? 'ElevenLabs configured' : 'ElevenLabs needs env key'
            : browserSupported ? 'browser voice available' : 'browser voice unavailable'}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="typography-ui-label text-foreground">Provider mode</span>
              <Select value={settings.provider} onValueChange={(value) => updateSettings({ provider: value })}>
                <SelectTrigger className="h-9 w-full justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="typography-micro text-muted-foreground">{activeProvider.helper}</span>
            </label>

            <label className="grid gap-2">
              <span className="typography-ui-label text-foreground">Roast setting</span>
              <Select value={settings.mood} onValueChange={(value) => updateSettings({ mood: value })}>
                <SelectTrigger className="h-9 w-full justify-between">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {moodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="typography-micro text-muted-foreground">{activeMood.helper}</span>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="typography-ui-label text-foreground">Browser voice</span>
            <Select value={settings.voiceURI || '__auto__'} onValueChange={(value) => updateSettings({ voiceURI: value === '__auto__' ? '' : value })}>
              <SelectTrigger className="h-9 w-full justify-between">
                <SelectValue placeholder="Auto-pick the nearest disappointed grandma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Auto-pick grandma energy</SelectItem>
                {voices.map((voice) => (
                  <SelectItem key={voice.voiceURI || voice.name} value={voice.voiceURI || voice.name}>
                    {voice.name} ({voice.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {settings.provider === 'elevenlabs' ? (
            <div className="grid gap-3 rounded-md border border-[var(--status-success)]/25 bg-[var(--status-success)]/8 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="typography-ui-label text-foreground">ElevenLabs voice casting</div>
                  <div className="typography-micro text-muted-foreground">
                    Pick a real account voice, or use the server default voice ID.
                  </div>
                </div>
                <Button type="button" variant="outline" onClick={loadElevenLabsVoices} disabled={!elevenLabsConfigured || isLoadingVoices}>
                  {isLoadingVoices ? 'Loading...' : 'Load voices'}
                </Button>
              </div>
              {elevenLabsVoices.length > 0 ? (
                <Select value={settings.elevenLabsVoiceId} onValueChange={(value) => updateSettings({ elevenLabsVoiceId: value })}>
                  <SelectTrigger className="h-9 w-full justify-between">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {elevenLabsVoices.map((voice) => (
                      <SelectItem key={voice.voiceId} value={voice.voiceId}>
                        {voice.name} {voice.labels?.age ? `· ${voice.labels.age}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <label className="flex items-start gap-3 rounded-md border border-border bg-background/50 p-3">
                <input
                  type="checkbox"
                  checked={settings.elevenLabsDemoMode}
                  onChange={(event) => updateSettings({ elevenLabsDemoMode: event.target.checked })}
                  className="mt-1"
                />
                <span>
                  <span className="block typography-ui-label text-foreground">Demo mode</span>
                  <span className="block typography-micro text-muted-foreground">
                    Use browser voice and tiny local blips for demos without spending ElevenLabs credits.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <label className="grid gap-2">
            <span className="typography-ui-label text-foreground">Preview line</span>
            <Textarea
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value)}
              rows={4}
              className="min-h-24 resize-y"
              placeholder="Write something Karen should say before rejecting the vibes."
            />
          </label>

          <div className="grid gap-3 rounded-md border border-border bg-background/50 p-3">
            <VoiceSlider label="Speed" value={settings.rate} min={0.55} max={1.35} step={0.01} onChange={(rate) => updateSettings({ rate })} />
            <VoiceSlider label="Grumble pitch" value={settings.pitch} min={0.35} max={1.25} step={0.01} onChange={(pitch) => updateSettings({ pitch })} />
            <VoiceSlider label="Volume" value={settings.volume} min={0} max={1} step={0.01} onChange={(volume) => updateSettings({ volume })} formatter={formatPercent} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handlePreview}
              disabled={settings.provider === 'elevenlabs' ? !elevenLabsConfigured || isPlaying : (!browserSupported && !isPlaying)}
            >
              {isPlaying ? <RiStopLine className="size-4" /> : <RiPlayLine className="size-4" />}
              {isPlaying ? 'Stop roast' : settings.provider === 'elevenlabs' ? 'Generate roast' : 'Preview roast'}
            </Button>
            <Button type="button" variant="outline" onClick={randomizeRoast}>
              New insult
            </Button>
          </div>

          {settings.provider === 'elevenlabs' ? (
            <div className="grid gap-2 rounded-md border border-border bg-background/50 p-3">
              <div className="typography-ui-label text-foreground">Courtroom soundboard</div>
              <div className="flex flex-wrap gap-2">
                {karenSoundEffects.map((effect) => (
                  <Button
                    key={effect.label}
                    type="button"
                    variant="outline"
                    onClick={() => playSoundEffect(effect.prompt)}
                    disabled={!elevenLabsConfigured || isPlaying}
                  >
                    {effect.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {status ? <div className="typography-micro text-muted-foreground">{status}</div> : null}
        </div>

        <aside className="grid content-start gap-3 rounded-md border border-border bg-background/50 p-4">
          <div>
            <div className="typography-ui-label text-foreground">{KAREN_ELEVENLABS_PLACEHOLDER.label}</div>
            <p className="mt-1 typography-micro text-muted-foreground">
              Server proxy: {KAREN_ELEVENLABS_PLACEHOLDER.endpointTemplate}
            </p>
          </div>

          <label className="grid gap-1">
            <span className="typography-micro text-muted-foreground">Voice ID placeholder</span>
            <input
              value={settings.elevenLabsVoiceId}
              onChange={(event) => updateSettings({ elevenLabsVoiceId: event.target.value })}
              className="h-8 rounded-md border border-border bg-card px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
            />
          </label>

          <label className="grid gap-1">
            <span className="typography-micro text-muted-foreground">Model</span>
            <input
              value={settings.elevenLabsModelId}
              onChange={(event) => updateSettings({ elevenLabsModelId: event.target.value })}
              className="h-8 rounded-md border border-border bg-card px-2 font-mono text-xs text-foreground outline-none focus:border-primary"
            />
          </label>

          <VoiceSlider label="Stability" value={settings.elevenLabsStability} min={0} max={1} step={0.01} onChange={(elevenLabsStability) => updateSettings({ elevenLabsStability })} formatter={formatPercent} />
          <VoiceSlider label="Similarity" value={settings.elevenLabsSimilarityBoost} min={0} max={1} step={0.01} onChange={(elevenLabsSimilarityBoost) => updateSettings({ elevenLabsSimilarityBoost })} formatter={formatPercent} />
          <VoiceSlider label="Style" value={settings.elevenLabsStyle} min={0} max={1} step={0.01} onChange={(elevenLabsStyle) => updateSettings({ elevenLabsStyle })} formatter={formatPercent} />

          {elevenLabsUsage ? (
            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="typography-micro font-medium text-foreground">Daily audio budget</div>
                  <div className="mt-1 typography-micro text-muted-foreground">
                    {elevenLabsUsage.characterCost.toLocaleString()} / {elevenLabsUsage.dailyCap.toLocaleString()} character units · {elevenLabsUsage.requests.toLocaleString()} fresh API calls
                  </div>
                </div>
                <span className="rounded-sm bg-muted px-2 py-1 typography-micro text-muted-foreground">
                  {elevenLabsUsage.demoMode || settings.elevenLabsDemoMode ? 'demo mode' : elevenLabsUsage.cacheEnabled ? 'cache on' : 'cache off'}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${usageRatio}%` }} />
              </div>
            </div>
          ) : null}

          <div className="rounded-md bg-muted/40 p-3">
            <div className="typography-micro font-medium text-foreground">Secret handling</div>
            <p className="mt-1 typography-micro text-muted-foreground">
              Use {KAREN_ELEVENLABS_PLACEHOLDER.requiredSecret} on the server. This browser panel never stores or receives the key.
            </p>
          </div>

          <div className="grid gap-2">
            {(elevenLabsStatus?.features ?? []).map((feature) => (
              <div key={feature.id} className="rounded-md border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="typography-micro font-medium text-foreground">{feature.label}</div>
                  <span className="rounded-sm bg-muted px-2 py-0.5 typography-micro text-muted-foreground">{feature.status}</span>
                </div>
                <p className="mt-1 typography-micro text-muted-foreground">{feature.detail}</p>
              </div>
            ))}
          </div>

          <pre className="max-h-48 overflow-auto rounded-md bg-card p-3 font-mono text-xs text-muted-foreground">
            {JSON.stringify(elevenLabsConfig, null, 2)}
          </pre>

          <Button type="button" variant="outline" onClick={copyConfig}>
            Copy config
          </Button>
        </aside>
      </div>
    </section>
  );
};

const VoiceSlider = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatter = (next) => next.toFixed(2),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatter?: (value: number) => string;
}) => (
  <label className="grid gap-1">
    <span className="typography-micro text-muted-foreground">{label}</span>
    <Slider
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={onChange}
      label={label}
      valueFormatter={formatter}
    />
  </label>
);

export default GrandmaVoicePanel;
