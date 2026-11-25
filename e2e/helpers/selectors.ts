import { expect, type Locator, type Page } from '@playwright/test';

export type NavTabName = 'Today' | 'Training' | 'Progress' | 'Settings';

export const CAFFEINE_WARNING_RE =
  /caffeine warning|after (?:6:00\s*PM|18:00|\d{1,2}:00)|disrupt.*sleep|protect.*sleep|caffeine intake|avoid caffeine|late.*caffeine/i;

export async function waitForAppHydration(page: Page): Promise<void> {
  await expect(page.getByRole('navigation').first()).toBeVisible();
  const loading = page.getByText(/Loading fitness data/i);
  if (await loading.isVisible().catch(() => false)) {
    await expect(loading).toBeHidden();
  }
}

export async function dismissSaturdayWeighInIfOpen(page: Page): Promise<void> {
  await waitForAppHydration(page);
  const weighInDialog = page
    .getByRole('dialog')
    .filter({ hasText: /weigh-in|fasted weight/i })
    .first();
  if (await weighInDialog.isVisible().catch(() => false)) {
    const dismissBtn = weighInDialog
      .getByRole('button', { name: /later|skip|dismiss|close|cancel|×/i })
      .first();
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click();
      await expect(weighInDialog).toBeHidden();
    }
  }
}

export async function gotoReady(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await waitForAppHydration(page);
  // Allow post-hydration Saturday weigh-in modal effect (if any) to mount
  await page.waitForTimeout(80);
  await dismissSaturdayWeighInIfOpen(page);
}

export async function reloadReady(page: Page): Promise<void> {
  await page.reload();
  await waitForAppHydration(page);
  await page.waitForTimeout(80);
  await dismissSaturdayWeighInIfOpen(page);
}

export function getWeeklyReportCard(page: Page): Locator {
  return page
    .locator('main')
    .locator('section, article, div')
    .filter({ hasText: /Weekly Report/i })
    .filter({ hasText: /trajectory|adherence|Week\s*\d|logged/i })
    .last();
}

export function getNavRegion(page: Page): Locator {
  return page.getByRole('navigation').first();
}

export function getNavTab(page: Page, tab: NavTabName): Locator {
  const nav = getNavRegion(page);
  const pattern = new RegExp(`^\\s*${tab}\\s*$`, 'i');
  return nav
    .getByRole('button', { name: pattern })
    .or(nav.getByRole('link', { name: pattern }))
    .or(nav.getByRole('tab', { name: pattern }));
}

export async function openTab(page: Page, tab: NavTabName): Promise<void> {
  await dismissSaturdayWeighInIfOpen(page);
  const control = getNavTab(page, tab).first();
  await expect(control).toBeVisible();
  await control.click();
  await expect(
    page.getByRole('heading', { name: new RegExp(tab, 'i') }).first(),
  ).toBeVisible();
}

export async function selectDateInput(page: Page, dateIso: string): Promise<void> {
  const dateInput = page
    .locator('input[type="date"]')
    .or(page.getByLabel(/date/i))
    .first();
  await expect(dateInput).toBeVisible();
  await dateInput.fill(dateIso);
}

export async function openQuickAddSheet(page: Page): Promise<Locator> {
  await dismissSaturdayWeighInIfOpen(page);
  const btn = page
    .getByRole('button', { name: /quick[- ]add/i })
    .first();
  await expect(btn).toBeVisible();
  await btn.click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function openManualMealForm(page: Page): Promise<Locator> {
  await dismissSaturdayWeighInIfOpen(page);
  const trigger = page
    .getByRole('button', { name: /manual|add meal|log meal|\+ meal/i })
    .first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog').last();
  if (await dialog.isVisible().catch(() => false)) {
    return dialog;
  }
  return page.locator('main').first();
}

export async function fillAndSaveManualMeal(
  page: Page,
  meal: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    time?: string;
    caffeinated?: boolean;
    notes?: string;
  },
): Promise<void> {
  const container = await openManualMealForm(page);
  await container.getByLabel(/meal name|food name|^name$/i).first().fill(meal.name);
  await container.getByLabel(/calories|kcal/i).first().fill(String(meal.calories));
  await container.getByLabel(/protein/i).first().fill(String(meal.proteinG));
  await container.getByLabel(/carbs|carbohydrates/i).first().fill(String(meal.carbsG));
  await container.getByLabel(/fat/i).first().fill(String(meal.fatG));

  if (meal.time) {
    const timeField = container.getByLabel(/time/i).first();
    if (await timeField.isVisible().catch(() => false)) {
      await timeField.fill(meal.time);
    }
  }

  if (typeof meal.caffeinated === 'boolean') {
    const caffCheckbox = container.getByLabel(/caffeine|caffeinated/i).first();
    if (await caffCheckbox.isVisible().catch(() => false)) {
      const checked = await caffCheckbox.isChecked();
      if (checked !== meal.caffeinated) {
        await caffCheckbox.click();
      }
    }
  }

  if (meal.notes) {
    const notesField = container.getByLabel(/note|notes/i).first();
    if (await notesField.isVisible().catch(() => false)) {
      await notesField.fill(meal.notes);
    }
  }

  await container
    .getByRole('button', { name: /save|add meal|log meal|submit/i })
    .first()
    .click();
}

export async function openAiMealPhotoModal(page: Page): Promise<Locator> {
  await dismissSaturdayWeighInIfOpen(page);
  const btn = page
    .getByRole('button', { name: /photo|ai meal|scan meal|estimate/i })
    .first();
  await expect(btn).toBeVisible();
  await btn.click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function clickSetCompleteControl(
  exerciseCard: Locator,
  setIndex: number,
): Promise<void> {
  const control = exerciseCard
    .getByRole('checkbox')
    .or(
      exerciseCard.getByRole('button', {
        name: /complete\s*set|mark\s*set|set\s*\d+.*(?:complete|done)|^(?:complete|done)$/i,
      }),
    )
    .nth(setIndex);
  await expect(control).toBeVisible();
  const checked = await control.isChecked().catch(() => false);
  if (!checked) {
    await control.click();
  }
}

export async function saveGeminiApiKeyInSettings(
  page: Page,
  apiKey: string,
): Promise<void> {
  await openTab(page, 'Settings');
  const input = page.getByLabel(/gemini api key|api key/i).first();
  await expect(input).toBeVisible();
  await input.fill(apiKey);
  const saveKeyBtn = page
    .getByRole('button', { name: /save key|save api key|save settings|save/i })
    .first();
  await saveKeyBtn.click();
}

export async function clearGeminiApiKeyInSettings(page: Page): Promise<void> {
  await openTab(page, 'Settings');
  const clearBtn = page
    .getByRole('button', { name: /clear key|remove key/i })
    .first();
  await expect(clearBtn).toBeVisible();
  await clearBtn.click();
}

export async function resetToInitialSeedInSettings(page: Page): Promise<void> {
  await openTab(page, 'Settings');
  const resetBtn = page
    .getByRole('button', { name: /reset.*seed|re-seed|reset data/i })
    .first();
  await expect(resetBtn).toBeVisible();
  await resetBtn.click();
  const confirmBtn = page
    .getByRole('button', { name: /confirm|yes, reset|reset now/i })
    .first();
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }
}

export async function logWeighInOnProgress(
  page: Page,
  weightKg: number,
  options?: { dateIso?: string; note?: string; fasted?: boolean },
): Promise<void> {
  await openTab(page, 'Progress');
  const trigger = page
    .getByRole('button', { name: /log weigh-in|add weigh-in|weigh in/i })
    .first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog').last();
  const scope = (await dialog.isVisible().catch(() => false))
    ? dialog
    : page.locator('main').first();

  await scope.getByLabel(/weight/i).first().fill(String(weightKg));
  if (options?.dateIso) {
    const dateInput = scope.getByLabel(/date/i).first();
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill(options.dateIso);
    }
  }
  if (options?.note) {
    const noteInput = scope.getByLabel(/note/i).first();
    if (await noteInput.isVisible().catch(() => false)) {
      await noteInput.fill(options.note);
    }
  }
  if (typeof options?.fasted === 'boolean') {
    const fastedBox = scope.getByLabel(/fasted/i).first();
    if (await fastedBox.isVisible().catch(() => false)) {
      const checked = await fastedBox.isChecked();
      if (checked !== options.fasted) {
        await fastedBox.click();
      }
    }
  }
  await scope
    .getByRole('button', { name: /save|submit|log weigh-in/i })
    .first()
    .click();
  if (weightKg >= 30 && weightKg <= 300) {
    await expect(dialog).toBeHidden();
  }
}
