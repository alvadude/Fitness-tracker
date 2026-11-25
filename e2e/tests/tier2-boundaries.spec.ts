import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../helpers/testBase.js';
import { mockAiEndpoints } from '../helpers/aiRouteMock.js';
import {
  advanceClockSeconds,
  pauseAppClock,
  resumeAppClock,
  setAppClock,
} from '../helpers/clock.js';
import { installNotificationStub } from '../helpers/notifications.js';
import { GEMINI_ROUNDING_PAYLOAD } from '../fixtures/gemini-responses.js';
import {
  CAFFEINE_WARNING_RE,
  clearGeminiApiKeyInSettings,
  fillAndSaveManualMeal,
  getWeeklyReportCard,
  gotoReady,
  logWeighInOnProgress,
  openAiMealPhotoModal,
  openQuickAddSheet,
  openTab,
  reloadReady,
  saveGeminiApiKeyInSettings,
  selectDateInput,
} from '../helpers/selectors.js';
import {
  assertMinTouchTarget,
  assertNoHorizontalOverflow,
} from '../helpers/viewport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEAL_SAMPLE_PNG = path.resolve(__dirname, '../fixtures/meal-sample.png');
const INVALID_BACKUP_JSON = path.resolve(__dirname, '../fixtures/invalid-backup.json');
const WRONG_VERSION_JSON = path.resolve(__dirname, '../fixtures/wrong-version-backup.json');
const MISSING_FIELDS_JSON = path.resolve(__dirname, '../fixtures/missing-fields-backup.json');

test.describe('Tier 2 — Area 1: First-Launch, Storage & JSON Backup Boundaries', () => {
  test('T2-B1-01: Empty storage first-launch seed check', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    await expect(page.getByText(/Meiji matcha chocolate/i)).toBeVisible();
    await expect(page.getByText(/35/).first()).toBeVisible();
    await selectDateInput(page, '2026-11-24');
    await expect(page.getByText(/2,?318/).first()).toBeVisible();

    await openTab(page, 'Training');
    await selectDateInput(page, '2026-11-24');
    await expect(page.getByText(/22\s*min/i).first()).toBeVisible();

    await openTab(page, 'Progress');
    await expect(page.getByText(/84(\.0)?\s*kg/i).first()).toBeVisible();
  });

  test('T2-B1-02: Corrupted localStorage fallback value does not white-screen', async ({ page }) => {
    await page.addInitScript(() => {
      for (const k of [
        'fittrack_state',
        'fitness_tracker_state',
        'fittrack_backup',
        'fittrack_settings',
      ]) {
        localStorage.setItem(k, '{corrupted_json!!!');
      }
    });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    await expect(page.getByRole('navigation').first()).toBeVisible();
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('T2-B1-03: Import malformed non-JSON file rejects cleanly & preserves state', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await fillAndSaveManualMeal(page, {
      name: 'Preserved Meal',
      calories: 300,
      proteinG: 25,
      carbsG: 30,
      fatG: 8,
    });

    await openTab(page, 'Settings');
    await page.locator('input[type="file"]').first().setInputFiles(INVALID_BACKUP_JSON);

    await expect(
      page.getByRole('alert').or(page.getByText(/invalid|malformed|error/i)).first(),
    ).toBeVisible();

    await openTab(page, 'Today');
    await expect(page.getByText('Preserved Meal')).toBeVisible();
  });

  test('T2-B1-04: Import JSON with unsupported schemaVersion rejects & preserves state', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page.locator('input[type="file"]').first().setInputFiles(WRONG_VERSION_JSON);
    await expect(
      page.getByRole('alert').or(page.getByText(/version|unsupported|invalid/i)).first(),
    ).toBeVisible();

    await openTab(page, 'Today');
    await expect(page.getByText(/Meiji matcha chocolate/i)).toBeVisible();
  });

  test('T2-B1-05: Import JSON missing required top-level fields rejects & preserves state', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page.locator('input[type="file"]').first().setInputFiles(MISSING_FIELDS_JSON);
    await expect(
      page.getByRole('alert').or(page.getByText(/missing|invalid|required/i)).first(),
    ).toBeVisible();

    await openTab(page, 'Today');
    await expect(page.getByText(/Meiji matcha chocolate/i)).toBeVisible();
  });

  test('T2-B1-06: Import valid JSON with empty meals and workouts works without crashing', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const emptyValidBackup = {
      schemaVersion: 1,
      exportedAt: '2026-11-25T10:00:00.000Z',
      profile: {
        age: 29,
        sex: 'male',
        heightCm: 175,
        activityLevel: 'desk',
        startWeightKg: 84.0,
        startDate: '2026-11-24',
        targetWeightKg: 65.0,
        targetDate: '2027-06-15',
        caffeineCutoffHour: 18,
      },
      targets: {
        calories: 1900,
        proteinG: 160,
        carbsG: 180,
        fatG: 60,
        weekNumber: 1,
      },
      presets: [],
      meals: [],
      workouts: [],
      weighIns: [],
      settings: { geminiApiEndpointMode: 'direct', notificationsEnabled: false },
    };

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'empty-valid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(emptyValidBackup), 'utf8'),
    });

    const confirmBtn = page
      .getByRole('button', { name: /confirm.*import|restore|apply/i })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await openTab(page, 'Today');
    await expect(page.getByText(/0\s*\/\s*1,?900|1,?900\s*remaining/i).first()).toBeVisible();
    await openTab(page, 'Progress');
    await expect(page.locator('svg').first()).toBeVisible();
  });
});

test.describe('Tier 2 — Area 2: Viewport 375px, Touch Targets & PWA/Notification Boundaries', () => {
  test('T2-B2-01: 375x812 viewport with all open modals/sheets has zero overflow', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    const quickSheet = await openQuickAddSheet(page);
    await assertNoHorizontalOverflow(page, 375);
    await quickSheet.getByRole('button', { name: /close|cancel|×/i }).first().click();

    const aiModal = await openAiMealPhotoModal(page);
    await assertNoHorizontalOverflow(page, 375);
    await aiModal.getByRole('button', { name: /close|cancel|×/i }).first().click();

    await openTab(page, 'Progress');
    await page
      .getByRole('button', { name: /log weigh-in|add weigh-in|weigh in/i })
      .first()
      .click();
    await assertNoHorizontalOverflow(page, 375);
  });

  test('T2-B2-02: Extremely long meal name (80+ chars) wraps cleanly at 375px', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');

    const longName =
      'Super Long Homemade Grilled Chicken Breast With Extra Steamed Broccoli And Brown Rice';
    await fillAndSaveManualMeal(page, {
      name: longName,
      calories: 520,
      proteinG: 48,
      carbsG: 52,
      fatG: 12,
    });

    await expect(page.getByText(longName)).toBeVisible();
    await assertNoHorizontalOverflow(page, 375);
  });

  test('T2-B2-03: Landscape narrow viewport (667x375) check', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    for (const tab of ['Today', 'Training', 'Progress', 'Settings'] as const) {
      await openTab(page, tab);
      await assertNoHorizontalOverflow(page, 667);
    }
  });

  test('T2-B2-04: Minimum 44x44px tap target check on primary & timer controls', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    for (const preset of ['90s', '2m', '3m']) {
      await assertMinTouchTarget(
        page.getByRole('button', { name: new RegExp(preset, 'i') }).first(),
        44,
        `Rest Timer ${preset}`,
      );
    }
  });

  test('T2-B2-05: Offline reload when querying uncached external AI endpoint shows graceful error', async ({ page, context }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaOfflineTestKey');

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (
      !(await page.evaluate(() => navigator.serviceWorker.controller !== null))
    ) {
      await page.reload();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
    }

    await context.setOffline(true);
    await page.reload();

    await openTab(page, 'Today');
    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(
      modal.getByRole('alert').or(modal.getByText(/offline|network|failed|error/i)).first(),
    ).toBeVisible();
    await context.setOffline(false);
  });

  test('T2-B2-06: Browser lacks Notification API renders graceful fallback without JS error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await installNotificationStub(page, { mode: 'undefined' });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await expect(
      page.getByText(/not supported|unavailable|\.ics/i).first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Tier 2 — Area 3: Caffeine Cutoff & Smart Evening Advisor Boundaries', () => {
  test('T2-B3-01: Boundary 17:59 caffeinated entry triggers NO warning', async ({ page }) => {
    await setAppClock(page, '2026-11-28T17:59:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    const caramel = sheet.getByRole('button', { name: /Caramel Macchiato/i }).first();
    if (await caramel.isVisible().catch(() => false)) {
      await caramel.click();
    }
    await expect(sheet.getByText(/after 6:00 PM|sleep.*warning/i)).toHaveCount(0);
    await sheet.getByRole('button', { name: /Black Coffee/i }).first().click();
    await expect(page.getByText(/Black Coffee/i).first()).toBeVisible();
  });

  test('T2-B3-02: Boundary 18:00 caffeinated entry triggers warning (inclusive)', async ({ page }) => {
    await setAppClock(page, '2026-11-28T18:00:00');
    await gotoReady(page);

    const sheet = await openQuickAddSheet(page);
    const caramel = sheet.getByRole('button', { name: /Caramel Macchiato/i }).first();
    if (await caramel.isVisible().catch(() => false)) {
      await caramel.click();
    }
    await expect(
      sheet
        .getByRole('alert')
        .filter({ hasText: CAFFEINE_WARNING_RE })
        .or(sheet.getByText(CAFFEINE_WARNING_RE))
        .first(),
    ).toBeVisible();
  });

  test('T2-B3-03: Late-night 00:30 vs morning 08:00 caffeinated entry', async ({ page }) => {
    await setAppClock(page, '2026-11-28T00:30:00');
    await gotoReady(page);

    const lateSheet = await openQuickAddSheet(page);
    await lateSheet.getByRole('button', { name: /Black Coffee/i }).first().click();
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
        .or(lateSheet.getByText(CAFFEINE_WARNING_RE))
        .first(),
    ).toBeVisible();

    await setAppClock(page, '2026-11-28T08:00:00');
    await reloadReady(page);
    const morningSheet = await openQuickAddSheet(page);
    await expect(morningSheet.getByText(CAFFEINE_WARNING_RE)).toHaveCount(0);
  });

  test('T2-B3-04: Custom caffeine cutoff hour changed in Settings is respected', async ({ page }) => {
    await setAppClock(page, '2026-11-28T16:30:00');
    await gotoReady(page);
    await openTab(page, 'Settings');

    const cutoffInput = page.getByLabel(/caffeine cutoff/i).first();
    await expect(cutoffInput).toBeVisible();
    await cutoffInput.fill('16');
    await page.getByRole('button', { name: /save/i }).first().click();
    await openTab(page, 'Today');
    const sheet = await openQuickAddSheet(page);
    const caramel = sheet.getByRole('button', { name: /Caramel Macchiato/i }).first();
    if (await caramel.isVisible().catch(() => false)) {
      await caramel.click();
    }
    await expect(
      sheet
        .getByRole('alert')
        .filter({ hasText: CAFFEINE_WARNING_RE })
        .or(sheet.getByText(CAFFEINE_WARNING_RE))
        .first(),
    ).toBeVisible();
  });

  test('T2-B3-05: Smart Advisor boundary remainingProteinG=35 vs 34', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    // 160 - 125 = 35g P remaining; 1900 - 1650 = 250 kcal remaining -> 2 scoops
    await fillAndSaveManualMeal(page, {
      name: 'Boundary Protein 125',
      calories: 1650,
      proteinG: 125,
      carbsG: 160,
      fatG: 50,
    });
    await expect(page.getByText(/2\s*scoops/i).first()).toBeVisible();

    // Edit to 126g P -> 34g P remaining -> steps down to 1 scoop
    await page.getByRole('button', { name: /edit/i }).first().click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByLabel(/protein/i).first().fill('126');
    await dialog.getByRole('button', { name: /save|update/i }).first().click();
    await expect(page.getByText(/1\s*scoop/i).first()).toBeVisible();
  });

  test('T2-B3-06: Smart Advisor boundary extreme surplus (+2,000 kcal) caps walk sensibly', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Mega Feast',
      calories: 3900,
      proteinG: 180,
      carbsG: 400,
      fatG: 150,
    });

    const advisorText = await page.locator('main').innerText();
    expect(advisorText).not.toContain('NaN');
    expect(advisorText).not.toContain('Infinity');
    const minsMatch = advisorText.match(/(\d+)\s*min/i);
    if (minsMatch) {
      expect(Number(minsMatch[1])).toBeLessThanOrEqual(60);
    }
  });
});

test.describe('Tier 2 — Area 4: Numeric, Zero & Negative Input Boundaries', () => {
  test('T2-B4-01: Negative kcal/macro inputs rejected in manual meal form', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');

    await page
      .getByRole('button', { name: /manual|add meal|log meal|\+ meal/i })
      .first()
      .click();
    const scope = page.getByRole('dialog').last();
    await scope.getByLabel(/meal name|food name|^name$/i).first().fill('Invalid Negative');
    await scope.getByLabel(/calories|kcal/i).first().fill('-50');
    await scope.getByLabel(/protein/i).first().fill('-10');
    await scope.getByLabel(/carbs|carbohydrates/i).first().fill('0');
    await scope.getByLabel(/fat/i).first().fill('0');
    await scope.getByRole('button', { name: /save|add|submit/i }).first().click();

    await expect(page.getByText('Invalid Negative')).toHaveCount(0);
  });

  test('T2-B4-02: Zero-calorie entry (0/0/0/0) allowed cleanly', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Sparkling Water',
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });

    await expect(page.getByText('Sparkling Water')).toBeVisible();
    await expect(page.getByText(/0\s*\/\s*1,?900|1,?900\s*remaining/i).first()).toBeVisible();
  });

  test('T2-B4-03: Treadmill speed 0 kph yields 0 kcal burned', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('20');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('0');

    await expect(page.getByText(/\b0\s*kcal/i).first()).toBeVisible();
  });

  test('T2-B4-04: Treadmill duration 0 min yields 0 kcal burned', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('0');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('4.5');

    await expect(page.getByText(/\b0\s*kcal/i).first()).toBeVisible();
  });

  test('T2-B4-05: Negative weight or reps in Workout Logger rejected or clamped', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    const weightInput = squatCard.getByLabel(/weight|kg/i).first();
    const repsInput = squatCard.getByLabel(/reps/i).first();
    await weightInput.fill('-5');
    await repsInput.fill('-2');
    await weightInput.blur();
    await repsInput.blur();

    const wVal = Number(await weightInput.inputValue());
    const rVal = Number(await repsInput.inputValue());
    const hasError = await squatCard
      .getByText(/invalid|non-negative|>= 0|positive/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(wVal >= 0 || hasError).toBe(true);
    expect(rVal >= 0 || hasError).toBe(true);
  });

  test('T2-B4-06: Zero or negative weight in Weigh-In modal rejected', async ({ page }) => {
    await setAppClock(page, '2026-12-01T08:00:00');
    await page.goto('/');

    await logWeighInOnProgress(page, 0);
    await expect(page.getByText(/(?:^|[^.\d])0(?:\.0)?\s*kg/i)).toHaveCount(0);

    await logWeighInOnProgress(page, -70);
    await expect(page.getByText(/-70/)).toHaveCount(0);
  });

  test('T2-B4-07: Large macro overage (5,000 kcal) clamps ring without NaN', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Extreme Surplus',
      calories: 5000,
      proteinG: 200,
      carbsG: 600,
      fatG: 180,
    });

    await expect(page.getByText(/5,?000/).first()).toBeVisible();
    await expect(page.getByText(/3,?100/).first()).toBeVisible();
    const bodyText = await page.locator('main').innerText();
    expect(bodyText).not.toContain('NaN');
  });
});

test.describe('Tier 2 — Area 5: Gemini AI Meal Photo Boundaries & Failure Modes', () => {
  test('T2-B5-01: Missing Gemini API key shows clear error and link/prompt to Settings', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_ROUNDING_PAYLOAD,
    });

    await page.goto('/');
    await clearGeminiApiKeyInSettings(page).catch(() => {});
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/api key|settings/i).first()).toBeVisible();
    expect(aiMock.requests.length).toBe(0);
  });

  test('T2-B5-02: Gemini HTTP 429 Rate Limit displays friendly retry message', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, { kind: 'status', status: 429 });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(
      modal.getByRole('alert').or(modal.getByText(/rate limit|429|try again/i)).first(),
    ).toBeVisible();
  });

  test('T2-B5-03: Gemini HTTP 500 Server Error displays graceful message & keeps Today log intact', async ({ page }) => {
    await setAppClock(page, '2026-11-25T12:00:00');
    await mockAiEndpoints(page, { kind: 'status', status: 500 });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(
      modal.getByRole('alert').or(modal.getByText(/error|failed|500|unavailable/i)).first(),
    ).toBeVisible();
    await modal.getByRole('button', { name: /close|cancel|×/i }).first().click();
    await expect(page.getByText(/Meiji matcha chocolate/i)).toBeVisible();
  });

  test('T2-B5-04: Gemini malformed non-JSON response displays error without crashing', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, { kind: 'malformed' });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(
      modal.getByRole('alert').or(modal.getByText(/parse|invalid|format|error/i)).first(),
    ).toBeVisible();
  });

  test('T2-B5-05: Gemini empty items [] displays no items detected & blocks save', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, { kind: 'empty' });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/no food|no items|empty/i).first()).toBeVisible();
    const saveBtn = modal.getByRole('button', { name: /save to.*log|save meal/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await expect(saveBtn).toBeDisabled();
    }
  });

  test('T2-B5-06: Fractional portion multiplier (0.25x / 1.25x) avoids float artifacts', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_ROUNDING_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/Protein Bite/i)).toBeVisible();
    const customMult = modal.getByLabel(/multiplier|portion/i).first();
    if (await customMult.isVisible().catch(() => false)) {
      await customMult.fill('1.25');
    } else {
      await modal.getByRole('button', { name: /1\.25x|0\.5x/i }).first().click();
    }

    const modalText = await modal.innerText();
    expect(modalText).not.toMatch(/000000\d|999999\d/);
  });

  test('T2-B5-07: Non-image file or empty selection blocked before sending Gemini request', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_ROUNDING_PAYLOAD,
    });

    await gotoReady(page);
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    const analyzeBtn = modal.getByRole('button', { name: /analyze|estimate/i }).first();
    // 1. Empty selection blocked
    if (await analyzeBtn.isEnabled().catch(() => false)) {
      await analyzeBtn.click();
    }
    expect(aiMock.requests.length).toBe(0);

    // 2. Non-image .txt upload blocked without sending Gemini request
    await modal.locator('input[type="file"]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image file', 'utf8'),
    });
    if (await analyzeBtn.isEnabled().catch(() => false)) {
      await analyzeBtn.click();
    }
    const hasErr = await modal
      .getByRole('alert')
      .or(modal.getByText(/image|unsupported|invalid|select.*photo/i))
      .first()
      .isVisible()
      .catch(() => false);
    const isDisabled = await analyzeBtn.isDisabled().catch(() => false);
    expect(hasErr || isDisabled).toBe(true);
    expect(aiMock.requests.length).toBe(0);
  });
});

test.describe('Tier 2 — Area 6: Schedule, Timer, Trajectory & Report Card Boundaries', () => {
  test('T2-B6-01: Trajectory start date boundary (2026-11-24) equals 84.0 kg', async ({ page }) => {
    await setAppClock(page, '2026-11-24T10:00:00');
    await page.goto('/');
    await openTab(page, 'Progress');

    await expect(page.getByText(/84(\.0)?\s*kg/i).first()).toBeVisible();
    await expect(page.getByText(/0(\.0)?\s*kg|on track/i).first()).toBeVisible();
  });

  test('T2-B6-02: Trajectory clamps at 65.0 kg on and after 2027-06-15', async ({ page }) => {
    await setAppClock(page, '2027-07-10T09:00:00');
    await page.goto('/');
    await logWeighInOnProgress(page, 65.0, { dateIso: '2027-07-10' });

    const text = await page.locator('main').innerText();
    expect(text).toContain('65');
    expect(text).not.toMatch(/6[0-3]\.\d\s*kg.*expected/i);
  });

  test('T2-B6-03: Fewer than 4 logged days holds baseline targets steady', async ({ page }) => {
    await setAppClock(page, '2026-11-25T12:00:00');
    await gotoReady(page);
    await openTab(page, 'Progress');

    // Fresh seed only has 2 days (Nov 24 & Nov 25)
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard).toBeVisible();
    await expect(
      reportCard.getByText(/steady|4[–-]7\s*days|consistent|at least 4/i).first(),
    ).toBeVisible();
  });

  test('T2-B6-04: Rapid loss exceeding -0.7 kg vs trajectory recommends +100 kcal (2,000 kcal)', async ({ page }) => {
    await setAppClock(page, '2026-11-30T10:00:00');
    await gotoReady(page);

    for (const d of ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']) {
      await selectDateInput(page, d);
      await fillAndSaveManualMeal(page, {
        name: `Week 1 Meal ${d}`,
        calories: 1900,
        proteinG: 160,
        carbsG: 180,
        fatG: 60,
      });
    }

    // 82.5 kg vs expected ~83.44 kg (delta = -0.94 < -0.7) -> increase_calories (+100 kcal -> 2000 kcal)
    await logWeighInOnProgress(page, 82.5, { dateIso: '2026-11-30' });
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard).toBeVisible();
    await expect(
      reportCard.getByText(/\+100\s*kcal|add 100\s*kcal|faster than planned|increase/i).first(),
    ).toBeVisible();
    await expect(
      reportCard.getByText(/2,?000/).first(),
    ).toBeVisible();
  });

  test('T2-B6-05: Rest timer stops at 00:00 and +15s near zero extends cleanly', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /90s/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    await advanceClockSeconds(page, 85);
    await expect(page.getByText('00:05').first()).toBeVisible();

    await page.getByRole('button', { name: /\+15s/i }).first().click();
    await expect(page.getByText('00:20').first()).toBeVisible();

    await advanceClockSeconds(page, 25);
    await expect(page.getByText('00:00').first()).toBeVisible();
    await expect(page.getByText(/-00:0/)).toHaveCount(0);
    await resumeAppClock(page);
  });

  test('T2-B6-06: Rapid double-click on Start / Preset does not double tick rate', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /90s/i }).first().click();
    await page.getByRole('button', { name: /90s/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    await advanceClockSeconds(page, 5);
    await expect(page.getByText('01:25').first()).toBeVisible();
    await resumeAppClock(page);
  });

  test('T2-B6-07: Saturday weigh-in prompt suppressed after logging today', async ({ page }) => {
    await setAppClock(page, '2026-11-28T07:05:00');
    await page.goto('/');

    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/weight/i).first().fill('83.2');
    await dialog.getByRole('button', { name: /save|submit|log/i }).first().click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
