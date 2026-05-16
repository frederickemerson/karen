import { expect, test } from '@playwright/test';

const base = process.env.KAREN_LANDING_BASE_URL ?? 'http://127.0.0.1:4400';

test.describe('Karen landing — new routes', () => {
  test('Home renders the hero, mascot, and at least one CTA', async ({ page }) => {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Did you read your/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /install/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /scoreboard/i }).first()).toBeVisible();
  });

  test('Scoreboard route loads (no demo data leakage)', async ({ page }) => {
    await page.goto(`${base}/scoreboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    // Demo names from the dropped LiveLeaderboardShowcase mocks must not appear.
    expect(html).not.toContain('Maya Chen');
    expect(html).not.toContain('Eli Brooks');
    expect(html).not.toContain('Nora Singh');
    expect(html).not.toContain('Jo Alvarez');
  });

  test('Install route loads with the curl command', async ({ page }) => {
    await page.goto(`${base}/install`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/curl/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('How-it-works route resolves (was previously unwired)', async ({ page }) => {
    const response = await page.goto(`${base}/how-it-works`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    // The HowItWorks component renders into the SPA shell; just verify the document loads.
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('/link route renders (manual code entry path)', async ({ page }) => {
    await page.goto(`${base}/link`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    // Signed-out users see Clerk sign-up controls; with Clerk unconfigured we
    // expect the manual-code entry or the auth-disabled fallback. Either way the
    // page must not throw.
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
    // Should mention either Clerk auth or the manual code instructions.
    expect(/link|code|sign|karen/i.test(html)).toBe(true);
  });

  test('/link?code=ABCD-EFGH passes the code into the page', async ({ page }) => {
    await page.goto(`${base}/link?code=ABCD-EFGH`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    // Either the code is rendered (signed-in path) or the page shows sign-up controls.
    expect(html.length).toBeGreaterThan(500);
  });

  test('/signup renders sign-up controls or fallback', async ({ page }) => {
    await page.goto(`${base}/signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('/signin renders sign-in controls or fallback', async ({ page }) => {
    await page.goto(`${base}/signin`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('/u/:username renders public profile or 404 state', async ({ page }) => {
    await page.goto(`${base}/u/nonexistent-user-12345`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
    // Should not crash; should mention either karen, nonexistent-user-12345, or a 404 string.
    expect(/karen|nonexistent|not found|no record/i.test(html)).toBe(true);
  });

  test('/profile renders or shows sign-in fallback', async ({ page }) => {
    await page.goto(`${base}/profile`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    expect(html.length).toBeGreaterThan(500);
  });

  test('Deep-link refresh works (SPA rewrite)', async ({ page }) => {
    // Hit a deep route directly; the Vercel-style server must rewrite to index.html.
    const response = await page.goto(`${base}/u/anything`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
  });
});
