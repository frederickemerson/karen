import * as nodePty from 'node-pty';
const child = nodePty.spawn(process.argv[2] || 'karen', [], {
  name: 'xterm-256color', cols: 120, rows: 40, cwd: process.cwd(),
  env: { ...process.env, KAREN_SKIP_SETUP: '1', KAREN_AUDIO: '0', KAREN_FX: '0' },
});
let out = '';
child.onData(d => { out += d; process.stdout.write(d); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(1500);
child.write('/login\r');
let result = 'timeout';
for (let i = 0; i < 60; i++) {  // up to 30s
  await sleep(500);
  if (/[A-Z2-9]{4}-[A-Z2-9]{4}/.test(out)) { result = 'login_started'; break; }
  if (/CONVEX_HTTP_ACTIONS_URL is not set/i.test(out)) { result = 'env_not_loaded'; break; }
  if (/cannot reach|fetch failed|ECONNREFUSED|Login did not complete/i.test(out)) { result = 'connection_error'; break; }
}
child.write('\x03');
await sleep(300);
child.write('/quit\r');
await sleep(300);
child.kill();
console.log('\n===PROBE RESULT:', result, '===');
