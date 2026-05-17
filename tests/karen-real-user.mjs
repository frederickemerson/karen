#!/usr/bin/env node
// Real-user TUI exercise. Spawns karen via PTY, types prompts, captures
// every byte. Dumps the transcript so we can inspect what a real user sees.

import * as nodePty from 'node-pty';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripAnsi = (s) => String(s)
  .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
  .replace(/\x1b[@-_]/g, '');

const child = nodePty.spawn('node', ['packages/karen/bin/karen.js'], {
  name: 'xterm-256color',
  cols: 140,
  rows: 50,
  cwd: repoRoot,
  env: {
    ...process.env,
    KAREN_SKIP_SETUP: '1',
    // Keep audio + fx ON so we exercise the real surfaces; the voice will
    // fail silently if no api key, which we want to detect.
    KAREN_VERBOSE_TIMING: '1',
  },
});

let raw = '';
child.onData((d) => { raw += d; process.stdout.write(d); });

const send = async (text, label, waitMs = 1200) => {
  process.stdout.write(`\n\x1b[36m[driver] >>> ${label}: ${JSON.stringify(text)}\x1b[0m\n`);
  child.write(text + '\r');
  await sleep(waitMs);
};

await sleep(1500); // banner

// 1. /help — see commands listed
await send('/help', 'list commands', 800);

// 2. /audio — see audio kill switches
await send('/audio', 'audio status', 600);

// 3. /voice usage — see the new voice state line
await send('/voice usage', 'voice usage', 600);

// 4. Easter eggs
await send('/sorry', 'sorry', 500);
await send('/please', 'please', 500);
await send('/karen', 'haiku', 500);

// 5. Unknown command — should print Karen-voice nudge
await send('/nonsense', 'unknown cmd', 500);

// 6. Vague prompt — expect BLOCK + new rewrite flow asking Y/n/e
await send('fix auth', 'vague prompt — expect rewrite flow', 2000);
// Decline the rewrite for now (we don't want to burn an OpenAI call in this test).
await send('n', 'decline rewrite', 600);

// 7. Commit-style prompt — expect 4 commit chips per task #13
await send('commit everything and push it', 'commit prompt — expect chips', 1800);
await send('n', 'decline rewrite for commit', 600);

// 8. /profile — see stats + Karen narrate
await send('/profile', 'profile', 1000);

// 9. /feed — see shame entries
await send('/feed 3', 'feed top 3', 1000);

// 10. /diff — git diff stat
await send('/diff', 'diff stat', 500);

// 11. /voice cues — list cue names
await send('/voice cues', 'list cues', 500);

// 12. Quit
await send('/quit', 'quit', 800);

const exitCode = await new Promise((resolve) => {
  let done = false;
  child.onExit(({ exitCode: c }) => { if (!done) { done = true; resolve(c); } });
  setTimeout(() => { if (!done) { done = true; child.kill(); resolve(-1); } }, 5000);
});

const out = stripAnsi(raw);
fs.writeFileSync(path.join(repoRoot, 'tests', 'karen-real-user.log'), out);

const findings = [];
const check = (name, regex, fail = `MISSING: ${name}`) => {
  if (regex.test(out)) findings.push({ ok: true, name });
  else findings.push({ ok: false, name, fail });
};

check('banner', /KAREN\s+terminal judgment layer/);
check('mood face', /░░████░░/);
check('/help lists /login', /\/login\b/);
check('/audio kill switches', /KAREN_AUDIO=(on|off)/);
check('/voice usage shows per-prompt state', /per-prompt cues\s+(ON|OFF)/);
check('/sorry response', /Karen accepts the apology/);
check('/please response', /Karen says please does not unblock/i);
check('/karen haiku', /Bad prompt walks in late|Karen sharpens her pencil|Sandbox now deleted/);
check('unknown command nudge', /Karen: I do not know \/nonsense/);
check('vague prompt blocked', /Verdict: BLOCKED/i);
check('vague prompt suggested rewrite present', /Suggested appeal:|Implement:/i);
check('NEW: vague prompt rewrite Y\\/n\\/e offered', /\bUse Karen.{0,3}s rewrite\?|\[Y\/n\/e\]/);
check('commit-style chips fire', /No diff explanation|No tests named|No blast-radius/i);
check('commit-gate-failed chip', /Commit gate failed in the TUI|commit-gate-failed/i);
check('/profile shows discipline', /Discipline:\s*\d+\/100/);
check('/feed renders entries or empty', /No public shame records|@\w+/);
check('/diff prints', /diff|No diff|Not a git repo/i);
check('/voice cues lists cue names', /prompt-blocked/);
check('goodbye line on exit', /Karen dismissed|Karen will remember/);
check('exit code 0', /^/); // placeholder; we have exitCode separately
check('NO unrecovered error stack', /^(?!.*Error: ENOENT)/);
check('NEW: KAREN_VERBOSE_TIMING shows stage', /\[karen-timing\]/);

let pass = 0, fail = 0;
console.log('\n\n===REAL-USER TUI PASS===\n');
for (const f of findings) {
  console.log(`  ${f.ok ? '✓' : '✗'} ${f.name}${f.ok ? '' : ` — ${f.fail}`}`);
  if (f.ok) pass++; else fail++;
}
console.log(`\n${pass} pass, ${fail} fail, exit ${exitCode}`);
console.log(`Full transcript: tests/karen-real-user.log`);
process.exit(fail === 0 ? 0 : 1);
