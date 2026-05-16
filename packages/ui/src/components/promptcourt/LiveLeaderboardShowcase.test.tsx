import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LiveLeaderboardShowcase } from './LiveLeaderboardShowcase';

describe('LiveLeaderboardShowcase', () => {
  test('renders an explicit empty live data state without preview standings', () => {
    const html = renderToStaticMarkup(
      <LiveLeaderboardShowcase
        developers={[]}
        events={[]}
        live
        updatedLabel="karen.overview live"
      />,
    );

    expect(html).toContain('No public users yet.');
    expect(html).toContain('No public court events yet.');
    expect(html).toContain('convex data');
    expect(html).not.toContain('Maya Chen');
    expect(html).not.toContain('preview stream');
  });

  test('renders live wall-of-shame events from props instead of demo events', () => {
    const html = renderToStaticMarkup(
      <LiveLeaderboardShowcase
        developers={[]}
        events={[{
          id: 'evt-real',
          actor: '@real-user',
          label: 'prompt blocked',
          detail: 'real PromptCourt feed item',
          timestamp: 'now',
          scoreDelta: -4,
          tone: 'warn',
        }]}
        live
      />,
    );

    expect(html).toContain('@real-user');
    expect(html).toContain('real PromptCourt feed item');
    expect(html).not.toContain('@maya.c');
    expect(html).not.toContain('auth/session.ts behavior explained');
  });
});
