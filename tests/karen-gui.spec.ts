import { expect, test } from '@playwright/test';

const karenUrl = process.env.KAREN_GUI_URL ?? 'http://127.0.0.1:3002/karen';
const karenLandingUrl = process.env.KAREN_LANDING_URL ?? 'http://127.0.0.1:3002/karen/landing';
const landingPath = (path: string) => `${karenLandingUrl.replace(/\/$/, '')}${path}`;

test('Karen dashboard renders the local empty profile state with the half-body mascot', async ({ page }) => {
  await page.goto(karenUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /no record on file/i })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('img', { name: /karen grandma mascot/i })).toBeVisible();

  const mascotBox = await page.getByRole('img', { name: /karen grandma mascot/i }).boundingBox();
  expect(mascotBox?.height ?? 0).toBeGreaterThan(240);
});

test('Karen landing quiz shows the rollback consequence for a wrong answer', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeAudio {
      onended: null | (() => void) = null;
      onerror: null | (() => void) = null;
      constructor(_url?: string) {}
      play() {
        window.setTimeout(() => this.onended?.(), 0);
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: FakeAudio,
    });
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => (
      blob instanceof Blob && blob.type.startsWith('audio/')
        ? 'blob:karen-audio-test'
        : originalCreateObjectURL(blob)
    );
    URL.revokeObjectURL = (url: string) => {
      if (url === 'blob:karen-audio-test') return;
      originalRevokeObjectURL(url);
    };
    window.localStorage.setItem('karen_grandma_voice_settings', JSON.stringify({
      provider: 'elevenlabs',
      voiceURI: '',
      rate: 0.92,
      pitch: 0.72,
      volume: 1,
      mood: 'spicy',
      elevenLabsVoiceId: 'voice_test',
      elevenLabsModelId: 'eleven_flash_v2_5',
      elevenLabsStability: 0.62,
      elevenLabsSimilarityBoost: 0.78,
      elevenLabsStyle: 0.34,
      elevenLabsDemoMode: false,
    }));
  });

  await page.goto(landingPath('/how-it-works'), { waitUntil: 'domcontentloaded' });
  await page.getByTestId('karen-quiz-option-B').click();

  await expect(page.getByText('git reset --hard', { exact: true })).toBeVisible();
});

test('Karen landing exposes install or source account affordance', async ({ page }) => {
  await page.goto(landingPath('/install'), { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /one line\. then karen judges every patch/i })).toBeVisible();

  const accountAffordance = page
    .getByRole('button', { name: /copy/i })
    .or(page.getByRole('link', { name: /github/i }));

  await expect(accountAffordance.first()).toBeVisible();
});
