import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { __karenTest } from './karen.js';
import { analyzeQuizEvidence, parseDiff as parseQuizDiff } from '../../web/server/lib/promptcourt/quiz-analyzer.js';
import {
  createOpenCodeHookAdapter,
  detectOpenCodeHookSupport,
  normalizeOpenCodePromptEvent,
  openCodeHookStrategies,
  selectOpenCodeInterceptionStrategy,
} from '../lib/opencode-hook.js';
import {
  karenRewritePrompt,
  rewriteAiAllowed,
  __karenRewriteTest,
} from '../lib/karen-rewrite.js';
import {
  getCachedProfile,
  invalidateProfileCache,
  isTimingEnabled,
  timeSync,
  timeAsync,
  __karenTimingTest,
} from '../lib/karen-timing.js';
import {
  formatGuardBadge,
  formatBlockedSidebar,
  createScreenTailBuffer,
  updateScreenTail,
  screenTailVisible,
  screenTailRaw,
  __karenTuiGuardTest,
} from '../lib/karen-tui-guard.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const tempDirs = [];

const diff = [
  'diff --git a/src/session.ts b/src/session.ts',
  'index 1111111..2222222 100644',
  '--- a/src/session.ts',
  '+++ b/src/session.ts',
  '@@ -1,3 +1,8 @@',
  '+import { auditTrail } from "./audit";',
  '+export function rejectExpiredSession(session) {',
  '+  if (session.expiresAt < Date.now()) {',
  '+    auditTrail.record("session_rejected");',
  '+    return false;',
  '+  }',
  '+  return true;',
  '+}',
].join('\n');

const withOpenAiEnv = () => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.KAREN_QUIZ_AI = '1';
  process.env.KAREN_QUIZ_MODEL = 'gpt-5.5';
  process.env.KAREN_QUIZ_REASONING_EFFORT = 'low';
  process.env.KAREN_QUIZ_TIMEOUT_MS = '5000';
};

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

const makeTempProject = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karen-quiz-analyzer-'));
  tempDirs.push(dir);
  return dir;
};

describe('Karen AI quiz generation', () => {
  test('uses structured OpenAI questions when the schema response is valid', async () => {
    withOpenAiEnv();
    let requestBody = null;
    globalThis.fetch = async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            questions: [
              {
                prompt: 'Which exported function did the patch add?',
                options: ['rejectExpiredSession', 'allowExpiredSession', 'renderSessionCard', 'loadTheme'],
                answer: 0,
                evidence: 'src/session.ts:2',
                why_it_matters: 'The exported API is what callers can depend on after the patch.',
              },
              {
                prompt: 'Which integration side effect did the new function call?',
                options: ['auditTrail.record', 'console.warn', 'fetch', 'setTimeout'],
                answer: 0,
                evidence: 'src/session.ts:4',
                why_it_matters: 'Side effects are what maintainers must understand before promotion.',
              },
              {
                prompt: 'What behavior does the session check add?',
                options: ['Expired sessions return false', 'All sessions are accepted', 'Themes are cached', 'OAuth is removed'],
                answer: 0,
                evidence: 'src/session.ts:3',
                why_it_matters: 'The quiz must verify changed behavior, not just file names.',
              },
            ],
          }),
        }),
      };
    };

    const quiz = await __karenTest.buildQuiz({
      prompt: 'Update src/session.ts to reject expired sessions and record an audit event.',
      generatedDiff: diff,
      cwd: null,
    });

    expect(quiz.source).toBe('ai:gpt-5.5');
    expect(quiz.questions).toHaveLength(3);
    expect(quiz.questions[0]).toMatchObject({
      source: 'ai',
      answer: 0,
      evidence: 'src/session.ts:2',
    });
    expect(requestBody.model).toBe('gpt-5.5');
    expect(requestBody.text.format.type).toBe('json_schema');
    expect(requestBody.text.format.schema.required).toContain('questions');
  });

  test('falls back to parser questions when the model request fails', async () => {
    withOpenAiEnv();
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => 'model unavailable',
    });

    const quiz = await __karenTest.buildQuiz({
      prompt: 'Update src/session.ts to reject expired sessions and record an audit event.',
      generatedDiff: diff,
      cwd: null,
    });

    expect(quiz.source).toBe('parser');
    expect(quiz.questions.length).toBeGreaterThanOrEqual(3);
    expect(quiz.questions.every((question) => question.source === 'parser')).toBe(true);
  });
});

describe('Karen quiz analyzer v2', () => {
  test('produces parser-backed TS evidence for changed exports, imports, calls, and touched tests', () => {
    const cwd = makeTempProject();
    fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'src/session.ts'), [
      'import { auditTrail } from "./audit";',
      '',
      'export function rejectExpiredSession(session) {',
      '  if (session.expiresAt < Date.now()) {',
      '    auditTrail.record("session_rejected");',
      '    return false;',
      '  }',
      '  return true;',
      '}',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(cwd, 'src/session.test.ts'), [
      'import { rejectExpiredSession } from "./session";',
      'test("rejects expired sessions", () => {',
      '  expect(rejectExpiredSession({ expiresAt: 1 })).toBe(false);',
      '});',
      '',
    ].join('\n'));

    const generatedDiff = [
      'diff --git a/src/session.ts b/src/session.ts',
      'index 1111111..2222222 100644',
      '--- a/src/session.ts',
      '+++ b/src/session.ts',
      '@@ -1,0 +1,9 @@',
      '+import { auditTrail } from "./audit";',
      '+',
      '+export function rejectExpiredSession(session) {',
      '+  if (session.expiresAt < Date.now()) {',
      '+    auditTrail.record("session_rejected");',
      '+    return false;',
      '+  }',
      '+  return true;',
      '+}',
      'diff --git a/src/session.test.ts b/src/session.test.ts',
      'index 3333333..4444444 100644',
      '--- a/src/session.test.ts',
      '+++ b/src/session.test.ts',
      '@@ -1,0 +1,4 @@',
      '+import { rejectExpiredSession } from "./session";',
      '+test("rejects expired sessions", () => {',
      '+  expect(rejectExpiredSession({ expiresAt: 1 })).toBe(false);',
      '+});',
    ].join('\n');

    const impact = analyzeQuizEvidence(parseQuizDiff(generatedDiff), { cwd });

    expect(impact.parsedFiles).toContain('src/session.ts');
    expect(impact.exportedSymbols).toContain('rejectExpiredSession');
    expect(impact.changedFunctions).toContain('rejectExpiredSession');
    expect(impact.importedModules).toContain('./audit');
    expect(impact.calledSymbols).toContain('auditTrail.record');
    expect(impact.callSiteFiles).toContain('src/session.ts');
    expect(impact.testFiles).toContain('src/session.test.ts');
    expect(impact.evidence.get('rejectExpiredSession')).toBe('src/session.ts:3');
    expect(impact.exportDetails).toContainEqual(expect.objectContaining({
      name: 'rejectExpiredSession',
      file: 'src/session.ts',
      line: 3,
    }));
    expect(impact.importDetails).toContainEqual(expect.objectContaining({
      module: './audit',
      specifiers: ['auditTrail'],
    }));
    expect(impact.testCoverage.coveredSourceFiles).toContain('src/session.ts');
    expect(impact.testCoverage.mappings).toContainEqual(expect.objectContaining({
      sourceFile: 'src/session.ts',
      relatedTestFiles: ['src/session.test.ts'],
      status: 'touched',
    }));
  });

  test('falls back to diff regex evidence and classifies config, rename, mode, and binary changes', () => {
    const generatedDiff = [
      'diff --git a/package.json b/package.json',
      'index 1111111..2222222 100644',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -3,6 +3,8 @@',
      '+  "scripts": { "test": "bun test" },',
      '+  "dependencies": { "convex": "^1.20.0" },',
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 94%',
      'rename from src/old.ts',
      'rename to src/new.ts',
      'old mode 100644',
      'new mode 100755',
      'diff --git a/assets/logo.png b/assets/logo.png',
      'new file mode 100644',
      'Binary files /dev/null and b/assets/logo.png differ',
    ].join('\n');

    const summary = parseQuizDiff(generatedDiff);
    const impact = analyzeQuizEvidence(summary);

    expect(summary.files.find((file) => file.path === 'src/new.ts')).toMatchObject({
      oldPath: 'src/old.ts',
      status: 'renamed',
      modeChanges: ['old mode 100644', 'new mode 100755'],
    });
    expect(summary.files.find((file) => file.path === 'assets/logo.png')).toMatchObject({
      status: 'added',
      binary: true,
    });
    expect(impact.configFiles).toContain('package.json');
    expect(impact.configImpact).toContainEqual(expect.objectContaining({
      file: 'package.json',
      areas: expect.arrayContaining(['scripts', 'dependencies']),
    }));
  });
});

describe('Karen OpenCode TUI interception heuristics', () => {
  test('normalizes OpenCode models and rejects setup yes/no answers', () => {
    expect(__karenTest.normalizeOpenCodeModel('opencode/minimax-m2.5-free')).toBe('opencode/minimax-m2.5-free');
    expect(__karenTest.normalizeOpenCodeModel('claude-opus-4.6', 'github-copilot')).toBe('github-copilot/claude-opus-4.6');
    expect(__karenTest.normalizeOpenCodeModel('y')).toBe(null);
    expect(__karenTest.normalizeOpenCodeModel('gpt-5.5', 'use /providers')).toBe(null);
  });

  test('runs OpenCode for every allowed prompt after the verdict gate passes', () => {
    expect(__karenTest.shouldRunAgentForEvaluation({
      allowed: true,
      intent: 'conversational',
    })).toBe(true);
    expect(__karenTest.shouldRunAgentForEvaluation({
      allowed: true,
      intent: 'exploration',
    })).toBe(true);
    expect(__karenTest.shouldRunAgentForEvaluation({
      allowed: true,
      intent: null,
    })).toBe(true);
    expect(__karenTest.shouldRunAgentForEvaluation({
      allowed: false,
      intent: null,
    })).toBe(false);
  });

  test('judges normal prompt input', () => {
    expect(__karenTest.classifyTuiContext('message\n> ')).toBe('prompt');
    expect(__karenTest.shouldJudgeTuiBuffer('Refactor src/session.ts to reject expired sessions and add tests.', {
      screenTail: 'message\n> ',
    })).toBe(true);
  });

  test('does not judge picker, search, confirmation, or slash command input', () => {
    const controls = [
      'Select provider\nOpenAI\nAnthropic',
      'Search commands\n/filter',
      'Are you sure? [y/n]',
      'Choose model\nGPT-5.5',
    ];

    for (const screenTail of controls) {
      expect(__karenTest.classifyTuiContext(screenTail)).toBe('control');
      expect(__karenTest.shouldJudgeTuiBuffer('OpenAI', { screenTail })).toBe(false);
    }

    expect(__karenTest.shouldJudgeTuiBuffer('/models', { screenTail: 'message\n> ' })).toBe(false);
    expect(__karenTest.shouldJudgeTuiBuffer('y', { screenTail: 'message\n> ' })).toBe(false);
  });

  test('updates and clears the intercepted input buffer like a terminal line editor', () => {
    let buffer = '';
    for (const char of 'fix it') buffer = __karenTest.updateTuiBuffer(buffer, char);
    expect(buffer).toBe('fix it');
    buffer = __karenTest.updateTuiBuffer(buffer, '\x7f');
    expect(buffer).toBe('fix i');
    buffer = __karenTest.updateTuiBuffer(buffer, '\x15');
    expect(buffer).toBe('');
  });
});

describe('Karen isolation hardening', () => {
  test('rejects symlinks that escape the isolated worktree root', () => {
    const root = makeTempProject();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'karen-outside-'));
    tempDirs.push(outside);
    const safeTarget = path.join(root, 'safe-target.txt');
    fs.writeFileSync(safeTarget, 'inside');

    fs.symlinkSync(safeTarget, path.join(root, 'safe-link'));
    expect(() => __karenTest.scanForUnsafeSymlinks(root)).not.toThrow();

    fs.symlinkSync(outside, path.join(root, 'unsafe-link'));
    expect(() => __karenTest.scanForUnsafeSymlinks(root)).toThrow(/Unsafe symlink escapes Karen worktree/);
  });

  test('keeps raw OpenCode passthrough behind an explicit local escape hatch', () => {
    delete process.env.KAREN_ALLOW_RAW_OPENCODE;
    expect(__karenTest.rawOpenCodeAllowed()).toBe(false);

    process.env.KAREN_ALLOW_RAW_OPENCODE = '1';
    expect(__karenTest.rawOpenCodeAllowed()).toBe(true);
  });
});

describe('Karen OpenCode hook adapter boundary', () => {
  test('detects upstream prompt hook registration APIs', () => {
    const support = detectOpenCodeHookSupport({
      upstream: {
        protocolVersion: '2026-05-09',
        registerPromptHook() {},
      },
      env: {},
    });

    expect(support.available).toBe(true);
    expect(support.registration.path).toBe('registerPromptHook');
    expect(support.protocolVersion).toBe('2026-05-09');
  });

  test('normalizes prompt submit event shapes into Karen prompt events', () => {
    expect(normalizeOpenCodePromptEvent({
      type: 'prompt:submit',
      prompt: 'Refactor auth session expiry and add tests.',
      sessionId: 'ses_123',
      cwd: '/repo',
      model: 'openai/gpt-5.5',
    })).toMatchObject({
      kind: 'prompt_submit',
      source: 'opencode-hook',
      rawType: 'prompt:submit',
      prompt: 'Refactor auth session expiry and add tests.',
      sessionId: 'ses_123',
      cwd: '/repo',
      metadata: { model: 'openai/gpt-5.5' },
    });

    expect(normalizeOpenCodePromptEvent({
      event: 'message.created',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'Update the dashboard loading state.' },
        ],
      },
    })).toMatchObject({
      prompt: 'Update the dashboard loading state.',
      rawType: 'message.created',
    });

    expect(normalizeOpenCodePromptEvent({
      event: 'message.created',
      message: { role: 'assistant', content: 'Done.' },
    })).toBe(null);
    expect(normalizeOpenCodePromptEvent({ event: 'model.picker', text: 'gpt-5.5' })).toBe(null);
  });

  test('selects hook, PTY fallback, required failure, and disabled modes', () => {
    expect(selectOpenCodeInterceptionStrategy({
      upstream: { registerPromptHook() {} },
      env: {},
    }).strategy).toBe(openCodeHookStrategies.HOOK_STRATEGY);

    expect(selectOpenCodeInterceptionStrategy({
      upstream: null,
      env: {},
    })).toMatchObject({
      strategy: openCodeHookStrategies.PTY_STRATEGY,
      hookAvailable: false,
      canFallbackToPty: true,
    });

    expect(selectOpenCodeInterceptionStrategy({
      upstream: null,
      env: { KAREN_OPENCODE_HOOK_MODE: 'required' },
    })).toMatchObject({
      strategy: openCodeHookStrategies.UNAVAILABLE_STRATEGY,
      canFallbackToPty: false,
    });

    expect(selectOpenCodeInterceptionStrategy({
      upstream: { registerPromptHook() {} },
      env: { KAREN_OPENCODE_HOOK: 'disabled' },
    })).toMatchObject({
      strategy: openCodeHookStrategies.DISABLED_STRATEGY,
      hookAvailable: false,
    });
  });

  test('attaches a prompt guard through the upstream hook adapter', async () => {
    let capturedHandler = null;
    const adapter = createOpenCodeHookAdapter({
      upstream: {
        hooks: {
          prompt: {
            submit(handler) {
              capturedHandler = handler;
              return { dispose() {} };
            },
          },
        },
      },
      env: {},
    });

    const installed = adapter.attachPromptGuard(async (event, context) => ({
      action: event.prompt.includes('fix it') ? 'block' : 'pass',
      prompt: event.prompt,
      context,
    }));

    expect(installed).toMatchObject({
      attached: true,
      strategy: openCodeHookStrategies.HOOK_STRATEGY,
      registrationPath: 'hooks.prompt.submit',
    });

    await expect(capturedHandler({
      type: 'prompt.submit',
      input: { text: 'fix it' },
    }, { source: 'test' })).resolves.toMatchObject({
      action: 'block',
      prompt: 'fix it',
      context: { source: 'test' },
    });
  });

  test('does not attach when the adapter is using PTY fallback', () => {
    const adapter = createOpenCodeHookAdapter({ upstream: null, env: {} });
    expect(adapter.attachPromptGuard(() => ({ action: 'pass' }))).toMatchObject({
      attached: false,
      strategy: openCodeHookStrategies.PTY_STRATEGY,
    });
  });
});

describe('Karen prompt rewriter', () => {
  test('skips the OpenAI call and reports no-api-key when OPENAI_API_KEY is unset', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.KAREN_REWRITE_AI;
    expect(rewriteAiAllowed()).toBe(false);
    const result = await karenRewritePrompt({
      original: 'fix auth',
      evaluation: { score: 18, reasons: ['No concrete target outcome'] },
      cwd: process.cwd(),
    });
    expect(result.ok).toBe(false);
    expect(result.source).toBe('no-api-key');
    expect(typeof result.reason).toBe('string');
  });

  test('calls the Responses API with a strict json_schema and returns the rewrite payload', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.KAREN_REWRITE_AI = '1';
    process.env.KAREN_REWRITE_MODEL = 'gpt-5.5';
    let captured = null;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            rewrite: 'Update packages/karen/lib/karen-auth.js to reject expired tokens; preserve current API.',
            files: ['packages/karen/lib/karen-auth.js'],
            acceptance_criteria: [
              'Expired tokens return null from loadAuth',
              'Existing happy-path tests still pass',
            ],
            scope: 'Only karen-auth.js and its existing tests.',
            tests: 'Add a unit test that injects an expired token.',
          }),
        }),
      };
    };
    const result = await karenRewritePrompt({
      original: 'fix auth',
      evaluation: { score: 18, reasons: ['No clear files'] },
      cwd: process.cwd(),
      branch: 'main',
      files: ['packages/karen/lib/karen-auth.js'],
      recentCommits: ['abc1234 wip'],
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe('ai:gpt-5.5');
    expect(result.rewrite).toContain('packages/karen/lib/karen-auth.js');
    expect(result.rewrite).toContain('Acceptance criteria');
    expect(captured.url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(captured.init.body);
    expect(body.model).toBe('gpt-5.5');
    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.schema.required).toContain('rewrite');
  });

  test('returns source=error when the API responds non-OK', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.KAREN_REWRITE_AI = '1';
    const result = await karenRewritePrompt({
      original: 'fix it',
      evaluation: { score: 12, reasons: ['Vague'] },
      cwd: process.cwd(),
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'unavailable' }),
    });
    expect(result.ok).toBe(false);
    expect(result.source).toBe('error');
    expect(result.reason).toContain('503');
  });

  test('formatRewriteForDisplay joins the structured payload into readable sections', () => {
    const text = __karenRewriteTest.formatRewriteForDisplay({
      rewrite: 'Update foo.js',
      files: ['foo.js'],
      scope: 'foo only',
      acceptance_criteria: ['behavior X works'],
      tests: 'unit test for X',
    });
    expect(text).toContain('Update foo.js');
    expect(text).toContain('Files: foo.js');
    expect(text).toContain('Acceptance criteria');
    expect(text).toContain('Tests: unit test for X');
  });
});

describe('Karen timing + profile cache', () => {
  test('isTimingEnabled tracks KAREN_VERBOSE_TIMING and timeSync is a no-op when off', () => {
    delete process.env.KAREN_VERBOSE_TIMING;
    expect(isTimingEnabled()).toBe(false);
    let called = false;
    const value = timeSync('noop', () => { called = true; return 42; });
    expect(called).toBe(true);
    expect(value).toBe(42);
  });

  test('timeAsync awaits and returns the resolved value', async () => {
    const result = await timeAsync('noop-async', async () => 'ok');
    expect(result).toBe('ok');
  });

  test('getCachedProfile serves the same value within the TTL window', () => {
    __karenTimingTest._resetCache();
    let calls = 0;
    const fakeStore = { getProfile: () => { calls += 1; return { user: { username: 'u' }, stats: { disciplineScore: calls } }; } };
    const first = getCachedProfile(fakeStore, 'u');
    const second = getCachedProfile(fakeStore, 'u');
    expect(first).toBe(second);
    expect(calls).toBe(1);
    invalidateProfileCache('u');
    const third = getCachedProfile(fakeStore, 'u');
    expect(third).not.toBe(first);
    expect(calls).toBe(2);
  });
});

describe('Karen TUI guard overlay', () => {
  test('formatGuardBadge returns a coloured "karen guard" pill', () => {
    const badge = formatGuardBadge({ active: true });
    expect(badge).toContain('karen guard');
  });

  test('formatGuardBadge with active=false returns empty', () => {
    expect(formatGuardBadge({ active: false })).toBe('');
  });

  test('formatBlockedSidebar renders verdict header and charges with wrapping', () => {
    const lines = formatBlockedSidebar(
      { score: 32, reasons: ['No clear files, subsystem, or scope boundary', 'Missing acceptance criteria'] },
      { width: 38 },
    );
    const flat = lines.join('\n');
    expect(flat).toContain('PROMPTCOURT CHECK');
    expect(flat).toContain('BLOCKED 32/100');
    expect(flat).toContain('No clear files');
    expect(flat).toContain('Missing acceptance criteria');
  });

  test('updateScreenTail keeps the visible-line ring usable after ANSI churn', () => {
    const buffer = createScreenTailBuffer({ maxBytes: 200, maxLines: 8 });
    updateScreenTail(buffer, 'message\n> ');
    updateScreenTail(buffer, '\x1b[2J\x1b[H\x1b[38;5;1m');
    updateScreenTail(buffer, 'Select provider\nOpenAI\nAnthropic\n');
    const visible = screenTailVisible(buffer, 6);
    expect(visible).toContain('Select provider');
    expect(visible).toContain('OpenAI');
    // raw tail still bounded:
    expect(screenTailRaw(buffer).length).toBeLessThanOrEqual(200);
  });

  test('openCodePluginAvailability honestly reports no SDK is installed', () => {
    const status = __karenTuiGuardTest.openCodePluginAvailability({ env: {} });
    expect(status.sdkInstalled).toBe(false);
    expect(status.reason).toContain('@opencode-ai/sdk');
  });
});
