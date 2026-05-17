import { describe, expect, it } from 'vitest';

import { classifyPromptIntent, evaluatePrompt, extractPromptText } from './evaluator.js';

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

  it('always exposes a chips array on evaluation output', () => {
    const blocked = evaluatePrompt('do your magic');
    expect(Array.isArray(blocked.chips)).toBe(true);
    expect(blocked.chips.length).toBeGreaterThan(0);
    for (const chip of blocked.chips) {
      expect(typeof chip.id).toBe('string');
      expect(typeof chip.label).toBe('string');
      expect(['critical', 'warn']).toContain(chip.severity);
      expect(['commit', 'general', 'long-prompt', 'secrets']).toContain(chip.category);
    }

    const conversational = evaluatePrompt('hi karen');
    expect(Array.isArray(conversational.chips)).toBe(true);
    expect(conversational.chips).toEqual([]);
  });

  it('keeps the legacy reasons[] array stable for backward-compatible callers', () => {
    const result = evaluatePrompt('do your magic');
    expect(Array.isArray(result.reasons)).toBe(true);
    // The classic reasons still appear when the regular gate trips.
    expect(result.reasons).toContain('Vague language without operational detail');
  });
});

describe('promptcourt commit-intent classifier', () => {
  it('classifies clear commit-intent prompts as commit', () => {
    const commits = [
      'commit everything and push it',
      'please commit this and push to main',
      'open a pr for this change',
      'open pr please',
      'make a pr',
      'raise a pull request',
      'merge to main',
      'merge it into main',
      'git commit -am "wip"',
      'commit and push',
      'push the changes',
      'push to origin',
      'cut a pr',
    ];
    for (const prompt of commits) {
      expect(classifyPromptIntent(prompt), `${prompt} -> commit`).toBe('commit');
    }
  });

  it('does not classify non-commit prompts as commit', () => {
    const nonCommits = [
      'commit it to memory',
      'add push notifications to the app',
      'wire up push notification handlers in packages/web',
      'pull the lever',
      'how does git work',
      'fix the login bug in packages/web/server/auth.ts',
      'explore the codebase',
      'hello karen',
      '',
    ];
    for (const prompt of nonCommits) {
      expect(classifyPromptIntent(prompt), `${prompt} -> normal`).toBe('normal');
    }
  });

  it('handles non-string inputs gracefully', () => {
    expect(classifyPromptIntent(undefined)).toBe('normal');
    expect(classifyPromptIntent(null)).toBe('normal');
    expect(classifyPromptIntent(42)).toBe('normal');
  });
});

describe('promptcourt commit-specific gate', () => {
  it('blocks "commit everything and push it" with the three failure chips', () => {
    const result = evaluatePrompt('commit everything and push it');

    expect(result.allowed).toBe(false);
    expect(result.verdict).toBe('blocked');
    expect(result.promptIntent).toBe('commit');

    const ids = result.chips.map((c) => c.id);
    expect(ids).toContain('commit-gate-failed');
    expect(ids).toContain('diff-explanation-missing');
    expect(ids).toContain('tests-not-named');
    expect(ids).toContain('blast-radius-missing');

    // Every commit chip is critical and categorized as commit.
    for (const chip of result.chips.filter((c) => c.category === 'commit')) {
      expect(chip.severity).toBe('critical');
    }

    // Reasons[] mirrors the chips for backward compatibility.
    expect(result.reasons).toContain('Commit gate failed in the TUI.');
    expect(result.reasons).toContain('No diff explanation');
    expect(result.reasons).toContain('No tests named');
    expect(result.reasons).toContain('No blast-radius owner');
  });

  it('drops the diff-explanation chip when the prompt explains what changed', () => {
    const prompt = [
      'Commit and push the auth refactor.',
      'Changes:',
      '- packages/web/server/auth.ts: extract login helper',
      '- packages/web/server/auth.test.ts: cover the new helper',
      'Tests: ran auth.test.ts, all green.',
      'Blast radius: only touches packages/web/server, no public api change.',
    ].join('\n');

    const result = evaluatePrompt(prompt);
    const ids = result.chips.map((c) => c.id);
    expect(ids).not.toContain('diff-explanation-missing');
    expect(ids).not.toContain('tests-not-named');
    expect(ids).not.toContain('blast-radius-missing');
  });

  it('drops the tests-not-named chip when the prompt names tests', () => {
    const prompt = 'commit this with tests for the new helper, ran auth.test.ts and they pass';
    const result = evaluatePrompt(prompt);
    const ids = result.chips.map((c) => c.id);
    expect(ids).not.toContain('tests-not-named');
  });

  it('drops the blast-radius chip when the prompt claims a scope', () => {
    const prompt = 'commit it: only touches packages/web/server, no breaking changes';
    const result = evaluatePrompt(prompt);
    const ids = result.chips.map((c) => c.id);
    expect(ids).not.toContain('blast-radius-missing');
  });

  it('does not attach commit chips to non-commit prompts', () => {
    const nonCommit = evaluatePrompt('fix this crash in the login flow');
    const ids = nonCommit.chips.map((c) => c.id);
    expect(ids).not.toContain('commit-gate-failed');
    expect(ids).not.toContain('diff-explanation-missing');
    expect(ids).not.toContain('tests-not-named');
    expect(ids).not.toContain('blast-radius-missing');
    expect(nonCommit.promptIntent).toBe('normal');
  });

  it('suggests a commit-shaped rewrite for commit-intent prompts', () => {
    const result = evaluatePrompt('commit everything and push it');
    expect(result.suggestedRewrite).toContain('Commit:');
    expect(result.suggestedRewrite).toContain('Diff explanation:');
    expect(result.suggestedRewrite).toContain('Tests:');
    expect(result.suggestedRewrite).toContain('Blast radius:');
  });

  it('blocks even when the underlying score would otherwise approve, if commit chips fire', () => {
    // A relatively detailed prompt that nonetheless omits the three commit
    // disciplines should still be blocked once it becomes commit-intent.
    const result = evaluatePrompt('commit the change and push to main');
    expect(result.promptIntent).toBe('commit');
    expect(result.verdict).toBe('blocked');
    expect(result.chips.some((c) => c.id === 'commit-gate-failed')).toBe(true);
  });
});
