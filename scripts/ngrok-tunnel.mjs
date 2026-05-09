#!/usr/bin/env node
/**
 * scripts/ngrok-tunnel.mjs
 *
 * Tunnels the local OpenChamber Express server to a public HTTPS URL via ngrok.
 * Used during the "laptop-as-VPS" stage so the Vercel landing page CTA can
 * point at a real running app.
 *
 * Usage:
 *   bun run tunnel                     # tunnels OPENCHAMBER_PORT (default 3001)
 *   bun run tunnel -- --port 3002      # override port
 *   KAREN_NGROK_DOMAIN=foo.ngrok.app bun run tunnel
 *
 * Requires the system `ngrok` binary on $PATH. If missing, prints install
 * instructions and exits non-zero.
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const parseArgs = (argv) => {
  const parsed = { port: null, domain: process.env.KAREN_NGROK_DOMAIN || null };
  const args = [...argv];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      parsed.port = Number(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--port=')) {
      parsed.port = Number(arg.slice('--port='.length));
    } else if (arg === '--domain') {
      parsed.domain = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--domain=')) {
      parsed.domain = arg.slice('--domain='.length);
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
};

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`Usage: bun run tunnel [-- --port <n>] [--domain <reserved.ngrok.app>]\n`);
  process.exit(0);
}

const port = Number(args.port || process.env.OPENCHAMBER_PORT || 3001);
if (!Number.isInteger(port) || port <= 0) {
  process.stderr.write(`[tunnel] invalid port: ${port}\n`);
  process.exit(2);
}

const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ngrok'], { encoding: 'utf8' });
if (which.status !== 0) {
  process.stderr.write([
    '[tunnel] ngrok binary not found on PATH.',
    '         Install it once:',
    '           macOS:   brew install ngrok/ngrok/ngrok',
    '           Linux:   https://ngrok.com/download',
    '           Windows: https://ngrok.com/download',
    '         Then run: ngrok config add-authtoken <YOUR_TOKEN>',
    '',
  ].join('\n'));
  process.exit(127);
}

const ngrokArgs = ['http', String(port), '--log=stdout', '--log-format=logfmt'];
if (args.domain) ngrokArgs.push(`--domain=${args.domain}`);

process.stdout.write(`[tunnel] starting ngrok http ${port}${args.domain ? ` (domain ${args.domain})` : ''}\n`);
process.stdout.write(`[tunnel] make sure the OpenChamber server is running, e.g.: bun run start:web\n\n`);

const child = spawn('ngrok', ngrokArgs, { stdio: ['ignore', 'pipe', 'inherit'] });

let publicUrl = null;

child.stdout.on('data', (chunk) => {
  const text = chunk.toString('utf8');
  process.stdout.write(text);
  if (publicUrl) return;
  const match = text.match(/url=(https:\/\/[^\s]+ngrok[^\s]*)/);
  if (match) {
    publicUrl = match[1];
    process.stdout.write([
      '',
      '======================================================================',
      `  Public URL: ${publicUrl}`,
      '',
      '  Set this as VITE_PUBLIC_APP_URL on Vercel and redeploy:',
      `    vercel env add VITE_PUBLIC_APP_URL production`,
      `    vercel env add VITE_PUBLIC_APP_URL preview`,
      `    # paste: ${publicUrl}`,
      `    vercel deploy --prod`,
      '',
      '  Local app is reachable at the URL above. Press Ctrl+C to stop.',
      '======================================================================',
      '',
    ].join('\n'));
  }
});

const shutdown = (signal) => {
  process.stdout.write(`\n[tunnel] received ${signal}, stopping ngrok...\n`);
  if (!child.killed) child.kill('SIGTERM');
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

child.on('exit', async (code, signal) => {
  if (signal === 'SIGTERM' || signal === 'SIGINT') {
    process.exit(0);
  }
  if (code === 0) {
    process.exit(0);
  }
  await wait(50);
  process.exit(code ?? 1);
});
