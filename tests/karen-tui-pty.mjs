#!/usr/bin/env node
// TUI smoke test: drive packages/karen/bin/karen.js through a real PTY so
// readline behaves like an interactive terminal. Asserts each command path
// produces the expected Karen-voice output.
//
// Run: node tests/karen-tui-pty.mjs

import * as nodePty from 'node-pty';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) =>
  s
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[@-_]/g, '');

const child = nodePty.spawn('node', ['packages/karen/bin/karen.js'], {
  name: 'xterm-256color',
  cols: 120,
  rows: 40,
  cwd: repoRoot,
  env: {
    ...process.env,
    KAREN_SKIP_SETUP: '1',
    KAREN_AUDIO: '0',
    KAREN_FX: '0',
    KAREN_TUI_INTERCEPT: '0',
  },
});

let raw = '';
child.onData((data) => {
  raw += data;
  process.stdout.write(data);
});

const send = async (text, waitMs = 350) => {
  child.write(text + '\r');
  await sleep(waitMs);
};

await sleep(1200); // banner

await send('/help');
await send('/sorry');
await send('/please');
await send('/karen');
await send('/nonsense');
await send('/profile');
await send('/feed');
await send('/audio');
await send('/quit');

const exitCode = await new Promise((resolve) => {
  child.onExit(({ exitCode: c }) => resolve(c));
  // safety timeout
  setTimeout(() => resolve(-1), 8000);
});

const out = stripAnsi(raw);

const checks = [
  ['banner has KAREN heading', /KAREN.{0,40}terminal judgment layer/],
  ['banner has mood face', /░░████░░/],
  ['banner shows user', /user @[a-z0-9_-]+/i],
  ['banner shows discipline score', /discipline \d+\/100/i],
  ['not-linked notice', /Not linked.*\/login/i],
  ['/help lists commands', /Karen commands/],
  ['/help mentions /login', /\/login/],
  ['/sorry response', /Karen accepts the apology/],
  ['/please response', /Karen says please does not unblock/i],
  ['/karen haiku', /Bad prompt walks in late\.|Karen sharpens her pencil\.|Sandbox now deleted\./],
  ['unknown cmd nudge', /Karen: I do not know \/nonsense/],
  ['/profile shows discipline', /Discipline:\s*\d+\/100/],
  ['/profile shows streaks', /Current streak:|streak/i],
  ['/audio kill switch', /KAREN_AUDIO=off|KAREN_AUDIO=on/],
  ['exit clean (no goodbye undefined)', /^(?!.*undefined).*$/m],
];

let pass = 0;
let fail = 0;
const failures = [];
for (const [name, rx] of checks) {
  if (rx.test(out)) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}`);
    fail++;
    failures.push(name);
  }
}

console.log('');
console.log(`PTY TUI: ${pass} passed, ${fail} failed, exit ${exitCode}`);
if (failures.length) {
  console.log('failed:', failures.join(', '));
  process.exit(1);
}
process.exit(0);
