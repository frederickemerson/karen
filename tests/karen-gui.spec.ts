import { expect, test } from '@playwright/test';

const karenUrl = process.env.KAREN_GUI_URL ?? 'http://127.0.0.1:3002/karen';

test('Karen dashboard renders as a scrollable page with the half-body mascot', async ({ page }) => {
  await page.goto(karenUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Karen GUI')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('img', { name: /karen pixel grandma mascot/i })).toBeVisible();

  const mascotBox = await page.getByRole('img', { name: /karen pixel grandma mascot/i }).boundingBox();
  expect(mascotBox?.height ?? 0).toBeGreaterThan(240);

  const before = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollY: window.scrollY,
  }));

  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before.scrollY);
});
