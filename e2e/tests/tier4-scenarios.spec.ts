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
  GEMINI_400_PAYLOAD,
  GEMINI_CHICKEN_RICE_PAYLOAD,
} from '../fixtures/gemini-responses.js';
import {
  CAFFEINE_WARNING_RE,
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
import {
  assertMinTouchTarget,
  assertNoHorizontalOverflow,
} from '../helpers/viewport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEAL_SAMPLE_PNG = path.resolve(__dirname, '../fixtures/meal-sample.png');

test.describe('Tier 4 — Real-World Application Scenarios (T4-01..T4-14)', () => {
  test('T4-01: Workday Recovery & Smart Evening Whey Decision (Tue-Fri)', async ({ page }) => {
    await setAppClock(page, '2026-11-25T20:30:00');
    await page.goto('/');

    // 35 kcal seeded on Nov 25 + 1525 kcal manual = 1560 kcal, 110g P
    await fillAndSaveManualMeal(page, {
      name: 'Workday Lunch & Dinner',
      calories: 1525,
      proteinG: 110,
      carbsG: 142,
      fatG: 46,
      time: '13:00',
    });

    await openTab(page, 'Training');
    await expect(page.getByText(/active recovery|workday/i).first()).toBeVisible();
    await expect(page.getByText(/7\+\s*h|sleep/i).first()).toBeVisible();

    await page.getByLabel(/duration/i).first().fill('18');
    await page.getByLabel(/incline/i).first().fill('2');
    await page.getByLabel(/speed/i).first().fill('4.5');
    await page
      .getByRole('button', { name: /log.*walk|log.*cardio|add cardio|save cardio/i })
      .first()
      .click();

    await openTab(page, 'Today');
    await expect(page.getByText(/2\s*scoops/i).first()).toBeVisible();

    const sheet = await openQuickAddSheet(page);
    const caffFree = sheet.getByRole('button', { name: /Caffeine[- ]Free/i }).first();
    if (await caffFree.isVisible().catch(() => false)) await caffFree.click();
    await sheet
      .getByRole('button', { name: /Active Whey.*2\s*scoops|2\s*scoops/i })
      .first()
      .click();

    // 1560 + 248 = 1808 kcal, 110 + 48 = 158g P
    await expect(page.getByText(/1,?808/).first()).toBeVisible();
    await expect(page.getByText(/158/).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(/1,?808/).first()).toBeVisible();
  });

  test('T4-02: Full Saturday Morning Weigh-In, Lower Body Lift & Incline Walk', async ({ page }) => {
    await setAppClock(page, '2026-11-28T07:05:00');
    await page.goto('/');

    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/weight/i).first().fill('83.2');
    await dialog.getByRole('button', { name: /save|submit|log/i }).first().click();

    await openTab(page, 'Training');
    await expect(page.getByText(/Barbell Back Squat/i)).toBeVisible();
    await expect(page.getByText(/Barbell Romanian Deadlift/i)).toBeVisible();

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

    await pauseAppClock(page, '2026-11-28T07:10:00');
    await page.getByRole('button', { name: /3m/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) await startBtn.click();
    await advanceClockSeconds(page, 10);
    await page.getByRole('button', { name: /pause/i }).first().click();
    await page.getByRole('button', { name: /resume|start/i }).first().click();
    await resumeAppClock(page);

    await page.getByLabel(/duration/i).first().fill('30');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('4.5');
    await page
      .getByRole('button', { name: /log.*walk|log.*cardio|add cardio|save cardio/i })
      .first()
      .click();
    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await openTab(page, 'Progress');
    await expect(page.getByText(/83\.2\s*kg/i).first()).toBeVisible();
    await expect(page.getByText(/1\s*\/\s*3|1\s*of\s*3/i).first()).toBeVisible();
    await expect(page.getByText(/Barbell Back Squat/i).first()).toBeVisible();

    await reloadReady(page);
    await openTab(page, 'Progress');
    await expect(page.getByText(/83\.2\s*kg/i).first()).toBeVisible();
  });

  test('T4-03: Buffet Surplus Day & Treadmill Offset Loop', async ({ page }) => {
    // Workday (Thursday) has no pre-populated cardio, preventing cardio double-counting
    await setAppClock(page, '2026-11-26T20:00:00');
    await gotoReady(page);

    await fillAndSaveManualMeal(page, {
      name: 'Buffet Feast',
      calories: 2350,
      proteinG: 140,
      carbsG: 220,
      fatG: 95,
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
    await expect(page.getByText(/2,?09[0-9]/).first()).toBeVisible();
  });

  test('T4-04: Sunday Upper Push/Pull + AI Meal Photo ("peeled chicken skin") + .ics Export', async ({ page }) => {
    await setAppClock(page, '2026-11-29T18:00:00');
    const aiMock = await mockAiEndpoints(page, {
      kind: 'success',
      payload: GEMINI_400_PAYLOAD,
    });

    await gotoReady(page);
    await saveGeminiApiKeyInSettings(page, 'AIzaSundayKey');

    await openTab(page, 'Training');
    await expect(page.getByText(/Barbell Bench Press/i)).toBeVisible();
    await expect(page.getByText(/Barbell Bent-Over Row/i)).toBeVisible();
    await expect(page.getByText(/Dumbbell Shoulder Press/i)).toBeVisible();

    await pauseAppClock(page, '2026-11-29T18:05:00');
    await page.getByRole('button', { name: /2m/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) await startBtn.click();
    await advanceClockSeconds(page, 5);
    await expect(page.getByText('01:55').first()).toBeVisible();
    await resumeAppClock(page);

    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await openTab(page, 'Today');
    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByLabel(/context|notes|description/i).first().fill('peeled chicken skin');
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();

    await expect(modal.getByText(/400/).first()).toBeVisible();
    await modal.getByRole('button', { name: /0\.5x/i }).first().click();
    await expect(modal.getByText(/200/).first()).toBeVisible();
    await modal.getByRole('button', { name: /save to.*log|save meal/i }).first().click();
    expect(aiMock.requests[0]?.rawBody).toContain('peeled chicken skin');

    await openTab(page, 'Settings');
    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /daily.*8:00\s*pm.*\.ics|8:00\s*pm/i })
        .first()
        .click();
    });
    expect(dl.content).toContain(
      "Time to finish logging today's meals and mark your workout.",
    );
  });

  test('T4-05: Monday Full Body & Interval Run + Week-Over-Week Progressive Overload', async ({ page }) => {
    await setAppClock(page, '2026-11-30T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const gobletCard = page
      .locator('article')
      .filter({ hasText: /Dumbbell Goblet Squat/i })
      .first();
    const gWeights = gobletCard.getByLabel(/weight|kg/i);
    const gReps = gobletCard.getByLabel(/reps/i);
    for (let i = 0; i < 3; i++) {
      await gWeights.nth(i).fill('24');
      await gReps.nth(i).fill('12');
    }

    const inclineDbCard = page
      .locator('article')
      .filter({ hasText: /Incline Dumbbell Press/i })
      .first();
    const iWeights = inclineDbCard.getByLabel(/weight|kg/i);
    const iReps = inclineDbCard.getByLabel(/reps/i);
    for (let i = 0; i < 3; i++) {
      await iWeights.nth(i).fill('20');
      await iReps.nth(i).fill('12');
    }

    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await selectDateInput(page, '2026-12-07'); // Next Monday
    await expect(page.getByText(/24\s*kg\s*[x×]\s*12|prev.*24/i).first()).toBeVisible();
    await expect(page.getByText(/20\s*kg\s*[x×]\s*12|prev.*20/i).first()).toBeVisible();

    const nextGoblet = page
      .locator('section, article, div')
      .filter({ hasText: /Dumbbell Goblet Squat/i })
      .first();
    await nextGoblet.getByLabel(/weight|kg/i).first().fill('26');
    await nextGoblet.getByLabel(/reps/i).first().fill('10');

    await page.reload();
    await openTab(page, 'Training');
    await selectDateInput(page, '2026-12-07');
    await expect(
      page
        .locator('section, article, div')
        .filter({ hasText: /Dumbbell Goblet Squat/i })
        .first()
        .getByLabel(/weight|kg/i)
        .first(),
    ).toHaveValue('26');
  });

  test('T4-06: Disaster Recovery: JSON Export -> Storage Wipe -> Import Restore -> Offline PWA Reload', async ({ page, context }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');

    await saveGeminiApiKeyInSettings(page, 'AIzaDisasterKey99');
    await page
      .getByLabel(/calorie target|daily calories|calories/i)
      .first()
      .fill('1850');
    await page.getByRole('button', { name: /save/i }).first().click();

    await openTab(page, 'Today');
    await fillAndSaveManualMeal(page, {
      name: 'Disaster Recovery Meal',
      calories: 550,
      proteinG: 45,
      carbsG: 60,
      fatG: 12,
    });
    await logWeighInOnProgress(page, 83.1, { dateIso: '2026-11-28' });

    await openTab(page, 'Settings');
    const dl = await captureDownload(page, async () => {
      await page.getByRole('button', { name: /export.*json|export backup/i }).first().click();
    });
    expect(dl.content).not.toContain('AIzaDisasterKey99');

    await resetToInitialSeedInSettings(page);
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'disaster-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(dl.content, 'utf8'),
    });
    const confirmBtn = page.getByRole('button', { name: /confirm.*import|restore|apply/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();

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

    await expect(page.getByText('Disaster Recovery Meal')).toBeVisible();
    await expect(page.getByText(/1,?850/).first()).toBeVisible();
    await openTab(page, 'Progress');
    await expect(page.getByText(/83\.1\s*kg/i).first()).toBeVisible();
    await context.setOffline(false);
  });

  test('T4-07: Full Week 1 -> Week 2 Report Card & Target Adjustment Flow', async ({ page }) => {
    await setAppClock(page, '2026-12-02T09:00:00');
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
        name: `Week 1 Day ${d}`,
        calories: 1900,
        proteinG: 160,
        carbsG: 180,
        fatG: 60,
      });
    }

    await openTab(page, 'Training');
    for (const d of ['2026-11-28', '2026-11-29', '2026-11-30']) {
      await selectDateInput(page, d);
      await page
        .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
        .first()
        .click();
    }

    // 7 adherent days (Nov 26..Dec 2) + 84.0 kg on Dec 2 (+0.75 kg > 0.5) -> 1800 kcal
    await logWeighInOnProgress(page, 84.0, { dateIso: '2026-12-02' });
    await expect(page.getByText(/3\s*\/\s*3|3\s*of\s*3/i).first()).toBeVisible();

    await page.getByRole('button', { name: /apply.*week/i }).first().click();
    await openTab(page, 'Settings');
    await expect(
      page.getByLabel(/calorie target|daily calories|calories/i).first(),
    ).toHaveValue('1800');
    await expect(page.getByText(/Week\s*2/i).first()).toBeVisible();
  });

  test('T4-08: Evening Caffeine Protection & 1-Tap Switch Workflow', async ({ page }) => {
    await setAppClock(page, '2026-11-28T21:15:00');
    await gotoReady(page);

    await fillAndSaveManualMeal(page, {
      name: 'Pre-Whey Meals',
      calories: 1650,
      proteinG: 135,
      carbsG: 165,
      fatG: 52,
      time: '18:00',
    });

    const sheet = await openQuickAddSheet(page);
    const caramel = sheet.getByRole('button', { name: /Caramel Macchiato/i }).first();
    if (await caramel.isVisible().catch(() => false)) await caramel.click();

    await expect(
      sheet
        .getByRole('alert')
        .filter({ hasText: CAFFEINE_WARNING_RE })
        .or(sheet.getByText(CAFFEINE_WARNING_RE))
        .first(),
    ).toBeVisible();

    await sheet.getByRole('button', { name: /Switch to Caffeine-Free/i }).first().click();
    await sheet
      .getByRole('button', { name: /Active Whey.*1\s*scoop|Add/i })
      .first()
      .click();

    await expect(page.getByText(/1,?774/).first()).toBeVisible();
    await expect(page.getByText(/159/).first()).toBeVisible();
  });

  test('T4-09: First-Time User Onboarding, Seed Verification & Calendar Setup', async ({ page }) => {
    await installNotificationStub(page, {
      mode: 'default',
      requestPermissionResult: 'granted',
    });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    await expect(page.getByText(/35/).first()).toBeVisible();
    await selectDateInput(page, '2026-11-24');
    await expect(page.getByText(/2,?318/).first()).toBeVisible();
    await expect(page.getByText(/170\s*g/i).first()).toBeVisible();
    await expect(page.getByText(/199\s*g/i).first()).toBeVisible();
    await expect(page.getByText(/92\s*g/i).first()).toBeVisible();

    await openTab(page, 'Settings');
    await expect(page.getByLabel(/age/i).first()).toHaveValue('29');
    await expect(page.getByLabel(/height/i).first()).toHaveValue('175');

    await saveGeminiApiKeyInSettings(page, 'AIzaOnboardingKey');
    await page
      .getByRole('button', { name: /enable notifications|request permission/i })
      .first()
      .click();
    await expect(page.getByText(/granted|enabled/i).first()).toBeVisible();

    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /all reminders|combined.*\.ics|both.*\.ics/i })
        .first()
        .click();
    });
    expect(dl.content).toContain(
      "Time to finish logging today's meals and mark your workout.",
    );
    expect(dl.content).toContain(
      'Morning weigh-in & weekly progress report ready.',
    );
  });

  test('T4-10: AI Meal Photo Error Recovery Flow (No Key -> 429 -> Success)', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    const aiMock = await mockAiEndpoints(page, { kind: 'status', status: 429 });

    await page.goto('/');
    const modal1 = await openAiMealPhotoModal(page);
    await modal1.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal1.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await expect(modal1.getByText(/api key/i).first()).toBeVisible();
    await modal1.getByRole('button', { name: /close|cancel|×/i }).first().click();

    await saveGeminiApiKeyInSettings(page, 'AIzaRecoveryKey');
    await openTab(page, 'Today');

    const modal2 = await openAiMealPhotoModal(page);
    await modal2.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal2.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await expect(
      modal2.getByRole('alert').or(modal2.getByText(/429|rate limit/i)).first(),
    ).toBeVisible();

    aiMock.setBehavior({ kind: 'success', payload: GEMINI_CHICKEN_RICE_PAYLOAD });
    await modal2
      .getByRole('button', { name: /retry|analyze|estimate/i })
      .first()
      .click();
    await expect(modal2.getByText(/Chicken Breast/i)).toBeVisible();
    await modal2
      .getByRole('button', { name: /save to.*log|save meal/i })
      .first()
      .click();
    await expect(page.getByText(/Chicken Breast/i).first()).toBeVisible();
  });

  test('T4-11: Mobile Gym-Floor Session at 375x812 Viewport', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);

    for (const tab of ['Today', 'Training', 'Progress', 'Settings'] as const) {
      await openTab(page, tab);
      await assertNoHorizontalOverflow(page, 375);
    }

    await openTab(page, 'Training');
    await assertMinTouchTarget(
      page.getByRole('button', { name: /90s/i }).first(),
      44,
      '90s timer button',
    );
    await pauseAppClock(page, '2026-11-28T10:00:00');
    await page.getByRole('button', { name: /90s/i }).first().click();
    await page.getByRole('button', { name: /\+15s/i }).first().click();
    await resumeAppClock(page);
    await assertNoHorizontalOverflow(page, 375);

    await openTab(page, 'Today');
    const sheet = await openQuickAddSheet(page);
    await assertNoHorizontalOverflow(page, 375);
    await sheet.getByRole('button', { name: /close|cancel|×/i }).first().click();
  });

  test('T4-12: Multi-Day Historical Editing & Chart Consistency', async ({ page }) => {
    await setAppClock(page, '2026-11-25T12:00:00');
    await gotoReady(page);

    await selectDateInput(page, '2026-11-24');
    await page
      .locator('li')
      .filter({ hasText: /Afternoon snack/i })
      .getByRole('button', { name: /edit/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog').last();
    await dialog.getByLabel(/calories|kcal/i).first().fill('330');
    await dialog.getByRole('button', { name: /save|update/i }).first().click();

    await page
      .locator('li')
      .filter({ hasText: /Late bite/i })
      .getByRole('button', { name: /duplicate|copy/i })
      .first()
      .click();

    // 2318 + 100 + 110 = 2528 kcal
    await expect(page.getByText(/2,?528/).first()).toBeVisible();

    await selectDateInput(page, '2026-11-25');
    await fillAndSaveManualMeal(page, {
      name: 'Nov 25 Lunch',
      calories: 550,
      proteinG: 45,
      carbsG: 50,
      fatG: 15,
    });
    // 35 + 550 = 585 kcal
    await expect(page.getByText(/585/).first()).toBeVisible();

    await openTab(page, 'Progress');
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard).toBeVisible();
    // (2528 + 585) / 2 = 1557 kcal avg (82% of 1900)
    await expect(reportCard.getByText(/1,?55[67]|82\s*%/i).first()).toBeVisible();
    const adherenceChart = page.locator('main svg').last();
    await expect(adherenceChart).toBeVisible();
    expect(await adherenceChart.locator('rect').count()).toBeGreaterThanOrEqual(2);
  });

  test('T4-13: Custom Food Preset Creation, Multi-Day Use & Backup Persistence', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    const sheet = await openQuickAddSheet(page);
    await sheet
      .getByRole('button', { name: /create preset|new preset|add preset|custom preset/i })
      .first()
      .click();
    await sheet.getByLabel(/name/i).first().fill('Chicken Breast 150g');
    await sheet.getByLabel(/calories|kcal/i).first().fill('240');
    await sheet.getByLabel(/protein/i).first().fill('45');
    await sheet.getByLabel(/carbs|carbohydrates/i).first().fill('0');
    await sheet.getByLabel(/fat/i).first().fill('5');
    await sheet.getByRole('button', { name: /save preset|create|save/i }).first().click();
    await sheet.getByRole('button', { name: /Chicken Breast 150g/i }).first().click();

    await selectDateInput(page, '2026-11-26');
    const sheet2 = await openQuickAddSheet(page);
    await sheet2.getByRole('button', { name: /Chicken Breast 150g/i }).first().click();

    await openTab(page, 'Settings');
    const dl = await captureDownload(page, async () => {
      await page.getByRole('button', { name: /export.*json|export backup/i }).first().click();
    });
    await resetToInitialSeedInSettings(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'preset-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(dl.content, 'utf8'),
    });
    const confirmBtn = page.getByRole('button', { name: /confirm.*import|restore|apply/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();

    await openTab(page, 'Today');
    await selectDateInput(page, '2026-11-27');
    const sheet3 = await openQuickAddSheet(page);
    await sheet3.getByRole('button', { name: /Chicken Breast 150g/i }).first().click();
    await expect(page.getByText('Chicken Breast 150g')).toBeVisible();
  });

  test('T4-14: Offline Airplane-Mode Gym & Meal Logging -> Online Reload', async ({ page, context }) => {
    await setAppClock(page, '2026-11-30T10:00:00');
    await gotoReady(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
      await reloadReady(page);
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
    }

    await context.setOffline(true);
    await reloadReady(page);

    const sheet = await openQuickAddSheet(page);
    await sheet.getByRole('button', { name: /Black Coffee/i }).first().click();

    await openTab(page, 'Training');
    const gobletCard = page
      .locator('section, article, div')
      .filter({ hasText: /Dumbbell Goblet Squat/i })
      .first();
    await gobletCard.getByLabel(/weight|kg/i).first().fill('24');
    await gobletCard.getByLabel(/reps/i).first().fill('12');

    await pauseAppClock(page, '2026-11-30T10:05:00');
    await page.getByRole('button', { name: /2m/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) await startBtn.click();
    await advanceClockSeconds(page, 5);
    await expect(page.getByText('01:55').first()).toBeVisible();
    await resumeAppClock(page);

    await logWeighInOnProgress(page, 82.9, { dateIso: '2026-11-30' });
    await reloadReady(page);
    await expect(page.getByText(/82\.9\s*kg/i).first()).toBeVisible();

    await context.setOffline(false);
    await reloadReady(page);
    await openTab(page, 'Progress');
    await expect(page.getByText(/82\.9\s*kg/i).first()).toBeVisible();
  });
});
