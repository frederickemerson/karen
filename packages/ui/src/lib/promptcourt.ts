export type PromptCourtVerdict = 'approved' | 'blocked';

export type PromptCourtEvaluation = {
  score: number;
  verdict: PromptCourtVerdict;
  allowed: boolean;
  reasons: string[];
  suggestedRewrite: string;
  username: string;
  publicPreview?: {
    title: string;
    score: number;
    promptExcerpt: string;
    failureReasons: string[];
    suggestedRewrite: string;
  } | null;
  publicPost?: PromptCourtPublicPost | null;
};

export type PromptCourtPublicPost = {
  id: string;
  username: string;
  type: 'bad_prompt' | 'quiz_failed' | string;
  title: string;
  score?: number;
  promptExcerpt?: string;
  failureReasons?: string[];
  suggestedRewrite?: string;
  createdAt: number;
};

export type PromptCourtProfile = {
  user: {
    username: string;
    displayName?: string;
    createdAt: number;
  };
  stats: {
    disciplineScore: number;
    level: string;
    averagePromptScore: number;
    quizPassRate: number;
    currentStreak: number;
    longestStreak: number;
    grannySkips?: number;
    lifetimeGrannySkips?: number;
    rollbackCount: number;
    publicFailureCount: number;
    perfectRuns: number;
    totalSessions: number;
    blockedPrompts: number;
    promotedRuns: number;
    generatedFileCount: number;
  };
  rewards: Array<{ id: string; label: string; tone: 'good' | 'bad' }>;
  recentSessions: Array<{
    id: string;
    status: string;
    promptScore: number;
    prompt?: string;
    reasons?: string[];
    quizPassed?: boolean | null;
    rollbackTriggered?: boolean;
    changedFiles?: string[];
    createdAt: number;
    completedAt?: number;
  }>;
  publicPosts: PromptCourtPublicPost[];
};

export type PromptCourtOverview = {
  users: PromptCourtProfile[];
  leaderboard: PromptCourtProfile[];
  totals: {
    users: number;
    sessions: number;
    publicFailures: number;
    promotedRuns: number;
  };
  feed: PromptCourtPublicPost[];
};

export type PromptCourtRunEvent = {
  id: string;
  sessionId?: string;
  username: string;
  status: 'queued' | 'running' | 'blocked' | 'terminal_opened' | 'quiz_passed' | 'rollback' | 'synced' | 'failed' | string;
  label: string;
  details?: string;
  createdAt: number;
};

const USERNAME_KEY = 'promptcourt_username';

export const getPromptCourtUsername = (): string => {
  if (typeof window === 'undefined') return 'local-user';
  try {
    return window.localStorage.getItem(USERNAME_KEY) || 'local-user';
  } catch {
    return 'local-user';
  }
};

export const setPromptCourtUsername = (username: string): string => {
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'local-user';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(USERNAME_KEY, normalized);
    } catch {
      // Ignore storage failures.
    }
  }
  return normalized;
};

export const evaluatePromptCourtPrompt = async (
  prompt: string,
  options?: { recordBlocked?: boolean },
): Promise<PromptCourtEvaluation> => {
  const username = getPromptCourtUsername();
  const response = await fetch('/api/promptcourt/evaluate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-promptcourt-user': username,
    },
    body: JSON.stringify({ prompt, username, recordBlocked: options?.recordBlocked === true }),
  });

  if (!response.ok) {
    throw new Error(`PromptCourt evaluation failed (${response.status})`);
  }

  return response.json() as Promise<PromptCourtEvaluation>;
};

export const fetchPromptCourtFeed = async (): Promise<PromptCourtPublicPost[]> => {
  const response = await fetch('/api/promptcourt/feed', { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`PromptCourt feed failed (${response.status})`);
  }
  const payload = await response.json() as { posts?: PromptCourtPublicPost[] };
  return Array.isArray(payload.posts) ? payload.posts : [];
};

export const fetchPromptCourtProfile = async (username = getPromptCourtUsername()): Promise<PromptCourtProfile> => {
  const response = await fetch(`/api/promptcourt/profile/${encodeURIComponent(username)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`PromptCourt profile failed (${response.status})`);
  }
  return response.json() as Promise<PromptCourtProfile>;
};

export const fetchPromptCourtOverview = async (): Promise<PromptCourtOverview> => {
  const response = await fetch('/api/promptcourt/overview', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Karen overview failed (${response.status})`);
  }
  return response.json() as Promise<PromptCourtOverview>;
};

export const fetchPromptCourtRunEvents = async (
  options: { username?: string; since?: string; limit?: number } = {},
): Promise<PromptCourtRunEvent[]> => {
  const params = new URLSearchParams();
  if (options.username) params.set('username', options.username);
  if (options.since) params.set('since', options.since);
  if (options.limit) params.set('limit', String(options.limit));
  const response = await fetch(`/api/promptcourt/runs?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Karen run stream failed (${response.status})`);
  }
  const payload = await response.json() as { events?: PromptCourtRunEvent[] };
  return Array.isArray(payload.events) ? payload.events : [];
};
