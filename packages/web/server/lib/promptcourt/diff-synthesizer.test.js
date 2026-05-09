import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { synthesizeGuiDiff, __test } from './diff-synthesizer.js';

describe('promptcourt diff synthesizer', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAi = process.env.KAREN_QUIZ_AI;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.KAREN_QUIZ_AI;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey ?? '';
    process.env.KAREN_QUIZ_AI = originalAi ?? '';
  });

  it('returns the fixture diff when AI is not configured', async () => {
    const result = await synthesizeGuiDiff({ prompt: 'Add a refresh helper to the auth session module.' });
    expect(result.source).toBe('fixture');
    expect(result.diff).toContain('diff --git');
    expect(result.note).toBeDefined();
  });

  it('returns the fixture diff for empty prompts', async () => {
    const result = await synthesizeGuiDiff({ prompt: '   ' });
    expect(result.source).toBe('fixture');
    expect(result.note).toContain('No prompt');
  });

  it('uses the fixture when the model returns non-diff content', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.KAREN_QUIZ_AI = '1';

    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ output_text: 'no diff here, just prose' }),
      text: async () => '',
    });

    const result = await synthesizeGuiDiff({ prompt: 'Refactor login.', fetchImpl: fakeFetch });
    expect(result.source).toBe('fixture');
    expect(result.note).toContain('did not return');
  });

  it('returns the model diff when the response is a unified diff', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.KAREN_QUIZ_AI = '1';

    const aiDiff = [
      'diff --git a/foo.js b/foo.js',
      'index 1111..2222 100644',
      '--- a/foo.js',
      '+++ b/foo.js',
      '@@ -1,3 +1,4 @@',
      ' const a = 1;',
      '+const b = 2;',
      ' const c = 3;',
    ].join('\n');

    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ output_text: aiDiff }),
      text: async () => '',
    });

    const result = await synthesizeGuiDiff({ prompt: 'Add b.', fetchImpl: fakeFetch });
    expect(result.source.startsWith('ai:')).toBe(true);
    expect(result.diff).toContain('diff --git');
    expect(result.note).toBeUndefined();
  });

  it('strips fenced code blocks before validating', () => {
    const cleaned = __test.stripCodeFences('```diff\ndiff --git a/x b/x\n```');
    expect(cleaned).toBe('diff --git a/x b/x');
  });
});
