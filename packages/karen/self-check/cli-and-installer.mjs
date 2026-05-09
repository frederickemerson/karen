#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const karenBin = path.join(root, 'packages/karen/bin/karen.js');
const installer = path.join(root, 'scripts/install-karen.mjs');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'karen-installer-check-'));

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, KAREN_SKIP_SETUP: '1' },
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ].filter(Boolean).join('\n'));
  }
  return result;
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  const help = run(process.execPath, [karenBin, '--help']).stdout;
  assert(help.includes('/opencode ...'), 'Karen help should expose OpenCode passthrough commands');
  assert(help.includes('/providers'), 'Karen help should expose provider setup');

  run(process.execPath, [installer, 'install', '--dir', tempDir]);
  const installed = path.join(tempDir, process.platform === 'win32' ? 'karen.cmd' : 'karen');
  assert(fs.existsSync(installed), 'Installer did not create the karen command');
  const version = run(installed, ['--version']).stdout.trim();
  assert(/^\d+\.\d+\.\d+/.test(version), 'Installed karen command did not print a version');

  const status = run(process.execPath, [installer, 'status', '--dir', tempDir]).stdout;
  assert(status.includes('Installed here: yes'), 'Installer status did not report installed command');

  run(process.execPath, [installer, 'uninstall', '--dir', tempDir]);
  assert(!fs.existsSync(installed), 'Uninstaller did not remove the karen command');

  console.log('Karen CLI and installer self-check passed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
