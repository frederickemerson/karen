import type { PromptCourtPublicPost } from '@/lib/promptcourt';

const fallbackCharges = [
  'No clear outcome',
  'No scope boundary',
  'No verification plan',
];

export const karenVerdictLine = (score?: number): string => {
  const safeScore = Number.isFinite(score) ? Number(score) : 0;
  if (safeScore >= 60) return 'Karen allowed an appeal, barely.';
  if (safeScore >= 35) return 'Karen found structure in the rubble.';
  return 'Karen has sent this prompt to the graveyard.';
};

export const karenChargeList = (post: PromptCourtPublicPost): string[] => {
  const charges = Array.isArray(post.failureReasons)
    ? post.failureReasons.map((reason) => reason.trim()).filter(Boolean)
    : [];
  return charges.length > 0 ? charges : fallbackCharges;
};

export const karenRewriteFor = (post: PromptCourtPublicPost): string => {
  const rewrite = typeof post.suggestedRewrite === 'string' ? post.suggestedRewrite.trim() : '';
  if (rewrite) return rewrite;

  return [
    'Implement: state the exact change.',
    'Scope: name the files or subsystem Karen may touch.',
    'Acceptance criteria: define the behavior that must be true.',
    'Verification: list the test, lint, type-check, build, or manual check.',
  ].join('\n');
};

export const formatBadPromptShareText = (post: PromptCourtPublicPost): string => {
  const score = Number.isFinite(post.score) ? Number(post.score) : 0;
  const prompt = post.promptExcerpt?.trim() || 'No prompt survived the paperwork.';
  const charges = karenChargeList(post).map((charge) => `- ${charge}`).join('\n');

  return [
    `Karen Bad Prompt Graveyard: ${score}/100`,
    karenVerdictLine(score),
    '',
    'Bad prompt:',
    prompt,
    '',
    'Charges:',
    charges,
    '',
    'Karen rewrite:',
    karenRewriteFor(post),
  ].join('\n');
};
