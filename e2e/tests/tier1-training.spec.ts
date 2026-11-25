import { test, expect } from '../helpers/testBase.js';
import {
  advanceClockSeconds,
  pauseAppClock,
  resumeAppClock,
  setAppClock,
} from '../helpers/clock.js';
import {
  gotoReady,
  openTab,
  reloadReady,
  selectDateInput,
} from '../helpers/selectors.js';

test.describe('Tier 1 — F13: Weekly Schedule Awareness (Workdays vs Off Days)', () => {
  test('T1-F13-01: Tuesday-Friday displays Workday Active Recovery mode', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00'); // Wednesday
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/workday|active recovery|rest day/i).first()).toBeVisible();
    await expect(page.getByText(/7\+\s*h|7\+\s*hours|sleep/i).first()).toBeVisible();
    await expect(page.getByText(/15[–-]20\s*min|easy.*walk|treadmill/i).first()).toBeVisible();
  });

  test('T1-F13-02: Saturday displays Off Day Lower & Incline Walk mode', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00'); // Saturday
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/Saturday|Lower.*Incline Walk/i).first()).toBeVisible();
    await expect(page.getByText(/Barbell Back Squat/i)).toBeVisible();
  });

  test('T1-F13-03: Sunday displays Off Day Upper Push/Pull mode', async ({ page }) => {
    await setAppClock(page, '2026-11-29T10:00:00'); // Sunday
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/Sunday|Upper Push\/Pull/i).first()).toBeVisible();
    await expect(page.getByText(/Barbell Bench Press/i)).toBeVisible();
  });

  test('T1-F13-04: Monday displays Off Day Full Body & Run mode', async ({ page }) => {
    await setAppClock(page, '2026-11-30T10:00:00'); // Monday
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/Monday|Full Body/i).first()).toBeVisible();
    await expect(page.getByText(/Dumbbell Goblet Squat/i)).toBeVisible();
  });

  test('T1-F13-05: Switching day/date on Training updates schedule view', async ({ page }) => {
    await setAppClock(page, '2026-11-27T10:00:00'); // Friday
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/active recovery|workday/i).first()).toBeVisible();
    await selectDateInput(page, '2026-11-28'); // Saturday

    await expect(page.getByText(/Barbell Back Squat/i)).toBeVisible();
  });
});

test.describe('Tier 1 — F14: Pre-Populated Sat/Sun/Mon Strength Splits', () => {
  test('T1-F14-01: Saturday split pre-populates exact exercises & sets', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/Barbell Back Squat/i)).toBeVisible();
    await expect(page.getByText(/4\s*[x×]\s*6[–-]8/i)).toBeVisible();
    await expect(page.getByText(/Barbell Romanian Deadlift/i)).toBeVisible();
    await expect(page.getByText(/3\s*[x×]\s*8[–-]10/i)).toBeVisible();
    await expect(page.getByText(/Incline Treadmill Walk/i)).toBeVisible();
    await expect(page.getByText(/30\s*min/i).first()).toBeVisible();
    await expect(page.getByText(/6[–-]10\s*%/i).first()).toBeVisible();
  });

  test('T1-F14-02: Sunday split pre-populates exact exercises & sets', async ({ page }) => {
    await setAppClock(page, '2026-11-29T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/Barbell Bench Press/i)).toBeVisible();
    await expect(page.getByText(/4\s*[x×]\s*6[–-]8/i)).toBeVisible();
    await expect(page.getByText(/Barbell Bent-Over Row/i)).toBeVisible();
    await expect(page.getByText(/8[–-]10/).first()).toBeVisible();
    await expect(page.getByText(/Dumbbell Shoulder Press/i)).toBeVisible();
    await expect(page.getByText(/3\s*[x×]\s*10[–-]12/i)).toBeVisible();
  });

  test('T1-F14-03: Monday split pre-populates exact exercises & interval run', async ({ page }) => {
    await setAppClock(page, '2026-11-30T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/Dumbbell Goblet Squat/i)).toBeVisible();
    await expect(page.getByText(/Incline Dumbbell Press/i)).toBeVisible();
    expect(await page.getByText(/3\s*[x×]\s*10[–-]12/i).count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/Treadmill Interval Running/i)).toBeVisible();
    await expect(page.getByText(/20\s*min/i).first()).toBeVisible();
    await expect(page.getByText(/1\s*min\s*jog/i)).toBeVisible();
    await expect(page.getByText(/2\s*min\s*walk/i)).toBeVisible();
  });

  test('T1-F14-04: Home-gym equipment context represented across splits', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await expect(page.getByText(/Barbell/i).first()).toBeVisible();
    await expect(page.getByText(/Treadmill/i).first()).toBeVisible();

    await selectDateInput(page, '2026-11-30');
    await expect(page.getByText(/Dumbbell/i).first()).toBeVisible();
  });

  test('T1-F14-05: Mark workout session complete updates status & Progress count', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const completeBtn = page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first();
    await completeBtn.click();

    await expect(page.getByText(/completed/i).first()).toBeVisible();
    await openTab(page, 'Progress');
    await expect(page.getByText(/1\s*\/\s*3|1\s*of\s*3|1\s*completed/i).first()).toBeVisible();
  });
});

test.describe('Tier 1 — F15: Strength Execution UI & Progressive Overload Lookup', () => {
  test('T1-F15-01: Log weight (kg) and reps for individual sets', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    await squatCard.getByLabel(/weight|kg/i).first().fill('80');
    await squatCard.getByLabel(/reps/i).first().fill('8');
    await squatCard
      .getByRole('checkbox')
      .or(squatCard.getByRole('button', { name: /complete|done/i }))
      .first()
      .click();

    await expect(squatCard.getByLabel(/weight|kg/i).first()).toHaveValue('80');
    await expect(squatCard.getByLabel(/reps/i).first()).toHaveValue('8');
  });

  test('T1-F15-02: Log all 4 sets of an exercise with varying weights/reps', async ({ page }) => {
    await setAppClock(page, '2026-11-29T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const benchCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Bench Press/i })
      .first();
    const weights = benchCard.getByLabel(/weight|kg/i);
    const reps = benchCard.getByLabel(/reps/i);

    const plan = [
      { w: '70', r: '8' },
      { w: '70', r: '8' },
      { w: '70', r: '7' },
      { w: '67.5', r: '8' },
    ];

    for (let i = 0; i < plan.length; i++) {
      await weights.nth(i).fill(plan[i]!.w);
      await reps.nth(i).fill(plan[i]!.r);
    }

    await page.reload();
    await openTab(page, 'Training');

    const reloadedBench = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Bench Press/i })
      .first();
    await expect(reloadedBench.getByLabel(/weight|kg/i).nth(3)).toHaveValue('67.5');
    await expect(reloadedBench.getByLabel(/reps/i).nth(2)).toHaveValue('7');
  });

  test('T1-F15-03: Previous session numbers display inline on next week', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    await squatCard.getByLabel(/weight|kg/i).first().fill('80');
    await squatCard.getByLabel(/reps/i).first().fill('8');
    await squatCard
      .getByRole('checkbox')
      .or(squatCard.getByRole('button', { name: /complete|done/i }))
      .first()
      .click();
    await page
      .getByRole('button', { name: /complete workout|finish workout|mark complete/i })
      .first()
      .click();

    await selectDateInput(page, '2026-12-05'); // Next Saturday
    await expect(page.getByText(/prev.*80.*8|80\s*kg\s*[x×]\s*8/i).first()).toBeVisible();
  });

  test('T1-F15-04: Edit previously logged set updates stored workout', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const squatCard = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    await squatCard.getByLabel(/weight|kg/i).first().fill('80');
    await squatCard.getByLabel(/reps/i).first().fill('8');
    await squatCard.getByLabel(/weight|kg/i).first().fill('82.5');

    await reloadReady(page);
    await openTab(page, 'Training');
    const reloaded = page
      .locator('section, article, div')
      .filter({ hasText: /Barbell Back Squat/i })
      .first();
    await expect(reloaded.getByLabel(/weight|kg/i).first()).toHaveValue('82.5');
  });

  test('T1-F15-05: Workday sleep hours check/log saves cleanly', async ({ page }) => {
    await setAppClock(page, '2026-11-25T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    const sleepInput = page.getByLabel(/sleep/i).first();
    await sleepInput.fill('7.5');
    const saveSleepBtn = page
      .getByRole('button', { name: /save.*sleep|log.*sleep|save recovery/i })
      .first();
    if (await saveSleepBtn.isVisible().catch(() => false)) {
      await saveSleepBtn.click();
    }

    await page.reload();
    await openTab(page, 'Training');
    await expect(page.getByLabel(/sleep/i).first()).toHaveValue('7.5');
  });
});

test.describe('Tier 1 — F16: Treadmill Cardio Logger & Weight-Based Burn Calculator', () => {
  test('T1-F16-01: Benchmark calculation matches ~185 kcal at 84.0 kg', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('22');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('4.5');

    await expect(page.getByText(/185\s*kcal/i).first()).toBeVisible();
  });

  test('T1-F16-02: Workday easy treadmill walk (15-20 min) logs cleanly', async ({ page }) => {
    await setAppClock(page, '2026-11-25T19:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('18');
    await page.getByLabel(/incline/i).first().fill('2');
    await page.getByLabel(/speed/i).first().fill('4.5');
    await page
      .getByRole('button', { name: /log.*walk|log.*cardio|add cardio|save cardio/i })
      .first()
      .click();

    await expect(page.getByText(/18\s*min/i).first()).toBeVisible();
    await page.reload();
    await openTab(page, 'Training');
    await expect(page.getByText(/18\s*min/i).first()).toBeVisible();
  });

  test('T1-F16-03: Saturday 30-min incline walk logs with live burn', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('30');
    await page.getByLabel(/incline/i).first().fill('8');
    await page.getByLabel(/speed/i).first().fill('4.5');
    await page
      .getByRole('button', { name: /log.*walk|log.*cardio|add cardio|save cardio/i })
      .first()
      .click();

    await expect(page.getByText(/30\s*min/i).first()).toBeVisible();
    await expect(page.getByText(/25[0-5]\s*kcal/i).first()).toBeVisible();
  });

  test('T1-F16-04: Monday 20-min interval run (1m jog / 2m walk) logs burn', async ({ page }) => {
    await setAppClock(page, '2026-11-30T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('20');
    const inclineInput = page.getByLabel(/incline/i).first();
    await inclineInput.fill('1');
    const jogInput = page.getByLabel(/jog.*speed/i).first();
    if (await jogInput.isVisible().catch(() => false)) {
      await jogInput.fill('8.0');
      await page.getByLabel(/walk.*speed/i).first().fill('4.5');
    } else {
      await page.getByLabel(/speed/i).first().fill('6.5');
    }

    await page
      .getByRole('button', { name: /log.*run|log.*cardio|add cardio|save cardio/i })
      .first()
      .click();

    await expect(page.getByText(/20\s*min/i).first()).toBeVisible();
  });

  test('T1-F16-05: Live calorie burn scales dynamically with input changes', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await page.goto('/');
    await openTab(page, 'Training');

    await page.getByLabel(/duration/i).first().fill('15');
    await page.getByLabel(/incline/i).first().fill('2');
    await page.getByLabel(/speed/i).first().fill('4.5');

    const previewRegion = page.getByText(/estimated|burn/i).first().locator('..');
    const initialText = await previewRegion.innerText();
    const initialKcal = Number(initialText.match(/(\d+)\s*kcal/i)?.[1] ?? '0');

    await page.getByLabel(/duration/i).first().fill('30');
    await page.getByLabel(/incline/i).first().fill('10');

    const updatedText = await previewRegion.innerText();
    const updatedKcal = Number(updatedText.match(/(\d+)\s*kcal/i)?.[1] ?? '0');

    expect(updatedKcal).toBeGreaterThan(initialKcal);
  });
});

test.describe('Tier 1 — F17: Built-In Workout Rest Timer (90s / 2m / 3m)', () => {
  test('T1-F17-01: 90s preset starts 01:30 countdown', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /90s/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    await expect(page.getByText('01:30').first()).toBeVisible();
    await advanceClockSeconds(page, 2);
    await expect(page.getByText('01:28').first()).toBeVisible();
    await resumeAppClock(page);
  });

  test('T1-F17-02: 2m preset starts 02:00 countdown', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /2m/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    await expect(page.getByText('02:00').first()).toBeVisible();
    await advanceClockSeconds(page, 3);
    await expect(page.getByText('01:57').first()).toBeVisible();
    await resumeAppClock(page);
  });

  test('T1-F17-03: 3m preset starts 03:00 countdown', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /3m/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    await expect(page.getByText('03:00').first()).toBeVisible();
    await advanceClockSeconds(page, 5);
    await expect(page.getByText('02:55').first()).toBeVisible();
    await resumeAppClock(page);
  });

  test('T1-F17-04: Pause and Resume preserve exact remaining seconds', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /90s/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    await advanceClockSeconds(page, 10);
    await expect(page.getByText('01:20').first()).toBeVisible();

    await page.getByRole('button', { name: /pause/i }).first().click();
    await advanceClockSeconds(page, 5);
    await expect(page.getByText('01:20').first()).toBeVisible();

    await page.getByRole('button', { name: /resume|start/i }).first().click();
    await advanceClockSeconds(page, 1);
    await expect(page.getByText('01:19').first()).toBeVisible();
    await resumeAppClock(page);
  });

  test('T1-F17-05: +15s and Reset controls adjust timer accurately', async ({ page }) => {
    await setAppClock(page, '2026-11-28T10:00:00');
    await gotoReady(page);
    await openTab(page, 'Training');
    await pauseAppClock(page, '2026-11-28T10:00:00');

    await page.getByRole('button', { name: /90s/i }).first().click();
    const startBtn = page.getByRole('button', { name: /^start$/i }).first();
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
    }

    await advanceClockSeconds(page, 30);
    await expect(page.getByText('01:00').first()).toBeVisible();

    await page.getByRole('button', { name: /\+15s/i }).first().click();
    await expect(page.getByText('01:15').first()).toBeVisible();

    await page.getByRole('button', { name: /reset/i }).first().click();
    await expect(page.getByText(/01:30|00:00/).first()).toBeVisible();
    await resumeAppClock(page);
  });
});
