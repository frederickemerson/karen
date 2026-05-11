#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';
import * as nodePty from 'node-pty';

import { evaluatePrompt } from '../../web/server/lib/promptcourt/evaluator.js';
import { redactPublicText } from '../../web/server/lib/promptcourt/privacy.js';
import { createPromptCourtStore } from '../../web/server/lib/promptcourt/storage.js';
import { analyzeDiffImpact, parseDiff } from '../../web/server/lib/promptcourt/quiz-analyzer.js';
import { buildQuiz } from '../../web/server/lib/promptcourt/quiz.js';
import { installWorktreeCommitHooks, createCommitTokenFile } from '../../web/server/lib/opencode/git-commit-guard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const karenPackagePath = path.resolve(__dirname, '../package.json');
const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
const openchamberDataDir = path.join(configHome, 'openchamber');
const store = createPromptCourtStore({ openchamberDataDir });

const expandHome = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
};

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;5;203m',
  green: '\x1b[38;5;120m',
  cyan: '\x1b[38;5;81m',
  amber: '\x1b[38;5;221m',
  pink: '\x1b[38;5;213m',
  gray: '\x1b[38;5;245m',
  bgRed: '\x1b[48;5;203m\x1b[38;5;16m',
  bgGreen: '\x1b[48;5;120m\x1b[38;5;16m',
  bgBlue: '\x1b[48;5;39m\x1b[38;5;15m',
  bgYellow: '\x1b[48;5;221m\x1b[38;5;16m',
};

const color = (value, tone) => process.stdout.isTTY ? `${ansi[tone] || ''}${value}${ansi.reset}` : value;
const line = (value = '') => process.stdout.write(`${value}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const envEnabled = (name, defaultValue = true) => {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
};

const verboseAllowed = () => envEnabled('KAREN_VERBOSE', false);

const karenAvatar = [
  '  ░░████░░ ',
  '  ░█░░░░█░ ',
  '  █░●░░●░█ ',
  '  █░░▔▔░░█ ',
  '  ░█▄▄▄▄█░ ',
];

const KAREN_LONG_PROMPT_THRESHOLD = 900;
const KAREN_SCREAMS = [
  'KAREN: THAT PROMPT HAS A BASEMENT. SPLIT IT UP.',
  'KAREN: I AM NOT READING A WHOLE LEASE AGREEMENT.',
  'KAREN: TOO MANY WORDS. WHERE ARE THE ACCEPTANCE CRITERIA?',
  'KAREN: THIS PROMPT NEEDS SECTIONS, NOT VIBES.',
  'KAREN: CTRL+A, DELETE, TRY AGAIN WITH BULLETS.',
];

const audioAllowed = () => (
  envEnabled('KAREN_AUDIO', true)
  && (process.stdout.isTTY || envEnabled('KAREN_AUDIO_FORCE', false))
);
const bellAllowed = () => audioAllowed() && envEnabled('KAREN_BELL', true);
const musicAllowed = () => audioAllowed() && envEnabled('KAREN_MUSIC', true);
const speechAllowed = () => audioAllowed() && envEnabled('KAREN_SAY', false);
const systemAudioAllowed = () => audioAllowed() && envEnabled('KAREN_SYSTEM_AUDIO', false);
const elevenLabsTerminalAllowed = () => (
  audioAllowed()
  && envEnabled('KAREN_ELEVENLABS_AUDIO', Boolean(process.env.ELEVENLABS_API_KEY))
  && Boolean(process.env.ELEVENLABS_API_KEY)
);

const terminalBell = () => {
  if (bellAllowed()) process.stdout.write('\x07');
};

const bellBurst = (count = 1, gapMs = 90) => {
  if (!bellAllowed()) return;
  for (let index = 0; index < count; index += 1) {
    setTimeout(terminalBell, index * gapMs);
  }
};

const spawnSilent = (command, args) => {
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const systemBeep = (count = 1) => {
  if (!systemAudioAllowed()) return;
  if (process.platform === 'darwin') {
    spawnSilent('osascript', ['-e', `beep ${count}`]);
  } else if (process.platform === 'win32') {
    spawnSilent('powershell.exe', [
      '-NoProfile',
      '-Command',
      `[console]::beep(880,140);${count > 1 ? '[console]::beep(660,140);' : ''}`,
    ]);
  }
};

const speakKaren = (message) => {
  if (!speechAllowed()) return;
  const text = String(message).replace(/^KAREN:\s*/i, '').slice(0, 180);
  if (process.platform === 'darwin') {
    spawnSilent('say', ['-v', process.env.KAREN_SAY_VOICE || 'Samantha', text]);
  } else if (process.platform === 'linux') {
    spawnSilent('spd-say', [text]);
  } else if (process.platform === 'win32') {
    spawnSilent('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak(${JSON.stringify(text)})`,
    ]);
  }
};

const terminalAudioCacheDir = () => process.env.KAREN_AUDIO_CACHE_DIR || path.join(openchamberDataDir, 'karen-audio-cache', 'terminal');
const terminalAudioUsagePath = () => path.join(openchamberDataDir, 'karen-elevenlabs-usage.json');
const terminalTodayKey = () => new Date().toISOString().slice(0, 10);
const terminalAudioCap = () => {
  const parsed = Number(process.env.KAREN_ELEVENLABS_DAILY_CAP || process.env.KAREN_AUDIO_DAILY_CAP || 20000);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 20000;
};

const readTerminalAudioUsage = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(terminalAudioUsagePath(), 'utf8'));
    if (parsed?.day === terminalTodayKey()) {
      return {
        day: parsed.day,
        requests: Number(parsed.requests) || 0,
        characterCost: Number(parsed.characterCost) || 0,
      };
    }
  } catch {
    // Missing usage file means today has not spent audio yet.
  }
  return { day: terminalTodayKey(), requests: 0, characterCost: 0 };
};

const writeTerminalAudioUsage = (usage) => writeJson(terminalAudioUsagePath(), usage);

const addTerminalAudioUsage = (cost) => {
  const usage = readTerminalAudioUsage();
  const next = {
    day: terminalTodayKey(),
    requests: usage.requests + 1,
    characterCost: usage.characterCost + Math.max(0, Math.trunc(Number(cost) || 0)),
  };
  writeTerminalAudioUsage(next);
  return next;
};

const terminalAudioHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const playTerminalAudioFile = (filePath) => {
  if (process.platform === 'darwin') return spawnSilent('afplay', [filePath]);
  if (process.platform === 'linux') {
    return spawnSilent('ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath])
      || spawnSilent('mpg123', ['-q', filePath]);
  }
  if (process.platform === 'win32') {
    return spawnSilent('powershell.exe', [
      '-NoProfile',
      '-Command',
      `(New-Object Media.SoundPlayer ${JSON.stringify(filePath)}).PlaySync()`,
    ]);
  }
  return false;
};

const elevenLabsCueLine = (cue, message) => {
  const cleaned = String(message || '').replace(/^KAREN:\s*/i, '').slice(0, 220);
  if (cue === 'long-prompt') return cleaned || 'That prompt has a basement. Split it up.';
  if (cue === 'prompt-blocked') return cleaned || 'Absolutely not. Rewrite the prompt with files, constraints, and tests.';
  if (cue === 'quiz-wrong') return 'Wrong. Sandbox deleted. Read the code before you defend it.';
  if (cue === 'quiz-pass') return 'Fine. You read the diff. The patch may live.';
  return '';
};

const playElevenLabsCue = async (cue, message = '') => {
  if (!elevenLabsTerminalAllowed()) return;
  if (['quiz-start', 'quiz-question'].includes(cue)) return;
  const text = elevenLabsCueLine(cue, message);
  if (!text) return;

  const payload = {
    text,
    model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5',
    voice_settings: {
      stability: Number(process.env.ELEVENLABS_STABILITY || 0.62),
      similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY_BOOST || 0.78),
      style: Number(process.env.ELEVENLABS_STYLE || 0.34),
      use_speaker_boost: true,
      speed: Number(process.env.ELEVENLABS_SPEED || 0.92),
    },
  };
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  const cacheKey = terminalAudioHash(JSON.stringify({ voiceId, payload }));
  const audioPath = path.join(terminalAudioCacheDir(), `${cacheKey}.mp3`);
  if (fs.existsSync(audioPath)) {
    playTerminalAudioFile(audioPath);
    return;
  }

  const usage = readTerminalAudioUsage();
  const dailyCap = terminalAudioCap();
  if (dailyCap > 0 && usage.characterCost + text.length > dailyCap) {
    speakKaren(text);
    return;
  }

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`ElevenLabs ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(audioPath), { recursive: true });
    fs.writeFileSync(audioPath, buffer);
    addTerminalAudioUsage(Number(response.headers.get('character-cost')) || text.length);
    playTerminalAudioFile(audioPath);
  } catch {
    speakKaren(text);
  }
};

const playAudioCue = (cue, message = '') => {
  if (!audioAllowed()) return;
  void playElevenLabsCue(cue, message);
  if (cue === 'long-prompt') {
    bellBurst(6, 55);
    systemBeep(2);
    speakKaren(message);
  } else if (cue === 'prompt-blocked') {
    bellBurst(4, 70);
    systemBeep(2);
    speakKaren(message || 'Prompt blocked. Rewrite it with actual acceptance criteria.');
  } else if (cue === 'quiz-start') {
    bellBurst(2, 120);
    systemBeep(1);
  } else if (cue === 'quiz-wrong') {
    bellBurst(7, 45);
    systemBeep(2);
    speakKaren('Thrown out. Read the code next time.');
  } else if (cue === 'quiz-pass') {
    bellBurst(3, 100);
    systemBeep(1);
  } else if (cue === 'quiz-question') {
    terminalBell();
  }
};

const startQuizMusic = () => {
  if (!musicAllowed()) return () => {};
  const pattern = [1, 0, 1, 0, 1, 1, 0, 0];
  let step = 0;
  const timer = setInterval(() => {
    if (pattern[step % pattern.length]) terminalBell();
    step += 1;
  }, 650);
  return () => clearInterval(timer);
};

const normalizeJsonish = (raw) => raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')
  .replace(/,\s*([}\]])/g, '$1');

const readJsonish = (filePath) => {
  try {
    return JSON.parse(normalizeJsonish(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return null;
  }
};

const karenVersion = () => readJsonish(karenPackagePath)?.version || '0.0.0';

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
};

const createProjectIdFromPath = (projectPath) => {
  const normalized = String(projectPath || '').replace(/\\/g, '/').replace(/\/+$/g, '').trim();
  if (!normalized) return '';
  return `path_${Buffer.from(normalized, 'utf8').toString('base64url')}`;
};

const ensureGuiProjectDirectory = (directory) => {
  const resolved = path.resolve(directory || process.cwd());
  try {
    if (!fs.statSync(resolved).isDirectory()) return null;
  } catch {
    return null;
  }

  const settingsPath = openChamberSettingsPath();
  const settings = readJsonish(settingsPath) || {};
  const projects = Array.isArray(settings.projects) ? settings.projects : [];
  const existing = projects.find((project) => project && project.path === resolved) || null;
  const project = existing || {
    id: createProjectIdFromPath(resolved),
    path: resolved,
    addedAt: Date.now(),
  };
  const nextProjects = existing
    ? projects.map((entry) => (entry && entry.id === existing.id ? { ...entry, lastOpenedAt: Date.now() } : entry))
    : [...projects, { ...project, lastOpenedAt: Date.now() }];
  const approvedDirectories = Array.from(new Set([
    ...(Array.isArray(settings.approvedDirectories) ? settings.approvedDirectories : []),
    resolved,
  ]));

  writeJson(settingsPath, {
    ...settings,
    approvedDirectories,
    projects: nextProjects,
    activeProjectId: project.id,
    lastDirectory: resolved,
    homeDirectory: settings.homeDirectory || os.homedir(),
  });

  return resolved;
};

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: options.cwd || process.cwd(),
  encoding: 'utf8',
  stdio: options.stdio || 'pipe',
});

const isPortOpen = (port, host = '127.0.0.1') => new Promise((resolve) => {
  const socket = net.createConnection({ port, host });
  socket.setTimeout(400);
  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('timeout', () => {
    socket.destroy();
    resolve(false);
  });
  socket.once('error', () => resolve(false));
});

const openKarenGui = async () => {
  const port = Number(process.env.OPENCHAMBER_PORT || 3002);
  // Root path loads MainLayout (chat + git editor). `/karen` is PromptCourt-only (scoreboard) — see packages/ui/src/App.tsx.
  const guiPath = String(process.env.KAREN_GUI_PATH || '/').trim() || '/';
  const url = `http://127.0.0.1:${port}${guiPath.startsWith('/') ? guiPath : `/${guiPath}`}`;
  const scoreboardUrl = `http://127.0.0.1:${port}/karen`;
  const projectDirectory = ensureGuiProjectDirectory(process.cwd());
  if (await isPortOpen(port)) {
    line(color(`OpenChamber GUI is already running: ${url}`, 'green'));
    line(color(`PromptCourt scoreboard: ${scoreboardUrl}`, 'gray'));
    if (projectDirectory) {
      line(color(`Project folder set to ${projectDirectory}. Refresh the GUI if it was already open.`, 'gray'));
    }
    return;
  }

  line(color(`Starting OpenChamber GUI at ${url}`, 'cyan'));
  line(color(`PromptCourt scoreboard: ${scoreboardUrl}`, 'gray'));
  if (projectDirectory) {
    line(color(`Project folder: ${projectDirectory}`, 'gray'));
  }
  const child = spawn('bun', ['run', 'dev'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      OPENCHAMBER_PORT: String(port),
    },
  });
  child.unref();
  line(color('Give it a few seconds, then open the URL above.', 'gray'));
};

const isExecutableFile = (candidate) => {
  if (!candidate) return false;
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() && (process.platform === 'win32' || Boolean(stat.mode & 0o111));
  } catch {
    return false;
  }
};

const binaryFromCandidate = (candidate) => {
  const expanded = expandHome(candidate);
  if (!expanded) return null;

  try {
    const stat = fs.statSync(expanded);
    if (stat.isDirectory()) {
      const nested = path.join(expanded, process.platform === 'win32' ? 'opencode.exe' : 'opencode');
      return isExecutableFile(nested) ? nested : null;
    }
  } catch {
    // Fall through to executable and PATH checks.
  }

  if (expanded.endsWith('.app') || expanded.includes('.app/Contents/')) return null;
  if (expanded.includes(path.sep) && isExecutableFile(expanded)) return expanded;

  if (!expanded.includes(path.sep)) {
    const found = run(process.platform === 'win32' ? 'where' : 'which', [expanded]);
    if (found.status === 0 && found.stdout.trim()) {
      return found.stdout.trim().split(/\r?\n/)[0];
    }
  }

  return null;
};

const resolveOpencodeBinary = () => {
  const settings = readJsonish(path.join(openchamberDataDir, 'settings.json')) || {};
  const candidates = [
    settings.opencodeBinary,
    process.env.OPENCODE_BINARY,
    process.env.OPENCODE_PATH,
    process.env.OPENCHAMBER_OPENCODE_PATH,
    process.env.OPENCHAMBER_OPENCODE_BIN,
    'opencode',
    '~/.opencode/bin/opencode',
    '~/.bun/bin/opencode',
    '~/.local/bin/opencode',
    '~/bin/opencode',
    '/opt/homebrew/bin/opencode',
    '/usr/local/bin/opencode',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = binaryFromCandidate(candidate);
    if (resolved) return resolved;
  }

  if (process.platform !== 'win32') {
    const shell = process.env.SHELL || '/bin/sh';
    const found = run(shell, ['-lc', 'command -v opencode']);
    if (found.status === 0 && found.stdout.trim()) {
      return found.stdout.trim().split(/\r?\n/)[0];
    }
  }

  return null;
};

const getRepo = () => {
  const rootResult = run('git', ['rev-parse', '--show-toplevel']);
  const branchResult = run('git', ['branch', '--show-current']);
  const prefixResult = run('git', ['rev-parse', '--show-prefix']);
  return {
    root: rootResult.status === 0 ? rootResult.stdout.trim() : process.cwd(),
    branch: branchResult.status === 0 && branchResult.stdout.trim() ? branchResult.stdout.trim() : 'no-branch',
    prefix: prefixResult.status === 0 ? prefixResult.stdout.trim().replace(/\/$/, '') : '',
    isGit: rootResult.status === 0,
  };
};

const getGitDiff = (cwd = process.cwd(), args = ['diff', '--binary', '--no-color', 'HEAD']) => {
  const result = run('git', args, { cwd });
  return result.status === 0 ? result.stdout : '';
};

const applyPatch = (patch, args, cwd = process.cwd()) => {
  if (!patch.trim()) return { status: 0, stderr: '' };
  return spawnSync('git', ['apply', '--whitespace=nowarn', ...args], {
    cwd,
    encoding: 'utf8',
    input: patch,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};

const getUntrackedFiles = (cwd) => {
  const result = run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout.split('\0').map((entry) => entry.trim()).filter(Boolean);
};

const copyFileInto = (sourceRoot, targetRoot, relativePath) => {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (entry) => !entry.includes(`${path.sep}.git${path.sep}`),
  });
};

const prepareGeneratedDiff = (cwd) => {
  run('git', ['add', '-N', '.'], { cwd });
  return getGitDiff(cwd);
};

const normalizeOpenCodeModel = (value, provider = null) => {
  const model = String(value || '').trim();
  const providerId = String(provider || '').trim();
  if (!model || /^(y|yes|n|no)$/i.test(model)) return null;
  if (model.includes('/')) return model;
  if (providerId && /^[A-Za-z0-9_.-]+$/.test(providerId)) return `${providerId}/${model}`;
  return null;
};

const readRecentOpenCodeModel = () => {
  const modelState = readJsonish(path.join(stateHome, 'opencode', 'model.json')) || {};
  const recent = Array.isArray(modelState.recent) ? modelState.recent : [];
  for (const entry of recent) {
    const model = normalizeOpenCodeModel(entry?.modelID, entry?.providerID);
    if (model) return model;
  }
  return null;
};

const readOpenCodeState = () => {
  const openCodeConfig = readJsonish(process.env.OPENCODE_CONFIG || path.join(configHome, 'opencode', 'opencode.json'))
    || readJsonish(path.join(configHome, 'opencode', 'config.json'))
    || readJsonish(path.join(configHome, 'opencode', 'opencode.jsonc'))
    || readJsonish(path.join(process.cwd(), 'opencode.json'))
    || readJsonish(path.join(process.cwd(), 'opencode.jsonc'))
    || readJsonish(path.join(process.cwd(), '.opencode', 'opencode.json'))
    || readJsonish(path.join(process.cwd(), '.opencode', 'opencode.jsonc'))
    || {};
  const openChamberSettings = readJsonish(path.join(configHome, 'openchamber', 'settings.json')) || {};
  const model = normalizeOpenCodeModel(openChamberSettings.defaultModel)
    || normalizeOpenCodeModel(openChamberSettings.currentModelId, openChamberSettings.currentProviderId)
    || normalizeOpenCodeModel(openChamberSettings.zenModel, 'opencode')
    || normalizeOpenCodeModel(openCodeConfig.model, openCodeConfig.provider)
    || readRecentOpenCodeModel();
  return {
    provider: model?.split('/')?.[0] || openChamberSettings.currentProviderId || openCodeConfig.provider || 'use /providers',
    model: model || 'use /models',
    pluginCount: Array.isArray(openCodeConfig.plugin) ? openCodeConfig.plugin.length : 0,
  };
};

const openChamberSettingsPath = () => path.join(openchamberDataDir, 'settings.json');

const writeDefaultModel = (model) => {
  const settingsPath = openChamberSettingsPath();
  const settings = readJsonish(settingsPath) || {};
  writeJson(settingsPath, {
    ...settings,
    defaultModel: model,
    currentModelId: model,
    currentProviderId: model.includes('/') ? model.split('/')[0] : settings.currentProviderId,
  });
};

const needsSetup = () => {
  const binary = resolveOpencodeBinary();
  const oc = readOpenCodeState();
  return !binary || oc.provider.startsWith('use /') || oc.model.startsWith('use /');
};

const username = () => store.normalizeUsername(process.env.KAREN_USER || os.userInfo().username || 'local-user');

const drawShell = () => {
  const repo = getRepo();
  const oc = readOpenCodeState();
  const profile = store.getProfile(username());
  if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
  line(color('KAREN', 'pink') + color('  terminal judgment layer for OpenCode', 'gray'));
  line(color('═'.repeat(72), 'gray'));
  for (const avatarLine of karenAvatar) {
    line(`${color(avatarLine, 'pink')}  ${color('repo', 'cyan')} ${repo.root}  ${color('branch', 'cyan')} ${repo.branch}`);
  }
  line(`${color('user', 'cyan')} @${username()}  ${color('discipline', 'cyan')} ${profile.stats.disciplineScore}/100 ${profile.stats.level}`);
  line(`${color('provider', 'cyan')} ${oc.provider}  ${color('model', 'cyan')} ${oc.model}  ${color('plugins', 'cyan')} ${oc.pluginCount}`);
  line(color('─'.repeat(72), 'gray'));
  line(`${color('/help', 'green')} commands  ${color('/gui', 'green')} web GUI  ${color('/providers', 'green')} auth  ${color('/models', 'green')} models  ${color('/feed', 'green')} shame`);
  if (needsSetup()) {
    line(color('Setup needed: run /setup to connect providers and choose a default model.', 'amber'));
  }
  line('');
};

const publicPostFor = (prompt, evaluation) => ({
  title: `Karen blocked ${evaluation.score}/100 prompt`,
  score: evaluation.score,
  promptExcerpt: redactPublicText(prompt),
  failureReasons: evaluation.reasons,
  suggestedRewrite: redactPublicText(evaluation.suggestedRewrite, 600),
});

const recordBlocked = (prompt, evaluation) => store.recordBlockedPrompt({
  username: username(),
  prompt: redactPublicText(prompt, 1200),
  evaluation,
  publicPost: publicPostFor(prompt, evaluation),
});

const printVerdict = (prompt, evaluation) => {
  const tone = evaluation.allowed ? 'green' : 'red';
  if (evaluation.allowed && !verboseAllowed()) return;
  if (evaluation.intent === 'conversational') {
    line(color('Verdict: PASS — chitchat allowed (no code change requested).', tone));
    return;
  }
  if (evaluation.intent === 'exploration') {
    line(color('Verdict: PASS — exploration allowed (read-only intent).', tone));
    return;
  }
  line(color(`Verdict: ${evaluation.verdict.toUpperCase()} ${evaluation.score}/100`, tone));
  if (evaluation.reasons.length > 0) {
    line(color('Charges:', 'amber'));
    for (const reason of evaluation.reasons) line(`  ${color('•', 'red')} ${reason}`);
  }
  if (!evaluation.allowed) {
    playAudioCue('prompt-blocked', 'Prompt blocked. Rewrite it with files, constraints, tests, and done criteria.');
    line('');
    line(color('Suggested appeal:', 'green'));
    line(evaluation.suggestedRewrite);
    const { post } = recordBlocked(prompt, evaluation);
    line('');
    line(post ? color(`Public record: ${post.id}`, 'red') : color('Public posting disabled by Karen privacy policy.', 'amber'));
  }
};

const shouldRunAgentForEvaluation = (evaluation) => (
  evaluation?.allowed === true
);

const maybeScreamAtLongPrompt = (prompt) => {
  if (prompt.length < KAREN_LONG_PROMPT_THRESHOLD) return;
  const screamChance = Math.min(0.75, (prompt.length - KAREN_LONG_PROMPT_THRESHOLD) / 1600);
  if (Math.random() > screamChance) return;
  const scream = KAREN_SCREAMS[Math.floor(Math.random() * KAREN_SCREAMS.length)] ?? KAREN_SCREAMS[0];
  playAudioCue('long-prompt', scream);
  line('');
  line(color(scream, 'red'));
  line(color(`${prompt.length.toLocaleString()} chars. Karen wants shorter prompts with bullets.`, 'amber'));
  line('');
};

const printOpenCodeCommands = () => {
  line(color('OpenCode passthrough commands', 'cyan'));
  line('  /tui [project]          start guarded OpenCode TUI with Karen prompt interception');
  line('  /tui-raw [project]      start raw OpenCode TUI without interception');
  line('  /run <message>          run OpenCode without the Karen prompt gate');
  line('  /attach <url>           attach to a running OpenCode server');
  line('  /serve [...args]        start a headless OpenCode server');
  line('  /web [...args]          start OpenCode web');
  line('  /session [...args]      manage sessions');
  line('  /stats [...args]        token usage and cost statistics');
  line('  /export <sessionID>     export session JSON');
  line('  /import <file-or-url>   import session JSON');
  line('  /plugin <module>        install plugin');
  line('  /github [...args]       manage GitHub agent');
  line('  /pr <number>            checkout a GitHub PR and run OpenCode');
  line('  /debug [...args]        troubleshooting tools');
  line('  /upgrade [target]       upgrade OpenCode');
  line('  /completion [...args]   shell completion script');
  line('  /db [...args]           database tools');
  line('  /acp [...args]          start ACP server');
};

const proxyOpencode = (args, options = {}) => new Promise((resolve) => {
  const binary = resolveOpencodeBinary();
  if (!binary) {
    line(color('OpenCode binary not found. Install OpenCode or set OPENCODE_BINARY.', 'red'));
    resolve(127);
    return;
  }
  const child = spawn(binary, args, { cwd: options.cwd || process.cwd(), stdio: options.stdio || 'inherit' });
  child.on('exit', (code) => resolve(code ?? 0));
});

const stripAnsi = (value) => String(value)
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
  .replace(/\x1b[@-_]/g, '');

const classifyTuiContext = (screenTail) => {
  const tail = stripAnsi(screenTail).toLowerCase();
  const recentLines = tail
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(-8)
    .join('\n');
  const controlPattern = [
    'select',
    'choose',
    'picker',
    'providers?',
    'models?',
    'confirm',
    'continue\\?',
    'are you sure',
    'press enter',
    'press any key',
    'search',
    'filter',
    'command palette',
    'esc',
    'arrow',
    'tab',
    'ctrl\\+',
    'yes/no',
    '\\[y/n\\]',
  ].join('|');
  if (new RegExp(controlPattern, 'i').test(recentLines)) {
    return 'control';
  }
  if (/(message|prompt|ask|what do you want|type a message|send a message|enter prompt|write your request|new message)/i.test(recentLines)) {
    return 'prompt';
  }
  if (/(^|\n)\s*(?:>|›|❯)\s*$/.test(tail)) {
    return 'prompt';
  }
  return 'unknown';
};

const shouldJudgeTuiBuffer = (value, { screenTail = '' } = {}) => {
  const prompt = value.trim();
  if (!prompt) return false;
  if (prompt.startsWith('/') || prompt.startsWith(':')) return false;
  if (/^[ynq?]$/i.test(prompt)) return false;
  const context = classifyTuiContext(screenTail);
  if (context === 'control') return false;
  if (context === 'unknown' && envEnabled('KAREN_TUI_HEURISTIC_PROMPTS', true) === false) return false;
  return prompt.includes(' ') || prompt.length >= 24;
};

const updateTuiBuffer = (buffer, char) => {
  if (char === '\x15') return '';
  if (char === '\x7f' || char === '\b') return buffer.slice(0, -1);
  if (char >= ' ' && char !== '\x7f') return `${buffer}${char}`;
  return buffer;
};

const isControlInput = (data) => (
  data.includes('\x1b')
  || data === '\t'
  || data === '\x10'
  || data === '\x0e'
  || data === '\x01'
  || data === '\x05'
);

const printTuiBlock = (prompt, evaluation) => {
  const { post } = recordBlocked(prompt, evaluation);
  playAudioCue('prompt-blocked', 'OpenCode did not receive that prompt. Rewrite it with receipts.');
  process.stdout.write('\r\n');
  line(color('KAREN INTERCEPTED THAT TUI PROMPT', 'red'));
  line(color(`Verdict: BLOCKED ${evaluation.score}/100`, 'red'));
  for (const reason of evaluation.reasons.slice(0, 4)) {
    line(`  ${color('•', 'red')} ${reason}`);
  }
  line(color('Suggested appeal:', 'green'));
  line(evaluation.suggestedRewrite);
  line(post ? color(`Public record: ${post.id}`, 'red') : color('Public posting disabled by Karen privacy policy.', 'amber'));
  line(color('OpenCode did not receive Enter. Rewrite the prompt in the TUI input.', 'amber'));
  process.stdout.write('\r\n');
};

const proxyOpencodeTuiIntercept = (args = []) => new Promise((resolve) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY || envEnabled('KAREN_TUI_INTERCEPT', true) === false) {
    void proxyOpencode(args).then(resolve);
    return;
  }

  const binary = resolveOpencodeBinary();
  if (!binary) {
    line(color('OpenCode binary not found. Install OpenCode or set OPENCODE_BINARY.', 'red'));
    resolve(127);
    return;
  }

  const child = nodePty.spawn(binary, args, {
    name: process.env.TERM || 'xterm-256color',
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
    cwd: process.cwd(),
    env: process.env,
  });

  let inputBuffer = '';
  let screenTail = '';
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const onResize = () => {
    child.resize(process.stdout.columns || 120, process.stdout.rows || 40);
  };

  const onInput = (chunk) => {
    const data = chunk.toString('utf8');
    if (isControlInput(data)) {
      child.write(data);
      return;
    }
    for (const char of data) {
      if (char === '\u0003' || char === '\u0004') {
        inputBuffer = '';
        child.write(char);
        continue;
      }

      if (char === '\r' || char === '\n') {
        const prompt = inputBuffer.trim();
        inputBuffer = '';
        maybeScreamAtLongPrompt(prompt);
        if (shouldJudgeTuiBuffer(prompt, { screenTail })) {
          const evaluation = evaluatePrompt(prompt);
          if (!evaluation.allowed) {
            child.write('\x15');
            printTuiBlock(prompt, evaluation);
            continue;
          }
        }
        child.write(char);
        continue;
      }

      inputBuffer = updateTuiBuffer(inputBuffer, char);
      child.write(char);
    }
  };

  child.onData((data) => {
    screenTail = `${screenTail}${stripAnsi(data)}`.slice(-3000);
    process.stdout.write(data);
  });
  process.stdin.on('data', onInput);
  process.stdout.on('resize', onResize);

  child.onExit(({ exitCode }) => {
    process.stdin.off('data', onInput);
    process.stdout.off('resize', onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw);
    resolve(exitCode ?? 0);
  });
});

const cleanupWorktree = (repoRoot, worktreePath, runtimeDir) => {
  if (!worktreePath) return;
  const removed = run('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoRoot });
  if (removed.status !== 0 && fs.existsSync(worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
    run('git', ['worktree', 'prune'], { cwd: repoRoot });
  }
  if (runtimeDir) {
    try { fs.rmSync(runtimeDir, { recursive: true, force: true }); } catch {}
  }
};

const createIsolatedWorktree = () => {
  const repo = getRepo();
  if (!repo.isGit) {
    return { ok: false, error: 'Karen needs a git repository for isolated execution.' };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karen-worktree-'));
  const addResult = run('git', ['worktree', 'add', '--quiet', '--detach', tempRoot, 'HEAD'], { cwd: repo.root });
  if (addResult.status !== 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { ok: false, error: addResult.stderr?.trim() || 'Failed to create isolated worktree.' };
  }

  const runId = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const runtimeDir = path.join(os.tmpdir(), 'karen-runs', runId);
  let commitToken;
  try {
    const tokenInfo = createCommitTokenFile({ runtimeDir, fs, path });
    commitToken = tokenInfo.token;
    installWorktreeCommitHooks({
      worktreePath: tempRoot,
      runtimeDir,
      allowSecret: commitToken,
      fs,
      path,
    });
  } catch (error) {
    cleanupWorktree(repo.root, tempRoot, runtimeDir);
    return { ok: false, error: `Failed to install Karen commit hooks: ${error?.message || error}` };
  }

  const baselinePatch = getGitDiff(repo.root);
  if (baselinePatch.trim()) {
    const applied = applyPatch(baselinePatch, [], tempRoot);
    if (applied.status !== 0) {
      cleanupWorktree(repo.root, tempRoot, runtimeDir);
      return { ok: false, error: applied.stderr?.trim() || 'Failed to mirror current tracked changes into isolated worktree.' };
    }
  }

  for (const untracked of getUntrackedFiles(repo.root)) {
    copyFileInto(repo.root, tempRoot, untracked);
  }

  run('git', ['add', '-A'], { cwd: tempRoot });
  const commitResult = spawnSync('git', [
    '-c',
    'user.name=Karen',
    '-c',
    'user.email=karen@local.invalid',
    'commit',
    '--allow-empty',
    '--quiet',
    '-m',
    'Karen isolated baseline',
  ], {
    cwd: tempRoot,
    encoding: 'utf8',
    env: { ...process.env, KAREN_COMMIT_ALLOW_TOKEN: commitToken },
  });
  if (commitResult.status !== 0) {
    cleanupWorktree(repo.root, tempRoot, runtimeDir);
    return { ok: false, error: commitResult.stderr?.trim() || 'Failed to create isolated baseline.' };
  }

  return {
    ok: true,
    repoRoot: repo.root,
    worktreePath: tempRoot,
    runCwd: path.join(tempRoot, repo.prefix),
    runtimeDir,
    commitToken,
  };
};

const buildRunArgs = (prompt) => {
  const oc = readOpenCodeState();
  const args = ['run', prompt];
  if (oc.model && !oc.model.startsWith('use /')) {
    args.push('--model', oc.model);
  }
  return args;
};

const promoteGeneratedDiff = (repoRoot, generatedDiff) => {
  const promoted = applyPatch(generatedDiff, [], repoRoot);
  if (promoted.status === 0) return true;
  line(color('Karen could not apply the generated patch back to your real repo.', 'red'));
  if (promoted.stderr) line(color(promoted.stderr.trim(), 'gray'));
  return false;
};

const runAgent = async (prompt, session) => {
  const isolated = createIsolatedWorktree();
  if (!isolated.ok) {
    line(color(isolated.error, 'red'));
    return;
  }

  if (verboseAllowed()) {
    line(color(`Running OpenCode in isolated worktree: ${isolated.worktreePath}`, 'cyan'));
  }
  try {
    await proxyOpencode(buildRunArgs(prompt), { cwd: isolated.runCwd });
    try {
      const generatedDiff = prepareGeneratedDiff(isolated.worktreePath);
      if (generatedDiff.trim()) {
        const summary = parseDiff(generatedDiff);
        const changedFiles = summary.files.map((file) => file.path);
        const quizPassed = await runQuiz({ prompt, generatedDiff, cwd: isolated.worktreePath });
        if (quizPassed) {
          const promoted = promoteGeneratedDiff(isolated.repoRoot, generatedDiff);
          store.recordQuizResult({
            sessionId: session.id,
            quizPassed: promoted,
            rollbackTriggered: !promoted,
            changedFiles,
            publicPost: promoted ? null : buildQuizFailurePost(prompt, generatedDiff, 'Patch promotion failed'),
          });
          line(color(
            promoted
              ? 'Generated patch promoted into your real worktree.'
              : 'Generated patch stayed inside the isolated worktree and was discarded.',
            promoted ? 'green' : 'amber',
          ));
          if (!promoted) {
            teachAfterDiscard({ prompt, generatedDiff, reason: 'Patch promotion failed' });
          }
        } else {
          store.recordQuizResult({
            sessionId: session.id,
            quizPassed: false,
            rollbackTriggered: true,
            changedFiles,
            publicPost: buildQuizFailurePost(prompt, generatedDiff, 'Failed code-read quiz'),
          });
          line(color('Generated work stayed in the isolated worktree and was discarded.', 'amber'));
          teachAfterDiscard({ prompt, generatedDiff, reason: 'Failed code-read quiz' });
        }
      } else {
        store.recordQuizResult({
          sessionId: session.id,
          quizPassed: true,
          rollbackTriggered: false,
          changedFiles: [],
        });
        if (verboseAllowed()) {
          line(color('No generated diff detected after OpenCode finished.', 'amber'));
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      store.recordRunEvent({
        sessionId: session.id,
        username: session.username,
        status: 'quiz_errored',
        label: 'Quiz preparation failed before promotion could be evaluated.',
        details: reason.slice(0, 400),
      });
      line(color(`Karen could not prepare the generated diff or run the quiz: ${reason}`, 'red'));
      throw error;
    }
  } finally {
    cleanupWorktree(isolated.repoRoot, isolated.worktreePath, isolated.runtimeDir);
  }
};

const buildQuizFailurePost = (prompt, generatedDiff, reason) => {
  const summary = parseDiff(generatedDiff);
  return {
    title: 'Karen threw out generated code',
    score: 0,
    promptExcerpt: redactPublicText(prompt, 300),
    failureReasons: [reason, `${summary.files.length} files changed`, `${summary.additions} additions / ${summary.deletions} deletions`],
    suggestedRewrite: 'Read the diff before asking Karen to keep it.',
  };
};

const teachAfterDiscard = ({ prompt, generatedDiff, reason }) => {
  const summary = parseDiff(generatedDiff);
  const topFile = [...summary.files].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))[0];
  const topSymbols = summary.addedSymbols.slice(0, 3);
  const promptLesson = evaluatePrompt(prompt);

  line('');
  line(color('KAREN LESSON', 'pink'));
  line(color('Your generated code was discarded. Here is the post-mortem.', 'gray'));
  line(`  ${color('1.', 'cyan')} Start with the blast radius: ${summary.files.length} file(s), ${summary.additions} additions, ${summary.deletions} deletions.`);
  if (topFile) {
    line(`  ${color('2.', 'cyan')} The highest-risk file was ${color(topFile.path, 'amber')} with ${topFile.additions + topFile.deletions} changed line(s).`);
  } else {
    line(`  ${color('2.', 'cyan')} Karen could not find a normal text diff, so inspect binary/generated output manually next time.`);
  }
  if (topSymbols.length > 0) {
    line(`  ${color('3.', 'cyan')} Name the new symbols before approving: ${topSymbols.join(', ')}.`);
  } else {
    line(`  ${color('3.', 'cyan')} If there are no obvious symbols, read the hunk labels and added lines before answering.`);
  }
  line(`  ${color('4.', 'cyan')} The reset reason was: ${reason}.`);
  line(`  ${color('5.', 'cyan')} Rewrite the prompt with explicit files, success criteria, and tests.`);
  if (promptLesson.reasons.length > 0) {
    line('');
    line(color('Prompt coaching:', 'amber'));
    for (const lesson of promptLesson.reasons.slice(0, 4)) {
      line(`  - ${lesson}`);
    }
  }
  line('');
};

const runQuiz = async ({ prompt, generatedDiff, cwd = null }) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const quiz = await buildQuiz({
    prompt,
    generatedDiff,
    cwd,
    onAiFallback: (message) => {
      line(color(`Karen AI quiz fell back to parser questions: ${message}`, 'amber'));
    },
  });
  const questions = quiz.questions;
  const stopMusic = startQuizMusic();
  playAudioCue('quiz-start');
  line('');
  line(color('CODE READ CHECK', 'pink'));
  line(color('Kahoot mode. Answer from the diff Karen is about to promote. Audio uses terminal bells by default.', 'gray'));
  line(color(`Quiz source: ${quiz.source}`, 'gray'));

  try {
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      playAudioCue('quiz-question');
      line('');
      line(color(`Question ${index + 1}/${questions.length}: ${question.prompt}`, 'cyan'));
      if (question.evidence) {
        line(color(`Evidence: ${question.evidence}`, 'gray'));
      }
      if (question.why) {
        line(color(`Why it matters: ${question.why}`, 'gray'));
      }
      const blocks = [ansi.bgRed, ansi.bgBlue, ansi.bgYellow, ansi.bgGreen];
      question.options.forEach((option, optionIndex) => {
        const block = process.stdout.isTTY ? blocks[optionIndex % blocks.length] : '';
        line(`${block} ${optionIndex + 1} ${ansi.reset} ${option}`);
      });
      const answer = await rl.question(color('answer > ', 'green'));
      const selected = Number(answer.trim()) - 1;
      if (selected !== question.answer) {
        line('');
        line(color('THROWN OUT', 'red'));
        playAudioCue('quiz-wrong');
        return false;
      }
    }

    line('');
    line(color('PASSED. Promoting patch.', 'green'));
    playAudioCue('quiz-pass');
    return true;
  } finally {
    stopMusic();
    rl.close();
  }
};

const printAudioStatus = () => {
  line(color('Karen audio', 'cyan'));
  line(`  KAREN_AUDIO=${audioAllowed() ? 'on' : 'off'}       master switch; set 0 to silence Karen`);
  line(`  KAREN_BELL=${bellAllowed() ? 'on' : 'off'}        terminal bell cues`);
  line(`  KAREN_MUSIC=${musicAllowed() ? 'on' : 'off'}       quiz beat using terminal bell rhythm`);
  line(`  KAREN_SYSTEM_AUDIO=${systemAudioAllowed() ? 'on' : 'off'} optional OS beep`);
  line(`  KAREN_SAY=${speechAllowed() ? 'on' : 'off'}         optional local system voice`);
  line(`  KAREN_ELEVENLABS_AUDIO=${elevenLabsTerminalAllowed() ? 'on' : 'off'} ElevenLabs terminal clips with local cache`);
  line(`  KAREN_ELEVENLABS_DAILY_CAP=${terminalAudioCap()} character-unit daily cap for fresh audio calls`);
  line(color('Examples: KAREN_AUDIO=0 karen, KAREN_MUSIC=0 karen, KAREN_SAY=1 karen, KAREN_ELEVENLABS_AUDIO=0 karen', 'gray'));
};

const printHelp = () => {
  line(color('Karen commands', 'pink'));
  line('  /gui             start/open OpenChamber web UI (editor); scoreboard lives at /karen');
  line('  /setup           guided OpenCode provider/model setup');
  line('  /commands        list OpenCode commands Karen can proxy');
  line('  /tui [project]   guarded OpenCode TUI; Karen blocks weak entered prompts');
  line('  /tui-raw [...]   raw OpenCode TUI without Karen interception');
  line('  /run <message>   run OpenCode directly without Karen gating');
  line('  /providers       open OpenCode provider/auth manager');
  line('  /models [id]     list OpenCode models');
  line('  /auth            alias for /providers');
  line('  /mcp             manage MCP through OpenCode');
  line('  /agent           manage OpenCode agents');
  line('  /session         manage OpenCode sessions');
  line('  /stats           show token and cost stats');
  line('  /audio           show terminal audio controls');
  line('  /feed            show latest public shame records');
  line('  /profile         show your Karen profile');
  line('  /diff            show current git diff stat');
  line('  /opencode ...    pass any command through to OpenCode');
  line('  /quit /exit /q   leave Karen');
};

const printCliHelp = () => {
  line(`Karen ${karenVersion()}`);
  line('');
  line('Usage:');
  line('  karen                 open the interactive Karen shell');
  line('  karen "<prompt>"      judge and run one prompt');
  line('  karen --help          show this help');
  line('  karen --version       show version');
  line('');
  printHelp();
};

const runSetupWizard = async (rl, { force = false } = {}) => {
  const binary = resolveOpencodeBinary();
  const oc = readOpenCodeState();
  if (!force && !needsSetup()) return;

  line('');
  line(color('KAREN SETUP', 'pink'));
  line(color('One-time check: OpenCode binary, provider auth, and default model.', 'gray'));

  if (!binary) {
    line(color('OpenCode binary not found.', 'red'));
    line('Set OPENCODE_BINARY or configure OpenChamber settings.opencodeBinary, then run /setup again.');
    return;
  }

  line(`${color('OpenCode', 'cyan')} ${binary}`);
  line(`${color('Provider', 'cyan')} ${oc.provider}`);
  line(`${color('Model', 'cyan')} ${oc.model}`);

  const authAnswer = await rl.question(color('Open provider/auth manager now? [y/N] ', 'green'));
  if (authAnswer.trim().toLowerCase() === 'y') {
    await proxyOpencode(['providers']);
  }

  const modelsAnswer = await rl.question(color('List models now? [y/N] ', 'green'));
  if (modelsAnswer.trim().toLowerCase() === 'y') {
    await proxyOpencode(['models']);
  }

  const modelAnswer = await rl.question(color('Default model provider/model (blank to keep current) > ', 'green'));
  const model = normalizeOpenCodeModel(modelAnswer, oc.provider);
  if (model) {
    writeDefaultModel(model);
    line(color(`Default model saved: ${model}`, 'green'));
  } else if (modelAnswer.trim()) {
    line(color('Default model not saved. Use provider/model, for example opencode/minimax-m2.5-free.', 'amber'));
  }
};

const printFeed = () => {
  const posts = store.getFeed(8);
  if (posts.length === 0) {
    line(color('No public shame records yet.', 'green'));
    return;
  }
  for (const post of posts) {
    line(`${color(post.title, 'red')} ${color(`@${post.username}`, 'gray')}`);
    line(`  ${post.promptExcerpt || ''}`);
  }
};

const printProfile = () => {
  const profile = store.getProfile(username());
  line(color(`@${profile.user.username}`, 'pink'));
  line(`Discipline: ${profile.stats.disciplineScore}/100 ${profile.stats.level}`);
  line(`Prompt avg: ${profile.stats.averagePromptScore}/100  Public failures: ${profile.stats.publicFailureCount}`);
  line(`Current streak: ${profile.stats.currentStreak}  Longest: ${profile.stats.longestStreak}`);
  line(`Rewards: ${profile.rewards.map((reward) => reward.label).join(', ') || 'none'}`);
};

const handleCommand = async (raw, rl) => {
  const [command, ...rest] = raw.trim().slice(1).split(/\s+/);
  if (command === 'help') printHelp();
  else if (command === 'commands') printOpenCodeCommands();
  else if (command === 'gui') await openKarenGui();
  else if (command === 'setup') await runSetupWizard(rl, { force: true });
  else if (command === 'tui') await proxyOpencodeTuiIntercept(rest);
  else if (command === 'tui-raw') await proxyOpencode(rest);
  else if (command === 'run') await proxyOpencode(['run', ...rest]);
  else if (command === 'providers' || command === 'auth') await proxyOpencode(['providers']);
  else if (command === 'models') await proxyOpencode(['models', ...rest]);
  else if (command === 'mcp') await proxyOpencode(['mcp', ...rest]);
  else if (command === 'agent') await proxyOpencode(['agent', ...rest]);
  else if (command === 'attach') await proxyOpencode(['attach', ...rest]);
  else if (command === 'serve') await proxyOpencode(['serve', ...rest]);
  else if (command === 'web') await proxyOpencode(['web', ...rest]);
  else if (command === 'session') await proxyOpencode(['session', ...rest]);
  else if (command === 'stats') await proxyOpencode(['stats', ...rest]);
  else if (command === 'export') await proxyOpencode(['export', ...rest]);
  else if (command === 'import') await proxyOpencode(['import', ...rest]);
  else if (command === 'plugin' || command === 'plug') await proxyOpencode(['plugin', ...rest]);
  else if (command === 'github') await proxyOpencode(['github', ...rest]);
  else if (command === 'pr') await proxyOpencode(['pr', ...rest]);
  else if (command === 'debug') await proxyOpencode(['debug', ...rest]);
  else if (command === 'upgrade') await proxyOpencode(['upgrade', ...rest]);
  else if (command === 'completion') await proxyOpencode(['completion', ...rest]);
  else if (command === 'db') await proxyOpencode(['db', ...rest]);
  else if (command === 'acp') await proxyOpencode(['acp', ...rest]);
  else if (command === 'audio') printAudioStatus();
  else if (command === 'feed') printFeed();
  else if (command === 'profile') printProfile();
  else if (command === 'diff') {
    const stat = run('git', ['diff', '--stat']);
    line(stat.stdout || color('No diff.', 'green'));
  } else if (command === 'opencode' || command === 'oc') {
    await proxyOpencode(rest);
  } else if (command === 'quit' || command === 'exit' || command === 'q' || command === 'bye') {
    return false;
  } else {
    await proxyOpencode([command, ...rest]);
  }
  return true;
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printCliHelp();
    return;
  }
  if (args.includes('--version') || args.includes('-v')) {
    line(karenVersion());
    return;
  }

  const initialPrompt = args.join(' ').trim();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => {
    line('');
    line(color('Karen dismissed.', 'gray'));
    process.exit(0);
  });

  if (process.env.KAREN_SKIP_SETUP !== '1') {
    await runSetupWizard(rl);
  }

  const handlePrompt = async (prompt) => {
    maybeScreamAtLongPrompt(prompt);
    const evaluation = evaluatePrompt(prompt);
    printVerdict(prompt, evaluation);
    if (shouldRunAgentForEvaluation(evaluation)) {
      const session = store.recordApprovedPrompt({
        username: username(),
        prompt: redactPublicText(prompt, 1200),
        evaluation,
        sessionId: `karen_${Date.now()}`,
      });
      await runAgent(prompt, session);
    }
  };

  if (initialPrompt) {
    await handlePrompt(initialPrompt);
    rl.close();
    await sleep(50);
    return;
  }

  drawShell();

  let active = true;
  while (active) {
    const prompt = await rl.question(color('\nkaren > ', 'pink'));
    const trimmed = prompt.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('/')) {
      active = await handleCommand(trimmed, rl);
      continue;
    }
    await handlePrompt(trimmed);
  }
  rl.close();
  await sleep(50);
  line(color('Karen dismissed.', 'gray'));
};

export const __karenTest = {
  analyzeDiffImpact,
  buildQuiz,
  classifyTuiContext,
  parseDiff,
  normalizeOpenCodeModel,
  shouldRunAgentForEvaluation,
  shouldJudgeTuiBuffer,
  updateTuiBuffer,
};

const isCliEntry = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isCliEntry) {
  main().catch((error) => {
    line(color(error instanceof Error ? error.message : String(error), 'red'));
    process.exitCode = 1;
  });
}
