import { describe, expect, it } from 'vitest';

import { redactPublicText } from './privacy.js';

describe('promptcourt privacy redaction', () => {
  it('redacts secrets, emails, urls, and local user paths before public posts', () => {
    const redacted = redactPublicText(`
      api_key="sk-abcdefghijklmnopqrstuvwxyz"
      token=ghp_abcdefghijklmnopqrstuvwxyz
      email test@example.com
      see https://example.com/private
      file /Users/frederick/Documents/secret.txt
    `, 500);

    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('test@example.com');
    expect(redacted).not.toContain('https://example.com/private');
    expect(redacted).not.toContain('/Users/frederick');
    expect(redacted).toContain('[redacted]');
    expect(redacted).toContain('/Users/[redacted]');
  });

  it('collapses whitespace and truncates long public excerpts', () => {
    const redacted = redactPublicText('one\n\n two   three four five', 14);

    expect(redacted).toBe('one two three…');
  });
});
