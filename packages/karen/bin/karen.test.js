import { afterEach, describe, expect, test } from 'bun:test';

import { __karenTest } from './karen.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

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
});

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

describe('Karen OpenCode TUI interception heuristics', () => {
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
