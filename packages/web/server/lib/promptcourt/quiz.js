import { redactPublicText } from './privacy.js';
import { analyzeDiffImpact, parseDiff } from './quiz-analyzer.js';

const envEnabled = (name, defaultValue = true) => {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
};

const getOpenAiApiKey = () => {
  const value = process.env.OPENAI_API_KEY;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
};

export const quizAiAllowed = () => envEnabled('KAREN_QUIZ_AI', Boolean(getOpenAiApiKey())) && Boolean(getOpenAiApiKey());
export const quizModel = () => process.env.KAREN_QUIZ_MODEL || 'gpt-5.5';
export const quizReasoningEffort = () => process.env.KAREN_QUIZ_REASONING_EFFORT || 'high';
export const quizTimeoutMs = () => {
  const parsed = Number(process.env.KAREN_QUIZ_TIMEOUT_MS || 25000);
  return Number.isFinite(parsed) ? Math.max(3000, Math.trunc(parsed)) : 25000;
};

const truncateForModel = (value, maxLength) => {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
};

const uniqueOptions = (...groups) => {
  const seen = new Set();
  return groups.flat().filter((option) => {
    const value = String(option || '').trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const makeQuestion = (promptText, correct, distractors, evidence = '') => {
  const options = uniqueOptions([correct], distractors).slice(0, 4);
  const fallback = ['package.json', 'README.md', 'no tracked diff', 'only formatting'];
  while (options.length < 4) {
    options.push(fallback[options.length - 1] || 'none');
  }
  return { prompt: promptText, options, answer: 0, evidence, source: 'parser' };
};

const buildQuizEvidencePack = ({ prompt, summary, impact }) => {
  const files = summary.files.map((file) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    hunks: file.hunks.slice(0, 8),
    addedLineNumbers: file.addedLineNumbers.slice(0, 16),
    removedLineNumbers: file.removedLineNumbers.slice(0, 16),
    addedLines: file.addedLines.slice(0, 14).map((lineText) => truncateForModel(lineText, 220)),
    removedLines: file.removedLines.slice(0, 10).map((lineText) => truncateForModel(lineText, 220)),
  }));

  return {
    prompt: redactPublicText(prompt, 1200),
    diffStats: {
      filesChanged: summary.files.length,
      additions: summary.additions,
      deletions: summary.deletions,
    },
    files,
    parserFindings: {
      parsedFiles: impact.parsedFiles,
      exportedSymbols: impact.exportedSymbols,
      changedFunctions: impact.changedFunctions,
      importedModules: impact.importedModules,
      calledSymbols: impact.calledSymbols,
      testFiles: impact.testFiles,
      configFiles: impact.configFiles,
      callSiteFiles: impact.callSiteFiles,
      exportDetails: impact.exportDetails?.slice(0, 12) || [],
      changedFunctionDetails: impact.changedFunctionDetails?.slice(0, 16) || [],
      importDetails: impact.importDetails?.slice(0, 16) || [],
      callSiteDetails: impact.callSiteDetails?.slice(0, 16) || [],
      configImpact: impact.configImpact?.slice(0, 8) || [],
      testCoverage: impact.testCoverage || null,
      evidence: Object.fromEntries(impact.evidence.entries()),
    },
  };
};

const quizResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'options', 'answer', 'evidence', 'why_it_matters'],
        properties: {
          prompt: { type: 'string', minLength: 12, maxLength: 180 },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'string', minLength: 1, maxLength: 180 },
          },
          answer: { type: 'integer', minimum: 0, maximum: 3 },
          evidence: { type: 'string', minLength: 1, maxLength: 180 },
          why_it_matters: { type: 'string', minLength: 8, maxLength: 220 },
        },
      },
    },
  },
};

const normalizeAiQuizQuestion = (question) => {
  const promptText = typeof question?.prompt === 'string' ? question.prompt.trim() : '';
  const options = Array.isArray(question?.options)
    ? question.options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
  const answer = Number(question?.answer);
  const evidence = typeof question?.evidence === 'string' ? question.evidence.trim() : '';
  const why = typeof question?.why_it_matters === 'string' ? question.why_it_matters.trim() : '';
  if (!promptText || options.length !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) return null;
  if (new Set(options).size !== 4) return null;
  return {
    prompt: promptText,
    options,
    answer,
    evidence,
    why,
    source: 'ai',
  };
};

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
      if (typeof content?.json === 'object') return JSON.stringify(content.json);
    }
  }
  return chunks.join('\n');
};

const parseModelJson = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const buildAiQuiz = async ({ prompt, generatedDiff, summary, impact, fetchImpl = fetch }) => {
  if (!quizAiAllowed()) return null;
  const apiKey = getOpenAiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), quizTimeoutMs());
  const evidencePack = buildQuizEvidencePack({ prompt, summary, impact });
  const input = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: [
            'You are Karen, a strict code-review quizmaster.',
            'Generate multiple-choice questions that prove the developer read the generated diff.',
            'Questions must be grounded only in the evidence pack. Do not ask trivia, style opinions, or generic programming questions.',
            'Prefer questions about changed behavior, touched functions, exported APIs, imports, call sites, config/test impact, and rollback risk.',
            'Make wrong options plausible but clearly contradicted by evidence.',
            'Return JSON only.',
          ].join(' '),
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: JSON.stringify({
            requiredQuestionCount: 5,
            evidencePack,
            diffExcerpt: truncateForModel(generatedDiff, 16000),
          }),
        },
      ],
    },
  ];

  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: quizModel(),
        reasoning: { effort: quizReasoningEffort() },
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'karen_quiz',
            schema: quizResponseSchema,
            strict: true,
          },
        },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI quiz request failed ${response.status}: ${detail.slice(0, 260)}`);
    }
    const payload = await response.json();
    const parsed = parseModelJson(extractResponseText(payload));
    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions.map(normalizeAiQuizQuestion).filter(Boolean)
      : [];
    return questions.length >= 3 ? questions.slice(0, 5) : null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildParserQuiz = ({ prompt, summary, impact }) => {
  const files = summary.files;
  const topFile = [...files].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))[0];
  const shape = summary.additions >= summary.deletions ? 'more additions than deletions' : 'more deletions than additions';
  const hunk = topFile?.hunks.find(Boolean);
  const addedLine = topFile?.addedLines.find((lineText) => lineText.length >= 12 && lineText.length <= 120);
  const questions = [];

  if (topFile) {
    questions.push(makeQuestion(
      files.length === 1 ? 'Which file did Karen change?' : 'Which file changed the most?',
      topFile.path,
      files.filter((file) => file.path !== topFile.path).map((file) => file.path).concat(['package.json', 'README.md', 'src/index.ts']),
      `${topFile.path}: +${topFile.additions} -${topFile.deletions}`,
    ));
  }

  if (summary.addedSymbols.length > 0) {
    questions.push(makeQuestion(
      'Which symbol appeared in the generated diff?',
      summary.addedSymbols[0],
      uniqueOptions(summary.removedSymbols, ['handleSubmit', 'loadConfig', 'renderView', 'setupClient']),
    ));
  } else if (hunk) {
    questions.push(makeQuestion(
      'Which hunk label did the diff touch?',
      hunk,
      uniqueOptions(files.flatMap((file) => file.hunks).filter((entry) => entry !== hunk), ['imports', 'main', 'render']),
    ));
  }

  if (impact.exportedSymbols.length > 0) {
    questions.push(makeQuestion(
      'Parser check: which exported API exists in a changed file?',
      impact.exportedSymbols[0],
      uniqueOptions(impact.changedFunctions.slice(1), ['renderView', 'loadConfig', 'handleSubmit']),
      impact.evidence.get(impact.exportedSymbols[0]) || '',
    ));
  } else if (impact.changedFunctions.length > 0) {
    questions.push(makeQuestion(
      'Parser check: which function or type should you explain before approval?',
      impact.changedFunctions[0],
      uniqueOptions(impact.changedFunctions.slice(1), ['setupClient', 'parseArgs', 'syncState']),
      impact.evidence.get(impact.changedFunctions[0]) || '',
    ));
  }

  if (impact.importedModules.length > 0) {
    questions.push(makeQuestion(
      'Parser check: which imported module is present in a changed file?',
      impact.importedModules[0],
      uniqueOptions(['react', 'node:fs', './missing'], impact.importedModules.slice(1)),
      impact.evidence.get(impact.importedModules[0]) || '',
    ));
  } else if (impact.calledSymbols.length > 0) {
    questions.push(makeQuestion(
      'Parser check: which call appears in a changed file?',
      impact.calledSymbols[0],
      uniqueOptions(impact.calledSymbols.slice(1), ['render', 'fetch', 'setState']),
      impact.evidence.get(impact.calledSymbols[0]) || '',
    ));
  }

  if (impact.testFiles.length > 0) {
    questions.push(makeQuestion(
      'Which test file was touched?',
      impact.testFiles[0],
      uniqueOptions(files.map((file) => file.path).filter((filePath) => filePath !== impact.testFiles[0]), ['README.md', 'package.json']),
    ));
  } else if (impact.configFiles.length > 0) {
    questions.push(makeQuestion(
      'Which config or schema file changed?',
      impact.configFiles[0],
      uniqueOptions(files.map((file) => file.path).filter((filePath) => filePath !== impact.configFiles[0]), ['src/index.ts', 'README.md']),
    ));
  } else if (impact.callSiteFiles.length > 0) {
    questions.push(makeQuestion(
      'Which file looked like a call site or integration point?',
      impact.callSiteFiles[0],
      uniqueOptions(files.map((file) => file.path).filter((filePath) => filePath !== impact.callSiteFiles[0]), ['package.json', 'README.md']),
    ));
  }

  if (addedLine) {
    questions.push(makeQuestion(
      'Which line was added?',
      addedLine,
      uniqueOptions(topFile.removedLines.slice(0, 3), ['console.log("done")', 'return null;', 'throw new Error("todo")']),
    ));
  }

  questions.push(makeQuestion(
    'What does the generated diff mostly show?',
    shape,
    [shape === 'more additions than deletions' ? 'more deletions than additions' : 'more additions than deletions', 'no changes', 'only binary changes'],
  ));

  questions.push(makeQuestion(
    'What did your prompt ask Karen to approve?',
    redactPublicText(prompt, 80),
    ['a vague cleanup', 'a dependency install only', 'nothing, just vibes'],
  ));

  return questions.slice(0, 5);
};

/**
 * Build a quiz for a generated diff. Tries AI-grounded MCQ first, falls back to
 * parser-derived questions. Returns `{ questions, source }`.
 *
 * @param {object} options
 * @param {string} options.prompt - User prompt that produced the diff.
 * @param {string} options.generatedDiff - Unified diff text.
 * @param {string|null} [options.cwd] - Optional repo root for AST lookups.
 * @param {(message: string) => void} [options.onAiFallback] - Called when AI
 *   request fails and parser questions are used instead.
 * @param {typeof fetch} [options.fetchImpl] - Fetch implementation override
 *   (used in tests).
 */
export const buildQuiz = async ({
  prompt,
  generatedDiff,
  cwd = null,
  onAiFallback = null,
  fetchImpl = fetch,
}) => {
  const summary = parseDiff(generatedDiff);
  const impact = analyzeDiffImpact(summary, { cwd });
  const parserQuestions = buildParserQuiz({ prompt, summary, impact });

  try {
    const aiQuestions = await buildAiQuiz({ prompt, generatedDiff, summary, impact, fetchImpl });
    if (aiQuestions?.length >= 3) {
      return {
        questions: aiQuestions,
        source: `ai:${quizModel()}`,
        summary,
        impact,
      };
    }
  } catch (error) {
    if (typeof onAiFallback === 'function') {
      onAiFallback(error instanceof Error ? error.message : 'unknown error');
    }
  }

  return {
    questions: parserQuestions,
    source: 'parser',
    summary,
    impact,
  };
};

export const __test = {
  buildAiQuiz,
  buildParserQuiz,
  buildQuizEvidencePack,
  normalizeAiQuizQuestion,
  parseModelJson,
  extractResponseText,
};
