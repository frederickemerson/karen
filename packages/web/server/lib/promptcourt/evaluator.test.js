import { describe, expect, it } from 'vitest';

import { evaluatePrompt, extractPromptText } from './evaluator.js';

describe('promptcourt evaluator', () => {
  it('blocks vague prompts before agent execution', () => {
    const result = evaluatePrompt('fix this and make it better');

    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe('blocked');
    expect(result.score).toBeLessThan(70);
    expect(result.reasons).toContain('Vague language without operational detail');
    expect(result.suggestedRewrite).toContain('Scope:');
    expect(result.suggestedRewrite).toContain('Acceptance criteria:');
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
