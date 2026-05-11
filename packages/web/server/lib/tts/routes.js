import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeCustomOpenAIBaseURL } from './base-url.js';
import { summarizeText, sanitizeForTTS, sanitizeForNote, sanitizeForNotification } from '../text/summarization.js';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const ELEVENLABS_OUTPUT_FORMATS = new Set([
  'mp3_44100_128',
  'mp3_44100_64',
  'mp3_22050_32',
  'pcm_16000',
  'ulaw_8000',
]);
const ELEVENLABS_USAGE_FILE = 'karen-elevenlabs-usage.json';
const ELEVENLABS_CACHE_DIR = 'karen-audio-cache';

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const sanitizeElevenLabsId = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return /^[a-zA-Z0-9_.-]{2,128}$/.test(normalized) ? normalized : fallback;
};

const sanitizeElevenLabsText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
};

const getElevenLabsApiKey = () => {
  const value = process.env.ELEVENLABS_API_KEY;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
};

const resolveKarenDataDir = () => {
  const configured = process.env.OPENCHAMBER_DATA_DIR || process.env.KAREN_DATA_DIR;
  if (typeof configured === 'string' && configured.trim()) return configured.trim();
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, 'openchamber');
};

const getAudioCacheDir = () => process.env.KAREN_AUDIO_CACHE_DIR || path.join(resolveKarenDataDir(), ELEVENLABS_CACHE_DIR);
const getUsageFilePath = () => path.join(resolveKarenDataDir(), ELEVENLABS_USAGE_FILE);
const elevenLabsDemoMode = () => ['1', 'true', 'on', 'yes'].includes(String(process.env.KAREN_AUDIO_DEMO_MODE || '').toLowerCase());
const elevenLabsCacheEnabled = () => !['0', 'false', 'off', 'no'].includes(String(process.env.KAREN_AUDIO_CACHE || '1').toLowerCase());

const resolveElevenLabsDailyCap = () => {
  const parsed = Number(process.env.KAREN_ELEVENLABS_DAILY_CAP || process.env.KAREN_AUDIO_DAILY_CAP || 20000);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 20000;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const readElevenLabsUsage = async () => {
  try {
    const raw = await fs.readFile(getUsageFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.day === todayKey()) {
      return {
        day: parsed.day,
        requests: Number.isFinite(Number(parsed.requests)) ? Number(parsed.requests) : 0,
        characterCost: Number.isFinite(Number(parsed.characterCost)) ? Number(parsed.characterCost) : 0,
      };
    }
  } catch {
    // Missing or malformed usage files reset naturally by day.
  }
  return { day: todayKey(), requests: 0, characterCost: 0 };
};

const writeElevenLabsUsage = async (usage) => {
  await fs.mkdir(path.dirname(getUsageFilePath()), { recursive: true });
  await fs.writeFile(getUsageFilePath(), `${JSON.stringify(usage, null, 2)}\n`);
};

const updateElevenLabsUsage = async (estimatedCost) => {
  const usage = await readElevenLabsUsage();
  const cost = Number.isFinite(Number(estimatedCost)) ? Math.max(0, Math.trunc(Number(estimatedCost))) : 0;
  const next = {
    day: todayKey(),
    requests: usage.requests + 1,
    characterCost: usage.characterCost + cost,
  };
  await writeElevenLabsUsage(next);
  return next;
};

const buildUsagePayload = async () => {
  const usage = await readElevenLabsUsage();
  const dailyCap = resolveElevenLabsDailyCap();
  return {
    ...usage,
    dailyCap,
    remaining: dailyCap === 0 ? 0 : Math.max(0, dailyCap - usage.characterCost),
    cacheEnabled: elevenLabsCacheEnabled(),
    demoMode: elevenLabsDemoMode(),
    cacheDir: getAudioCacheDir(),
  };
};

const estimateAudioCost = ({ text, characterCost }) => {
  const parsed = Number(characterCost);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  return typeof text === 'string' ? text.length : 0;
};

const assertElevenLabsBudget = async (estimatedCost) => {
  if (elevenLabsDemoMode()) {
    const error = new Error('Karen audio demo mode is enabled. No ElevenLabs credits were used.');
    error.statusCode = 409;
    throw error;
  }
  const usage = await readElevenLabsUsage();
  const dailyCap = resolveElevenLabsDailyCap();
  if (dailyCap > 0 && usage.characterCost + estimatedCost > dailyCap) {
    const error = new Error(`Karen audio daily cap reached (${usage.characterCost}/${dailyCap} character units).`);
    error.statusCode = 429;
    throw error;
  }
};

const cacheKeyForAudio = ({ endpoint, outputFormat, payload }) => crypto
  .createHash('sha256')
  .update(JSON.stringify({ endpoint, outputFormat, payload }))
  .digest('hex');

const readCachedAudio = async (cacheKey) => {
  if (!elevenLabsCacheEnabled()) return null;
  const audioPath = path.join(getAudioCacheDir(), `${cacheKey}.mp3`);
  const metaPath = path.join(getAudioCacheDir(), `${cacheKey}.json`);
  try {
    const [buffer, rawMeta] = await Promise.all([
      fs.readFile(audioPath),
      fs.readFile(metaPath, 'utf8').catch(() => '{}'),
    ]);
    const meta = JSON.parse(rawMeta);
    return {
      buffer,
      contentType: typeof meta.contentType === 'string' ? meta.contentType : 'audio/mpeg',
      characterCost: typeof meta.characterCost === 'string' ? meta.characterCost : '',
      requestId: typeof meta.requestId === 'string' ? meta.requestId : '',
      cacheHit: true,
    };
  } catch {
    return null;
  }
};

const writeCachedAudio = async (cacheKey, result) => {
  if (!elevenLabsCacheEnabled()) return;
  await fs.mkdir(getAudioCacheDir(), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(getAudioCacheDir(), `${cacheKey}.mp3`), result.buffer),
    fs.writeFile(path.join(getAudioCacheDir(), `${cacheKey}.json`), `${JSON.stringify({
      contentType: result.contentType,
      characterCost: result.characterCost,
      requestId: result.requestId,
      createdAt: Date.now(),
    }, null, 2)}\n`),
  ]);
};

const resolveElevenLabsVoiceId = (value) => sanitizeElevenLabsId(
  value,
  sanitizeElevenLabsId(process.env.ELEVENLABS_VOICE_ID, DEFAULT_ELEVENLABS_VOICE_ID),
);

const resolveElevenLabsOutputFormat = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return ELEVENLABS_OUTPUT_FORMATS.has(normalized) ? normalized : 'mp3_44100_128';
};

const mapElevenLabsVoice = (voice) => ({
  voiceId: typeof voice?.voice_id === 'string' ? voice.voice_id : '',
  name: typeof voice?.name === 'string' ? voice.name : 'Untitled voice',
  category: typeof voice?.category === 'string' ? voice.category : '',
  description: typeof voice?.description === 'string' ? voice.description : '',
  previewUrl: typeof voice?.preview_url === 'string' ? voice.preview_url : '',
  labels: voice?.labels && typeof voice.labels === 'object' ? voice.labels : {},
  highQualityBaseModelIds: Array.isArray(voice?.high_quality_base_model_ids)
    ? voice.high_quality_base_model_ids.filter((item) => typeof item === 'string')
    : [],
});

const fetchElevenLabsAudio = async ({ endpoint, apiKey, payload, outputFormat }) => {
  const url = new URL(`${ELEVENLABS_API_BASE}${endpoint}`);
  url.searchParams.set('output_format', outputFormat);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    const message = detail ? detail.slice(0, 500) : response.statusText;
    const error = new Error(`ElevenLabs request failed (${response.status}): ${message}`);
    error.statusCode = response.status;
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get('content-type') || 'audio/mpeg',
    characterCost: response.headers.get('character-cost')
      || response.headers.get('x-character-count')
      || '',
    requestId: response.headers.get('request-id') || response.headers.get('x-request-id') || '',
  };
};

const getCachedOrFetchElevenLabsAudio = async ({ endpoint, apiKey, payload, outputFormat, estimatedText }) => {
  const cacheKey = cacheKeyForAudio({ endpoint, outputFormat, payload });
  const cached = await readCachedAudio(cacheKey);
  if (cached) return cached;

  await assertElevenLabsBudget(estimateAudioCost({ text: estimatedText }));
  const result = await fetchElevenLabsAudio({ endpoint, apiKey, payload, outputFormat });
  const usage = await updateElevenLabsUsage(estimateAudioCost({ text: estimatedText, characterCost: result.characterCost }));
  const next = { ...result, cacheHit: false, usage };
  await writeCachedAudio(cacheKey, result).catch((error) => {
    console.warn('[Karen ElevenLabs] Audio cache write failed:', error?.message ?? error);
  });
  return next;
};

const sendElevenLabsAudio = async (res, result, provider) => {
  const usage = result.usage || await readElevenLabsUsage();
  const cap = resolveElevenLabsDailyCap();
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Cache-Control', result.cacheHit ? 'public, max-age=31536000, immutable' : 'no-store');
  res.setHeader('X-Karen-Audio-Provider', provider);
  res.setHeader('X-Karen-Audio-Cache', result.cacheHit ? 'hit' : 'miss');
  res.setHeader('X-Karen-Audio-Usage-Day', usage.day);
  res.setHeader('X-Karen-Audio-Usage-Character-Cost', String(usage.characterCost));
  res.setHeader('X-Karen-Audio-Usage-Daily-Cap', String(cap));
  if (result.characterCost) res.setHeader('X-ElevenLabs-Character-Cost', result.characterCost);
  if (result.requestId) res.setHeader('X-ElevenLabs-Request-Id', result.requestId);
  return res.send(result.buffer);
};

export function registerTtsRoutes(app, { resolveZenModel, sayTTSCapability }) {
  const jsonParser = express.json({ limit: '256kb' });

  let ttsModulePromise = null;
  const getTtsModule = async () => {
    if (!ttsModulePromise) {
      ttsModulePromise = import('./index.js');
    }
    return ttsModulePromise;
  };

  app.post('/api/voice/token', jsonParser, async (req, res) => {
    console.log('[Voice] Token request received:', {
      contentType: req.headers['content-type'] || null,
    });
    try {
      const openaiApiKey = process.env.OPENAI_API_KEY;
      console.log('[Voice] OpenAI API Key present:', !!openaiApiKey);

      if (!openaiApiKey) {
        return res.status(503).json({
          allowed: false,
          error: 'OpenAI voice service not configured. Set OPENAI_API_KEY environment variable.'
        });
      }

      // Return success - OpenAI TTS is available
      res.json({
        allowed: true,
        provider: 'openai',
        message: 'OpenAI TTS is available'
      });
    } catch (error) {
      console.error('[Voice] Token generation error:', error);
      res.status(500).json({
        allowed: false,
        error: 'Voice service error'
      });
    }
  });

  // Server-side TTS endpoint - streams audio from OpenAI TTS API
  app.post('/api/tts/speak', jsonParser, async (req, res) => {
    try {
      const { text, voice = 'nova', model = 'gpt-4o-mini-tts', speed = 0.9, instructions, summarize = false, providerId, modelId, threshold = 200, maxLength = 500, apiKey, baseURL } = req.body || {};

      const normalizedBaseURLResult = normalizeCustomOpenAIBaseURL(baseURL);
      if (normalizedBaseURLResult.error) {
        return res.status(400).json({ error: normalizedBaseURLResult.error });
      }
      const normalizedBaseURL = normalizedBaseURLResult.value;

      console.log('[TTS] Request received:', { voice, model, speed, textLength: text?.length, hasApiKey: !!apiKey, hasBaseURL: !!baseURL });

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Dynamically import the TTS service (ESM)
      const { ttsService } = await getTtsModule();

      // Check availability - server-configured key, client-provided key, or custom server URL
      const hasServerKey = ttsService.isAvailable();
      const hasClientKey = apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0;
      const hasCustomBaseURL = typeof normalizedBaseURL === 'string' && normalizedBaseURL.length > 0;
      
      if (!hasServerKey && !hasClientKey && !hasCustomBaseURL) {
        return res.status(503).json({ 
          error: 'TTS service not available. Please configure OpenAI in OpenCode, provide an API key, or set a custom server URL in settings.' 
        });
      }

      let textToSpeak = text.trim();

      // Optionally summarize long text before speaking using zen API
      if (summarize && textToSpeak.length > threshold) {
        try {
          const speakZenModel = await resolveZenModel(typeof req.body?.zenModel === 'string' ? req.body.zenModel : undefined);
          const result = await summarizeText({ text: textToSpeak, threshold, maxLength, zenModel: speakZenModel, mode: 'tts' });
          
          if (result.summarized && result.summary) {
            textToSpeak = result.summary;
          }
        } catch (summarizeError) {
          console.error('[TTS/speak] Summarization failed:', summarizeError);
          // Continue with original text if summarization fails
        }
      }

      const result = await ttsService.generateSpeechStream({
        text: textToSpeak,
        voice,
        model,
        speed,
        instructions,
        apiKey: hasClientKey ? apiKey.trim() : undefined,
        baseURL: hasCustomBaseURL ? normalizedBaseURL : undefined,
      });

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Length', result.buffer.length);
      res.send(result.buffer);
      } catch (error) {
        console.error('[TTS] Error:', error);
        if (!res.headersSent) {
          const { model: m, voice: v, baseURL: b } = req.body || {};
          res.status(500).json({ 
            error: error instanceof Error ? error.message : 'TTS generation failed',
            detail: { model: m, voice: v, hasBaseURL: !!b },
          });
        }
    }
  });

  app.get('/api/karen/elevenlabs/status', async (_req, res) => {
    const configured = Boolean(getElevenLabsApiKey());
    res.json({
      configured,
      provider: 'elevenlabs',
      secretEnvVar: 'ELEVENLABS_API_KEY',
      defaultVoiceId: resolveElevenLabsVoiceId(),
      usage: await buildUsagePayload(),
      recommendedModels: [
        {
          id: 'eleven_v3',
          label: 'Eleven v3',
          use: 'Most expressive Karen performance, best for roasts and final-boss lines.',
        },
        {
          id: 'eleven_flash_v2_5',
          label: 'Flash v2.5',
          use: 'Low-latency terminal roasts and quick quiz feedback.',
        },
        {
          id: 'eleven_multilingual_v2',
          label: 'Multilingual v2',
          use: 'Stable narration and longer lesson explanations.',
        },
      ],
      features: [
        {
          id: 'tts',
          label: 'Grandma roasts',
          status: configured ? 'ready' : 'needs_api_key',
          detail: 'Server-side text-to-speech for prompt blocks, quiz verdicts, and rollback lessons.',
        },
        {
          id: 'sound-effects',
          label: 'Courtroom stings',
          status: configured ? 'ready' : 'needs_api_key',
          detail: 'Generated gavel hits, rollback alarms, badge unlocks, and final-boss audio.',
        },
        {
          id: 'voice-library',
          label: 'Voice casting',
          status: configured ? 'ready' : 'needs_api_key',
          detail: 'List available voices so Karen can be cast as stern, sweet, unhinged, or game-show host.',
        },
      ],
    });
  });

  app.get('/api/karen/elevenlabs/usage', async (_req, res) => {
    try {
      return res.json(await buildUsagePayload());
    } catch (error) {
      console.error('[Karen ElevenLabs] Usage read error:', error?.message ?? error);
      return res.status(500).json({ error: 'Failed to read Karen audio usage' });
    }
  });

  app.get('/api/karen/elevenlabs/voices', async (_req, res) => {
    try {
      const apiKey = getElevenLabsApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.',
        });
      }

      const response = await fetch(`${ELEVENLABS_API_BASE}/voices?show_legacy=false`, {
        headers: {
          'xi-api-key': apiKey,
          accept: 'application/json',
        },
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return res.status(response.status).json({
          error: 'Failed to load ElevenLabs voices',
          detail: detail.slice(0, 500),
        });
      }

      const payload = await response.json();
      const voices = Array.isArray(payload?.voices)
        ? payload.voices.map(mapElevenLabsVoice).filter((voice) => voice.voiceId).slice(0, 80)
        : [];
      return res.json({ voices });
    } catch (error) {
      console.error('[Karen ElevenLabs] Voice list error:', error?.message ?? error);
      return res.status(500).json({ error: 'Failed to load ElevenLabs voices' });
    }
  });

  app.post('/api/karen/elevenlabs/speech', jsonParser, async (req, res) => {
    try {
      const apiKey = getElevenLabsApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.',
        });
      }

      const text = sanitizeElevenLabsText(req.body?.text, 1200);
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const voiceId = resolveElevenLabsVoiceId(req.body?.voiceId);
      const modelId = sanitizeElevenLabsId(req.body?.modelId, 'eleven_v3');
      const outputFormat = resolveElevenLabsOutputFormat(req.body?.outputFormat);
      const settings = req.body?.voiceSettings && typeof req.body.voiceSettings === 'object'
        ? req.body.voiceSettings
        : {};
      const voiceSettings = {
        stability: clampNumber(settings.stability, 0, 1, 0.5),
        similarity_boost: clampNumber(settings.similarity_boost, 0, 1, 0.78),
        style: clampNumber(settings.style, 0, 1, 0.45),
        use_speaker_boost: settings.use_speaker_boost !== false,
        speed: clampNumber(settings.speed, 0.7, 1.2, 0.92),
      };

      const result = await getCachedOrFetchElevenLabsAudio({
        endpoint: `/text-to-speech/${encodeURIComponent(voiceId)}`,
        apiKey,
        outputFormat,
        estimatedText: text,
        payload: {
          text,
          model_id: modelId,
          voice_settings: voiceSettings,
        },
      });

      return sendElevenLabsAudio(res, result, 'elevenlabs');
    } catch (error) {
      console.error('[Karen ElevenLabs] Speech error:', error?.message ?? error);
      return res.status(error?.statusCode || 500).json({
        error: error instanceof Error ? error.message : 'ElevenLabs speech generation failed',
      });
    }
  });

  app.post('/api/karen/elevenlabs/sound-effect', jsonParser, async (req, res) => {
    try {
      const apiKey = getElevenLabsApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: 'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.',
        });
      }

      const text = sanitizeElevenLabsText(req.body?.text, 600);
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const outputFormat = resolveElevenLabsOutputFormat(req.body?.outputFormat);
      const payload = {
        text,
        model_id: sanitizeElevenLabsId(req.body?.modelId, 'eleven_text_to_sound_v2'),
        loop: req.body?.loop === true,
        duration_seconds: clampNumber(req.body?.durationSeconds, 0.5, 30, 1.2),
        prompt_influence: clampNumber(req.body?.promptInfluence, 0, 1, 0.35),
      };

      const result = await getCachedOrFetchElevenLabsAudio({
        endpoint: '/sound-generation',
        apiKey,
        outputFormat,
        estimatedText: text,
        payload,
      });

      return sendElevenLabsAudio(res, result, 'elevenlabs-sfx');
    } catch (error) {
      console.error('[Karen ElevenLabs] Sound effect error:', error?.message ?? error);
      return res.status(error?.statusCode || 500).json({
        error: error instanceof Error ? error.message : 'ElevenLabs sound effect generation failed',
      });
    }
  });

  app.post('/api/text/summarize', jsonParser, async (req, res) => {
    try {
      const { text, threshold = 200, maxLength = 500, mode } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const sumZenModel = await resolveZenModel(typeof req.body?.zenModel === 'string' ? req.body.zenModel : undefined);
      let result = await summarizeText({
        text,
        threshold,
        maxLength,
        zenModel: sumZenModel,
        mode: typeof mode === 'string' ? mode : 'tts',
      });

      if (mode === 'note' && !result.summarized) {
        const notificationResult = await summarizeText({
          text,
          threshold,
          maxLength,
          zenModel: sumZenModel,
          mode: 'notification',
        });
        if (notificationResult.summarized && notificationResult.summary) {
          result = {
            ...notificationResult,
            summary: sanitizeForNote(sanitizeForNotification(notificationResult.summary)),
          };
        } else {
          return res.status(502).json({
            error: 'Note summarization failed',
            reason: notificationResult.reason || result.reason || 'No distilled result from model',
          });
        }
      }

      return res.json(result);
    } catch (error) {
      console.error('[Summarize] Error:', error);
      const sanitized = typeof req.body?.mode === 'string' && req.body.mode === 'note'
        ? sanitizeForNote(req.body?.text || '')
        : sanitizeForTTS(req.body?.text || '');
      return res.json({ summary: sanitized, summarized: false, reason: error.message });
    }
  });

       
  // TTS status endpoint
  app.get('/api/tts/status', async (_req, res) => {
    try {
      const { ttsService } = await getTtsModule();
      res.json({
        available: ttsService.isAvailable(),
        voices: [
          'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
          'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'
        ]
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to check TTS status' });
    }
  });

  // macOS 'say' command TTS status endpoint - returns cached capability from startup
  app.get('/api/tts/say/status', (_req, res) => {
    res.json(sayTTSCapability);
  });

  // macOS 'say' command TTS speak endpoint
  app.post('/api/tts/say/speak', jsonParser, async (req, res) => {
    try {
      const { text, voice = 'Samantha', rate = 200 } = req.body || {};
      
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'Text is required' });
      }
      
      // Check if we're on macOS
      if (process.platform !== 'darwin') {
        return res.status(503).json({ error: 'macOS say command not available on this platform' });
      }
      
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const execAsync = promisify(exec);
      
      // Create temp file for audio output (use m4a for browser compatibility)
      const tempDir = os.tmpdir();
      const tempFile = path.join(tempDir, `say-${Date.now()}.m4a`);
      
      // Escape text for shell - escape both single quotes and double quotes
      const escapedText = text.trim().replace(/'/g, "'\\''").replace(/"/g, '\\"');
      
      // Generate audio file using 'say' command
      // -o outputs to file, -r sets rate (words per minute)
      // --data-format=aac outputs as m4a which browsers can decode
      const cmd = `say -v "${voice}" -r ${rate} -o "${tempFile}" --data-format=aac '${escapedText}'`;
      console.log('[TTS-Say] Generating speech:', { textLength: text.length, voice, rate });
      
      await execAsync(cmd);
      
      // Read the generated audio file
      const audioBuffer = await fs.promises.readFile(tempFile);
      
      // Clean up temp file
      fs.promises.unlink(tempFile).catch(() => {});
      
      // Send audio response
      res.setHeader('Content-Type', 'audio/mp4');
      res.setHeader('Content-Length', audioBuffer.length);
      res.send(audioBuffer);
      
    } catch (error) {
      console.error('[TTS-Say] Error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Say command failed'
      });
    }
  });

  // Server-side STT: receive raw audio, proxy to OpenAI-compatible transcription endpoint
  app.post(
    '/api/stt/transcribe',
    express.raw({ type: (req) => (req.headers['content-type'] || '').startsWith('audio/'), limit: '20mb' }),
    async (req, res) => {
      try {
        const { transcribeAudio } = await import('./stt.js');

        const mimeType = (req.headers['content-type'] || 'audio/webm').split(',')[0].trim();
        const baseURL = typeof req.headers['x-base-url'] === 'string' ? req.headers['x-base-url'].trim() : '';
        const model = typeof req.headers['x-model'] === 'string' && req.headers['x-model'].trim().length > 0
          ? req.headers['x-model'].trim()
          : 'deepdml/faster-whisper-large-v3-turbo-ct2';
        const language = typeof req.headers['x-language'] === 'string' && req.headers['x-language'].trim().length > 0
          ? req.headers['x-language'].trim()
          : undefined;

        if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ error: 'Audio data is required' });
        }

        if (!baseURL) {
          return res.status(400).json({ error: 'X-Base-URL header is required' });
        }

        console.log('[STT] Transcribing audio:', {
          bytes: req.body.length,
          mimeType,
          model,
          baseURL,
          language,
        });

        const transcript = await transcribeAudio({
          audioBuffer: req.body,
          mimeType,
          model,
          baseURL,
          language,
        });

        console.log('[STT] Transcript:', transcript?.slice(0, 120));
        res.json({ transcript: transcript ?? '' });
      } catch (error) {
        console.error('[STT] Error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : 'Transcription failed',
          });
        }
      }
    }
  );
}
