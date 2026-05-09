import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `packages/web/server/lib` → monorepo root (`../../../../`). */
export const MONOREPO_ROOT = path.resolve(__dirname, '../../../../');

export function parseEnvFile(targetPath) {
  try {
    const entries = {};
    for (const line of fs.readFileSync(targetPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match) continue;
      entries[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    return entries;
  } catch {
    return {};
  }
}

/**
 * Fills `into` from `repoRoot/.env` then `repoRoot/.env.local` without overwriting keys already set on `into`.
 * Defaults: `repoRoot` = monorepo root, `into` = `process.env`.
 */
export function mergeMonorepoRootEnvIntoProcess(options = {}) {
  const repoRoot = options.repoRoot ?? MONOREPO_ROOT;
  const into = options.into ?? process.env;
  const layered = {
    ...parseEnvFile(path.join(repoRoot, '.env')),
    ...parseEnvFile(path.join(repoRoot, '.env.local')),
  };
  for (const [key, value] of Object.entries(layered)) {
    if (into[key] === undefined) into[key] = value;
  }
}
