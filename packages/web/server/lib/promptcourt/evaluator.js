const ACCEPTANCE_PATTERNS = [
  /\bacceptance criteria\b/i,
  /\bexpected behavior\b/i,
  /\bshould\b/i,
  /\bwhen\b.+\bthen\b/i,
  /\bmust\b/i,
  /\bverify\b/i,
  /\bso that\b/i,
  /\bso\b.+\b(redirect|show|return|render|save|update|create|delete|prevent|allow)\b/i,
  /\b(add|update|write)\b.+\btests?\b/i,
];

const SCOPE_PATTERNS = [
  /\bfile\b/i,
  /\bcomponent\b/i,
  /\broute\b/i,
  /\bendpoint\b/i,
  /\bfunction\b/i,
  /\bclass\b/i,
  /\bmodule\b/i,
  /\bpage\b/i,
  /\bflow\b/i,
  /\bprovider\b/i,
  /\broutes?\b/i,
  /\bauth\b/i,
  /\blogin\b/i,
  /\bcheckout\b/i,
  /\bbilling\b/i,
  /[`'"][^`'"]+\.(ts|tsx|js|jsx|css|json|md|py|go|rs|java|kt|swift)[`'"]/i,
  /(?:^|\s)(?:packages|src|app|components|server|client|lib|pages|routes)\//i,
];

const VERIFICATION_PATTERNS = [
  /\btest(s|ing)?\b/i,
  /\btype-?check\b/i,
  /\blint\b/i,
  /\bbuild\b/i,
  /\bmanual QA\b/i,
  /\breproduce\b/i,
  /\bregression\b/i,
];

const RISK_PATTERNS = [
  /\bdo not\b/i,
  /\bdon't\b/i,
  /\bavoid\b/i,
  /\bwithout changing\b/i,
  /\bkeep\b.+\bexisting\b/i,
  /\bbackward compatible\b/i,
  /\brollback\b/i,
  /\bsecurity\b/i,
  /\bauth\b/i,
  /\bpayment\b/i,
];

const CONTEXT_PATTERNS = [
  /\bbecause\b/i,
  /\bcurrently\b/i,
  /\bexisting\b/i,
  /\berror\b/i,
  /\bbug\b/i,
  /\buser\b/i,
  /\brepro\b/i,
  /\bsteps?\b/i,
];

const VAGUE_PHRASES = [
  /\bmake it better\b/i,
  /\bfix (it|this|everything)\b/i,
  /\bclean (it|this|up)\b/i,
  /\bimprove\b/i,
  /\boptimi[sz]e\b/i,
  /\brefactor\b/i,
  /\bpolish\b/i,
  /\bdo your magic\b/i,
  /\bmake.*nice\b/i,
];

const countMatches = (text, patterns) => patterns.reduce((count, pattern) => (
  pattern.test(text) ? count + 1 : count
), 0);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const scorePrompt = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  const words = prompt.split(/\s+/).filter(Boolean);
  const lines = prompt.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const specificityHits = countMatches(prompt, SCOPE_PATTERNS);
  const acceptanceHits = countMatches(prompt, ACCEPTANCE_PATTERNS);
  const verificationHits = countMatches(prompt, VERIFICATION_PATTERNS);
  const riskHits = countMatches(prompt, RISK_PATTERNS);
  const contextHits = countMatches(prompt, CONTEXT_PATTERNS);
  const vagueHits = countMatches(prompt, VAGUE_PHRASES);

  const lengthScore = words.length >= 35 ? 10 : words.length >= 18 ? 7 : words.length >= 10 ? 4 : 1;
  const structureScore = lines.length >= 3 ? 8 : lines.length === 2 ? 5 : 2;

  const dimensions = {
    specificGoal: clamp(lengthScore + (prompt.includes('.') ? 3 : 0) + (vagueHits === 0 ? 7 : 0), 0, 20),
    scopeBoundaries: clamp(specificityHits * 7 + (/\bonly\b|\blimit\b|\bscope\b/i.test(prompt) ? 6 : 0), 0, 20),
    acceptanceCriteria: clamp(acceptanceHits * 7 + structureScore, 0, 20),
    context: clamp(contextHits * 5 + (words.length >= 25 ? 5 : 0), 0, 15),
    verification: clamp(verificationHits * 8, 0, 15),
    riskAwareness: clamp(riskHits * 5, 0, 10),
  };

  let score = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  score -= vagueHits * 8;
  if (words.length < 6) score -= 18;
  if (words.length < 12 && vagueHits > 0) score -= 12;
  score = clamp(Math.round(score), 0, 100);

  const reasons = [];
  if (dimensions.specificGoal < 12) reasons.push('No concrete target outcome');
  if (dimensions.scopeBoundaries < 10) reasons.push('No clear files, subsystem, or scope boundary');
  if (dimensions.acceptanceCriteria < 12) reasons.push('Missing acceptance criteria');
  if (dimensions.context < 8) reasons.push('Missing current behavior or relevant context');
  if (dimensions.verification < 8) reasons.push('No verification or test request');
  if (dimensions.riskAwareness < 5) reasons.push('No constraints for risky or unrelated changes');
  if (vagueHits > 0) reasons.push('Vague language without operational detail');

  const verdict = score < 70 ? 'blocked' : 'approved';
  return {
    score,
    verdict,
    allowed: verdict === 'approved',
    reasons,
    dimensions,
    suggestedRewrite: buildSuggestedRewrite(prompt, reasons),
  };
};

const buildSuggestedRewrite = (prompt, reasons) => {
  const topic = prompt.length > 0 ? prompt.slice(0, 96) : 'the requested change';
  return [
    `Implement: ${topic}`,
    'Scope: name the files, route, component, or subsystem the agent may touch.',
    'Acceptance criteria: list the exact user-visible behavior that must be true.',
    'Verification: say which tests, type checks, lint, build, or manual checks should pass.',
    reasons.includes('No constraints for risky or unrelated changes')
      ? 'Constraints: call out what must not change.'
      : null,
  ].filter(Boolean).join('\n');
};

export const extractPromptText = (body) => {
  if (!body || typeof body !== 'object') {
    return '';
  }
  const parts = Array.isArray(body.parts) ? body.parts : [];
  return parts
    .filter((part) => part && typeof part === 'object' && part.type === 'text' && !part.synthetic)
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n\n')
    .trim();
};

export const evaluatePrompt = (prompt) => scorePrompt(prompt);
