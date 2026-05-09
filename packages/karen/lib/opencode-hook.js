const HOOK_STRATEGY = 'opencode-hook';
const PTY_STRATEGY = 'pty-heuristic';
const DISABLED_STRATEGY = 'disabled';
const UNAVAILABLE_STRATEGY = 'unavailable';

const VALID_MODES = new Set(['auto', 'required', 'disabled', 'pty']);

const envEnabled = (value, defaultValue = true) => {
  if (value == null || value === '') return defaultValue;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
};

const normalizeHookMode = (value) => {
  const mode = String(value || 'auto').trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : 'auto';
};

export const readOpenCodeHookConfig = ({ env = process.env, config = {} } = {}) => {
  const mode = normalizeHookMode(
    env.KAREN_OPENCODE_HOOK_MODE
    || env.KAREN_OPENCODE_HOOK
    || config.mode
    || 'auto',
  );

  return {
    mode,
    allowPtyFallback: mode === 'pty' || (mode === 'auto' && envEnabled(env.KAREN_TUI_INTERCEPT, true)),
    hookPackage: env.KAREN_OPENCODE_HOOK_PACKAGE || config.hookPackage || null,
  };
};

const registrationCandidates = (upstream) => ([
  ['registerPromptHook', upstream?.registerPromptHook],
  ['onPromptSubmit', upstream?.onPromptSubmit],
  ['hooks.prompt.submit', upstream?.hooks?.prompt?.submit],
  ['hooks.promptSubmit', upstream?.hooks?.promptSubmit],
  ['hooks.prompt:submit', upstream?.hooks?.['prompt:submit']],
  ['prompt.onSubmit', upstream?.prompt?.onSubmit],
  ['karen.promptGuard', upstream?.karen?.promptGuard],
]);

const findPromptRegistration = (upstream) => {
  for (const [path, value] of registrationCandidates(upstream)) {
    if (typeof value === 'function') return { path, register: value.bind(upstream) };
  }
  return null;
};

export const detectOpenCodeHookSupport = ({ upstream = null, env = process.env, config = {} } = {}) => {
  const hookConfig = readOpenCodeHookConfig({ env, config });
  const registration = findPromptRegistration(upstream);

  if (hookConfig.mode === 'disabled' || hookConfig.mode === 'pty') {
    return {
      available: false,
      mode: hookConfig.mode,
      reason: hookConfig.mode === 'disabled'
        ? 'Karen OpenCode hooks are disabled by configuration.'
        : 'Karen is configured to use PTY interception.',
      registration: null,
      protocolVersion: null,
    };
  }

  if (!registration) {
    return {
      available: false,
      mode: hookConfig.mode,
      reason: 'No upstream OpenCode prompt hook registration API was detected.',
      registration: null,
      protocolVersion: upstream?.hookProtocolVersion || upstream?.protocolVersion || upstream?.manifest?.hookProtocol || null,
    };
  }

  return {
    available: true,
    mode: hookConfig.mode,
    reason: `Detected upstream OpenCode prompt hook at ${registration.path}.`,
    registration,
    protocolVersion: upstream?.hookProtocolVersion || upstream?.protocolVersion || upstream?.manifest?.hookProtocol || null,
  };
};

export const selectOpenCodeInterceptionStrategy = ({ upstream = null, env = process.env, config = {} } = {}) => {
  const hookConfig = readOpenCodeHookConfig({ env, config });
  const support = detectOpenCodeHookSupport({ upstream, env, config });

  if (hookConfig.mode === 'disabled') {
    return {
      strategy: DISABLED_STRATEGY,
      hookAvailable: false,
      canFallbackToPty: false,
      support,
      reason: support.reason,
    };
  }

  if (support.available) {
    return {
      strategy: HOOK_STRATEGY,
      hookAvailable: true,
      canFallbackToPty: hookConfig.allowPtyFallback,
      support,
      reason: support.reason,
    };
  }

  if (hookConfig.mode === 'required') {
    return {
      strategy: UNAVAILABLE_STRATEGY,
      hookAvailable: false,
      canFallbackToPty: false,
      support,
      reason: 'Karen requires an upstream OpenCode prompt hook, but none was detected.',
    };
  }

  if (hookConfig.allowPtyFallback || hookConfig.mode === 'pty') {
    // This is the compatibility path for current OpenCode builds. PTY interception can
    // guard normal prompt entry, but it infers TUI state from terminal output and must
    // stay secondary to a real upstream prompt-submission hook when one is available.
    return {
      strategy: PTY_STRATEGY,
      hookAvailable: false,
      canFallbackToPty: true,
      support,
      reason: `${support.reason} Falling back to PTY heuristics.`,
    };
  }

  return {
    strategy: UNAVAILABLE_STRATEGY,
    hookAvailable: false,
    canFallbackToPty: false,
    support,
    reason: `${support.reason} PTY fallback is disabled.`,
  };
};

const textFromContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object') return content.text || content.content || '';
  return '';
};

const promptTextFromEvent = (event) => {
  if (typeof event === 'string') return event;
  if (!event || typeof event !== 'object') return '';

  return event.prompt
    || event.text
    || event.inputText
    || event.input?.prompt
    || event.input?.text
    || event.payload?.prompt
    || event.payload?.text
    || textFromContent(event.message?.content)
    || textFromContent(event.payload?.message?.content)
    || textFromContent(event.messages?.at?.(-1)?.content)
    || '';
};

const rawEventType = (event) => {
  if (typeof event === 'string') return 'string';
  if (!event || typeof event !== 'object') return 'unknown';
  return event.type || event.event || event.kind || event.name || event.action || 'unknown';
};

const isPromptLikeType = (type) => (
  /prompt|message|chat|user_input|input|request/i.test(type)
  && !/assistant|response|tool|system|provider|model|picker|search|filter|confirm|cancel/i.test(type)
);

export const normalizeOpenCodePromptEvent = (event, { source = 'opencode-hook' } = {}) => {
  const rawType = rawEventType(event);
  const role = typeof event === 'object' && event ? event.role || event.message?.role || event.payload?.message?.role : null;
  if (role && role !== 'user') return null;
  if (rawType !== 'string' && !isPromptLikeType(rawType)) return null;

  const prompt = promptTextFromEvent(event).trim();
  if (!prompt) return null;

  return {
    kind: 'prompt_submit',
    source,
    rawType,
    prompt,
    sessionId: typeof event === 'object' && event ? event.sessionId || event.sessionID || event.session?.id || null : null,
    cwd: typeof event === 'object' && event ? event.cwd || event.projectPath || event.workspace?.cwd || null : null,
    metadata: {
      model: typeof event === 'object' && event ? event.model || event.modelId || null : null,
      provider: typeof event === 'object' && event ? event.provider || event.providerId || null : null,
    },
  };
};

export const createOpenCodeHookAdapter = ({ upstream = null, env = process.env, config = {} } = {}) => {
  const decision = selectOpenCodeInterceptionStrategy({ upstream, env, config });

  return {
    ...decision,
    normalizePromptEvent: normalizeOpenCodePromptEvent,
    attachPromptGuard(onPrompt) {
      if (decision.strategy !== HOOK_STRATEGY) {
        return {
          attached: false,
          strategy: decision.strategy,
          reason: decision.reason,
          dispose: () => {},
        };
      }

      const register = decision.support.registration.register;
      const registrationResult = register(async (event, context = {}) => {
        const normalized = normalizeOpenCodePromptEvent(event);
        if (!normalized) return { action: 'pass' };
        return onPrompt(normalized, context);
      });

      const dispose = typeof registrationResult === 'function'
        ? registrationResult
        : registrationResult?.dispose || registrationResult?.unsubscribe || (() => {});

      return {
        attached: true,
        strategy: decision.strategy,
        registrationPath: decision.support.registration.path,
        dispose,
      };
    },
  };
};

export const openCodeHookStrategies = {
  HOOK_STRATEGY,
  PTY_STRATEGY,
  DISABLED_STRATEGY,
  UNAVAILABLE_STRATEGY,
};
