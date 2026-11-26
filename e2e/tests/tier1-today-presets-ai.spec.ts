import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../helpers/testBase.js';
import { mockAiEndpoints } from '../helpers/aiRouteMock.js';
import { setAppClock } from '../helpers/clock.js';
import {
  GEMINI_300_PAYLOAD,
  GEMINI_310_SAVE_PAYLOAD,
  GEMINI_400_PAYLOAD,
  GEMINI_CHICKEN_RICE_PAYLOAD,
  GEMINI_TWO_ITEM_SAUCE_PAYLOAD,
} from '../fixtures/gemini-responses.js';
import {
  CAFFEINE_WARNING_RE,
  fillAndSaveManualMeal,
  gotoReady,
  openAiMealPhotoModal,
  openQuickAddSheet,
  openTab,
  reloadReady,
  saveGeminiApiKeyInSettings,
  selectDateInput,
} from '../helpers/selectors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEAL_SAMPLE_PNG = path.resolve(__dirname, '../fixtures/meal-sample.png');

test.describe('Tier 1 — F6: Today Dashboard: Live Macro Rings/Bars & Date Nav', () => {
  test('T1-F6-01: Macro rings/bars show logged, target & remaining', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-25');

    await expect(page.getByText(/\b35\s*kcal|\b35\s*\//i).first()).toBeVisible();
    await expect(page.getByText(/1,?900/).first()).toBeVisible();
    await expect(page.getByText(/1,?865/).first()).toBeVisible();
    await expect(page.getByText(/\b160\s*g|\b0\s*\/\s*160/i).first()).toBeVisible();
    await expect(page.getByText(/\b180\s*g|\b3\s*\/\s*180/i).first()).toBeVisible();
    await expect(page.getByText(/\b60\s*g|\b0\s*\/\s*60|\b2\s*\/\s*60/i).first()).toBeVisible();
  });

  test('T1-F6-02: Surplus day displays over-target macro values clearly', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-24');

    await expect(page.getByText(/2,?318/).first()).toBeVisible();
    await expect(page.getByText(/418/).first()).toBeVisible();
    await expect(page.getByText(/170/).first()).toBeVisible();
    await expect(page.getByText(/199/).first()).toBeVisible();
    await expect(page.getByText(/92/).first()).toBeVisible();
  });

  test('T1-F6-03: Net calorie badge reflects cardio burn on Nov 24', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-24');

    await expect(page.getByText(/185/).first()).toBeVisible();
    await expect(page.getByText(/2,?133/).first()).toBeVisible();
  });

  test('T1-F6-04: Date switcher navigates backward and forward', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    await page
      .getByRole('button', { name: /prev|previous/i })
      .first()
      .click();
    await expect(page.getByText(/2,?318/).first()).toBeVisible();
    await expect(page.getByText(/Pancit sotanghon/i)).toBeVisible();

    await page
      .getByRole('button', { name: /next/i })
      .first()
      .click();
    await expect(page.getByText(/Meiji matcha chocolate/i)).toBeVisible();
  });

  test('T1-F6-05: Date picker jumps directly to arbitrary date', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-28');

    await expect(page.getByText(/0\s*\/\s*1,?900|1,?900\s*remaining/i).first()).toBeVisible();
    await expect(page.getByText(/Meiji matcha chocolate/i)).toHaveCount(0);
  });
});

test.describe('Tier 1 — F7: Saved Food Presets & One-Tap Quick-Add', () => {
  test('T1-F7-01: Quick-add Black Coffee logs 5/0/0/0', async ({ page }) => {
    await setAppClock(page, '2026-11-28T09:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    await sheet
      .getByRole('button', { name: /Black Coffee/i })
      .first()
      .click();

    await expect(page.getByText(/Black Coffee/i).first()).toBeVisible();
    await expect(page.getByText(/5\s*kcal|5\s*\/\s*1,?900/i).first()).toBeVisible();
  });

  test('T1-F7-02: Quick-add Active Whey 1 scoop logs 124/24/3/2', async ({ page }) => {
    await setAppClock(page, '2026-11-28T15:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    const caffFreeBtn = sheet.getByRole('button', { name: /caffeine[- ]free/i }).first();
    if (await caffFreeBtn.isVisible().catch(() => false)) {
      await caffFreeBtn.click();
    }
    await sheet
      .getByRole('button', { name: /Active Whey.*1\s*scoop|1\s*scoop/i })
      .first()
      .click();

    await expect(page.getByText(/124/).first()).toBeVisible();
    await expect(page.getByText(/24\s*g/i).first()).toBeVisible();
  });

  test('T1-F7-03: Quick-add Active Whey 2 scoops logs 248/48/6/4', async ({ page }) => {
    await setAppClock(page, '2026-11-28T15:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    const caffFreeBtn = sheet.getByRole('button', { name: /caffeine[- ]free/i }).first();
    if (await caffFreeBtn.isVisible().catch(() => false)) {
      await caffFreeBtn.click();
    }
    await sheet
      .getByRole('button', { name: /Active Whey.*2\s*scoops|2\s*scoops/i })
      .first()
      .click();

    await expect(page.getByText(/248/).first()).toBeVisible();
    await expect(page.getByText(/48\s*g/i).first()).toBeVisible();
  });

  test('T1-F7-04: Active Whey flavor/caffeine toggle switches Caramel Macchiato vs Caffeine-Free', async ({ page }) => {
    await setAppClock(page, '2026-11-28T15:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    const caramelToggle = sheet
      .getByRole('button', { name: /Caramel Macchiato/i })
      .or(sheet.getByLabel(/Caramel Macchiato/i))
      .first();
    await caramelToggle.click();

    await sheet
      .getByRole('button', { name: /Active Whey.*1\s*scoop|Add.*Whey|1\s*scoop/i })
      .first()
      .click();

    await expect(page.getByText(/Caramel Macchiato/i).first()).toBeVisible();
  });

  test('T1-F7-05: White rice portion quick-add & custom preset creation', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    await sheet.getByRole('button', { name: /white rice|rice/i }).first().click();

    const sheet2 = await openQuickAddSheet(page);
    await sheet2
      .getByRole('button', { name: /create preset|new preset|add preset|custom preset/i })
      .first()
      .click();
    await sheet2.getByLabel(/name/i).first().fill('Greek Yogurt 150g');
    await sheet2.getByLabel(/calories|kcal/i).first().fill('90');
    await sheet2.getByLabel(/protein/i).first().fill('15');
    await sheet2.getByLabel(/carbs|carbohydrates/i).first().fill('5');
    await sheet2.getByLabel(/fat/i).first().fill('0');
    await sheet2
      .getByRole('button', { name: /save preset|create|save/i })
      .first()
      .click();

    await sheet2.getByRole('button', { name: /Greek Yogurt 150g/i }).first().click();
    await expect(page.getByText('Greek Yogurt 150g').first()).toBeVisible();
  });
});

test.describe('Tier 1 — F8: After-6:00 PM Caffeine Warning Logic', () => {
  test('T1-F8-01: Caramel Macchiato whey at 18:30 triggers warning', async ({ page }) => {
    await setAppClock(page, '2026-11-28T18:30:00');
    await gotoReady(page);

    const sheet = await openQuickAddSheet(page);
    const caramelBtn = sheet
      .getByRole('button', { name: /Caramel Macchiato/i })
      .or(sheet.getByLabel(/Caramel Macchiato/i))
      .first();
    if (await caramelBtn.isVisible().catch(() => false)) {
      await caramelBtn.click();
    }

    await expect(
      sheet
        .getByRole('alert')
        .filter({ hasText: CAFFEINE_WARNING_RE })
        .or(sheet.getByText(CAFFEINE_WARNING_RE))
        .first(),
    ).toBeVisible();
  });

  test('T1-F8-02: Black Coffee at 19:00 triggers warning', async ({ page }) => {
    await setAppClock(page, '2026-11-28T19:00:00');
    await gotoReady(page);

    const sheet = await openQuickAddSheet(page);
    await sheet.getByRole('button', { name: /Black Coffee/i }).first().click();

    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: CAFFEINE_WARNING_RE })
        .or(
          page
            .locator('li, article, div')
            .filter({ hasText: /Black Coffee/i })
            .getByText(CAFFEINE_WARNING_RE),
        )
        .or(sheet.getByText(CAFFEINE_WARNING_RE))
        .first(),
    ).toBeVisible();
  });

  test('T1-F8-03: 1-tap Switch to Caffeine-Free resolves warning and logs cleanly', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    const caramelBtn = sheet
      .getByRole('button', { name: /Caramel Macchiato/i })
      .or(sheet.getByLabel(/Caramel Macchiato/i))
      .first();
    if (await caramelBtn.isVisible().catch(() => false)) {
      await caramelBtn.click();
    }

    const switchBtn = sheet
      .getByRole('button', { name: /Switch to Caffeine-Free/i })
      .first();
    await expect(switchBtn).toBeVisible();
    await switchBtn.click();

    await expect(
      sheet.getByText(/after 6:00 PM.*sleep/i),
    ).toHaveCount(0);

    await sheet
      .getByRole('button', { name: /Active Whey.*1\s*scoop|Add/i })
      .first()
      .click();
    await expect(page.getByText(/Caffeine[- ]Free/i).first()).toBeVisible();
  });

  test('T1-F8-04: Caffeine-Free Active Whey after 6:00 PM shows NO warning', async ({ page }) => {
    await setAppClock(page, '2026-11-28T21:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    const caffFreeBtn = sheet
      .getByRole('button', { name: /Caffeine[- ]Free/i })
      .first();
    if (await caffFreeBtn.isVisible().catch(() => false)) {
      await caffFreeBtn.click();
    }

    await sheet
      .getByRole('button', { name: /Active Whey.*1\s*scoop|1\s*scoop/i })
      .first()
      .click();

    await expect(page.getByText(/caffeine warning|sleep disruption/i)).toHaveCount(0);
    await expect(page.getByText(/124/).first()).toBeVisible();
  });

  test('T1-F8-05: Caffeinated preset at 09:00 AM shows NO warning', async ({ page }) => {
    await setAppClock(page, '2026-11-28T09:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    await expect(sheet.getByText(/caffeine warning|after 6:00 PM/i)).toHaveCount(0);
    await sheet.getByRole('button', { name: /Black Coffee/i }).first().click();

    await expect(page.getByText(/Black Coffee/i).first()).toBeVisible();
    await expect(page.getByText(/caffeine warning|after 6:00 PM/i)).toHaveCount(0);
  });
});

test.describe('Tier 1 — F9: Manual Meal Entry & Daily Meal Log CRUD', () => {
  test('T1-F9-01: Add manual meal with full macro details', async ({ page }) => {
    await setAppClock(page, '2026-11-28T13:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Grilled Salmon',
      calories: 420,
      proteinG: 38,
      carbsG: 0,
      fatG: 28,
      time: '13:00',
    });

    await expect(page.getByText('Grilled Salmon')).toBeVisible();
    await expect(page.getByText(/420/).first()).toBeVisible();
    await expect(page.getByText(/38/).first()).toBeVisible();
    await expect(page.getByText(/28/).first()).toBeVisible();
  });

  test('T1-F9-02: Edit existing meal updates macro rings immediately', async ({ page }) => {
    await setAppClock(page, '2026-11-28T13:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Grilled Salmon',
      calories: 420,
      proteinG: 38,
      carbsG: 0,
      fatG: 28,
      time: '13:00',
    });

    await page
      .getByRole('button', { name: /edit.*Grilled Salmon|^edit$/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByLabel(/calories|kcal/i).first().fill('500');
    await dialog.getByLabel(/protein/i).first().fill('42');
    await dialog.getByRole('button', { name: /save|update/i }).first().click();

    await expect(page.getByText(/500/).first()).toBeVisible();
    await expect(page.getByText(/42/).first()).toBeVisible();
  });

  test('T1-F9-03: Delete meal removes row and subtracts macros', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-25');

    await expect(page.getByText(/Meiji matcha chocolate/i)).toBeVisible();
    await page
      .getByRole('button', { name: /delete|remove/i })
      .first()
      .click();

    const confirmBtn = page
      .getByRole('button', { name: /confirm|delete|yes/i })
      .last();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByText(/Meiji matcha chocolate/i)).toHaveCount(0);
    await expect(page.getByText(/0\s*\/\s*1,?900|1,?900\s*remaining/i).first()).toBeVisible();
  });

  test('T1-F9-04: Duplicate meal clones macros and increments totals', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Whey Shake',
      calories: 124,
      proteinG: 24,
      carbsG: 3,
      fatG: 2,
      time: '12:00',
    });

    await page
      .getByRole('button', { name: /duplicate|copy/i })
      .first()
      .click();

    await expect(page.getByText('Whey Shake')).toHaveCount(2);
    await expect(page.getByText(/248/).first()).toBeVisible();
    await expect(page.getByText(/48/).first()).toBeVisible();
  });

  test('T1-F9-05: Manual meal notes & caffeinated flag persist across reload', async ({ page }) => {
    await setAppClock(page, '2026-11-28T09:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Cold Brew',
      calories: 10,
      proteinG: 0,
      carbsG: 2,
      fatG: 0,
      time: '09:00',
      caffeinated: true,
      notes: 'unsweetened',
    });

    await reloadReady(page);
    await expect(page.getByText('Cold Brew')).toBeVisible();
    await expect(page.getByText(/unsweetened/i)).toBeVisible();
  });
});

test.describe('Tier 1 — F10: Smart Evening Advisor Contextual Card', () => {
  test('T1-F10-01: Recommends 2 scoops caffeine-free whey for large protein gap', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Daytime Meals',
      calories: 1400,
      proteinG: 100,
      carbsG: 140,
      fatG: 45,
      time: '13:00',
    });

    const advisor = page.getByText(/Smart Evening Advisor|Evening Advisor/i).locator('..');
    await expect(advisor.or(page.locator('main')).first()).toContainText(/2\s*scoops/i);
    await expect(advisor.or(page.locator('main')).first()).toContainText(/caffeine[- ]free/i);
  });

  test('T1-F10-02: Recommends 1 scoop caffeine-free whey for moderate gap', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Daytime Meals',
      calories: 1700,
      proteinG: 138,
      carbsG: 165,
      fatG: 50,
      time: '13:00',
    });

    await expect(page.getByText(/1\s*scoop.*caffeine[- ]free|caffeine[- ]free.*1\s*scoop/i).first()).toBeVisible();
  });

  test('T1-F10-03: Recommends incline walk on calorie/fat surplus day', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Buffet Surplus',
      calories: 2318,
      proteinG: 170,
      carbsG: 199,
      fatG: 92,
      time: '14:00',
    });

    await expect(page.getByText(/incline.*walk|treadmill/i).first()).toBeVisible();
    await expect(page.getByText(/8\s*%|4\.5\s*kph|min/i).first()).toBeVisible();
  });

  test('T1-F10-04: Recommends protein + optional short walk when calories tight', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Tight Calorie Day',
      calories: 1860,
      proteinG: 135,
      carbsG: 175,
      fatG: 55,
      time: '15:00',
    });

    await expect(page.getByText(/1\s*scoop/i).first()).toBeVisible();
    await expect(page.getByText(/walk|treadmill/i).first()).toBeVisible();
  });

  test('T1-F10-05: Displays on-track / sleep message when targets met', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:30:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Dialed-In Day',
      calories: 1880,
      proteinG: 160,
      carbsG: 175,
      fatG: 55,
      time: '18:00',
    });

    await expect(
      page.getByText(/on track|dialed in|sleep|7\+\s*hours|hydration/i).first(),
    ).toBeVisible();
  });
});

test.describe('Tier 1 — F11: AI Meal Photo Upload & Gemini Request Pipeline', () => {
  test('T1-F11-01: Upload photo sends structured request to gemini-3.8-flash', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    expect(aiMock.requests.length).toBe(1);
    expect(aiMock.requests[0]?.url).toContain('gemini-3.8-flash');
    expect(aiMock.requests[0]?.rawBody).toContain('inlineData');
  });

  test('T1-F11-02: Optional text context included in Gemini prompt payload', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal
      .getByLabel(/context|notes|description/i)
      .first()
      .fill('peeled chicken skin, 2 tbsp rice');
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    expect(aiMock.requests[0]?.rawBody).toContain('peeled chicken skin, 2 tbsp rice');
  });

  test('T1-F11-03: Returned structured items render with portion & macros', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    await expect(modal.getByText(/150g/i)).toBeVisible();
    await expect(modal.getByText(/248/)).toBeVisible();
    await expect(modal.getByText(/White Rice/i)).toBeVisible();
    await expect(modal.getByText(/208/)).toBeVisible();
  });

  test('T1-F11-04: Direct mode uses Settings API key in request', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'test-key-123');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    const req = aiMock.requests[0];
    expect(req?.url).toContain('generativelanguage.googleapis.com');
    const hasKeyInUrlOrHeader =
      (req?.url ?? '').includes('test-key-123') ||
      Object.values(req?.headers ?? {}).some((v) => v.includes('test-key-123'));
    expect(hasKeyInUrlOrHeader).toBe(true);
  });

  test('T1-F11-05: Proxy mode sends request to /api/analyze-meal', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await openTab(page, 'Settings');
    const proxyRadio = page
      .getByRole('radio', { name: /proxy/i })
      .or(page.getByRole('button', { name: /proxy/i }))
      .or(page.getByLabel(/proxy/i))
      .first();
    await proxyRadio.click();
    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    await openTab(page, 'Today');
    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    expect(aiMock.requests[0]?.url).toContain('/api/analyze-meal');
  });
});

test.describe('Tier 1 — F12: AI Meal Review, Edit & Portion Multiplier Flow', () => {
  test('T1-F12-01: Edit item name and macros in review screen', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    // Scope edits to Item 0 inside the AI breakdown item list (never top-level Meal Name)
    const breakdownList = modal.locator('ul, ol, [role="list"]').first();
    const hasList = await breakdownList.isVisible().catch(() => false);
    const listScope = hasList ? breakdownList : modal;

    const nameInputs = listScope.getByLabel(/item.*name|^name$/i);
    let itemNameInput = nameInputs.first();
    const nameCount = await nameInputs.count();
    if (nameCount === 0) {
      const allNameInputs = modal.getByLabel(/name/i);
      const totalNames = await allNameInputs.count();
      for (let i = 0; i < totalNames; i++) {
        const val = await allNameInputs.nth(i).inputValue().catch(() => '');
        if (/^chicken breast$/i.test(val.trim())) {
          itemNameInput = allNameInputs.nth(i);
          break;
        }
      }
    } else {
      for (let i = 0; i < nameCount; i++) {
        const val = await nameInputs.nth(i).inputValue().catch(() => '');
        if (/chicken breast/i.test(val)) {
          itemNameInput = nameInputs.nth(i);
          break;
        }
      }
    }
    await itemNameInput.fill('Skinless Chicken');

    const calInputs = listScope.getByLabel(/calories|kcal/i);
    let itemCalInput = calInputs.first();
    const calCount = await calInputs.count();
    for (let i = 0; i < calCount; i++) {
      const val = await calInputs.nth(i).inputValue().catch(() => '');
      if (val === '248') {
        itemCalInput = calInputs.nth(i);
        break;
      }
    }
    await itemCalInput.fill('210');

    const protInputs = listScope.getByLabel(/protein/i);
    let itemProtInput = protInputs.first();
    const protCount = await protInputs.count();
    for (let i = 0; i < protCount; i++) {
      const val = await protInputs.nth(i).inputValue().catch(() => '');
      if (val === '46') {
        itemProtInput = protInputs.nth(i);
        break;
      }
    }
    await itemProtInput.fill('42');

    // 210 + 208 = 418 kcal total, 42 + 4 = 46g protein total
    await expect(modal.getByText(/\b418\b/).first()).toBeVisible();
    await expect(modal.getByText(/\b46\s*g\b|\b46\b/i).first()).toBeVisible();
  });

  test('T1-F12-02: Portion multiplier 0.5x halves preview totals', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_400_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/400/).first()).toBeVisible();
    await modal.getByRole('button', { name: /0\.5x/i }).first().click();

    await expect(modal.getByText(/200/).first()).toBeVisible();
    await expect(modal.getByText(/20\s*g/i).first()).toBeVisible();
  });

  test('T1-F12-03: Portion multiplier 2x doubles preview totals', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_300_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/300/).first()).toBeVisible();
    await modal.getByRole('button', { name: /2x/i }).first().click();

    await expect(modal.getByText(/600/).first()).toBeVisible();
    await expect(modal.getByText(/40\s*g/i).first()).toBeVisible();
  });

  test('T1-F12-04: Remove unwanted item from AI breakdown', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_TWO_ITEM_SAUCE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Sauce/i)).toBeVisible();
    const sauceRemoveBtn = modal
      .getByRole('button', { name: /remove.*sauce|delete.*sauce/i })
      .or(
        modal
          .locator('li, article, [role="listitem"], div')
          .filter({ hasText: /Sauce/i })
          .filter({ hasNotText: /Chicken/i })
          .getByRole('button', { name: /remove|delete/i }),
      );
    if ((await sauceRemoveBtn.count()) > 0) {
      await sauceRemoveBtn.first().click();
    } else {
      const breakdownList = modal.locator('ul, ol, [role="list"]').first();
      const scope = (await breakdownList.isVisible().catch(() => false))
        ? breakdownList
        : modal;
      await scope
        .getByRole('button', { name: /^(remove|delete)(\s+item)?$/i })
        .last()
        .click();
    }

    await expect(modal.getByText(/Heavy Sauce/i)).toHaveCount(0);
    await expect(modal.getByText(/\b250\b/).first()).toBeVisible();
  });

  test('T1-F12-05: Save reviewed AI meal commits to Today log', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_310_SAVE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey111');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Seared Chicken/i)).toBeVisible();
    await modal
      .getByRole('button', { name: /save to.*log|save meal|add to log/i })
      .first()
      .click();

    await expect(modal).toBeHidden();
    await expect(page.getByText(/Seared Chicken/i)).toBeVisible();
    await expect(page.getByText(/310/).first()).toBeVisible();
    await expect(page.getByText(/35\s*g/i).first()).toBeVisible();
  });
});
