const SECRET_PATTERNS = [
  /\b[A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*\s*[:=]\s*["']?[^"'\s]+/gi,
  /\b[A-Za-z0-9_-]*token[A-Za-z0-9_-]*\s*[:=]\s*["']?[^"'\s]+/gi,
  /\b[A-Za-z0-9_-]*secret[A-Za-z0-9_-]*\s*[:=]\s*["']?[^"'\s]+/gi,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9_]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /https?:\/\/[^\s)]+/gi,
];

export const redactPublicText = (value, maxLength = 220) => {
  let text = typeof value === 'string' ? value : '';
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, '[redacted]');
  }
  text = text.replace(/\/Users\/[^/\s]+/g, '/Users/[redacted]');
  text = text.replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[redacted]');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength - 1)}…`;
  }
  return text;
};

