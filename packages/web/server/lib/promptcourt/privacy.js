const REDACTED = '[redacted]';

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
const falsey = (value) => ['0', 'false', 'no', 'off'].includes(String(value ?? '').trim().toLowerCase());

const SECRET_NAME_PATTERN = [
  'api[_-]?key',
  'access[_-]?token',
  'auth[_-]?token',
  'bearer[_-]?token',
  'client[_-]?secret',
  'credential',
  'cookie',
  'jwt',
  'password',
  'private[_-]?key',
  'refresh[_-]?token',
  'secret',
  'session',
  'token',
  'webhook',
].join('|');

const SECRET_ASSIGNMENT = new RegExp(
  `(^|[\\s;,{])((?:export\\s+)?["']?[A-Za-z_][A-Za-z0-9_.-]*(?:${SECRET_NAME_PATTERN})[A-Za-z0-9_.-]*["']?\\s*[:=]\\s*)(["']?)([^"'\\s;,}]+)\\3`,
  'gim',
);

const AUTH_HEADER = /\b(authorization\s*[:=]\s*)(bearer|basic|token|apikey|api-key|key)\s+([^"'\s,;]+)/gim;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const URL = /\bhttps?:\/\/[^\s<>"')]+/gi;

const TOKEN_PATTERNS = [
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9_]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
  /\bhf_[A-Za-z0-9]{16,}\b/g,
  /\bnpm_[A-Za-z0-9]{16,}\b/g,
  /\bpypi-[A-Za-z0-9_-]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\b(?:eyJ|ew0K)[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

const SECRET_QUERY_PARAM = /^(access_token|api_key|apikey|auth|code|credential|jwt|key|password|secret|session|sig|signature|token)$/i;
const SECRET_QUERY_PARAM_IN_URL = /([?&](?:access_token|api_key|apikey|auth|code|credential|jwt|key|password|secret|session|sig|signature|token)=)[^&#]+/gi;

export const getPromptCourtPrivacyPolicy = (env = process.env) => {
  const mode = String(env.KAREN_ORG_PRIVACY_MODE || '').trim().toLowerCase();
  const localOnly = truthy(env.KAREN_LOCAL_ONLY) || mode === 'local_only';
  const privateMode = localOnly || mode === 'private';
  const secretScanningEnabled = !falsey(env.KAREN_SECRET_SCANNING);
  const publicPostingEnabled = !privateMode && secretScanningEnabled && !falsey(env.KAREN_PUBLIC_POSTING);
  const redactEmails = !falsey(env.KAREN_PUBLIC_REDACT_EMAILS);
  const urlMode = String(env.KAREN_PUBLIC_REDACT_URLS || (mode === 'standard' ? 'credentials' : 'all')).trim().toLowerCase();

  return {
    mode: mode || 'strict',
    localOnly,
    privateMode,
    publicPostingEnabled,
    redactEmails,
    redactUrls: urlMode === 'credentials' ? 'credentials' : 'all',
    secretScanningEnabled,
  };
};

export const shouldSyncPromptCourtCloud = (env = process.env) => !getPromptCourtPrivacyPolicy(env).localOnly;

const applyPattern = (text, pattern, replacement) => text.replace(pattern, replacement);

const redactUrl = (rawUrl, policy) => {
  try {
    const parsed = new URL(rawUrl);
    const hadCredentials = Boolean(parsed.username || parsed.password);
    parsed.username = '';
    parsed.password = '';
    let changedQuery = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (SECRET_QUERY_PARAM.test(key)) {
        parsed.searchParams.set(key, REDACTED);
        changedQuery = true;
      }
    }
    if (policy.redactUrls === 'all') return '[redacted:url]';
    const safeUrl = parsed.toString().replace(
      SECRET_QUERY_PARAM_IN_URL,
      (_match, prefix) => `${prefix}${encodeURIComponent(REDACTED)}`,
    );
    if (hadCredentials) return safeUrl.replace('//', `//${REDACTED}@`);
    return changedQuery ? safeUrl : rawUrl;
  } catch {
    return policy.redactUrls === 'all' ? '[redacted:url]' : rawUrl.replace(/\/\/[^/@\s]+@/, `//${REDACTED}@`);
  }
};

const redactPrivatePaths = (text) => text
  .replace(/\/Users\/[^/\s:]+/g, '/Users/[redacted]')
  .replace(/\/home\/[^/\s:]+/g, '/home/[redacted]')
  .replace(/\/private\/var\/folders\/[^/\s]+/g, '/private/var/folders/[redacted]')
  .replace(/[A-Za-z]:\\Users\\[^\\\s:]+/g, 'C:\\Users\\[redacted]')
  .replace(/((?:^|[\s"'`])~\/)(?:\.ssh|\.config|\.aws|\.npm|\.docker|\.kube)(?=\/|\s|$)/g, `$1[redacted]`);

export const redactPublicText = (value, maxLength = 220, options = {}) => {
  const policy = options.policy || getPromptCourtPrivacyPolicy(options.env);
  let text = typeof value === 'string' ? value : '';
  if (!policy.secretScanningEnabled) {
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  text = applyPattern(text, SECRET_ASSIGNMENT, (_match, lead, key) => `${lead}${key}${REDACTED}`);
  text = applyPattern(text, AUTH_HEADER, (_match, prefix, scheme) => `${prefix}${scheme} ${REDACTED}`);
  for (const pattern of TOKEN_PATTERNS) {
    text = applyPattern(text, pattern, REDACTED);
  }
  text = text.replace(
    SECRET_QUERY_PARAM_IN_URL,
    (_match, prefix) => `${prefix}${encodeURIComponent(REDACTED)}`,
  );
  text = applyPattern(text, URL, (match) => redactUrl(match, policy));
  if (policy.redactEmails) {
    text = applyPattern(text, EMAIL, '[redacted:email]');
  }
  text = redactPrivatePaths(text);
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength - 1)}…`;
  }
  return text;
};

export const detectPublicTextFindings = (value, options = {}) => {
  const policy = options.policy || getPromptCourtPrivacyPolicy(options.env);
  const text = typeof value === 'string' ? value : '';
  const findings = new Set();
  if (!policy.secretScanningEnabled || !text) return [];

  if (new RegExp(SECRET_ASSIGNMENT.source, 'im').test(text)) findings.add('secret-assignment');
  if (new RegExp(AUTH_HEADER.source, 'im').test(text)) findings.add('authorization-header');
  if (TOKEN_PATTERNS.some((pattern) => new RegExp(pattern.source).test(text))) findings.add('api-token');
  if (policy.redactEmails && new RegExp(EMAIL.source, 'i').test(text)) findings.add('email');
  if (new RegExp(URL.source, 'i').test(text)) findings.add('url');
  if (/\/Users\/[^/\s:]+|\/home\/[^/\s:]+|[A-Za-z]:\\Users\\[^\\\s:]+|~\/(?:\.ssh|\.config|\.aws|\.npm|\.docker|\.kube)/.test(text)) {
    findings.add('private-path');
  }
  return [...findings].sort();
};

export const sanitizePublicPost = (post, options = {}) => {
  const policy = options.policy || getPromptCourtPrivacyPolicy(options.env);
  if (!post || !policy.publicPostingEnabled) return null;
  return {
    ...post,
    title: redactPublicText(post.title, 140, { policy }),
    promptExcerpt: post.promptExcerpt === undefined ? undefined : redactPublicText(post.promptExcerpt, 300, { policy }),
    failureReasons: Array.isArray(post.failureReasons)
      ? post.failureReasons.slice(0, 10).map((reason) => redactPublicText(reason, 180, { policy }))
      : [],
    suggestedRewrite: post.suggestedRewrite === undefined ? undefined : redactPublicText(post.suggestedRewrite, 600, { policy }),
  };
};
