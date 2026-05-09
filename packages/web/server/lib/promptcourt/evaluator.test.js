import { describe, expect, it } from 'vitest';

import { evaluatePrompt, extractPromptText } from './evaluator.js';

describe('promptcourt evaluator', () => {
  it('blocks prompts with no useful coding intent before agent execution', () => {
    const result = evaluatePrompt('do your magic');

    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe('blocked');
    expect(result.score).toBeLessThan(40);
    expect(result.reasons).toContain('Vague language without operational detail');
    expect(result.suggestedRewrite).toContain('Scope:');
    expect(result.suggestedRewrite).toContain('Acceptance criteria:');
  });

  it('suggests an immediately passing exploration rewrite for vague read-only prompts', () => {
    const result = evaluatePrompt('go through the codebase');

    expect(result.allowed).toBe(false);
    expect(result.suggestedRewrite).toContain('Explore the codebase');
    expect(result.suggestedRewrite).not.toContain('name the files');
    expect(result.suggestedRewrite).not.toContain('list the exact user-visible behavior');

    const appeal = evaluatePrompt(result.suggestedRewrite);
    expect(appeal.allowed).toBe(true);
    expect(appeal.intent).toBe('exploration');
  });

  it('suggests an immediately passing implementation rewrite for vague mutation prompts', () => {
    const result = evaluatePrompt('fix this');

    expect(result.allowed).toBe(false);
    expect(result.suggestedRewrite).not.toContain('name the files');
    expect(result.suggestedRewrite).not.toContain('list the exact user-visible behavior');

    const appeal = evaluatePrompt(result.suggestedRewrite);
    expect(appeal.allowed).toBe(true);
    expect(appeal.verdict).toBe('approved');
  });

  it('allows lazy but actionable coding prompts with warnings', () => {
    const result = evaluatePrompt('fix this crash in the login flow');

    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe('approved');
    expect(result.reasons).toContain('Lazy prompt: allowed, but Karen will quiz harder');
  });

  it('approves prompts with scope, acceptance criteria, verification, and constraints', () => {
    const result = evaluatePrompt(`
      Implement the Karen prompt gate in packages/web/server/lib/promptcourt/routes.js.
      Scope: only touch the promptcourt route and evaluator modules.
      Acceptance criteria: when a user sends a weak prompt, the endpoint must return a blocked verdict with reasons so that no OpenCode execution starts.
      Verification: add tests for the blocked and approved cases, then run lint and type-check.
      Constraints: do not change unrelated OpenCode provider or auth behavior.
    `);

    expect(result.allowed).toBe(true);
    expect(result.verdict).toBe('approved');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).not.toContain('No verification or test request');
  });

  it('lets greetings through without quizzing', () => {
    for (const greeting of ['hi', 'hello there', 'hey karen', 'good morning', 'thanks!', 'yo', 'sup']) {
      const result = evaluatePrompt(greeting);
      expect(result.allowed, `${greeting} should be allowed`).toBe(true);
      expect(result.intent, `${greeting} intent`).toBe('conversational');
      expect(result.reasons).toEqual([]);
    }
  });

  it('lets read-only exploration prompts through without quizzing', () => {
    const explorations = [
      'explore the codebase',
      'show me the auth flow',
      'what does the session middleware do',
      'how does the quiz pipeline work',
      'tell me about the promptcourt store',
      'walk me through the login flow',
      'list the open routes',
    ];
    for (const prompt of explorations) {
      const result = evaluatePrompt(prompt);
      expect(result.allowed, `${prompt} should be allowed`).toBe(true);
      expect(result.intent, `${prompt} intent`).toBe('exploration');
      expect(result.reasons).toEqual([]);
    }
  });

  it('still blocks lazy mutation prompts even when they sound short and casual', () => {
    for (const prompt of ['fix it', 'fix this', 'make this faster', 'optimize this', 'get it working', 'make it work', 'refactor the thing', 'just do it']) {
      const result = evaluatePrompt(prompt);
      expect(result.allowed, `${prompt} should be blocked`).toBe(false);
      expect(result.verdict).toBe('blocked');
      expect(result.intent).toBeNull();
    }
  });

  it('falls back to the strict gate when chitchat is mixed with bare mutation intent', () => {
    const result = evaluatePrompt('hi karen, fix it');
    expect(result.intent).toBeNull();
    expect(result.verdict).toBe('blocked');
  });

  it('lets the strict gate approve mutation prompts that include scope and context', () => {
    const result = evaluatePrompt('hi karen, fix the login bug in packages/web/server/auth.ts');
    expect(result.intent).toBeNull();
    expect(result.verdict).toBe('approved');
  });

  it('extracts only user-authored text parts from request bodies', () => {
    const body = {
      parts: [
        { type: 'text', text: 'Real user prompt' },
        { type: 'text', text: 'Synthetic context', synthetic: true },
        { type: 'image', text: 'not prompt text' },
        { type: 'text', text: 'Acceptance criteria: verify the endpoint returns 403.' },
      ],
    };

    expect(extractPromptText(body)).toBe('Real user prompt\n\nAcceptance criteria: verify the endpoint returns 403.');
    expect(extractPromptText(null)).toBe('');
    expect(extractPromptText({ parts: 'invalid' })).toBe('');
  });
});
