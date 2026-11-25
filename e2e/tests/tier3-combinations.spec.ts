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
import { captureDownload } from '../helpers/downloads.js';
import { installNotificationStub } from '../helpers/notifications.js';
import {
  GEMINI_350_40P_PAYLOAD,
  GEMINI_400_PAYLOAD,
  GEMINI_CHICKEN_RICE_PAYLOAD,
} from '../fixtures/gemini-responses.js';
import {
  CAFFEINE_WARNING_RE,
  clearGeminiApiKeyInSettings,
  clickSetCompleteControl,
  fillAndSaveManualMeal,
  getWeeklyReportCard,
  gotoReady,
  logWeighInOnProgress,
  openAiMealPhotoModal,
  openQuickAddSheet,
  openTab,
  reloadReady,
  resetToInitialSeedInSettings,
  saveGeminiApiKeyInSettings,
  selectDateInput,
} from '../helpers/selectors.js';
import { assertNoHorizontalOverflow } from '../helpers/viewport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEAL_SAMPLE_PNG = path.resolve(__dirname, '../fixtures/meal-sample.png');

test.describe('Tier 3 — Pairwise Cross-Feature Combinations (T3-01..T3-26)', () => {
  test('T3-01: AI meal log -> Today rings & Smart Advisor recalculation', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_350_40P_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    await fillAndSaveManualMeal(page, {
      name: 'Lunch',
      calories: 1400,
      proteinG: 110,
      carbsG: 140,
      fatG: 45,
      time: '12:30',
    });
    await expect(page.getByText(/2\s*scoops/i).first()).toBeVisible();

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await modal.getByRole('button', { name: /save to.*log|save meal/i }).first().click();

    await expect(page.getByText(/1,?750/).first()).toBeVisible();
    await expect(page.getByText(/150/).first()).toBeVisible();
    await expect(page.getByText(/2\s*scoops/i)).toHaveCount(0);
  });

  test('T3-02: Sat weigh-in -> Training treadmill burn recalculation', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');

    await logWeighInOnProgress(page, 70.0, { dateIso: '2026-11-28' });
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('22');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('4.5');

    // ~154 kcal at 70 kg vs 185 kcal at 84 kg
    await expect(page.getByText(/15[0-9]\s*kcal/i).first()).toBeVisible();
  });

  test('T3-03: Sat weigh-in -> Progress trend chart & Weekly Report Card delta', async ({ page }) => {
    await setAppClock(page, '2026-12-01T09:00:00');
    await page.goto('/');

    await logWeighInOnProgress(page, 82.5, { dateIso: '2026-12-01' });
    await expect(page.getByText(/82\.5\s*kg/i).first()).toBeVisible();
    await expect(page.locator('svg').first()).toBeVisible();
    await expect(page.getByText(/Weekly Report/i).first()).toBeVisible();
  });

  test('T3-04: Strength sets hitting top rep range -> Report Card overload & workout count', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    const weights = squatCard.getByLabel(/weight|kg/i);
    const reps = squatCard.getByLabel(/reps/i);
    for (let i = 0; i < 4; i++) {
      await weights.nth(i).fill('80');
      await reps.nth(i).fill('8');
      await clickSetCompleteControl(squatCard, i);
    }
    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await openTab(page, 'Progress');
    await expect(page.getByText(/1\s*\/\s*3|1\s*of\s*3/i).first()).toBeVisible();
    await expect(page.getByText(/Barbell Back Squat/i).first()).toBeVisible();
    await expect(page.getByText(/\+2\.5\s*kg|increase/i).first()).toBeVisible();
  });

  test('T3-05: Settings target edit -> Today remaining & Progress adherence bars', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page
      .getByLabel(/calorie target|daily calories|calories/i)
      .first()
      .fill('2100');
    await page.getByLabel(/protein/i).first().fill('170');
    await page.getByRole('button', { name: /save/i }).first().click();

    await openTab(page, 'Today');
    await expect(page.getByText(/2,?065|2,?100/).first()).toBeVisible();

    await openTab(page, 'Progress');
    await expect(page.getByText(/2,?100/).first()).toBeVisible();
  });

  test('T3-06: Settings profile target date edit -> Trajectory line & Report Card', async ({ page }) => {
    await setAppClock(page, '2026-12-01T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Progress');
    const beforeReportText = await getWeeklyReportCard(page).innerText();

    await openTab(page, 'Settings');
    const targetDateInput = page.getByLabel(/target date|goal date/i).first();
    await targetDateInput.fill('2027-03-01');
    await page.getByRole('button', { name: /save/i }).first().click();

    await openTab(page, 'Progress');
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard).toBeVisible();
    const afterReportText = await reportCard.innerText();
    expect(afterReportText).not.toBe(beforeReportText);
    await expect(
      reportCard.getByText(/82\.6\d?|1\.3\d?|1\.4\d?|2027-03-01|Mar/i).first(),
    ).toBeVisible();
    const chart = page.locator('svg').first();
    await expect(chart).toBeVisible();
    expect(await chart.locator('path, line, polyline, circle').count()).toBeGreaterThanOrEqual(2);
  });

  test('T3-07: JSON Export -> Reset/Wipe -> JSON Import -> API key exclusion', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'key-secret');

    await openTab(page, 'Today');
    await fillAndSaveManualMeal(page, {
      name: 'Backup Restore Meal',
      calories: 410,
      proteinG: 35,
      carbsG: 40,
      fatG: 10,
    });

    await openTab(page, 'Settings');
    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /export.*json|export backup/i })
        .first()
        .click();
    });
    expect(dl.content).not.toContain('key-secret');

    await resetToInitialSeedInSettings(page);
    await openTab(page, 'Today');
    await expect(page.getByText('Backup Restore Meal')).toHaveCount(0);

    await openTab(page, 'Settings');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'restore.json',
      mimeType: 'application/json',
      buffer: Buffer.from(dl.content, 'utf8'),
    });
    const confirmBtn = page
      .getByRole('button', { name: /confirm.*import|restore|apply/i })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await openTab(page, 'Today');
    await expect(page.getByText('Backup Restore Meal')).toBeVisible();
  });

  test('T3-08: After-6 PM caffeinated whey -> 1-tap Caffeine-Free switch -> Smart Advisor update', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:30:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Daytime Intake',
      calories: 1750,
      proteinG: 136,
      carbsG: 170,
      fatG: 54,
      time: '14:00',
    });

    const sheet = await openQuickAddSheet(page);
    const caramel = sheet.getByRole('button', { name: /Caramel Macchiato/i }).first();
    if (await caramel.isVisible().catch(() => false)) {
      await caramel.click();
    }
    await sheet.getByRole('button', { name: /Switch to Caffeine-Free/i }).first().click();
    await sheet
      .getByRole('button', { name: /Active Whey.*1\s*scoop|Add/i })
      .first()
      .click();

    await expect(page.getByText(/160/).first()).toBeVisible();
    await expect(page.getByText(/on track|dialed in|sleep/i).first()).toBeVisible();
  });

  test('T3-09: Smart Advisor walk recommendation -> Log treadmill walk -> Net kcal & Advisor update', async ({ page }) => {
    // Workday (Thursday) has no pre-populated cardio, preventing cardio double-counting
    await setAppClock(page, '2026-11-26T20:00:00');
    await gotoReady(page);

    await fillAndSaveManualMeal(page, {
      name: 'Surplus Dinner',
      calories: 2318,
      proteinG: 170,
      carbsG: 199,
      fatG: 92,
      time: '19:00',
    });
    await expect(page.getByText(/incline.*walk|treadmill/i).first()).toBeVisible();

    await openTab(page, 'Training');
    await page.getByLabel(/duration/i).first().fill('30');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('4.5');
    await page
      .getByRole('button', { name: /log.*walk|log.*cardio|add cardio|save cardio/i })
      .first()
      .click();

    await openTab(page, 'Today');
    await expect(page.getByText(/2,?06[0-9]/).first()).toBeVisible();
  });

  test('T3-10: Smart Advisor whey CTA -> Quick-Add 2 scoops -> Macro rings update', async ({ page }) => {
    await setAppClock(page, '2026-11-28T20:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Light Day',
      calories: 1500,
      proteinG: 110,
      carbsG: 160,
      fatG: 50,
      time: '14:00',
    });

    const advisorCta = page
      .getByRole('button', { name: /2\s*scoops|add.*whey|quick[- ]add/i })
      .first();
    if (await advisorCta.isVisible().catch(() => false)) {
      await advisorCta.click();
    }
    const sheet = page.getByRole('dialog').last();
    if (await sheet.isVisible().catch(() => false)) {
      const caffFree = sheet.getByRole('button', { name: /Caffeine[- ]Free/i }).first();
      if (await caffFree.isVisible().catch(() => false)) await caffFree.click();
      const twoScoops = sheet.getByRole('button', { name: /2\s*scoops/i }).first();
      if (await twoScoops.isVisible().catch(() => false)) await twoScoops.click();
    }

    await expect(page.getByText(/158/).first()).toBeVisible();
    await expect(page.getByText(/1,?748/).first()).toBeVisible();
  });

  test('T3-11: Workday Tue-Fri walk -> Today net calorie badge', async ({ page }) => {
    await setAppClock(page, '2026-11-25T19:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('20');
    await page.getByLabel(/incline/i).first().fill('2');
    await page.getByLabel(/speed/i).first().fill('4.5');
    await page
      .getByRole('button', { name: /log.*walk|log.*cardio|add cardio|save cardio/i })
      .first()
      .click();

    await openTab(page, 'Today');
    await expect(page.getByText(/35/).first()).toBeVisible();
    await expect(page.getByText(/net|burn/i).first()).toBeVisible();
  });

  test('T3-12: Week 1 Sat split logged -> Reload -> Week 2 Sat split shows previous numbers', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const rdlCard = page
      .locator('section, article, div')
      .filter({ hasText: /Romanian Deadlift/i })
      .first();
    await rdlCard.getByLabel(/weight|kg/i).first().fill('60');
    await rdlCard.getByLabel(/reps/i).first().fill('10');
    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await reloadReady(page);
    await openTab(page, 'Training');
    await selectDateInput(page, '2026-12-05');

    await expect(page.getByText(/prev.*60.*10|60\s*kg\s*[x×]\s*10/i).first()).toBeVisible();
  });

  test('T3-13: Edit/Delete meal on Today -> Progress adherence chart & averages update', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await gotoReady(page);
    await selectDateInput(page, '2026-11-24');

    await page
      .getByRole('button', { name: /delete.*Buffet|remove.*Buffet/i })
      .or(page.locator('li').filter({ hasText: /Buffet lunch/i }).getByRole('button', { name: /delete|remove/i }))
      .first()
      .click();

    const confirmBtn = page.getByRole('button', { name: /confirm|delete|yes/i }).last();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByText(/1,?328/).first()).toBeVisible();
    await openTab(page, 'Progress');
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard).toBeVisible();
    // (1328 + 35) / 2 = 682 kcal avg (36% of 1900)
    await expect(reportCard.getByText(/68[12]|3[56]\s*%/i).first()).toBeVisible();
    const adherenceChart = page.locator('main svg').last();
    await expect(adherenceChart).toBeVisible();
    expect(await adherenceChart.locator('rect').count()).toBeGreaterThanOrEqual(2);
  });

  test('T3-14: Custom preset created -> Exported & restored via JSON backup', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    await sheet
      .getByRole('button', { name: /create preset|new preset|add preset|custom preset/i })
      .first()
      .click();
    await sheet.getByLabel(/name/i).first().fill('Tuna Can');
    await sheet.getByLabel(/calories|kcal/i).first().fill('130');
    await sheet.getByLabel(/protein/i).first().fill('28');
    await sheet.getByLabel(/carbs|carbohydrates/i).first().fill('0');
    await sheet.getByLabel(/fat/i).first().fill('1');
    await sheet.getByRole('button', { name: /save preset|create|save/i }).first().click();
    await sheet.getByRole('button', { name: /close|cancel|×/i }).first().click();

    await openTab(page, 'Settings');
    const dl = await captureDownload(page, async () => {
      await page.getByRole('button', { name: /export.*json|export backup/i }).first().click();
    });
    await resetToInitialSeedInSettings(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'tuna-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(dl.content, 'utf8'),
    });
    const confirmBtn = page.getByRole('button', { name: /confirm.*import|restore|apply/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await openTab(page, 'Today');
    const restoredSheet = await openQuickAddSheet(page);
    await expect(restoredSheet.getByText('Tuna Can')).toBeVisible();
  });

  test('T3-15: AI Photo meal (peeled chicken skin, 0.5x) -> Progress 7-day adherence', async ({ page }) => {
    await setAppClock(page, '2026-11-25T12:00:00');
    await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_400_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaMockKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByLabel(/context|notes|description/i).first().fill('peeled chicken skin');
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await modal.getByRole('button', { name: /0\.5x/i }).first().click();
    await modal.getByRole('button', { name: /save to.*log|save meal/i }).first().click();

    // 35 seeded + 200 (0.5x of 400) = 235 kcal
    await expect(page.getByText(/235/).first()).toBeVisible();
    await openTab(page, 'Progress');
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard).toBeVisible();
    // (2318 + 235) / 2 = 1277 kcal avg (67% of 1900), 95g P avg (59% of 160)
    await expect(
      reportCard.getByText(/1,?27[67]|67\s*%|95\s*g|59\s*%/i).first(),
    ).toBeVisible();
    const adherenceChart = page.locator('main svg').last();
    await expect(adherenceChart).toBeVisible();
    expect(await adherenceChart.locator('rect').count()).toBeGreaterThanOrEqual(2);
  });

  test('T3-16: Report Card Apply Week N+1 Targets -> Settings & Today rings update', async ({ page }) => {
    await setAppClock(page, '2026-12-02T10:00:00');
    await gotoReady(page);

    for (const d of [
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]) {
      await selectDateInput(page, d);
      await fillAndSaveManualMeal(page, {
        name: `Target ${d}`,
        calories: 1900,
        proteinG: 160,
        carbsG: 180,
        fatG: 60,
      });
    }

    await logWeighInOnProgress(page, 84.0, { dateIso: '2026-12-02' });
    await page.getByRole('button', { name: /apply.*week/i }).first().click();

    await openTab(page, 'Settings');
    await expect(
      page.getByLabel(/calorie target|daily calories|calories/i).first(),
    ).toHaveValue('1800');
    await expect(page.getByText(/Week\s*2/i).first()).toBeVisible();

    await openTab(page, 'Today');
    await expect(page.getByText(/1,?800/).first()).toBeVisible();
  });

  test('T3-17: Log set completion + trigger Rest Timer in same workflow', async ({ page }) => {
    await setAppClock(page, '2026-11-29T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');

    const benchCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Bench Press/i })
      .first();
    await benchCard.getByLabel(/weight|kg/i).first().fill('70');
    await benchCard.getByLabel(/reps/i).first().fill('8');
    await clickSetCompleteControl(benchCard, 0);

    await pauseAppClock(page, '2026-11-29T10:00:00');
    await page.getByRole('button', { name: /2m/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }
    await advanceClockSeconds(page, 10);
    await expect(page.getByText('01:50').first()).toBeVisible();
    await resumeAppClock(page);

    await benchCard.getByLabel(/weight|kg/i).nth(1).fill('70');
    await benchCard.getByLabel(/reps/i).nth(1).fill('8');
    await expect(benchCard.getByLabel(/weight|kg/i).nth(1)).toHaveValue('70');
  });

  test('T3-18: Rest Timer active across tab switch & 375px layout', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /90s/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }
    await advanceClockSeconds(page, 2);

    await openTab(page, 'Today');
    await assertNoHorizontalOverflow(page, 375);
    await openTab(page, 'Training');
    await assertNoHorizontalOverflow(page, 375);
    await expect(page.getByText(/01:\d{2}|00:\d{2}/).first()).toBeVisible();
    await resumeAppClock(page);
  });

  test('T3-19: Nov 24 seeded meal + seeded walk cross-view consistency', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await selectDateInput(page, '2026-11-24');

    await expect(page.getByText(/2,?318/).first()).toBeVisible();
    await expect(page.getByText(/185/).first()).toBeVisible();

    await openTab(page, 'Training');
    await selectDateInput(page, '2026-11-24');
    await expect(page.getByText(/22\s*min/i).first()).toBeVisible();
    await expect(page.getByText(/185\s*kcal/i).first()).toBeVisible();
  });

  test('T3-20: Settings API key save/clear directly controls AI Meal Photo behavior', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaDynamicKey');
    await openTab(page, 'Today');

    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    expect(aiMock.requests.length).toBe(1);

    await modal.getByRole('button', { name: /close|cancel|×/i }).first().click();
    await clearGeminiApiKeyInSettings(page);
    await openTab(page, 'Today');

    const modal2 = await openAiMealPhotoModal(page);
    await modal2.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal2.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await expect(modal2.getByText(/api key/i).first()).toBeVisible();
    expect(aiMock.requests.length).toBe(1);
  });

  test('T3-21: Settings Proxy toggle switches AI endpoint target', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_CHICKEN_RICE_PAYLOAD,
    });

    await page.goto('/');
    await openTab(page, 'Settings');
    await page
      .getByRole('radio', { name: /proxy/i })
      .or(page.getByRole('button', { name: /proxy/i }))
      .or(page.getByLabel(/proxy/i))
      .first()
      .click();
    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();

    await openTab(page, 'Today');
    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await expect(modal.getByText(/Chicken Breast/i)).toBeVisible();
    expect(aiMock.requests[0]?.url).toContain('/api/analyze-meal');
  });

  test('T3-22: Weigh-In weight supersedes initial profile 84.0 kg for cardio math', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await logWeighInOnProgress(page, 78.0, { dateIso: '2026-11-28' });

    await openTab(page, 'Training');
    await page.getByLabel(/duration/i).first().fill('22');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('4.5');

    // ~172 kcal at 78 kg (distinct from 185 kcal at 84 kg)
    await expect(page.getByText(/17[0-4]\s*kcal/i).first()).toBeVisible();
  });

  test('T3-23: Notifications denied gracefully pairs with .ics export', async ({ page }) => {
    await installNotificationStub(page, { mode: 'denied' });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await expect(page.getByText(/denied|blocked/i).first()).toBeVisible();
    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /all reminders|daily.*8:00\s*pm/i })
        .first()
        .click();
    });
    expect(dl.content).toContain('BEGIN:VCALENDAR');
  });

  test('T3-24: Offline PWA mode + meal Quick-Add + strength set logging', async ({ page, context }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
      await page.reload();
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
    }

    await context.setOffline(true);
    await reloadReady(page);

    const sheet = await openQuickAddSheet(page);
    await sheet.getByRole('button', { name: /Black Coffee/i }).first().click();
    await expect(page.getByText(/Black Coffee/i).first()).toBeVisible();

    await openTab(page, 'Training');
    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    await squatCard.getByLabel(/weight|kg/i).first().fill('85');
    await squatCard.getByLabel(/reps/i).first().fill('6');

    await context.setOffline(false);
    await reloadReady(page);
    await expect(page.getByText(/Black Coffee/i).first()).toBeVisible();
    await openTab(page, 'Training');
    await expect(
      page
        .locator('section, article, div')
        .filter({ hasText: /Barbell Back Squat/i })
        .first()
        .getByLabel(/weight|kg/i)
        .first(),
    ).toHaveValue('85');
  });

  test('T3-25: Duplicate caffeinated meal after 6:00 PM vs edit time to morning', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);

    await fillAndSaveManualMeal(page, {
      name: 'Morning Coffee',
      calories: 5,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      time: '10:00',
      caffeinated: true,
    });

    await page.getByRole('button', { name: /duplicate|copy/i }).first().click();
    await page.getByRole('button', { name: /edit/i }).nth(1).click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByLabel(/time/i).first().fill('19:00');
    const dialogWarned = await dialog
      .getByRole('alert')
      .filter({ hasText: CAFFEINE_WARNING_RE })
      .or(dialog.getByText(CAFFEINE_WARNING_RE))
      .first()
      .isVisible()
      .catch(() => false);
    await dialog.getByRole('button', { name: /save|update/i }).first().click();

    const mealRows = page.locator('li, article, div').filter({ hasText: 'Morning Coffee' });
    const morningRow = mealRows.filter({ hasText: /10:00/ }).last();
    const eveningRow = mealRows.filter({ hasText: /19:00|7:00\s*PM/i }).last();
    await expect(morningRow).toBeVisible();
    await expect(eveningRow).toBeVisible();
    await expect(morningRow.getByText(CAFFEINE_WARNING_RE)).toHaveCount(0);
    const rowWarned = await eveningRow
      .getByText(CAFFEINE_WARNING_RE)
      .first()
      .isVisible()
      .catch(() => false);
    expect(dialogWarned || rowWarned).toBe(true);
  });

  test('T3-26: Reset to Seed restores <4 days state on Report Card', async ({ page }) => {
    await setAppClock(page, '2026-11-30T10:00:00');
    await gotoReady(page);

    for (const d of ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']) {
      await selectDateInput(page, d);
      await fillAndSaveManualMeal(page, {
        name: `Day ${d}`,
        calories: 1900,
        proteinG: 160,
        carbsG: 180,
        fatG: 60,
      });
    }

    await resetToInitialSeedInSettings(page);
    await openTab(page, 'Progress');
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard).toBeVisible();
    await expect(
      reportCard.getByText(/steady|4[–-]7\s*days|consistent|at least 4/i).first(),
    ).toBeVisible();
  });
});
