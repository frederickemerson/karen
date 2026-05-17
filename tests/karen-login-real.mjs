#!/usr/bin/env node
// Live /login flow driver. Drives karen via PTY, then polls the on-disk
// karen-cloud-auth.json file for the actual token (not just a regex match
// against the buffer, which can false-positive on the URL).

import * as nodePty from 'node-pty';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AUTH_PATH = path.join(os.homedir(), '.config', 'openchamber', 'karen-cloud-auth.json');

const child = nodePty.spawn('karen', [], {
  name: 'xterm-256color',
  cols: 120,
  rows: 40,
  cwd: repoRoot,
  env: {
    ...process.env,
    KAREN_SKIP_SETUP: '1',
    KAREN_AUDIO: '0',
    KAREN_FX: '0',
  },
});

let buffer = '';
child.onData((data) => {
  buffer += data;
  process.stdout.write(data);
});

await sleep(1500);
process.stdout.write('\n>>> Sending /login...\n\n');
child.write('/login\r');

// Watch for the actual auth file to appear OR a definitive failure message.
const deadline = Date.now() + 540_000;
let result = 'timeout';
let lastReport = Date.now();
while (Date.now() < deadline) {
  await sleep(2000);
  // True success: the token file exists with a non-empty token.
  if (fs.existsSync(AUTH_PATH)) {
    try {
      const f = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
      if (f && typeof f.token === 'string' && f.token.length > 0) {
        result = 'success';
        break;
      }
    } catch {}
  }
  // Hard failure messages from runLoginFlow.
  if (/The code was denied|login code expired|Karen could not start the device flow|malformed response/i.test(buffer)) {
    result = 'failed';
    break;
  }
  // Process death (karen exited unexpectedly).
  if (/Karen dismissed\./i.test(buffer)) {
    result = 'karen_quit';
    break;
  }
  if (Date.now() - lastReport > 30_000) {
    process.stdout.write(`\n[driver] still polling, ${Math.round((deadline - Date.now()) / 1000)}s remaining...\n`);
    lastReport = Date.now();
  }
}

if (result !== 'success' && result !== 'karen_quit') {
  child.write('\x03');
  await sleep(300);
  child.write('/quit\r');
  await sleep(400);
}
child.kill();

console.log(`\n\n===LOGIN RESULT: ${result}===`);
if (result === 'success') {
  const f = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
  console.log('  username:', f.username);
  console.log('  clerkUserId:', f.clerkUserId);
  console.log('  deviceLabel:', f.deviceLabel);
  console.log('  token preview:', String(f.token).slice(0, 8) + '...');
}
process.exit(result === 'success' ? 0 : 1);
