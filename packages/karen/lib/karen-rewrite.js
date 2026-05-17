// Karen prompt rewriter — turns a vague prompt into a concrete one using OpenAI.
//
// When the evaluator BLOCKS a prompt, the static `evaluation.suggestedRewrite`
// is generic boilerplate. This module asks an LLM to produce a CONCRETE
// rewrite — naming files in the current cwd, citing the existing reasons
// (the "charges") as constraints, and adding acceptance criteria, scope, and
// tests. The OpenAI call shape is modeled on quiz.js (Responses API,
// strict JSON schema, KAREN_QUIZ_MODEL env, OPENAI_API_KEY).
//
// Falls back gracefully when no OPENAI_API_KEY is set or the call fails:
// returns { ok: false, source: 'no-api-key' | 'error', reason } and the
// caller falls back to `evaluation.suggestedRewrite`.
//
// Public API:
//   karenRewritePrompt({ original, evaluation, cwd, branch, files, recentCommits }) → Promise<{ ok, rewrite, source, latencyMs, reason? }>
//   gatherRepoContext({ cwd, max }) → { cwd, branch, files, recentCommits }

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FILE_CAP = 40;
const COMMIT_CAP = 5;

const envEnabled = (name, defaultValue = true) => {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
};

const getOpenAiApiKey = () => {
  const value = process.env.OPENAI_API_KEY;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
};

export const rewriteAiAllowed = () => envEnabled('KAREN_REWRITE_AI', Boolean(getOpenAiApiKey())) && Boolean(getOpenAiApiKey());
export const rewriteModel = () => process.env.KAREN_REWRITE_MODEL || process.env.KAREN_QUIZ_MODEL || 'gpt-5.5';
export const rewriteTimeoutMs = () => {
  const parsed = Number(process.env.KAREN_REWRITE_TIMEOUT_MS || 20000);
  return Number.isFinite(parsed) ? Math.max(3000, Math.trunc(parsed)) : 20000;
};

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: options.cwd || process.cwd(),
  encoding: 'utf8',
  stdio: 'pipe',
});

const listCwdFiles = (cwd, cap = FILE_CAP) => {
  // Prefer git ls-files for tracked files; falls back to fs.readdirSync.
  try {
    const result = run('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd });
    if (result.status === 0 && result.stdout) {
      return result.stdout.split(/\r?\n/).filter(Boolean).slice(0, cap);
    }
  } catch {}
  try {
    return fs.readdirSync(cwd).slice(0, cap);
  } catch {
    return [];
  }
};

const listRecentCommits = (cwd, cap = COMMIT_CAP) => {
  try {
    const result = run('git', ['log', `-${cap}`, '--pretty=%h %s'], { cwd });
    if (result.status === 0 && result.stdout) {
      return result.stdout.split(/\r?\n/).filter(Boolean);
    }
  } catch {}
  return [];
};

const currentBranch = (cwd) => {
  try {
    const result = run('git', ['branch', '--show-current'], { cwd });
    return result.status === 0 ? (result.stdout || '').trim() : '';
  } catch {
    return '';
  }
};

export const gatherRepoContext = ({ cwd = process.cwd(), max = FILE_CAP } = {}) => ({
  cwd,
  branch: currentBranch(cwd),
  files: listCwdFiles(cwd, max),
  recentCommits: listRecentCommits(cwd, COMMIT_CAP),
});

const rewriteSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rewrite', 'files', 'acceptance_criteria', 'scope', 'tests'],
  properties: {
    rewrite: { type: 'string', minLength: 20, maxLength: 1800 },
    files: {
      type: 'array',
      minItems: 0,
      maxItems: 8,
      items: { type: 'string', minLength: 1, maxLength: 200 },
    },
    acceptance_criteria: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string', minLength: 4, maxLength: 240 },
    },
    scope: { type: 'string', minLength: 4, maxLength: 400 },
    tests: { type: 'string', minLength: 4, maxLength: 400 },
  },
};

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.json === 'object') return JSON.stringify(content.json);
    }
  }
  return chunks.join('\n');
};

const parseModelJson = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch {}
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
};

export const formatRewriteForDisplay = (parsed) => {
  const sections = [];
  if (parsed?.rewrite) sections.push(parsed.rewrite.trim());
  if (Array.isArray(parsed?.files) && parsed.files.length > 0) {
    sections.push(`Files: ${parsed.files.join(', ')}`);
  }
  if (parsed?.scope) sections.push(`Scope: ${parsed.scope.trim()}`);
  if (Array.isArray(parsed?.acceptance_criteria) && parsed.acceptance_criteria.length > 0) {
    sections.push(`Acceptance criteria:\n${parsed.acceptance_criteria.map((c) => `  - ${c}`).join('\n')}`);
  }
  if (parsed?.tests) sections.push(`Tests: ${parsed.tests.trim()}`);
  return sections.join('\n\n');
};

export const karenRewritePrompt = async ({
  original,
  evaluation,
  cwd = process.cwd(),
  branch = null,
  files = null,
  recentCommits = null,
  fetchImpl = fetch,
} = {}) => {
  const startedAt = Date.now();
  const baseResult = (extra) => ({ latencyMs: Date.now() - startedAt, ...extra });

  if (!rewriteAiAllowed()) {
    return baseResult({
      ok: false,
      rewrite: '',
      source: 'no-api-key',
      reason: 'OPENAI_API_KEY is not set; falling back to the static suggestedRewrite.',
    });
  }

  const apiKey = getOpenAiApiKey();
  const resolvedBranch = branch ?? currentBranch(cwd);
  const resolvedFiles = files ?? listCwdFiles(cwd, FILE_CAP);
  const resolvedCommits = recentCommits ?? listRecentCommits(cwd, COMMIT_CAP);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), rewriteTimeoutMs());

  const userPayload = {
    originalPrompt: String(original || '').slice(0, 1800),
    karenCharges: Array.isArray(evaluation?.reasons) ? evaluation.reasons.slice(0, 8) : [],
    evaluationScore: typeof evaluation?.score === 'number' ? evaluation.score : null,
    repo: {
      cwd: String(cwd || ''),
      branch: resolvedBranch || null,
      files: Array.isArray(resolvedFiles) ? resolvedFiles.slice(0, FILE_CAP) : [],
      recentCommits: Array.isArray(resolvedCommits) ? resolvedCommits.slice(0, COMMIT_CAP) : [],
    },
  };

  const input = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: [
            'You are Karen, a strict but constructive prompt editor.',
            'The developer wrote a vague prompt that the PromptCourt evaluator blocked.',
            'Your job: rewrite it as a CONCRETE prompt that names specific files (from repo.files when relevant), bounds scope, lists acceptance criteria, and asks for tests.',
            'Stay faithful to the original intent — do not invent unrelated features.',
            'The rewrite must be addressed to a coding agent (OpenCode), not to Karen.',
            'Each charge in karenCharges is a constraint to satisfy in the rewrite.',
            'Return strict JSON matching the schema. No prose.',
          ].join(' '),
        },
      ],
    },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: JSON.stringify(userPayload) },
      ],
    },
  ];

  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: rewriteModel(),
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'karen_prompt_rewrite',
            schema: rewriteSchema,
            strict: true,
          },
        },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return baseResult({
        ok: false,
        rewrite: '',
        source: 'error',
        reason: `OpenAI rewrite request failed ${response.status}: ${String(detail).slice(0, 200)}`,
      });
    }
    const payload = await response.json();
    const parsed = parseModelJson(extractResponseText(payload));
    if (!parsed || typeof parsed.rewrite !== 'string' || parsed.rewrite.trim().length < 12) {
      return baseResult({
        ok: false,
        rewrite: '',
        source: 'error',
        reason: 'OpenAI returned no usable rewrite payload.',
      });
    }
    return baseResult({
      ok: true,
      rewrite: formatRewriteForDisplay(parsed),
      structured: parsed,
      source: `ai:${rewriteModel()}`,
    });
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    return baseResult({
      ok: false,
      rewrite: '',
      source: isAbort ? 'timeout' : 'error',
      reason: isAbort
        ? `OpenAI rewrite request timed out after ${rewriteTimeoutMs()}ms.`
        : String(error?.message || error),
    });
  } finally {
    clearTimeout(timer);
  }
};

export const __karenRewriteTest = {
  formatRewriteForDisplay,
  parseModelJson,
  extractResponseText,
  rewriteSchema,
  gatherRepoContext,
};
