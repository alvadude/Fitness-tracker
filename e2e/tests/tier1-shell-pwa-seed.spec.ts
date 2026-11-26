import { test, expect } from '../helpers/testBase.js';
import { setAppClock } from '../helpers/clock.js';
import {
  fillAndSaveManualMeal,
  getNavRegion,
  getNavTab,
  gotoReady,
  openQuickAddSheet,
  openTab,
  reloadReady,
  selectDateInput,
} from '../helpers/selectors.js';
import {
  assertMinTouchTarget,
  assertNoHorizontalOverflow,
} from '../helpers/viewport.js';

test.describe('Tier 1 — F1: App Shell, Routing & Dark Athletic Theme', () => {
  test('T1-F1-01: Bottom navigation switches across all 4 views', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    const tabs = ['Training', 'Progress', 'Settings', 'Today'] as const;
    for (const tabName of tabs) {
      const tab = getNavTab(page, tabName).first();
      await tab.click();
      await expect(
        page.getByRole('heading', { name: new RegExp(tabName, 'i') }).first(),
      ).toBeVisible();
      const ariaCurrent = await tab.getAttribute('aria-current');
      const ariaSelected = await tab.getAttribute('aria-selected');
      const dataActive = await tab.getAttribute('data-active');
      expect(
        ariaCurrent === 'page' ||
          ariaSelected === 'true' ||
          dataActive === 'true',
      ).toBe(true);
    }
  });

  test('T1-F1-02: Dark-mode-first athletic theme applied', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    const themeMeta = page.locator('meta[name="theme-color"]');
    await expect(themeMeta).toHaveCount(1);

    const colors = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      const htmlStyle = getComputedStyle(document.documentElement);
      const bg =
        bodyStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
          ? bodyStyle.backgroundColor
          : htmlStyle.backgroundColor;
      const fg = bodyStyle.color;
      return { bg, fg };
    });

    const parseRgb = (cssColor: string): [number, number, number] => {
      const match = cssColor.match(/\d+/g);
      if (!match || match.length < 3) return [0, 0, 0];
      return [Number(match[0]), Number(match[1]), Number(match[2])];
    };

    const [bgR, bgG, bgB] = parseRgb(colors.bg);
    const [fgR, fgG, fgB] = parseRgb(colors.fg);
    const bgLuma = 0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB;
    const fgLuma = 0.2126 * fgR + 0.7152 * fgG + 0.0722 * fgB;

    expect(bgLuma).toBeLessThan(60);
    expect(fgLuma).toBeGreaterThan(150);
  });

  test('T1-F1-03: Mobile touch targets meet >=44px guideline', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    for (const tabName of ['Today', 'Training', 'Progress', 'Settings'] as const) {
      await assertMinTouchTarget(
        getNavTab(page, tabName).first(),
        44,
        `BottomNav ${tabName}`,
      );
    }

    const quickAddBtn = page.getByRole('button', { name: /quick[- ]add/i }).first();
    await assertMinTouchTarget(quickAddBtn, 44, 'Quick-Add button');
  });

  test('T1-F1-04: Zero horizontal overflow across all 4 tabs at 375px', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    for (const tabName of ['Today', 'Training', 'Progress', 'Settings'] as const) {
      await openTab(page, tabName);
      await assertNoHorizontalOverflow(page, 375);
    }
  });

  test('T1-F1-05: Unknown SPA route falls back cleanly to app shell', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/nonexistent-route');

    await expect(getNavRegion(page)).toBeVisible();
    await expect(getNavTab(page, 'Today').first()).toBeVisible();
  });
});

test.describe('Tier 1 — F2: PWA Manifest, Custom Icons & Offline Service Worker', () => {
  test('T1-F2-01: Valid manifest.json served with standalone display', async ({ page }) => {
    await page.goto('/');

    const manifestHref = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const response = await page.request.get(manifestHref ?? '/manifest.json');
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as {
      display?: string;
      name?: string;
      short_name?: string;
      start_url?: string;
      icons?: Array<{ src?: string; sizes?: string }>;
    };

    expect(manifest.display).toBe('standalone');
    expect(manifest.name || manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    const sizes = (manifest.icons ?? []).map((i) => i.sizes ?? '');
    expect(sizes.some((s) => s.includes('192x192'))).toBe(true);
    expect(sizes.some((s) => s.includes('512x512'))).toBe(true);
  });

  test('T1-F2-02: Custom PWA and Apple touch icons resolve cleanly', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

    for (const iconPath of ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
      const res = await page.request.get(iconPath);
      expect(res.status(), `${iconPath} HTTP status`).toBe(200);
      expect(res.headers()['content-type'] ?? '').toContain('image/png');
      const body = await res.body();
      expect(body.byteLength).toBeGreaterThan(100);
    }
  });

  test('T1-F2-03: Service Worker registers and activates', async ({ page }) => {
    await page.goto('/');

    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return {
        scope: reg.scope,
        activeState: reg.active?.state ?? null,
      };
    });

    expect(swReady).not.toBeNull();
    expect(swReady?.activeState).toMatch(/activated|activating/);
  });

  test('T1-F2-04: App shell reloads offline via Service Worker', async ({ page, context }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Ensure SW controls the page before going offline
    const hasController = await page.evaluate(
      () => navigator.serviceWorker.controller !== null,
    );
    if (!hasController) {
      await page.reload();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
    }

    await context.setOffline(true);
    await page.reload();

    await expect(getNavRegion(page)).toBeVisible();
    await expect(
      page.getByText(/black coffee|meiji|35\s*kcal/i).first(),
    ).toBeVisible();
    await context.setOffline(false);
  });

  test('T1-F2-05: SPA fallback route serves app shell without invalid _redirects loop', async ({ page }) => {
    await page.goto('/training');
    await expect(getNavRegion(page)).toBeVisible();
    const res = await page.request.get('/_redirects');
    if (res.status() === 200) {
      const text = await res.text();
      expect(text).not.toContain('/* /index.html 200');
    }
  });
});

test.describe('Tier 1 — F3: Storage Abstraction & Persistence Layer', () => {
  test('T1-F3-01: Meal entry persists across hard browser reload', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Chicken Bowl',
      calories: 450,
      proteinG: 40,
      carbsG: 45,
      fatG: 10,
      time: '12:30',
    });

    await expect(page.getByText('Chicken Bowl')).toBeVisible();
    await reloadReady(page);
    await expect(page.getByText('Chicken Bowl')).toBeVisible();
    await expect(page.getByText(/\b485\b/).first()).toBeVisible();
  });

  test('T1-F3-02: Workout set logs persist across hard reload', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');

    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    await expect(squatCard).toBeVisible();

    const weightInput = squatCard.getByLabel(/weight|kg/i).first();
    const repsInput = squatCard.getByLabel(/reps/i).first();
    await weightInput.fill('80');
    await repsInput.fill('8');

    const completeCheck = squatCard
      .getByRole('checkbox')
      .or(squatCard.getByRole('button', { name: /complete|done/i }))
      .first();
    await completeCheck.click();

    await reloadReady(page);
    await openTab(page, 'Training');

    const reloadedSquat = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    await expect(reloadedSquat.getByLabel(/weight|kg/i).first()).toHaveValue('80');
    await expect(reloadedSquat.getByLabel(/reps/i).first()).toHaveValue('8');
  });

  test('T1-F3-03: Weigh-in entry persists across hard reload', async ({ page }) => {
    await setAppClock(page, '2026-11-26T08:00:00');
    await page.goto('/');
    await openTab(page, 'Progress');

    await page
      .getByRole('button', { name: /log weigh-in|add weigh-in|weigh in/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog').last();
    const scope = (await dialog.isVisible().catch(() => false))
      ? dialog
      : page.locator('main').first();
    await scope.getByLabel(/weight/i).first().fill('83.5');
    await scope
      .getByRole('button', { name: /save|submit|log/i })
      .first()
      .click();

    await expect(page.getByText(/83\.5\s*kg/i).first()).toBeVisible();
    await page.reload();
    await openTab(page, 'Progress');
    await expect(page.getByText(/83\.5\s*kg/i).first()).toBeVisible();
  });

  test('T1-F3-04: Profile & macro target edits persist across hard reload', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const kcalInput = page.getByLabel(/calorie target|daily calories|calories/i).first();
    await kcalInput.fill('1850');
    await page.getByRole('button', { name: /save/i }).first().click();

    await page.reload();
    await openTab(page, 'Settings');
    await expect(
      page.getByLabel(/calorie target|daily calories|calories/i).first(),
    ).toHaveValue('1850');

    await openTab(page, 'Today');
    await expect(page.getByText(/1,?850/).first()).toBeVisible();
  });

  test('T1-F3-05: Custom food preset persists across hard reload', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    const sheet = await openQuickAddSheet(page);

    const createBtn = sheet
      .getByRole('button', { name: /create preset|new preset|add preset|custom preset/i })
      .first();
    await createBtn.click();

    await sheet.getByLabel(/name/i).first().fill('Boiled Egg');
    await sheet.getByLabel(/calories|kcal/i).first().fill('78');
    await sheet.getByLabel(/protein/i).first().fill('6');
    await sheet.getByLabel(/carbs|carbohydrates/i).first().fill('0.6');
    await sheet.getByLabel(/fat/i).first().fill('5');
    await sheet
      .getByRole('button', { name: /save preset|create|save/i })
      .first()
      .click();

    await expect(sheet.getByText('Boiled Egg')).toBeVisible();
    await page.reload();
    const reloadedSheet = await openQuickAddSheet(page);
    await expect(reloadedSheet.getByText('Boiled Egg')).toBeVisible();
  });
});

test.describe('Tier 1 — F4: First-Launch Seed Engine', () => {
  test('T1-F4-01: First launch seeds Nov 24, 2026 meals & exact totals', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-24');

    await expect(page.getByText(/Pancit sotanghon/i)).toBeVisible();
    await expect(page.getByText(/Buffet lunch/i)).toBeVisible();
    await expect(page.getByText(/Second helping/i)).toBeVisible();
    await expect(page.getByText(/Afternoon snack/i)).toBeVisible();
    await expect(page.getByText(/Active Whey/i)).toBeVisible();
    await expect(page.getByText(/Late bite/i)).toBeVisible();

    await expect(page.getByText(/2,?318/).first()).toBeVisible();
    await expect(page.getByText(/170\s*g/i).first()).toBeVisible();
    await expect(page.getByText(/199\s*g/i).first()).toBeVisible();
    await expect(page.getByText(/92\s*g/i).first()).toBeVisible();
  });

  test('T1-F4-02: First launch seeds Nov 24, 2026 treadmill walk', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');
    await selectDateInput(page, '2026-11-24');

    await expect(page.getByText(/22\s*min/i).first()).toBeVisible();
    await expect(page.getByText(/8\s*%/).first()).toBeVisible();
    await expect(page.getByText(/4\.5\s*kph/i).first()).toBeVisible();
    await expect(page.getByText(/185\s*kcal/i).first()).toBeVisible();
  });

  test('T1-F4-03: First launch seeds Nov 25, 2026 in-progress meal', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-25');

    await expect(page.getByText(/Meiji matcha chocolate/i).first()).toBeVisible();
    await expect(page.getByText(/35\s*\/|35\s*kcal/i).first()).toBeVisible();
    await expect(page.getByText(/0\s*\/\s*160|0g/i).first()).toBeVisible();
    await expect(page.getByText(/3\s*\/\s*180|3g/i).first()).toBeVisible();
    await expect(page.getByText(/2\s*\/\s*60|2g/i).first()).toBeVisible();
  });

  test('T1-F4-04: First launch seeds initial weigh-in 84.0 kg on Nov 24', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Progress');

    await expect(page.getByText(/84(\.0)?\s*kg/i).first()).toBeVisible();
    await expect(page.getByText(/2026-11-24|Nov 24/i).first()).toBeVisible();
  });

  test('T1-F4-05: Reloading after first launch does not duplicate seed entries', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await page.reload();
    await page.reload();

    await selectDateInput(page, '2026-11-24');
    await expect(page.getByText(/2,?318/).first()).toBeVisible();
    await expect(page.getByText(/Pancit sotanghon/i)).toHaveCount(1);
    await expect(page.getByText(/Late bite/i)).toHaveCount(1);
  });
});

test.describe('Tier 1 — F5: User Profile & Targets Defaults + Settings Editor', () => {
  test('T1-F5-01: Initial user profile defaults rendered accurately', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await expect(page.getByLabel(/age/i).first()).toHaveValue('29');
    await expect(page.getByLabel(/height/i).first()).toHaveValue('175');
    await expect(page.getByLabel(/start weight/i).first()).toHaveValue(/84(\.0)?/);
    await expect(page.getByLabel(/target weight|goal weight/i).first()).toHaveValue(/65(\.0)?/);
    await expect(page.getByText(/desk/i).first()).toBeVisible();
  });

  test('T1-F5-02: Initial Week 1 macro targets rendered accurately', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await expect(
      page.getByLabel(/calorie target|daily calories|calories/i).first(),
    ).toHaveValue('1900');
    await expect(page.getByLabel(/protein/i).first()).toHaveValue('160');
    await expect(page.getByLabel(/carbs|carbohydrates/i).first()).toHaveValue('180');
    await expect(page.getByLabel(/fat/i).first()).toHaveValue('60');
    await expect(page.getByText(/Week\s*1/i).first()).toBeVisible();
  });

  test('T1-F5-03: Edit profile demographics and persist', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page.getByLabel(/age/i).first().fill('30');
    const activitySelect = page.getByLabel(/activity/i).first();
    const lightOptionValue = await activitySelect
      .locator('option')
      .evaluateAll((opts) => {
        const match = opts.find((o) =>
          /light/i.test(`${o.textContent ?? ''} ${(o as HTMLOptionElement).value}`),
        );
        return match ? (match as HTMLOptionElement).value : 'light';
      });
    await activitySelect.selectOption(lightOptionValue);

    await page.getByRole('button', { name: /save/i }).first().click();
    await expect(page.getByText(/saved/i).first()).toBeVisible();

    await page.reload();
    await openTab(page, 'Settings');
    await expect(page.getByLabel(/age/i).first()).toHaveValue('30');
  });

  test('T1-F5-04: Edit target weight updates trajectory in Progress', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page.getByLabel(/target weight|goal weight/i).first().fill('68');
    await page.getByRole('button', { name: /save/i }).first().click();

    await openTab(page, 'Progress');
    await expect(page.getByText(/68(\.0)?\s*kg/i).first()).toBeVisible();
  });

  test('T1-F5-05: Edit macro targets updates Today remaining calculations', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page
      .getByLabel(/calorie target|daily calories|calories/i)
      .first()
      .fill('2000');
    await page.getByLabel(/protein/i).first().fill('175');
    await page.getByRole('button', { name: /save/i }).first().click();

    await openTab(page, 'Today');
    await selectDateInput(page, '2026-11-25');
    // Nov 25 seeded = 35 kcal, 0g P -> remaining = 1,965 kcal, 175g P
    await expect(page.getByText(/1,?965/).first()).toBeVisible();
    await expect(page.getByText(/175\s*g/i).first()).toBeVisible();
  });
});
