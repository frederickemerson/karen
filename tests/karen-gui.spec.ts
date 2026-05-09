import { expect, test } from '@playwright/test';

const karenUrl = process.env.KAREN_GUI_URL ?? 'http://127.0.0.1:3002/karen';
const karenLandingUrl = process.env.KAREN_LANDING_URL ?? 'http://127.0.0.1:3002/karen/landing';

test('Karen dashboard renders as a scrollable page with the half-body mascot', async ({ page }) => {
  await page.goto(karenUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Karen control room')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('img', { name: /karen grandma mascot/i })).toBeVisible();

  const mascotBox = await page.getByRole('img', { name: /karen grandma mascot/i }).boundingBox();
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

test('Karen landing quiz routes GUI event audio through ElevenLabs hooks', async ({ page }) => {
  const audioRequests = {
    speech: 0,
    soundEffect: 0,
  };

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

  await page.route('**/api/karen/elevenlabs/sound-effect', async (route) => {
    audioRequests.soundEffect += 1;
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: Buffer.from([1, 2, 3]),
      headers: {
        'x-karen-audio-cache': 'miss',
      },
    });
  });

  await page.route('**/api/karen/elevenlabs/speech', async (route) => {
    audioRequests.speech += 1;
    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: Buffer.from([4, 5, 6]),
      headers: {
        'x-karen-audio-cache': 'miss',
      },
    });
  });

  await page.goto(karenLandingUrl, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('karen-quiz-option-A').click();

  await expect.poll(() => audioRequests.soundEffect).toBeGreaterThan(0);
  await expect.poll(() => audioRequests.speech).toBeGreaterThan(0);
});

test('Karen landing exposes signup, profile, or local install account affordance', async ({ page }) => {
  await page.goto(karenLandingUrl, { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: /claim your promptcourt profile/i })).toBeVisible();

  const accountAffordance = page
    .getByRole('button', { name: /sign up/i })
    .or(page.getByRole('link', { name: /my profile/i }))
    .or(page.getByRole('link', { name: /github/i }));

  await expect(accountAffordance.first()).toBeVisible();
});
