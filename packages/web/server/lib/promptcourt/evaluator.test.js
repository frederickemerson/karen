import { describe, expect, it } from 'vitest';

import {
  blastRadiusMissing,
  classifyPromptIntent,
  diffExplanationMissing,
  evaluatePrompt,
  extractPromptText,
  testsNotNamed,
} from './evaluator.js';

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

describe('classifyPromptIntent', () => {
  it('detects commit intent for "commit everything and push it"', () => {
    expect(classifyPromptIntent('commit everything and push it')).toBe('commit');
  });

  it('detects commit intent for git commit / push to main / PRs / merge', () => {
    expect(classifyPromptIntent('git commit -m "thing"')).toBe('commit');
    expect(classifyPromptIntent('push to main')).toBe('commit');
    expect(classifyPromptIntent('please open a PR')).toBe('commit');
    expect(classifyPromptIntent('raise a pull request when done')).toBe('commit');
    expect(classifyPromptIntent('merge to main once green')).toBe('commit');
    expect(classifyPromptIntent('ship it')).toBe('commit');
  });

  it('does not flag negative-pattern uses of commit/push as commit intent', () => {
    expect(classifyPromptIntent('commit it to memory')).toBe('normal');
    expect(classifyPromptIntent('add push notifications to the app')).toBe('normal');
    expect(classifyPromptIntent('describe the commit history of this repo')).toBe('normal');
  });

  it('returns normal for empty or non-commit prompts', () => {
    expect(classifyPromptIntent('')).toBe('normal');
    expect(classifyPromptIntent(null)).toBe('normal');
    expect(classifyPromptIntent('fix the login bug in packages/web/server/auth.ts')).toBe('normal');
  });

  it('handles mixed positive + negative phrases by stripping negatives first', () => {
    // Negative phrase + a real git-push action — the real action should still register.
    expect(classifyPromptIntent('commit it to memory then git push to main')).toBe('commit');
    // Only negative phrases — must remain normal.
    expect(classifyPromptIntent('commit it to memory and push notifications later')).toBe('normal');
  });
});

describe('commit-specific checks', () => {
  it('diffExplanationMissing is false when files or directories are named', () => {
    expect(diffExplanationMissing('updated packages/web/server/foo.js to add bar')).toBe(false);
    expect(diffExplanationMissing('changes: src/app/login.tsx')).toBe(false);
    expect(diffExplanationMissing('the diff renames a helper')).toBe(false);
  });

  it('diffExplanationMissing is true for bare commit prompts', () => {
    expect(diffExplanationMissing('commit everything and push it')).toBe(true);
    expect(diffExplanationMissing('')).toBe(true);
  });

  it('testsNotNamed is false when tests are mentioned by name or activity', () => {
    expect(testsNotNamed('ran tests for the evaluator')).toBe(false);
    expect(testsNotNamed('with tests passing')).toBe(false);
    expect(testsNotNamed('added evaluator.test.js cases')).toBe(false);
  });

  it('blastRadiusMissing is false when scope or compat is stated', () => {
    expect(blastRadiusMissing('only touches promptcourt evaluator, backward compatible')).toBe(false);
    expect(blastRadiusMissing('no breaking changes')).toBe(false);
    expect(blastRadiusMissing('scoped to the auth route')).toBe(false);
  });
});

describe('commit-layer enforcement in evaluatePrompt', () => {
  it('blocks a bare commit prompt with four commit chips including commit-gate-failed', () => {
    const result = evaluatePrompt('commit everything and push it');

    expect(result.promptIntent).toBe('commit');
    expect(result.verdict).toBe('blocked');
    expect(result.allowed).toBe(false);

    const commitChips = result.chips.filter((c) => c.category === 'commit');
    expect(commitChips.length).toBeGreaterThanOrEqual(4);

    const ids = commitChips.map((c) => c.id);
    expect(ids).toContain('commit-gate-failed');
    expect(ids).toContain('no-diff-explanation');
    expect(ids).toContain('no-tests-named');
    expect(ids).toContain('no-blast-radius');

    // First commit chip MUST be the gate chip.
    expect(commitChips[0].id).toBe('commit-gate-failed');
    expect(commitChips[0].label).toBe('Commit gate failed in the TUI.');

    // Reasons[] mirrors the commit chip labels.
    expect(result.reasons[0]).toBe('Commit gate failed in the TUI.');
    expect(result.reasons).toContain('No diff explanation');
    expect(result.reasons).toContain('No tests named');
    expect(result.reasons).toContain('No blast-radius owner');
  });

  it('does not push commit chips when files, tests, and scope are all named', () => {
    const result = evaluatePrompt([
      'commit and push the evaluator change.',
      'Diff: packages/web/server/lib/promptcourt/evaluator.js gains a commit-intent classifier.',
      'Tests: ran evaluator.test.js with new commit-gate cases, all passing.',
      'Blast radius: only touches promptcourt evaluator, backward compatible, no schema changes.',
    ].join('\n'));

    expect(result.promptIntent).toBe('commit');
    const commitChips = result.chips.filter((c) => c.category === 'commit');
    expect(commitChips).toEqual([]);
    expect(result.reasons).not.toContain('Commit gate failed in the TUI.');
  });

  it('emits a commit-shaped suggestedRewrite when promptIntent is commit', () => {
    const result = evaluatePrompt('commit and push to main');
    expect(result.promptIntent).toBe('commit');
    expect(result.suggestedRewrite).toContain('Commit:');
    expect(result.suggestedRewrite).toContain('Diff explanation:');
    expect(result.suggestedRewrite).toContain('Tests:');
    expect(result.suggestedRewrite).toContain('Blast radius:');
  });
});

describe('chip schema for non-commit prompts', () => {
  it('produces chips that mirror reasons[] for a blocked vague prompt', () => {
    const result = evaluatePrompt('do your magic');
    expect(result.promptIntent).toBe('normal');
    expect(result.verdict).toBe('blocked');
    expect(result.chips.length).toBeGreaterThan(0);

    const chipIds = result.chips.map((c) => c.id);
    // No commit chips for a non-commit prompt.
    expect(chipIds).not.toContain('commit-gate-failed');
    // Should map the vague-language reason.
    expect(chipIds).toContain('vague-language');

    // Every chip has the required shape.
    for (const chip of result.chips) {
      expect(chip).toHaveProperty('id');
      expect(chip).toHaveProperty('label');
      expect(['critical', 'warn']).toContain(chip.severity);
      expect(['commit', 'general']).toContain(chip.category);
    }
  });

  it('returns an empty chips array for an approved conversational prompt', () => {
    const result = evaluatePrompt('hi karen');
    expect(result.intent).toBe('conversational');
    expect(result.allowed).toBe(true);
    expect(result.chips).toEqual([]);
    expect(result.promptIntent).toBe('normal');
  });
});

describe('backward compatibility', () => {
  it('still exposes allowed, verdict, and reasons[] in the historical shape', () => {
    const result = evaluatePrompt('fix this');
    expect(typeof result.allowed).toBe('boolean');
    expect(typeof result.verdict).toBe('string');
    expect(Array.isArray(result.reasons)).toBe(true);
    // chips is additive — must coexist.
    expect(Array.isArray(result.chips)).toBe(true);
  });
});
