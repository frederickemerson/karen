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
  /\bcrash(es|ing)?\b/i,
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

const CODING_INTENT_PATTERNS = [
  /\bfix\b/i,
  /\bdebug\b/i,
  /\bcrash(es|ing)?\b/i,
  /\berror\b/i,
  /\bfail(s|ing|ed)?\b/i,
  /\bbug\b/i,
  /\bslow\b/i,
  /\bfaster\b/i,
  /\bperf(ormance)?\b/i,
  /\boptimi[sz]e\b/i,
  /\brefactor\b/i,
  /\badd\b/i,
  /\bupdate\b/i,
  /\bremove\b/i,
  /\bchange\b/i,
  /\bimplement\b/i,
  /\btest\b/i,
  /\bbuild\b/i,
  /\btype-?check\b/i,
];

const HOPELESS_PROMPTS = [
  /^\s*(do it|go|continue|yes|ok|okay|sure|ship it|make it happen)\s*[.!?]*\s*$/i,
  /\bdo your magic\b/i,
  /\bmake it better\b/i,
  /\bmake.*nice\b/i,
];

// Greetings / pleasantries — no code change requested.
const CONVERSATIONAL_PATTERNS = [
  /^\s*(hi|hello|hey|yo|sup|howdy|hola|gm|gn|good\s+(morning|afternoon|evening|night))\b/i,
  /^\s*(thanks?|thank\s+you|ty|thx|cheers|bye|goodbye|nice|cool|great|awesome|love\s+(it|this|that))\b/i,
  /^\s*(how('s|\s+is)\s+it\s+going|how\s+are\s+you|what'?s\s+up|wassup)\b/i,
  /^\s*(yes|no|maybe|sure|ok(ay)?|nope|yep|yeah|nah)\s*[.!?]?\s*$/i,
];

// Read-only / exploratory prompts — Karen does not need to gate these,
// the agent can chat or explore the repo without producing a diff.
const EXPLORATION_PATTERNS = [
  /\b(explore|inspect|browse|tour|survey|review|audit|study|map\s+out|map\s+the|analy[sz]e|skim)\b.*\b(codebase|repo(sitory)?|project|module|files?|structure|tree|directory|folder|architecture|system|flow|design|layout)\b/i,
  /\b(show|list|find|locate|search\s+for|grep|describe|explain|summari[sz]e|outline|tell\s+me\s+about|walk\s+me\s+through|teach\s+me|give\s+me\s+(an?\s+)?overview)\b/i,
  /\b(what|where|how|why|when|which|who)\s+(is|are|does|do|did|was|were|happens?|should|would|could|can|will|am|i'?m)\b/i,
  /\b(read|open|view|look\s+at|peek\s+at|check\s+out|take\s+a\s+look)\b\s+(the\s+)?(file|folder|directory|module|function|class|component|test|config|repo|codebase)\b/i,
];

// Imperative mutation verbs that require specifics. If any of these appear,
// the prompt MUST go through the strict gate — even if the wrapper sounds
// conversational ("hi can you fix the login bug" still gets graded).
const MUTATION_VERBS = /\b(?:fix|debug|patch|repair|resolve|implement|introduce|generate|delete|prune|refactor|restructure|reorganize|rewrite|rename|migrate|port|optimi[sz]e|polish|improve|cleanup|clean\s+up|harden|finish|complete|ship|deploy|release|publish)\b/i;

// Bare lazy directives that carry no information at all.
const LAZY_DIRECTIVES = /\b(?:get\s+(?:it|this|things?|stuff)\s+working|make\s+(?:it|this|things?|stuff)\s+work|just\s+do\s+it|do\s+your\s+(?:thing|magic)|make\s+it\s+(?:better|nicer|cleaner|prettier))\b/i;

const classifyIntent = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  if (!prompt) return null;
  if (MUTATION_VERBS.test(prompt) || LAZY_DIRECTIVES.test(prompt)) return null;
  const conversational = CONVERSATIONAL_PATTERNS.some((re) => re.test(prompt));
  const exploration = EXPLORATION_PATTERNS.some((re) => re.test(prompt));
  if (!conversational && !exploration) return null;
  return exploration ? 'exploration' : 'conversational';
};

const intentApproval = (prompt, intent) => ({
  score: 100,
  verdict: 'approved',
  allowed: true,
  intent,
  reasons: [],
  dimensions: {
    specificGoal: 20,
    scopeBoundaries: 20,
    acceptanceCriteria: 20,
    context: 15,
    verification: 15,
    riskAwareness: 10,
  },
  suggestedRewrite: '',
  promptKind: intent,
  excerpt: prompt.slice(0, 120),
});

const countMatches = (text, patterns) => patterns.reduce((count, pattern) => (
  pattern.test(text) ? count + 1 : count
), 0);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const scorePrompt = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  const intent = classifyIntent(prompt);
  if (intent) return intentApproval(prompt, intent);
  const words = prompt.split(/\s+/).filter(Boolean);
  const lines = prompt.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const specificityHits = countMatches(prompt, SCOPE_PATTERNS);
  const acceptanceHits = countMatches(prompt, ACCEPTANCE_PATTERNS);
  const verificationHits = countMatches(prompt, VERIFICATION_PATTERNS);
  const riskHits = countMatches(prompt, RISK_PATTERNS);
  const contextHits = countMatches(prompt, CONTEXT_PATTERNS);
  const vagueHits = countMatches(prompt, VAGUE_PHRASES);
  const codingIntentHits = countMatches(prompt, CODING_INTENT_PATTERNS);
  const hopelessHits = countMatches(prompt, HOPELESS_PROMPTS);
  const hasCodeReference = /[`'"][^`'"]+[`'"]|[\w.-]+\.(ts|tsx|js|jsx|css|json|md|py|go|rs|java|kt|swift)|\/|\b(line|stack|trace|diff|commit|branch)\b/i.test(prompt);
  const hasConcreteIntent = codingIntentHits > 0 || specificityHits > 0 || hasCodeReference;

  const lengthScore = words.length >= 35 ? 10 : words.length >= 18 ? 7 : words.length >= 10 ? 4 : 1;
  const structureScore = lines.length >= 3 ? 8 : lines.length === 2 ? 5 : 2;
  const lazyButUsableBonus = words.length >= 2 && hasConcreteIntent ? 20 : 0;

  const dimensions = {
    specificGoal: clamp(lengthScore + lazyButUsableBonus + (prompt.includes('.') ? 3 : 0) + (vagueHits === 0 ? 7 : 0), 0, 20),
    scopeBoundaries: clamp(specificityHits * 7 + (/\bonly\b|\blimit\b|\bscope\b/i.test(prompt) ? 6 : 0), 0, 20),
    acceptanceCriteria: clamp(acceptanceHits * 7 + structureScore, 0, 20),
    context: clamp(contextHits * 5 + (hasCodeReference ? 5 : 0) + (words.length >= 25 ? 5 : 0), 0, 15),
    verification: clamp(verificationHits * 8, 0, 15),
    riskAwareness: clamp(riskHits * 5, 0, 10),
  };

  let score = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  score -= Math.min(vagueHits * 4, 12);
  if (words.length < 4 && !hasConcreteIntent) score -= 18;
  if (words.length < 8 && vagueHits > 0 && !hasConcreteIntent) score -= 12;
  if (hopelessHits > 0 && !hasCodeReference && codingIntentHits === 0) score -= 20;
  score = clamp(Math.round(score), 0, 100);

  const reasons = [];
  if (dimensions.specificGoal < 12) reasons.push('No concrete target outcome');
  if (dimensions.scopeBoundaries < 10) reasons.push('No clear files, subsystem, or scope boundary');
  if (dimensions.acceptanceCriteria < 12) reasons.push('Missing acceptance criteria');
  if (dimensions.context < 8) reasons.push('Missing current behavior or relevant context');
  if (dimensions.verification < 8) reasons.push('No verification or test request');
  if (dimensions.riskAwareness < 5) reasons.push('No constraints for risky or unrelated changes');
  if (vagueHits > 0) reasons.push(hasConcreteIntent ? 'Lazy prompt: allowed, but Karen will quiz harder' : 'Vague language without operational detail');

  const verdict = score < 25 || (score < 40 && !hasConcreteIntent) || (hopelessHits > 0 && !hasConcreteIntent) ? 'blocked' : 'approved';
  return {
    score,
    verdict,
    allowed: verdict === 'approved',
    intent: null,
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
