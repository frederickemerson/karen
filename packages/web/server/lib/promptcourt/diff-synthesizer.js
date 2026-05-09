import { quizAiAllowed, quizModel, quizReasoningEffort, quizTimeoutMs } from './quiz.js';

const getOpenAiApiKey = () => {
  const value = process.env.OPENAI_API_KEY;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
};

const truncate = (value, maxLength) => {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated]`;
};

const FIXTURE_DIFF = `diff --git a/packages/web/server/lib/auth/session.js b/packages/web/server/lib/auth/session.js
index 1111111..2222222 100644
--- a/packages/web/server/lib/auth/session.js
+++ b/packages/web/server/lib/auth/session.js
@@ -12,9 +12,18 @@ export const createSession = (user) => {
   const id = randomUUID();
-  const expiresAt = Date.now() + 1000 * 60 * 60;
+  const expiresAt = Date.now() + 1000 * 60 * 60 * 24;
   return {
     id,
     userId: user.id,
+    email: user.email,
     expiresAt,
   };
 };
+
+export const refreshSession = (session) => {
+  if (!session || session.expiresAt < Date.now()) return null;
+  return {
+    ...session,
+    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
+  };
+};
diff --git a/packages/web/server/lib/auth/session.test.js b/packages/web/server/lib/auth/session.test.js
index 3333333..4444444 100644
--- a/packages/web/server/lib/auth/session.test.js
+++ b/packages/web/server/lib/auth/session.test.js
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { createSession } from './session.js';
+import { createSession, refreshSession } from './session.js';

@@ -10,4 +11,11 @@ describe('createSession', () => {
     expect(session.userId).toBe('u_1');
   });
+
+  it('refreshSession extends expiry by 24 hours', () => {
+    const session = createSession({ id: 'u_1', email: 'a@b.com' });
+    const refreshed = refreshSession(session);
+    expect(refreshed.expiresAt).toBeGreaterThan(session.expiresAt);
+  });
 });
`;

const FIXTURE_NOTE = 'Karen could not call the model. Showing a sample diff so the quiz still runs.';

const SYSTEM_PROMPT = [
  'You are Karen, simulating what a strong coding agent would generate for a single small task.',
  'Output ONLY a valid unified git diff (no prose, no markdown fences, no commentary).',
  'Constraints:',
  '- Use real-looking file paths in this monorepo style (packages/<pkg>/...).',
  '- Touch 1-3 files maximum. Keep total diff under ~120 lines.',
  '- Include 1 source file change and (when sensible) 1 matching test file change.',
  '- Diff must start with "diff --git" and contain proper @@ hunks.',
  '- Make the change concretely match the user prompt.',
  '- Avoid placeholders like TODO, "your code here", or ellipses inside hunks.',
].join('\n');

export const buildSynthesizeDiffMessages = (prompt) => [
  {
    role: 'system',
    content: [{ type: 'input_text', text: SYSTEM_PROMPT }],
  },
  {
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: [
          'User prompt to simulate:',
          truncate(prompt, 2000),
          '',
          'Return only the unified diff text, nothing else.',
        ].join('\n'),
      },
    ],
  },
];

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n');
};

const stripCodeFences = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : text).trim();
};

const looksLikeDiff = (value) => /(^|\n)diff --git /.test(String(value || ''));

/**
 * Generate a plausible unified diff from a user prompt for the GUI quiz flow.
 * Uses the same OpenAI Responses endpoint and env knobs as the quiz builder.
 * Falls back to a static fixture diff when the model is unavailable.
 *
 * @param {object} options
 * @param {string} options.prompt
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ diff: string, source: string, note?: string }>}
 */
export const synthesizeGuiDiff = async ({ prompt, fetchImpl = fetch } = {}) => {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) {
    return { diff: FIXTURE_DIFF, source: 'fixture', note: 'No prompt was provided.' };
  }

  if (!quizAiAllowed()) {
    return { diff: FIXTURE_DIFF, source: 'fixture', note: FIXTURE_NOTE };
  }

  const apiKey = getOpenAiApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), quizTimeoutMs());

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
        input: buildSynthesizeDiffMessages(cleanPrompt),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Diff synthesis failed ${response.status}: ${detail.slice(0, 240)}`);
    }

    const payload = await response.json();
    const raw = extractResponseText(payload);
    const candidate = stripCodeFences(raw);
    if (!looksLikeDiff(candidate)) {
      throw new Error('Model did not return a unified diff.');
    }

    return {
      diff: candidate,
      source: `ai:${quizModel()}`,
    };
  } catch (error) {
    return {
      diff: FIXTURE_DIFF,
      source: 'fixture',
      note: error instanceof Error ? error.message : 'Unknown synthesis error.',
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const __test = {
  FIXTURE_DIFF,
  FIXTURE_NOTE,
  stripCodeFences,
  looksLikeDiff,
  extractResponseText,
};
