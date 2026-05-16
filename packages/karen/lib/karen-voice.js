// Karen voice — line pools, context-aware selection, ElevenLabs orchestration.
//
// Karen has a personality. Every cue (blocked, quiz-pass, etc.) has a pool of
// possible lines instead of a single string, and the right line is chosen based
// on the current state: username, score, streak, time of day. The chosen line
// is then run through ElevenLabs with voice_settings tuned to the user's
// disciplineScore — angry for low scores, deadpan for high.
//
// Public API:
//   playKarenLine(cue, ctx, { warmOnly })
//   prewarmCommonLines(ctx)
//   voiceUsage()
//   muteSession() / unmuteSession()
//   setSessionVoiceOverride(voiceId | null)
//   sampleRandomLine()
//
// Cues recognised:
//   prompt-blocked, long-prompt, quiz-wrong, quiz-pass,
//   startup, login-success, logout, streak-break, level-up,
//   profile-read, feed-narrate, budget-warning, sample.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

// --- Constants ---------------------------------------------------------------

const DEFAULT_VOICE_ID = 'z9fAnlkpzviPz146aGWa'; // Glinda — older, warm-ironic.
const DEFAULT_MODEL_ID = 'eleven_flash_v2_5';

// Voice settings tuned by Karen's mood at the user, derived from score band.
const VOICE_SETTINGS = {
  angry:    { stability: 0.42, similarity_boost: 0.78, style: 0.65, use_speaker_boost: true, speed: 1.00 },
  standard: { stability: 0.55, similarity_boost: 0.78, style: 0.55, use_speaker_boost: true, speed: 0.88 },
  deadpan:  { stability: 0.82, similarity_boost: 0.78, style: 0.22, use_speaker_boost: true, speed: 0.85 },
};

const pickVoiceMood = (ctx = {}) => {
  const score = Number(ctx.score);
  if (!Number.isFinite(score)) return 'standard';
  if (score < 30) return 'angry';
  if (score >= 80) return 'deadpan';
  return 'standard';
};

// macOS-bundled system sounds, free for app use. SFX bed layered under voice.
const SFX_BED_DARWIN = {
  'prompt-blocked': '/System/Library/Sounds/Sosumi.aiff',
  'long-prompt':    '/System/Library/Sounds/Pop.aiff',
  'quiz-wrong':     '/System/Library/Sounds/Basso.aiff',
  'quiz-pass':      '/System/Library/Sounds/Glass.aiff',
  'level-up':       '/System/Library/Sounds/Hero.aiff',
  'streak-break':   '/System/Library/Sounds/Bottle.aiff',
  'login-success':  '/System/Library/Sounds/Funk.aiff',
};

// --- Line pools --------------------------------------------------------------
// `when` is an optional predicate over the ctx; lines without `when` are always
// eligible. If multiple `when` predicates match, all matching lines stay in the
// pool. {name}, {streak}, {score}, {level}, {hour}, {feedTitle} get substituted.

const POOLS = {
  'long-prompt': [
    { template: 'That prompt has a basement, {name}. Split it up.' },
    { template: 'I am not reading a whole lease agreement.' },
    { template: 'Too many words. Where are the acceptance criteria?' },
    { template: 'This prompt needs sections, not vibes.' },
    { template: 'Control A. Delete. Try again with bullets.' },
    { template: '{name}. This is a novel, not a prompt.' },
    { template: 'Karen does not have the time to read all that.', when: (ctx) => ctx.hour >= 22 || ctx.hour < 6 },
  ],
  'prompt-blocked': [
    { template: 'Absolutely not. Rewrite it with files, constraints, and tests.' },
    { template: '{name}. That prompt is going on the wall.' },
    { template: 'No. Try again with receipts.' },
    { template: 'Karen is unimpressed.' },
    { template: 'This prompt is an embarrassment. Start over.', when: (ctx) => Number(ctx.score) < 30 },
    { template: '{name}. Three strikes. Karen has notes.', when: (ctx) => Number(ctx.publicFailureCount) >= 5 },
    { template: 'Blocked. {name}, you know better.', when: (ctx) => Number(ctx.score) >= 70 },
    { template: 'Karen is filing this one under disappointment.' },
  ],
  'quiz-wrong': [
    { template: 'Wrong. Sandbox deleted. Read the code before you defend it.' },
    { template: 'Not even close. The diff was right there, {name}.' },
    { template: 'Karen is filing a complaint with the manager.' },
    { template: 'You did not read the code, {name}.' },
    { template: 'Thrown out. Every line, next time.' },
    { template: 'Karen vs {name}. Final score: zero.' },
  ],
  'quiz-pass': [
    { template: 'Fine. You read the diff. The patch may live.' },
    { template: 'Correct. Karen is reluctantly impressed.' },
    { template: 'You did read it. Karen will not say it twice.' },
    { template: 'Patch promoted. Do not make Karen regret this.' },
    { template: '{name}. That was the right answer. Once.' },
    { template: 'Approved. Karen is not handing out cookies.' },
  ],
  'startup': [
    { template: 'Karen is here. Do not waste her time.' },
    { template: 'Karen woke up cranky.', when: (ctx) => ctx.hour < 9 },
    { template: 'It is late, {name}. Karen is in her robe.', when: (ctx) => ctx.hour >= 22 || ctx.hour < 5 },
    { template: 'Karen remembers yesterday, {name}. Do not test her.', when: (ctx) => Number(ctx.publicFailureCount) > 0 },
    { template: '{name}. Karen respects the {streak}-day streak. Do not blow it.', when: (ctx) => Number(ctx.currentStreak) >= 7 },
    { template: 'Karen unbuttoned her cardigan. Bad sign.' },
    { template: 'Karen is reading your last commit. Not impressed.' },
  ],
  'login-success': [
    { template: '{name}. Karen has filed you under pending.' },
    { template: 'Linked. Welcome to the courthouse, {name}.' },
    { template: '{name}. Your record starts now.' },
    { template: 'Karen now knows where to send the complaints, {name}.' },
  ],
  'logout': [
    { template: '{name}. Karen forgets you. For now.' },
    { template: 'Unlinked. Karen is not sad about it.' },
  ],
  'streak-break': [
    { template: 'Your {streak}-day streak is dead, {name}.' },
    { template: 'Karen sighs. {streak} clean days, ruined.' },
    { template: 'The streak is over. Karen warned you.' },
  ],
  'level-up': [
    { template: '{name}. You are now {level}. Do not get comfortable.' },
    { template: 'Karen reluctantly upgrades you, {name}.' },
    { template: 'Level up. Karen is watching.' },
  ],
  'profile-read': [
    { template: '{name}. {score} out of one hundred. Karen has notes.', when: (ctx) => Number(ctx.score) < 50 },
    { template: '{name}. {score} out of one hundred. Acceptable, for now.', when: (ctx) => Number(ctx.score) >= 50 && Number(ctx.score) < 80 },
    { template: '{name}. {score} out of one hundred. Karen is reluctantly proud.', when: (ctx) => Number(ctx.score) >= 80 },
  ],
  'feed-narrate': [
    { template: 'Latest entry on the public record: {feedTitle}.' },
    { template: 'Karen reads from the wall of shame: {feedTitle}.' },
  ],
  'budget-warning': [
    { template: 'Karen is running out of voice budget today. Choose your words.' },
  ],
  'sample': [
    { template: 'Karen is testing her voice. Hear me, {name}?' },
    { template: 'This is what disappointment sounds like.' },
    { template: 'Karen, judge of prompts and people.' },
  ],
};

// --- Env / state -------------------------------------------------------------

const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const openchamberDataDir = path.join(configHome, 'openchamber');
const audioCacheDir = () => process.env.KAREN_AUDIO_CACHE_DIR || path.join(openchamberDataDir, 'karen-audio-cache', 'terminal');
const usagePath = () => path.join(openchamberDataDir, 'karen-elevenlabs-usage.json');
const todayKey = () => new Date().toISOString().slice(0, 10);

const envEnabled = (name, defaultValue = true) => {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
};

let sessionMuted = false;
let sessionVoiceOverride = null;

export const muteSession = () => { sessionMuted = true; };
export const unmuteSession = () => { sessionMuted = false; };
export const isSessionMuted = () => sessionMuted;
export const setSessionVoiceOverride = (voiceId) => { sessionVoiceOverride = voiceId || null; };
export const getSessionVoiceId = () => sessionVoiceOverride || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

const elevenLabsAllowed = () => (
  !sessionMuted
  && envEnabled('KAREN_AUDIO', true)
  && envEnabled('KAREN_ELEVENLABS_AUDIO', Boolean(process.env.ELEVENLABS_API_KEY))
  && Boolean(process.env.ELEVENLABS_API_KEY)
);

// --- Usage tracking ----------------------------------------------------------

const dailyCap = () => {
  const parsed = Number(process.env.KAREN_ELEVENLABS_DAILY_CAP || process.env.KAREN_AUDIO_DAILY_CAP || 20000);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 20000;
};

const readUsage = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(usagePath(), 'utf8'));
    if (parsed?.day === todayKey()) {
      return {
        day: parsed.day,
        requests: Number(parsed.requests) || 0,
        characterCost: Number(parsed.characterCost) || 0,
      };
    }
  } catch {}
  return { day: todayKey(), requests: 0, characterCost: 0 };
};

const writeUsage = (usage) => {
  try {
    fs.mkdirSync(path.dirname(usagePath()), { recursive: true });
    const tmp = `${usagePath()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(usage, null, 2)}\n`);
    fs.renameSync(tmp, usagePath());
  } catch {}
};

const recordUsage = (cost) => {
  const usage = readUsage();
  const next = {
    day: todayKey(),
    requests: usage.requests + 1,
    characterCost: usage.characterCost + Math.max(0, Math.trunc(Number(cost) || 0)),
  };
  writeUsage(next);
  return next;
};

export const voiceUsage = () => {
  const usage = readUsage();
  const cap = dailyCap();
  const pct = cap > 0 ? (usage.characterCost / cap) : 0;
  return {
    day: usage.day,
    requests: usage.requests,
    characterCost: usage.characterCost,
    cap,
    pct,
    state: cap === 0 ? 'unlimited' : pct >= 1 ? 'exhausted' : pct >= 0.8 ? 'warning' : 'ok',
  };
};

let budgetWarningAnnounced = false;
const maybeWarnAboutBudget = async (ctx) => {
  if (budgetWarningAnnounced) return;
  const u = voiceUsage();
  if (u.state !== 'warning') return;
  budgetWarningAnnounced = true;
  await playKarenLine('budget-warning', ctx);
};

// --- Line selection ----------------------------------------------------------

const TEMPLATE_REGEX = /\{(name|streak|score|level|hour|feedTitle)\}/g;

const renderTemplate = (template, ctx = {}) => {
  const safeName = String(ctx.name || ctx.username || 'you');
  const streak = String(ctx.currentStreak ?? ctx.streak ?? 0);
  const score = String(Math.round(Number(ctx.score) || 0));
  const level = String(ctx.level || 'standing');
  const hour = String(ctx.hour ?? new Date().getHours());
  const feedTitle = String(ctx.feedTitle || 'something embarrassing');
  return template.replace(TEMPLATE_REGEX, (_, key) => {
    switch (key) {
      case 'name': return safeName;
      case 'streak': return streak;
      case 'score': return score;
      case 'level': return level;
      case 'hour': return hour;
      case 'feedTitle': return feedTitle;
      default: return '';
    }
  });
};

const eligibleLines = (cue, ctx) => {
  const pool = POOLS[cue] || [];
  const matching = pool.filter((entry) => !entry.when || entry.when(ctx));
  return matching.length ? matching : pool;
};

export const pickLine = (cue, ctx = {}) => {
  const lines = eligibleLines(cue, ctx);
  if (!lines.length) return '';
  const choice = lines[Math.floor(Math.random() * lines.length)];
  return renderTemplate(choice.template, ctx);
};

// --- Cache + playback --------------------------------------------------------

const hashCacheKey = (voiceId, modelId, settings, text) => crypto
  .createHash('sha1')
  .update(JSON.stringify({ voiceId, modelId, settings, text }))
  .digest('hex')
  .slice(0, 24);

const spawnSilent = (command, args) => {
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const playAudioFile = (filePath) => {
  if (!fs.existsSync(filePath)) return false;
  if (process.platform === 'darwin') return spawnSilent('afplay', [filePath]);
  if (process.platform === 'linux') {
    return spawnSilent('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath])
      || spawnSilent('mpg123', ['-q', filePath]);
  }
  if (process.platform === 'win32') {
    return spawnSilent('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([Uri]::new(${JSON.stringify(filePath)})); $p.Play(); Start-Sleep -Milliseconds 3500`,
    ]);
  }
  return false;
};

const playSfxBed = (cue) => {
  if (process.platform !== 'darwin') return;
  const file = SFX_BED_DARWIN[cue];
  if (!file) return;
  playAudioFile(file);
};

const printCaption = (line) => {
  if (!line) return;
  if (!process.stdout.isTTY) return;
  if (envEnabled('KAREN_VOICE_CAPTIONS', true) === false) return;
  process.stdout.write(`\x1b[2m\x1b[38;5;245m   karen: ${line}\x1b[0m\n`);
};

const callElevenLabs = async (voiceId, payload, audioPath) => {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(audioPath), { recursive: true });
  const tmp = `${audioPath}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, audioPath);
  return Number(response.headers.get('character-cost')) || (typeof payload.text === 'string' ? payload.text.length : 0);
};

// Local-OS fallback voice (mac say, linux spd-say, windows speech synth).
const localSpeak = (text) => {
  if (!process.stdout.isTTY) return;
  const truncated = String(text).slice(0, 220);
  if (process.platform === 'darwin') {
    spawnSilent('say', ['-v', process.env.KAREN_SAY_VOICE || 'Karen', truncated]);
  } else if (process.platform === 'linux') {
    spawnSilent('spd-say', [truncated]);
  } else if (process.platform === 'win32') {
    spawnSilent('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak(${JSON.stringify(truncated)})`,
    ]);
  }
};

// --- Public: play a cue ------------------------------------------------------

export const playKarenLine = async (cue, ctx = {}, options = {}) => {
  const { warmOnly = false, suppressCaption = false } = options;
  const text = pickLine(cue, ctx);
  if (!text) return null;

  if (!warmOnly && !suppressCaption) printCaption(text);

  if (!elevenLabsAllowed()) {
    if (!warmOnly) localSpeak(text);
    return { text, source: 'local' };
  }

  const settings = VOICE_SETTINGS[pickVoiceMood(ctx)] || VOICE_SETTINGS.standard;
  const voiceId = getSessionVoiceId();
  const payload = {
    text,
    model_id: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
    voice_settings: settings,
  };
  const cacheKey = hashCacheKey(voiceId, payload.model_id, settings, text);
  const audioPath = path.join(audioCacheDir(), `${cacheKey}.mp3`);

  if (fs.existsSync(audioPath)) {
    if (!warmOnly) {
      playSfxBed(cue);
      // tiny offset so the SFX bed precedes voice by ~80ms
      setTimeout(() => playAudioFile(audioPath), 80);
    }
    return { text, source: 'cache' };
  }

  const u = voiceUsage();
  if (u.state === 'exhausted') {
    if (!warmOnly) localSpeak(text);
    return { text, source: 'budget-exhausted' };
  }
  if (u.cap > 0 && u.characterCost + text.length > u.cap) {
    if (!warmOnly) localSpeak(text);
    return { text, source: 'budget-would-exceed' };
  }

  try {
    const cost = await callElevenLabs(voiceId, payload, audioPath);
    recordUsage(cost);
    if (!warmOnly) {
      playSfxBed(cue);
      setTimeout(() => playAudioFile(audioPath), 80);
    }
    void maybeWarnAboutBudget(ctx);
    return { text, source: 'elevenlabs' };
  } catch (error) {
    if (!warmOnly) localSpeak(text);
    return { text, source: 'error', error: String(error?.message || error) };
  }
};

// --- Pre-warming -------------------------------------------------------------

export const prewarmCommonLines = async (ctx) => {
  if (!elevenLabsAllowed()) return;
  if (voiceUsage().state !== 'ok') return;
  // Pre-fetch the cues a user is most likely to trigger in their first minute.
  await Promise.allSettled([
    playKarenLine('prompt-blocked', ctx, { warmOnly: true }),
    playKarenLine('quiz-pass', ctx, { warmOnly: true }),
    playKarenLine('quiz-wrong', ctx, { warmOnly: true }),
  ]);
};

// --- Misc helpers ------------------------------------------------------------

export const sampleRandomLine = async (ctx) => {
  const cues = Object.keys(POOLS).filter((cue) => cue !== 'budget-warning' && cue !== 'sample');
  const cue = cues[Math.floor(Math.random() * cues.length)];
  await playKarenLine(cue, { ...ctx, name: ctx.name || ctx.username || 'you' });
  return cue;
};

export const listVoiceCues = () => Object.keys(POOLS);
