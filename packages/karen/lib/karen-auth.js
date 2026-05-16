// Karen cloud auth — Convex device-flow client.
//
// Token storage lives at ~/.config/openchamber/karen-cloud-auth.json with mode 0o600.
// The Convex contract is documented in KAREN_AGENT_BRIEF; see also packages/web/server/lib/github/device-flow.js
// for the GitHub device-flow client we modeled the poll loop on.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
const AUTH_DIR = path.join(CONFIG_HOME, 'openchamber');
const AUTH_PATH = path.join(AUTH_DIR, 'karen-cloud-auth.json');

const CONVEX_BASE = () => (
  process.env.CONVEX_HTTP_ACTIONS_URL
  || process.env.VITE_CONVEX_SITE_URL
  || ''
).replace(/\/+$/, '');

export const karenAuthPath = () => AUTH_PATH;

export const loadAuth = () => {
  try {
    const raw = fs.readFileSync(AUTH_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveAuth = ({ token, userId, clerkUserId, username, deviceLabel }) => {
  if (!token) throw new Error('saveAuth: token is required');
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const payload = {
    token,
    userId: userId || null,
    clerkUserId: clerkUserId || null,
    username: username || null,
    deviceLabel: deviceLabel || null,
    createdAt: Date.now(),
  };
  const tmpPath = `${AUTH_PATH}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmpPath, AUTH_PATH);
  try { fs.chmodSync(AUTH_PATH, 0o600); } catch {}
  return payload;
};

export const clearAuth = () => {
  try { fs.unlinkSync(AUTH_PATH); return true; } catch { return false; }
};

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  pink: '\x1b[38;5;213m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  gray: '\x1b[38;5;245m',
  cyan: '\x1b[38;5;81m',
  amber: '\x1b[38;5;221m',
};
const color = (value, tone) => process.stdout.isTTY ? `${ansi[tone] || ''}${value}${ansi.reset}` : value;
const line = (value = '') => process.stdout.write(`${value}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tryOpenInBrowser = (url) => {
  let cmd = null;
  let args = [];
  if (process.platform === 'darwin') { cmd = 'open'; args = [url]; }
  else if (process.platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '""', url]; }
  else { cmd = 'xdg-open'; args = [url]; }
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

const KAREN_WAITING_LINES = [
  'Karen is reading her glasses.',
  'Karen is judging your username.',
  'Karen is double-checking your spelling.',
  'Karen is timing how long this takes.',
  'Karen is sighing.',
  'Karen is straightening the rug.',
  'Karen has questions for the manager.',
  'Karen wants to see your receipts.',
];

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

const startSpinner = () => {
  if (!process.stdout.isTTY || process.env.KAREN_FX === '0') {
    return { stop: () => {}, render: () => {} };
  }
  let frame = 0;
  let lineIndex = 0;
  let lastSwitch = Date.now();
  let currentLine = KAREN_WAITING_LINES[0];
  let active = true;

  const render = () => {
    if (!active) return;
    if (Date.now() - lastSwitch > 10_000) {
      lineIndex = (lineIndex + 1) % KAREN_WAITING_LINES.length;
      currentLine = KAREN_WAITING_LINES[lineIndex];
      lastSwitch = Date.now();
    }
    const symbol = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    frame += 1;
    process.stdout.write(`\r${color(symbol, 'pink')} ${color(currentLine, 'gray')}   `);
  };

  const timer = setInterval(render, 200);
  render();

  return {
    stop: () => {
      active = false;
      clearInterval(timer);
      if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
    },
    render,
  };
};

const postJson = async (url, body, { timeoutMs = 15_000 } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      const err = new Error(payload?.error || `HTTP ${response.status}`);
      err.status = response.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
};

export const deviceLabel = () => {
  let u = 'user';
  let h = 'host';
  try { u = os.userInfo().username || u; } catch {}
  try { h = os.hostname() || h; } catch {}
  return `${u}@${h} (${process.platform})`;
};

// Pretty-print the user code like "WX7P-NQ4M" in a big visible box.
const printUserCode = (userCode, verificationUri) => {
  const code = String(userCode || '').toUpperCase();
  const code2 = code.length > 0 ? code : '????-????';
  const padded = `   ${code2}   `;
  const border = '─'.repeat(padded.length);
  line('');
  line(color(`┌${border}┐`, 'pink'));
  line(color(`│${padded}│`, 'pink'));
  line(color(`└${border}┘`, 'pink'));
  line('');
  line(`${color('Visit', 'cyan')} ${color(verificationUri, 'green')}`);
  line(color('Enter the code above to link this device.', 'gray'));
  line('');
};

export const runLoginFlow = async ({ verbose = false } = {}) => {
  const base = CONVEX_BASE();
  if (!base) {
    line(color('Karen cannot reach the cloud — CONVEX_HTTP_ACTIONS_URL is not set.', 'red'));
    line(color('Set CONVEX_HTTP_ACTIONS_URL or VITE_CONVEX_SITE_URL and try `karen login` again.', 'gray'));
    return null;
  }

  const label = deviceLabel();
  let start;
  try {
    start = await postJson(`${base}/karen/auth/device/start`, { deviceLabel: label });
  } catch (error) {
    line(color(`Karen could not start the device flow: ${error?.message || error}`, 'red'));
    return null;
  }
  if (!start?.deviceCode || !start?.userCode || !start?.verificationUri) {
    line(color('Karen got a malformed response from the cloud. Try again later.', 'red'));
    return null;
  }

  const verificationUriComplete = start.verificationUriComplete || start.verificationUri;
  const interval0 = Math.max(1, Number(start.interval) || 5);
  const expiresIn = Math.max(60, Number(start.expiresIn) || 600);

  line('');
  line(color('Karen wants to link this device to your account.', 'pink'));
  printUserCode(start.userCode, start.verificationUri);

  const opened = tryOpenInBrowser(verificationUriComplete);
  if (!opened && verbose) {
    line(color('(Could not auto-open your browser — paste the URL above.)', 'gray'));
  }

  const spinner = startSpinner();
  const deadline = Date.now() + expiresIn * 1000;
  let interval = interval0;

  try {
    while (Date.now() < deadline) {
      await sleep(interval * 1000);
      let result;
      try {
        result = await postJson(`${base}/karen/auth/device/poll`, { deviceCode: start.deviceCode });
      } catch (error) {
        if (verbose) line(color(`\nKaren poll error: ${error?.message || error}`, 'gray'));
        continue;
      }
      const status = result?.status;
      if (result?.connected && result?.token) {
        spinner.stop();
        const saved = saveAuth({
          token: result.token,
          userId: result.user?.id || null,
          clerkUserId: result.user?.clerkUserId || null,
          username: result.user?.username || null,
          deviceLabel: label,
        });
        line('');
        line(color('Linked. Karen knows who you are now.', 'green'));
        if (result.user?.username) {
          line(`${color('user', 'cyan')} @${result.user.username}`);
        }
        return saved;
      }
      if (status === 'authorization_pending') continue;
      if (status === 'slow_down') { interval += 5; continue; }
      if (status === 'access_denied') {
        spinner.stop();
        line('');
        line(color('Karen was refused. The code was denied.', 'red'));
        line(color('Run `karen login` again to try once more.', 'gray'));
        return null;
      }
      if (status === 'expired_token') {
        spinner.stop();
        line('');
        line(color('The login code expired. Karen has no patience for slow typists.', 'red'));
        line(color('Run `karen login` to start a fresh code.', 'gray'));
        return null;
      }
    }
    spinner.stop();
    line('');
    line(color('Login timed out. Karen will not wait forever.', 'amber'));
    return null;
  } finally {
    spinner.stop();
  }
};

// --- tiny cooperative lockfile (no proper-lockfile dep) ---

const LOCK_DEFAULT_TIMEOUT = 5_000;
const LOCK_RETRY_MS = 50;

const lockPath = (filePath) => `${filePath}.lock`;

const writeLockFile = (lock, pid) => {
  fs.writeFileSync(lock, `${pid}\n`, { flag: 'wx' });
};

const isProcessAlive = (pid) => {
  if (!pid || !Number.isFinite(pid)) return false;
  try { process.kill(pid, 0); return true; } catch (error) {
    return error?.code === 'EPERM';
  }
};

export const acquireFileLock = async (filePath, { timeoutMs = LOCK_DEFAULT_TIMEOUT } = {}) => {
  const lock = lockPath(filePath);
  const deadline = Date.now() + timeoutMs;
  let acquired = false;
  while (!acquired && Date.now() < deadline) {
    try {
      writeLockFile(lock, process.pid);
      acquired = true;
    } catch (error) {
      if (error?.code === 'EEXIST') {
        try {
          const stalePid = Number(fs.readFileSync(lock, 'utf8').trim()) || 0;
          if (!isProcessAlive(stalePid)) {
            try { fs.unlinkSync(lock); } catch {}
            continue;
          }
        } catch {}
        await sleep(LOCK_RETRY_MS);
      } else {
        throw error;
      }
    }
  }
  if (!acquired) {
    // Best effort: take the lock even if a peer is holding it stale.
    try { fs.unlinkSync(lock); } catch {}
    try { writeLockFile(lock, process.pid); acquired = true; } catch {}
  }
  return {
    release: () => { try { fs.unlinkSync(lock); } catch {} },
  };
};

export const withFileLock = async (filePath, fn, options) => {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch {}
  const handle = await acquireFileLock(filePath, options);
  try {
    return await fn();
  } finally {
    handle.release();
  }
};

export const __karenAuthTest = {
  printUserCode,
  KAREN_WAITING_LINES,
  CONVEX_BASE,
};
