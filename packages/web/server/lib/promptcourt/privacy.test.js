import { describe, expect, it } from 'vitest';

import {
  detectPublicTextFindings,
  getPromptCourtPrivacyPolicy,
  redactPublicText,
  sanitizePublicPost,
  shouldSyncPromptCourtCloud,
} from './privacy.js';

describe('promptcourt privacy redaction', () => {
  it('redacts secrets, emails, urls, and local user paths before public posts', () => {
    const redacted = redactPublicText(`
      api_key="sk-abcdefghijklmnopqrstuvwxyz"
      token=ghp_abcdefghijklmnopqrstuvwxyz
      email test@example.com
      see https://example.com/private
      file /Users/frederick/Documents/secret.txt
      home /home/frederick/.config/karen.json
      windows C:\\Users\\frederick\\.ssh\\id_rsa
    `, 500);

    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('test@example.com');
    expect(redacted).not.toContain('https://example.com/private');
    expect(redacted).not.toContain('/Users/frederick');
    expect(redacted).not.toContain('/home/frederick');
    expect(redacted).not.toContain('C:\\Users\\frederick');
    expect(redacted).toContain('[redacted]');
    expect(redacted).toContain('/Users/[redacted]');
  });

  it('redacts common API tokens, env assignments, authorization headers, and credential URLs', () => {
    const redacted = redactPublicText(`
      OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
      export CLERK_SECRET_KEY="sk_test_abcdefghijklmnopqrstuvwxyz"
      Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signaturevalue
      curl https://deploy:super-secret@example.com/hook?token=abc123&safe=ok
      github_pat_abcdefghijklmnopqrstuvwxyz_1234567890
      AKIAIOSFODNN7EXAMPLE
      AIzaSyabcdefghijklmnopqrstuvwxyz123456789
    `, 900, { env: { KAREN_PUBLIC_REDACT_URLS: 'credentials' } });

    expect(redacted).toContain('OPENAI_API_KEY=[redacted]');
    expect(redacted).toContain('CLERK_SECRET_KEY=[redacted]');
    expect(redacted).toContain('Authorization: Bearer [redacted]');
    expect(redacted).toContain('https://[redacted]@example.com/hook?token=%5Bredacted%5D&safe=ok');
    expect(redacted).not.toContain('sk-proj-');
    expect(redacted).not.toContain('github_pat_');
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(redacted).not.toContain('AIzaSyabcdefghijklmnopqrstuvwxyz123456789');
  });

  it('reports redaction findings without returning secret values', () => {
    const findings = detectPublicTextFindings(`
      API_TOKEN=sk-abcdefghijklmnopqrstuvwxyz
      Authorization: Basic abcdefghijklmnop
      me@example.com
      /Users/frederick/project/.env
      https://user:pass@example.com
    `);

    expect(findings).toEqual([
      'api-token',
      'authorization-header',
      'email',
      'private-path',
      'secret-assignment',
      'url',
    ]);
  });

  it('sanitizes every public post text field and can suppress public posting by policy', () => {
    const safePost = sanitizePublicPost({
      title: 'Failed with OPENAI_API_KEY=sk-abcdefghijklmnop',
      promptExcerpt: 'email me@example.com and use https://user:pass@example.com',
      failureReasons: ['Token ghp_abcdefghijklmnopqrstuvwxyz leaked from /Users/frederick/app'],
      suggestedRewrite: 'Set Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    }, { env: { KAREN_ORG_PRIVACY_MODE: 'strict' } });

    expect(safePost).toMatchObject({
      title: 'Failed with OPENAI_API_KEY=[redacted]',
      promptExcerpt: 'email [redacted:email] and use [redacted:url]',
      failureReasons: ['Token [redacted] leaked from /Users/[redacted]/app'],
      suggestedRewrite: 'Set Authorization: Bearer [redacted]',
    });

    expect(sanitizePublicPost({ title: 'hidden' }, { env: { KAREN_PUBLIC_POSTING: '0' } })).toBeNull();
  });

  it('turns local-only and private org modes into non-public cloud policy', () => {
    expect(getPromptCourtPrivacyPolicy({ KAREN_LOCAL_ONLY: '1' })).toMatchObject({
      localOnly: true,
      publicPostingEnabled: false,
    });
    expect(getPromptCourtPrivacyPolicy({ KAREN_ORG_PRIVACY_MODE: 'private' })).toMatchObject({
      privateMode: true,
      publicPostingEnabled: false,
    });
    expect(getPromptCourtPrivacyPolicy({ KAREN_SECRET_SCANNING: '0' })).toMatchObject({
      secretScanningEnabled: false,
      publicPostingEnabled: false,
    });
    expect(shouldSyncPromptCourtCloud({ KAREN_LOCAL_ONLY: '1' })).toBe(false);
  });

  it('collapses whitespace and truncates long public excerpts', () => {
    const redacted = redactPublicText('one\n\n two   three four five', 14);

    expect(redacted).toBe('one two three…');
  });
});
