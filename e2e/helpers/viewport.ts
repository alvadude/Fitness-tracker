import { expect, type Locator, type Page } from '@playwright/test';

export async function assertNoHorizontalOverflow(
  page: Page,
  maxWidth = 375,
): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    metrics.scrollWidth,
    `Horizontal overflow detected: scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth);

  expect(
    metrics.scrollWidth,
    `Horizontal overflow exceeds maxWidth=${maxWidth}: scrollWidth=${metrics.scrollWidth}`,
  ).toBeLessThanOrEqual(maxWidth);
}

export async function assertMinTouchTarget(
  locator: Locator,
  minSizePx = 44,
  label = 'interactive control',
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `Missing boundingBox for ${label}`).not.toBeNull();
  if (!box) return;
  expect(
    box.width,
    `${label} width ${box.width}px < ${minSizePx}px`,
  ).toBeGreaterThanOrEqual(minSizePx);
  expect(
    box.height,
    `${label} height ${box.height}px < ${minSizePx}px`,
  ).toBeGreaterThanOrEqual(minSizePx);
}
