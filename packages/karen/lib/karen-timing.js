// Karen timing instrumentation + per-session profile cache.
//
// Enables fine-grained perf measurement of the hottest paths in karen.js:
//   - createIsolatedWorktree  (git worktree add + diff mirror + untracked copy)
//   - prepareGeneratedDiff    (git add -N + git diff)
//   - buildQuiz               (OpenAI call)
//   - playKarenLine           (voice cue scheduling)
//   - store.getProfile        (JSON file read)
//
// Activated by `KAREN_VERBOSE_TIMING=1`. When off, all wrappers are no-ops
// (zero overhead beyond a guard check).
//
// Also exposes a tiny in-memory profile cache so repeat calls within the
// shell render loop don't re-read the profile JSON every keystroke. The cache
// TTL defaults to 5 seconds and can be tuned via KAREN_PROFILE_CACHE_TTL_MS.

import { performance } from 'node:perf_hooks';

const envEnabled = (name, defaultValue = false) => {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
};

export const isTimingEnabled = () => envEnabled('KAREN_VERBOSE_TIMING', false);

const TIMING_PREFIX = '[karen-timing]';

const ansi = {
  reset: '\x1b[0m',
  gray: '\x1b[38;5;245m',
};

const writeTiming = (stage, ms, extra = '') => {
  if (!isTimingEnabled()) return;
  const colored = process.stdout.isTTY
    ? `${ansi.gray}${TIMING_PREFIX} ${stage} ${ms.toFixed(1)}ms${extra ? ` ${extra}` : ''}${ansi.reset}`
    : `${TIMING_PREFIX} ${stage} ${ms.toFixed(1)}ms${extra ? ` ${extra}` : ''}`;
  process.stdout.write(`${colored}\n`);
};

export const timeSync = (stage, fn, getExtra = null) => {
  if (!isTimingEnabled()) return fn();
  const t0 = performance.now();
  try {
    const value = fn();
    const ms = performance.now() - t0;
    let extra = '';
    if (typeof getExtra === 'function') {
      try { extra = String(getExtra(value) || ''); } catch {}
    }
    writeTiming(stage, ms, extra);
    return value;
  } catch (error) {
    writeTiming(stage, performance.now() - t0, 'errored');
    throw error;
  }
};

export const timeAsync = async (stage, fn, getExtra = null) => {
  if (!isTimingEnabled()) return fn();
  const t0 = performance.now();
  try {
    const value = await fn();
    const ms = performance.now() - t0;
    let extra = '';
    if (typeof getExtra === 'function') {
      try { extra = String(getExtra(value) || ''); } catch {}
    }
    writeTiming(stage, ms, extra);
    return value;
  } catch (error) {
    writeTiming(stage, performance.now() - t0, 'errored');
    throw error;
  }
};

// --- Profile cache ------------------------------------------------------------

const DEFAULT_TTL_MS = (() => {
  const parsed = Number(process.env.KAREN_PROFILE_CACHE_TTL_MS);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.trunc(parsed);
  return 5000;
})();

const profileCache = new Map();
let profileCacheStats = { hits: 0, misses: 0, invalidations: 0 };

export const getCachedProfile = (store, username, { ttlMs = DEFAULT_TTL_MS } = {}) => {
  const now = Date.now();
  const cached = profileCache.get(username);
  if (cached && now - cached.storedAt < ttlMs) {
    profileCacheStats.hits += 1;
    return cached.value;
  }
  profileCacheStats.misses += 1;
  const profile = timeSync('store.getProfile', () => store.getProfile(username));
  profileCache.set(username, { value: profile, storedAt: now });
  return profile;
};

export const invalidateProfileCache = (username = null) => {
  if (username == null) {
    profileCacheStats.invalidations += profileCache.size;
    profileCache.clear();
    return;
  }
  if (profileCache.delete(username)) profileCacheStats.invalidations += 1;
};

export const getProfileCacheStats = () => ({
  size: profileCache.size,
  hits: profileCacheStats.hits,
  misses: profileCacheStats.misses,
  invalidations: profileCacheStats.invalidations,
  ttlMs: DEFAULT_TTL_MS,
});

export const __karenTimingTest = {
  // For unit tests: hook the cache without exporting writes.
  _peekCache: (username) => profileCache.get(username) || null,
  _resetCache: () => {
    profileCache.clear();
    profileCacheStats = { hits: 0, misses: 0, invalidations: 0 };
  },
};
