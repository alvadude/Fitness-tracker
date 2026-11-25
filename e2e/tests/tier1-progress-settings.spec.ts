import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../helpers/testBase.js';
import { setAppClock } from '../helpers/clock.js';
import { captureDownload } from '../helpers/downloads.js';
import {
  getCapturedNotifications,
  installNotificationStub,
} from '../helpers/notifications.js';
import {
  clearGeminiApiKeyInSettings,
  clickSetCompleteControl,
  fillAndSaveManualMeal,
  getWeeklyReportCard,
  gotoReady,
  logWeighInOnProgress,
  openAiMealPhotoModal,
  openTab,
  reloadReady,
  resetToInitialSeedInSettings,
  saveGeminiApiKeyInSettings,
  selectDateInput,
  waitForAppHydration,
} from '../helpers/selectors.js';
import { assertNoHorizontalOverflow } from '../helpers/viewport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUP_SAMPLE_JSON = path.resolve(__dirname, '../fixtures/backup-sample.json');
const MEAL_SAMPLE_PNG = path.resolve(__dirname, '../fixtures/meal-sample.png');

test.describe('Tier 1 — F18: Saturday 7:00 AM Fasted Weigh-In Flow', () => {
  test('T1-F18-01: Saturday 7:00 AM triggers fasted weigh-in prompt', async ({ page }) => {
    await setAppClock(page, '2026-11-28T07:05:00');
    await page.goto('/');

    const prompt = page
      .getByRole('dialog')
      .or(page.getByText(/fasted weigh-in|saturday.*weigh-in|morning weigh-in/i))
      .first();
    await expect(prompt).toBeVisible();
  });

  test('T1-F18-02: Submit fasted weight via Saturday modal', async ({ page }) => {
    await setAppClock(page, '2026-11-28T07:05:00');
    await page.goto('/');

    const dialog = page.getByRole('dialog').last();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/weight/i).first().fill('83.2');
    await dialog
      .getByRole('button', { name: /save|submit|log/i })
      .first()
      .click();

    await expect(dialog).toBeHidden();
    await openTab(page, 'Progress');
    await expect(page.getByText(/83\.2\s*kg/i).first()).toBeVisible();
  });

  test('T1-F18-03: Manual Log Weigh-In works on any day', async ({ page }) => {
    await setAppClock(page, '2026-12-01T08:00:00');
    await page.goto('/');

    await logWeighInOnProgress(page, 83.0, { dateIso: '2026-12-01' });
    await expect(page.getByText(/83(\.0)?\s*kg/i).first()).toBeVisible();

    await page.reload();
    await openTab(page, 'Progress');
    await expect(page.getByText(/83(\.0)?\s*kg/i).first()).toBeVisible();
  });

  test('T1-F18-04: Optional weigh-in note persists', async ({ page }) => {
    await setAppClock(page, '2026-12-01T08:00:00');
    await page.goto('/');

    await logWeighInOnProgress(page, 82.8, {
      dateIso: '2026-12-01',
      note: 'post-cardio morning',
    });

    await page.reload();
    await openTab(page, 'Progress');
    await expect(page.getByText(/82\.8\s*kg/i).first()).toBeVisible();
    await expect(page.getByText(/post-cardio morning/i)).toBeVisible();
  });

  test('T1-F18-05: Multiple weigh-ins sort chronologically with latest highlighted', async ({ page }) => {
    await setAppClock(page, '2026-12-05T08:00:00');
    await page.goto('/');

    // Dismiss Saturday modal if open so we use Progress consistently
    const dialog = page.getByRole('dialog').first();
    if (await dialog.isVisible().catch(() => false)) {
      const closeBtn = dialog.getByRole('button', { name: /close|dismiss|later|cancel/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    }

    await logWeighInOnProgress(page, 83.2, { dateIso: '2026-11-28' });
    await logWeighInOnProgress(page, 82.5, { dateIso: '2026-12-05' });

    await expect(page.getByText(/84(\.0)?\s*kg/i).first()).toBeVisible();
    await expect(page.getByText(/83\.2\s*kg/i).first()).toBeVisible();
    await expect(page.getByText(/82\.5\s*kg/i).first()).toBeVisible();
  });
});

test.describe('Tier 1 — F19: Weight Trajectory & 7-Day Adherence Charts', () => {
  test('T1-F19-01: Weight trend chart renders actual points & June 2027 target line', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');

    await logWeighInOnProgress(page, 83.2, { dateIso: '2026-11-28' });

    const weightChart = page
      .locator('svg[aria-label*="weight" i], svg[role="img"]')
      .first();
    await expect(weightChart).toBeVisible();
    const pathOrLineCount = await weightChart.locator('path, line, polyline, circle').count();
    expect(pathOrLineCount).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/65(\.0)?\s*kg/i).first()).toBeVisible();
  });

  test('T1-F19-02: Weight trend chart updates live when new weigh-in logged', async ({ page }) => {
    await setAppClock(page, '2026-12-05T10:00:00');
    await page.goto('/');

    await logWeighInOnProgress(page, 82.6, { dateIso: '2026-12-05' });
    await expect(page.getByText(/82\.6\s*kg/i).first()).toBeVisible();
    const weightChart = page.locator('svg').first();
    await expect(weightChart).toBeVisible();
  });

  test('T1-F19-03: 7-day calorie adherence bar chart renders daily bars vs target', async ({ page }) => {
    await setAppClock(page, '2026-11-25T12:00:00');
    await page.goto('/');
    await openTab(page, 'Progress');

    const chart = page
      .locator('svg[aria-label*="adherence" i], svg[aria-label*="calorie" i]')
      .or(page.locator('svg').nth(1))
      .first();
    await expect(chart).toBeVisible();
    const rects = await chart.locator('rect').count();
    expect(rects).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/1,?900/).first()).toBeVisible();
  });

  test('T1-F19-04: 7-day protein adherence bar chart renders protein bars vs 160g', async ({ page }) => {
    await setAppClock(page, '2026-11-25T12:00:00');
    await page.goto('/');
    await openTab(page, 'Progress');

    const proteinToggle = page
      .getByRole('button', { name: /protein/i })
      .first();
    if (await proteinToggle.isVisible().catch(() => false)) {
      await proteinToggle.click();
    }

    await expect(page.getByText(/160\s*g/i).first()).toBeVisible();
    const adherenceChart = page
      .locator('svg[aria-label*="adherence" i], svg[aria-label*="protein" i], svg[aria-label*="calorie" i]')
      .or(page.locator('svg').last())
      .first();
    await expect(adherenceChart).toBeVisible();
    expect(await adherenceChart.locator('rect').count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/170\s*g|87\s*%|100\s*%|adherence/i).first()).toBeVisible();
  });

  test('T1-F19-05: Charts fit cleanly inside 375px mobile viewport', async ({ page }) => {
    await setAppClock(page, '2026-11-25T12:00:00');
    await page.goto('/');
    await openTab(page, 'Progress');

    await assertNoHorizontalOverflow(page, 375);
    const svgs = page.locator('svg');
    const count = await svgs.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const box = await svgs.nth(i).boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(375);
      }
    }
  });
});

test.describe('Tier 1 — F20: Automated Weekly Report Card & Week N+1 Engine', () => {
  test('T1-F20-01: Weekly Report Card shows weight delta vs June 2027 trajectory', async ({ page }) => {
    await setAppClock(page, '2026-12-01T09:00:00');
    await page.goto('/');
    await logWeighInOnProgress(page, 83.0, { dateIso: '2026-12-01' });

    await expect(page.getByText(/Weekly Report/i).first()).toBeVisible();
    await expect(page.getByText(/83(\.0)?\s*kg/i).first()).toBeVisible();
    await expect(page.getByText(/ahead|on pace|delta|trajectory/i).first()).toBeVisible();
  });

  test('T1-F20-02: Weekly Report Card computes 7-day average calorie & protein adherence', async ({ page }) => {
    await setAppClock(page, '2026-11-30T18:00:00');
    await page.goto('/');

    // Log 5 adherent days averaging 1900 kcal / 160g P
    for (const d of ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']) {
      await selectDateInput(page, d);
      await fillAndSaveManualMeal(page, {
        name: `Target Meal ${d}`,
        calories: 1900,
        proteinG: 160,
        carbsG: 180,
        fatG: 60,
        time: '13:00',
      });
    }

    await openTab(page, 'Progress');
    const reportCard = getWeeklyReportCard(page);
    await expect(reportCard.getByText(/adherence|avg/i).first()).toBeVisible();
    await expect(reportCard.getByText(/\b(?:8[5-9]|9\d|100)\s*%/).first()).toBeVisible();
  });

  test('T1-F20-03: Weekly Report Card summarizes completed workouts vs 3 splits', async ({ page }) => {
    await setAppClock(page, '2026-11-29T12:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await selectDateInput(page, '2026-11-28');
    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await selectDateInput(page, '2026-11-29');
    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await openTab(page, 'Progress');
    await expect(page.getByText(/2\s*\/\s*3|2\s*of\s*3/i).first()).toBeVisible();
  });

  test('T1-F20-04: Progressive overload recommendations surface for top-rep exercises', async ({ page }) => {
    await setAppClock(page, '2026-11-28T12:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');

    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    const weights = squatCard.getByLabel(/weight|kg/i);
    const reps = squatCard.getByLabel(/reps/i);
    for (let i = 0; i < 4; i++) {
      await weights.nth(i).fill('80');
      await reps.nth(i).fill('8'); // Top of 6-8 range
      await clickSetCompleteControl(squatCard, i);
    }
    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await openTab(page, 'Progress');
    await expect(page.getByText(/Barbell Back Squat/i).first()).toBeVisible();
    await expect(page.getByText(/\+2\.5\s*kg|increase|overload/i).first()).toBeVisible();
  });

  test('T1-F20-05: Week N+1 recommendation and 1-tap apply update targets', async ({ page }) => {
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
        name: `Meals ${d}`,
        calories: 1900,
        proteinG: 160,
        carbsG: 180,
        fatG: 60,
        time: '13:00',
      });
    }

    // 7-day adherence >= 95% and 84.0 kg on 2026-12-02 (+0.75 kg > 0.5 above trajectory) -> 1800 kcal
    await logWeighInOnProgress(page, 84.0, { dateIso: '2026-12-02' });

    const applyBtn = page
      .getByRole('button', { name: /apply.*week/i })
      .first();
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    await openTab(page, 'Settings');
    await expect(
      page.getByLabel(/calorie target|daily calories|calories/i).first(),
    ).toHaveValue('1800');
    await expect(page.getByText(/Week\s*2/i).first()).toBeVisible();
  });
});

test.describe('Tier 1 — F21: Client-Side Browser/PWA Notifications', () => {
  test('T1-F21-01: Notifications UI displays current browser permission status', async ({ page }) => {
    await installNotificationStub(page, { mode: 'default' });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await expect(
      page.getByText(/not enabled|default|enable notifications/i).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /enable notifications|request permission/i }).first(),
    ).toBeVisible();
  });

  test('T1-F21-02: Clicking Enable requests permission and updates status', async ({ page }) => {
    await installNotificationStub(page, {
      mode: 'default',
      requestPermissionResult: 'granted',
    });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page
      .getByRole('button', { name: /enable notifications|request permission/i })
      .first()
      .click();

    await expect(page.getByText(/granted|enabled/i).first()).toBeVisible();
  });

  test('T1-F21-03: Test Notification triggers browser Notification API', async ({ page }) => {
    await installNotificationStub(page, { mode: 'granted' });
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page
      .getByRole('button', { name: /test notification|send test/i })
      .first()
      .click();

    const captured = await getCapturedNotifications(page);
    expect(captured.length).toBeGreaterThanOrEqual(1);
  });

  test('T1-F21-04: Active-app check at 8:00 PM triggers daily reminder once per day', async ({ page }) => {
    await installNotificationStub(page, { mode: 'granted' });
    await setAppClock(page, '2026-11-26T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const enableControl = page
      .getByRole('checkbox', { name: /daily.*8:00|notifications|reminders/i })
      .or(page.getByRole('switch', { name: /daily.*8:00|notifications|reminders/i }))
      .or(page.getByLabel(/daily.*8:00|notifications|reminders/i))
      .or(page.getByRole('button', { name: /enable notifications|request permission/i }))
      .first();
    await expect(enableControl).toBeVisible();
    if (!(await enableControl.isChecked().catch(() => false))) {
      await enableControl.click();
    }
    await expect(page.getByText(/granted|enabled/i).first()).toBeVisible();

    await setAppClock(page, '2026-11-26T20:01:00');
    await page.reload();
    await expect
      .poll(async () => {
        const list = await getCapturedNotifications(page);
        return list.some((n) =>
          `${n.title} ${n.body}`.includes(
            "Time to finish logging today's meals and mark your workout.",
          ),
        );
      })
      .toBe(true);

    // Reload again the same evening: must NOT re-fire
    await page.reload();
    await waitForAppHydration(page);
    await page.waitForTimeout(300);
    const capturedAfter = await getCapturedNotifications(page);
    expect(capturedAfter).toHaveLength(0);
  });

  test('T1-F21-05: Active-app check on Saturday 7:00 AM triggers weigh-in notification', async ({ page }) => {
    await installNotificationStub(page, { mode: 'granted' });
    await setAppClock(page, '2026-11-27T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const enableControl = page
      .getByRole('checkbox', { name: /notifications|reminders/i })
      .or(page.getByRole('switch', { name: /notifications|reminders/i }))
      .or(page.getByLabel(/notifications|reminders/i))
      .or(page.getByRole('button', { name: /enable notifications|request permission/i }))
      .first();
    await expect(enableControl).toBeVisible();
    if (!(await enableControl.isChecked().catch(() => false))) {
      await enableControl.click();
    }
    await expect(page.getByText(/granted|enabled/i).first()).toBeVisible();

    await setAppClock(page, '2026-11-28T07:01:00');
    await page.reload();

    await expect
      .poll(async () => {
        const list = await getCapturedNotifications(page);
        return list.some((n) =>
          `${n.title} ${n.body}`.includes(
            'Morning weigh-in & weekly progress report ready.',
          ),
        );
      })
      .toBe(true);
  });
});

test.describe('Tier 1 — F22: .ics Recurring Calendar Reminder Generator', () => {
  test('T1-F22-01: Download Daily 8:00 PM .ics reminder', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /daily.*8:00\s*pm.*\.ics|8:00\s*pm/i })
        .first()
        .click();
    });

    expect(dl.filename.toLowerCase()).toContain('.ics');
    expect(dl.content).toContain('BEGIN:VCALENDAR');
    expect(dl.content).toContain('RRULE:FREQ=DAILY');
    expect(dl.content).toContain('200000');
    expect(dl.content).toContain('VALARM');
    expect(dl.content).toContain(
      "Time to finish logging today's meals and mark your workout.",
    );
  });

  test('T1-F22-02: Download Saturday 7:00 AM .ics reminder', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /saturday.*7:00\s*am.*\.ics|7:00\s*am/i })
        .first()
        .click();
    });

    expect(dl.filename.toLowerCase()).toContain('.ics');
    expect(dl.content).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(dl.content).toContain('070000');
    expect(dl.content).toContain('VALARM');
    expect(dl.content).toContain(
      'Morning weigh-in & weekly progress report ready.',
    );
  });

  test('T1-F22-03: Download combined .ics contains both recurring VEVENTs', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /all reminders|combined.*\.ics|both.*\.ics/i })
        .first()
        .click();
    });

    expect(dl.filename.toLowerCase()).toContain('.ics');
    expect(dl.content.match(/BEGIN:VEVENT/g)?.length).toBe(2);
    expect(dl.content).toContain('RRULE:FREQ=DAILY');
    expect(dl.content).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(dl.content).toContain(
      "Time to finish logging today's meals and mark your workout.",
    );
    expect(dl.content).toContain(
      'Morning weigh-in & weekly progress report ready.',
    );
  });

  test('T1-F22-04: Downloaded .ics uses RFC 5545 CRLF line endings & valid structure', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /daily.*8:00\s*pm.*\.ics|8:00\s*pm/i })
        .first()
        .click();
    });

    expect(dl.content).toContain('\r\n');
    expect(dl.content).toContain('VERSION:2.0');
    expect(dl.content).toContain('PRODID:');
    expect(dl.content).toContain('BEGIN:VEVENT');
    expect(dl.content).toContain('END:VEVENT');
    expect(dl.content).toContain('END:VCALENDAR');
  });

  test('T1-F22-05: .ics download works completely offline', async ({ page, context }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await context.setOffline(true);
    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /daily.*8:00\s*pm.*\.ics|all reminders/i })
        .first()
        .click();
    });
    await context.setOffline(false);

    expect(dl.filename.toLowerCase()).toContain('.ics');
    expect(dl.content).toContain('BEGIN:VCALENDAR');
  });
});

test.describe('Tier 1 — F23: JSON Backup Export & Validated Import', () => {
  test('T1-F23-01: Export JSON downloads complete backup snapshot', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /export.*json|export backup/i })
        .first()
        .click();
    });

    expect(dl.filename.toLowerCase()).toContain('.json');
    const parsed = JSON.parse(dl.content) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed).toHaveProperty('profile');
    expect(parsed).toHaveProperty('targets');
    expect(parsed).toHaveProperty('presets');
    expect(parsed).toHaveProperty('meals');
    expect(parsed).toHaveProperty('workouts');
    expect(parsed).toHaveProperty('weighIns');
    expect(parsed).toHaveProperty('settings');
  });

  test('T1-F23-02: Exported JSON never leaks Gemini API key', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'secret-ai-key-999');

    const dl = await captureDownload(page, async () => {
      await page
        .getByRole('button', { name: /export.*json|export backup/i })
        .first()
        .click();
    });

    expect(dl.content).not.toContain('secret-ai-key-999');
    expect(dl.content).not.toContain('geminiApiKey');
  });

  test('T1-F23-03: Import valid JSON restores all state across all 4 tabs', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const importInput = page.locator('input[type="file"][accept*="json" i], input[type="file"]').first();
    await importInput.setInputFiles(BACKUP_SAMPLE_JSON);

    const confirmBtn = page
      .getByRole('button', { name: /confirm.*import|restore|apply/i })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(
      page.getByText(/restored|imported|success/i).first(),
    ).toBeVisible();
    await expect(
      page.getByLabel(/calorie target|daily calories|calories/i).first(),
    ).toHaveValue('1800');

    await openTab(page, 'Today');
    await expect(page.getByText('Oats')).toBeVisible();

    await openTab(page, 'Progress');
    await expect(page.getByText(/81\.5\s*kg/i).first()).toBeVisible();
  });

  test('T1-F23-04: Import displays validation/summary counts upon restore', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const importInput = page.locator('input[type="file"]').first();
    await importInput.setInputFiles(BACKUP_SAMPLE_JSON);

    await expect(page.getByText(/1\s*meal|meals/i).first()).toBeVisible();
    await expect(page.getByText(/workout|weigh-in/i).first()).toBeVisible();
  });

  test('T1-F23-05: Imported state persists after hard reload', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    await page.locator('input[type="file"]').first().setInputFiles(BACKUP_SAMPLE_JSON);
    const confirmBtn = page
      .getByRole('button', { name: /confirm.*import|restore|apply/i })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await page.reload();
    await openTab(page, 'Today');
    await expect(page.getByText('Oats')).toBeVisible();
  });
});

test.describe('Tier 1 — F24: Gemini API Key & Settings Management', () => {
  test('T1-F24-01: Save Gemini API key persists across reload', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaTestKey12345');

    await page.reload();
    await openTab(page, 'Settings');
    await expect(page.getByLabel(/gemini api key|api key/i).first()).toHaveValue(
      'AIzaTestKey12345',
    );
    await expect(page.getByText(/configured|saved/i).first()).toBeVisible();
  });

  test('T1-F24-02: API key input masked by default with show/hide toggle', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaTestKey12345');

    const input = page.getByLabel(/gemini api key|api key/i).first();
    await expect(input).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: /show/i }).first().click();
    await expect(input).toHaveAttribute('type', 'text');
    await expect(input).toHaveValue('AIzaTestKey12345');

    await page.getByRole('button', { name: /hide/i }).first().click();
    await expect(input).toHaveAttribute('type', 'password');
  });

  test('T1-F24-03: Clear API key removes stored credential', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await saveGeminiApiKeyInSettings(page, 'AIzaTestKey12345');
    await clearGeminiApiKeyInSettings(page);

    await page.reload();
    await openTab(page, 'Settings');
    await expect(page.getByLabel(/gemini api key|api key/i).first()).toHaveValue('');

    await openTab(page, 'Today');
    const modal = await openAiMealPhotoModal(page);
    await modal.locator('input[type="file"]').setInputFiles(MEAL_SAMPLE_PNG);
    await modal.getByRole('button', { name: /analyze|estimate/i }).first().click();
    await expect(modal.getByText(/api key/i).first()).toBeVisible();
  });

  test('T1-F24-04: Endpoint mode toggle (Direct vs Proxy) persists', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Settings');

    const proxyControl = page
      .getByRole('radio', { name: /proxy/i })
      .or(page.getByRole('button', { name: /proxy/i }))
      .or(page.getByLabel(/proxy/i))
      .first();
    await proxyControl.click();

    const saveBtn = page.getByRole('button', { name: /save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    await reloadReady(page);
    await openTab(page, 'Settings');
    const reloadedProxy = page
      .getByRole('radio', { name: /proxy/i })
      .or(page.getByRole('button', { name: /proxy/i }))
      .or(page.getByLabel(/proxy/i))
      .first();
    await expect(reloadedProxy).toBeVisible();
    const checked = await reloadedProxy.isChecked().catch(() => false);
    const ariaPressed = await reloadedProxy.getAttribute('aria-pressed');
    const ariaChecked = await reloadedProxy.getAttribute('aria-checked');
    const dataActive = await reloadedProxy.getAttribute('data-active');
    const dataState = await reloadedProxy.getAttribute('data-state');
    const hasActiveBadge = await page
      .getByText(/proxy.*active|active.*proxy/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(
      checked ||
        ariaPressed === 'true' ||
        ariaChecked === 'true' ||
        dataActive === 'true' ||
        dataState === 'active' ||
        hasActiveBadge,
    ).toBe(true);
  });

  test('T1-F24-05: Reset / Re-seed restores initial Nov 24-25 state', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');

    await fillAndSaveManualMeal(page, {
      name: 'Temporary Custom Meal',
      calories: 500,
      proteinG: 30,
      carbsG: 50,
      fatG: 15,
      time: '12:00',
    });

    await openTab(page, 'Settings');
    await page
      .getByLabel(/calorie target|daily calories|calories/i)
      .first()
      .fill('2200');
    await page.getByRole('button', { name: /save/i }).first().click();

    await resetToInitialSeedInSettings(page);

    await expect(
      page.getByLabel(/calorie target|daily calories|calories/i).first(),
    ).toHaveValue('1900');

    await openTab(page, 'Today');
    await expect(page.getByText('Temporary Custom Meal')).toHaveCount(0);
    await expect(page.getByText(/\b35\s*kcal|\b35\s*\//i).first()).toBeVisible();

    await selectDateInput(page, '2026-11-24');
    await expect(page.getByText(/2,?318/).first()).toBeVisible();
  });
});
