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

// --- Commit-intent classification -------------------------------------------
//
// `classifyPromptIntent` is the public, commit-aware sibling of `classifyIntent`.
// It returns either 'commit' or 'normal'. It is NOT used by the conversational/
// exploration fast-path; that path stays owned by `classifyIntent`.

// Negative phrases that *look* like commit/push/PR/merge but are not git
// operations. These are stripped before re-testing the positive patterns.
const COMMIT_NEGATIVE_PATTERNS = [
  /\bcommit (it|this|that|them|these|those)? ?to memory\b/i,
  /\bcommitted to memory\b/i,
  /\bcommit (to|on) (the|a|our)? ?(plan|idea|strategy|cause|vision|principle|process)\b/i,
  /\bpush notifications?\b/i,
  /\bpush back\b/i,
  /\bpush through\b/i,
  /\bdescribe (the|a|our)? ?commit history\b/i,
  /\bcommit history\b/i,
  /\bmerge (sort|conflict)\b/i,
  /\bopen a (new )?(file|tab|window|terminal|browser|issue|ticket)\b/i,
];

const COMMIT_POSITIVE_PATTERNS = [
  /\bgit\s+commit\b/i,
  /\bgit\s+push\b/i,
  /\bcommit\s+(and|then)\s+push\b/i,
  /\bcommit\s+(everything|all|the\s+changes|these\s+changes|this|it|them|files?)\b/i,
  /\bcommit\s+(and|&)\s+push\s+(it|this|that|them)\b/i,
  /\bcommit\s+(it|this|that|them)\s+(and|then|&)\s+push\b/i,
  /\bpush\s+(to|it\s+to)\s+(main|master|origin|remote|upstream|production|prod)\b/i,
  /\bpush\s+(the\s+)?(branch|changes?|commits?)\b/i,
  /\bopen\s+(a\s+)?(pr|pull\s+request)\b/i,
  /\bcreate\s+(a\s+)?(pr|pull\s+request)\b/i,
  /\braise\s+(a\s+)?(pr|pull\s+request)\b/i,
  /\bmake\s+(a\s+)?(pr|pull\s+request)\b/i,
  /\bcut\s+(a\s+)?(pr|pull\s+request)\b/i,
  /\bmerge\s+(it|this|that|them|the\s+change|the\s+changes)\s+(to|into|in\s+to)\s+(main|master|trunk|develop|release)\b/i,
  /\bmerge\s+(to|into|in\s+to)\s+(main|master|trunk|develop|release)\b/i,
  /\bmerge\s+(the\s+)?(pr|pull\s+request|branch)\b/i,
  /\bship\s+(it|this|the\s+change|the\s+pr)\b/i,
];

export const classifyPromptIntent = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  if (!prompt) return 'normal';

  const hasNegative = COMMIT_NEGATIVE_PATTERNS.some((re) => re.test(prompt));
  const hasPositive = COMMIT_POSITIVE_PATTERNS.some((re) => re.test(prompt));

  if (hasPositive && !hasNegative) return 'commit';
  if (!hasPositive) return 'normal';

  // Both fire — strip negative substrings, then re-test positives.
  let stripped = prompt;
  for (const re of COMMIT_NEGATIVE_PATTERNS) {
    stripped = stripped.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), ' ');
  }
  const stillPositive = COMMIT_POSITIVE_PATTERNS.some((re) => re.test(stripped));
  return stillPositive ? 'commit' : 'normal';
};

// --- Commit-specific checks --------------------------------------------------
// Each returns true when the check FAILS (i.e., the prompt is missing what
// we'd expect a real commit prompt to carry).

const FILE_PATH_PATTERN = /[\w./@-]+\.(ts|tsx|js|jsx|mjs|cjs|css|scss|json|md|yml|yaml|toml|py|go|rs|java|kt|swift|rb|php|sh|sql)\b/i;
const DIRECTORY_PATH_PATTERN = /(?:^|\s)(?:packages|src|app|components|server|client|lib|pages|routes|convex|scripts|docs|tests?|specs?)\//i;
const DIFF_EXPLANATION_HINT_PATTERN = /\b(the\s+diff|changes?\s+(to|in|are|include)|i\s+(changed|updated|added|removed|refactored|fixed|renamed)|this\s+(diff|patch|change|commit)|the\s+patch|the\s+commit\s+adds|the\s+commit\s+removes|the\s+commit\s+changes|adds?\s+(a|the|new)|removes?\s+(a|the))\b/i;
const BULLET_LIST_PATTERN = /(^|\n)\s*(?:[-*•]\s+|\d+[.)]\s+).+/m;

export const diffExplanationMissing = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt : '';
  if (!prompt) return true;
  if (FILE_PATH_PATTERN.test(prompt)) return false;
  if (DIRECTORY_PATH_PATTERN.test(prompt)) return false;
  if (DIFF_EXPLANATION_HINT_PATTERN.test(prompt)) return false;
  if (BULLET_LIST_PATTERN.test(prompt)) return false;
  return true;
};

const TESTS_NAMED_PATTERNS = [
  /\bwith\s+tests?\b/i,
  /\bran\s+tests?\s+for\b/i,
  /\branning\s+tests?\b/i,
  /\btests?\s+pass(ing|ed)?\b/i,
  /\btests?\s+(are\s+)?green\b/i,
  /\b\S+\.test\.(ts|tsx|js|jsx|mjs|cjs)\b/i,
  /\b\S+\.spec\.(ts|tsx|js|jsx|mjs|cjs)\b/i,
  /\b(added|wrote|updated)\s+(unit\s+|integration\s+)?tests?\b/i,
  /\bnew\s+tests?\s+(in|for|cover|covering)\b/i,
  /\bvitest|jest|playwright|cypress\b/i,
];

export const testsNotNamed = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt : '';
  if (!prompt) return true;
  return !TESTS_NAMED_PATTERNS.some((re) => re.test(prompt));
};

const BLAST_RADIUS_PATTERNS = [
  /\bno\s+breaking\s+changes?\b/i,
  /\bonly\s+touches?\b/i,
  /\bonly\s+(changes?|modifies|edits?|affects?)\b/i,
  /\bscoped\s+to\b/i,
  /\bbackward(s)?\s+compatible\b/i,
  /\bno\s+(public|external)\s+api\s+changes?\b/i,
  /\bno\s+schema\s+changes?\b/i,
  /\bno\s+migration(s)?\b/i,
  /\bisolated\s+to\b/i,
  /\bcontained\s+(to|in|within)\b/i,
  /\bblast\s+radius\b/i,
];

export const blastRadiusMissing = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt : '';
  if (!prompt) return true;
  return !BLAST_RADIUS_PATTERNS.some((re) => re.test(prompt));
};

// --- Chip schema -------------------------------------------------------------

// Map of reason text -> chip id. `reasons[]` strings are mirrored into chips
// so existing consumers keep working while UIs can render structured chips.
const REASON_TO_CHIP = [
  {
    test: (r) => /no concrete target outcome/i.test(r),
    id: 'no-target-outcome',
    severity: 'critical',
    category: 'general',
  },
  {
    test: (r) => /no clear files|scope boundary/i.test(r),
    id: 'no-files',
    severity: 'critical',
    category: 'general',
  },
  {
    test: (r) => /missing acceptance criteria/i.test(r),
    id: 'no-acceptance',
    severity: 'critical',
    category: 'general',
  },
  {
    test: (r) => /current behavior|relevant context/i.test(r),
    id: 'no-context',
    severity: 'warn',
    category: 'general',
  },
  {
    test: (r) => /verification|test request/i.test(r),
    id: 'no-verification',
    severity: 'warn',
    category: 'general',
  },
  {
    test: (r) => /constraints/i.test(r),
    id: 'no-constraints',
    severity: 'warn',
    category: 'general',
  },
  {
    test: (r) => /vague language/i.test(r),
    id: 'vague-language',
    severity: 'critical',
    category: 'general',
  },
  {
    test: (r) => /lazy prompt/i.test(r),
    id: 'lazy-prompt-warning',
    severity: 'warn',
    category: 'general',
  },
];

const chipFromReason = (reason) => {
  for (const entry of REASON_TO_CHIP) {
    if (entry.test(reason)) {
      return {
        id: entry.id,
        label: reason,
        severity: entry.severity,
        category: entry.category,
      };
    }
  }
  return null;
};

const buildChipsFromReasons = (reasons) => {
  const chips = [];
  const seen = new Set();
  for (const reason of reasons) {
    const chip = chipFromReason(reason);
    if (chip && !seen.has(chip.id)) {
      seen.add(chip.id);
      chips.push(chip);
    }
  }
  return chips;
};

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
  promptIntent: 'normal',
  reasons: [],
  chips: [],
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

const COMMIT_CHIP_ORDER = [
  { id: 'commit-gate-failed', label: 'Commit gate failed in the TUI.', severity: 'critical' },
  { id: 'diff-explanation-missing', label: 'No diff explanation', severity: 'critical', check: 'diff' },
  { id: 'tests-not-named', label: 'No tests named', severity: 'critical', check: 'tests' },
  { id: 'blast-radius-missing', label: 'No blast-radius owner', severity: 'critical', check: 'blast' },
];

const scorePrompt = (rawPrompt) => {
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : '';
  const intent = classifyIntent(prompt);
  if (intent) return intentApproval(prompt, intent);

  const promptIntent = classifyPromptIntent(prompt);

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

  // Sub-4-word prompts without a file path are blocked even if a single word
  // matches a scope keyword. "fix auth" blocks; "fix this crash in the login flow" doesn't.
  const tooVagueToRun = words.length < 4 && !hasCodeReference;
  let verdict = (
    score < 25
    || tooVagueToRun
    || (score < 40 && !hasConcreteIntent)
    || (hopelessHits > 0 && !hasConcreteIntent)
  ) ? 'blocked' : 'approved';

  // Commit-specific enforcement: if classifier says this is a commit/push/PR
  // prompt and any of the three commit-specific checks fail, force-block.
  let chips = buildChipsFromReasons(reasons);
  if (promptIntent === 'commit') {
    const commitFailures = [];
    if (diffExplanationMissing(prompt)) commitFailures.push('diff');
    if (testsNotNamed(prompt)) commitFailures.push('tests');
    if (blastRadiusMissing(prompt)) commitFailures.push('blast');

    if (commitFailures.length > 0) {
      verdict = 'blocked';
      const gateChip = COMMIT_CHIP_ORDER[0];
      const commitChips = [
        { id: gateChip.id, label: gateChip.label, severity: gateChip.severity, category: 'commit' },
      ];
      for (const entry of COMMIT_CHIP_ORDER.slice(1)) {
        if (commitFailures.includes(entry.check)) {
          commitChips.push({
            id: entry.id,
            label: entry.label,
            severity: entry.severity,
            category: 'commit',
          });
        }
      }
      // Mirror commit chip labels into reasons[] (front of array, no dupes).
      const mirroredReasons = commitChips.map((chip) => chip.label);
      for (const label of mirroredReasons) {
        if (!reasons.includes(label)) reasons.unshift(label);
      }
      // Re-order reasons so commit-gate-failed is first.
      const gateLabel = gateChip.label;
      const gateIdx = reasons.indexOf(gateLabel);
      if (gateIdx > 0) {
        reasons.splice(gateIdx, 1);
        reasons.unshift(gateLabel);
      }
      chips = [...commitChips, ...buildChipsFromReasons(reasons.filter((r) => !mirroredReasons.includes(r)))];
    }
  }

  return {
    score,
    verdict,
    allowed: verdict === 'approved',
    intent: null,
    promptIntent,
    reasons,
    chips,
    dimensions,
    suggestedRewrite: buildSuggestedRewrite(prompt, reasons, promptIntent),
  };
};

const buildCommitRewrite = (prompt) => {
  const topic = prompt.length > 0 ? prompt.slice(0, 96) : 'the requested commit';
  return [
    `Commit: ${topic}`,
    'Diff explanation: list the files touched and a one-line description of each change (e.g., "- packages/web/server/lib/promptcourt/evaluator.js: add commit intent classifier").',
    'Tests: name the tests you ran or added (e.g., "ran evaluator.test.js, 12 passing; added 4 commit-gate cases").',
    'Blast radius: state what this does NOT touch and whether it is backward compatible (e.g., "only touches promptcourt evaluator, no schema or route changes, backward compatible").',
    'Constraints: do not amend prior commits, do not skip hooks, do not force-push.',
  ].join('\n');
};

const buildSuggestedRewrite = (prompt, reasons, promptIntent = 'normal') => {
  if (promptIntent === 'commit') return buildCommitRewrite(prompt);
  const topic = prompt.length > 0 ? prompt.slice(0, 96) : 'the requested change';
  const readOnlyIntent = /\b(go through|explore|inspect|browse|tour|survey|review|audit|study|map|analy[sz]e|summari[sz]e|explain|walk\s+through)\b/i.test(topic)
    && !MUTATION_VERBS.test(topic);
  if (readOnlyIntent) {
    return [
      `Explore the codebase for: ${topic}`,
      'Scope: read-only survey of the repository structure, package scripts, entrypoints, and the most relevant modules you find.',
      'Acceptance criteria: return a concise map of the main subsystems, where the requested behavior likely lives, and the next concrete files to inspect or change.',
      'Verification: do not edit files; cite the files or commands you inspected so I can verify the walkthrough.',
      'Constraints: do not modify code, install dependencies, start long-running servers, or change configuration.',
    ].join('\n');
  }
  return [
    `Implement: ${topic}`,
    'Scope: inspect the repository to find the relevant files, then limit edits to the smallest route, component, module, or test files needed for this request.',
    'Acceptance criteria: the requested behavior works end-to-end, the original broken behavior no longer reproduces, and unrelated visible behavior stays the same.',
    'Verification: run the focused tests for touched files; if no focused test exists, run the nearest package test or build command and report the exact command output.',
    reasons.includes('No constraints for risky or unrelated changes')
      ? 'Constraints: do not change unrelated providers, auth, storage formats, public APIs, or styling outside the touched flow.'
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
