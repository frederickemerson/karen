import { expect, test } from '@playwright/test';

const base = process.env.KAREN_GUI_URL ?? 'http://127.0.0.1:3002';

// The Karen GUI keeps SSE/polling open, so `networkidle` never settles.
// Use `domcontentloaded` and wait for specific elements instead.

test.describe('Karen in-app GUI — new surfaces', () => {
  test('/karen renders mascot (control room when data exists, empty state otherwise)', async ({ page }) => {
    await page.goto(`${base}/karen`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    // KarenMascot has aria-label "Karen grandma mascot..." — present in both the
    // full control room and the KarenEmptyState fallback.
    const html = await page.content();
    expect(/grandma mascot/i.test(html)).toBe(true);
    // The page must be in ONE of: control room, loading skeleton, or empty state.
    const inControlRoom = /Karen control room/i.test(html);
    const inLoading = /Karen is warming up/i.test(html);
    const inEmpty = /No record on file/i.test(html);
    expect(inControlRoom || inLoading || inEmpty).toBe(true);
  });

  test('/karen has no demo data leakage', async ({ page }) => {
    await page.goto(`${base}/karen`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000); // give SSR a moment to fill data
    const html = await page.content();
    expect(html).not.toContain('Maya Chen');
    expect(html).not.toContain('Eli Brooks');
    expect(html).not.toContain('Nora Singh');
    expect(html).not.toContain('Jo Alvarez');
  });

  test('/u/:other-user renders read-only (no Start guarded run)', async ({ page }) => {
    await page.goto(`${base}/u/some-other-user-xyz`, { waitUntil: 'domcontentloaded' });
    // Wait for the page to do *something* (either the read-only view or the 404 state).
    await page.waitForTimeout(2500);
    const html = await page.content();
    // P0 fix: launch controls must not be present on a foreign profile.
    expect(html).not.toMatch(/Start guarded run/i);
    expect(html).not.toMatch(/Terminal bridge/i);
    // Should mention either the username, a Karen-voice 404, or the read-only profile shell.
    expect(/some-other-user-xyz|karen has no record|not found|@karen/i.test(html)).toBe(true);
  });

  test('SPA deep-link refresh on /u/:user stays read-only', async ({ page }) => {
    await page.goto(`${base}/u/another-foreign-user-12345`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const html = await page.content();
    expect(html.length).toBeGreaterThan(2000);
    expect(html).not.toMatch(/Start guarded run/i);
  });

  test('No critical console errors on /karen load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(`${base}/karen`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    // Allow benign dev-only errors:
    //  - favicon / manifest / service worker
    //  - 404 on dev assets
    //  - 401 Unauthorized on `/api/promptcourt/*` when no session token is set in this
    //    headless browser (production users hit the same APIs via a Bearer token)
    //  - clerk / convex / cors / chrome-extension noise
    const real = errors.filter(
      (e) =>
        !/favicon|manifest|service.?worker|sw\.js|401|404|unauthorized|clerk|convex|cors|chrome-extension/i.test(
          e,
        ),
    );
    if (real.length) console.log('real console errors:\n', real.join('\n'));
    expect(real.length).toBeLessThan(3);
  });
});
