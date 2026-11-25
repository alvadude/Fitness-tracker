import type { Page } from '@playwright/test';

/**
 * Normalizes a local Asia/Manila ISO wall-clock timestamp (e.g. "2026-11-25T17:59:00")
 * into a Date with explicit +08:00 offset matching playwright.config.ts timezoneId.
 */
export function manilaDate(localIso: string): Date {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(localIso)) {
    return new Date(localIso);
  }
  return new Date(`${localIso}+08:00`);
}

/**
 * Pins Date.now() / new Date() without pausing setTimeout/setInterval timers,
 * keeping IndexedDB/React async updates smooth while keeping date/time deterministic.
 */
export async function setAppClock(page: Page, localIso: string): Promise<void> {
  await page.clock.setFixedTime(manilaDate(localIso));
}

/**
 * Installs fake timers + fixed initial time for countdown timer tests (90s / 2m / 3m).
 */
export async function installFakeClock(
  page: Page,
  localIso = '2026-11-28T10:00:00',
): Promise<void> {
  await page.clock.install({ time: manilaDate(localIso) });
}

/**
 * Advances fake timers and Date by `ms` milliseconds, triggering pending timer ticks.
 */
export async function advanceClockMs(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

export async function advanceClockSeconds(page: Page, seconds: number): Promise<void> {
  await page.clock.runFor(seconds * 1_000);
}

/**
 * Freezes timers at `localIso` after initial app/SW hydration so Rest Timer ticks
 * can be driven deterministically without stalling Service Worker / IndexedDB startup.
 */
export async function pauseAppClock(
  page: Page,
  localIso = '2026-11-28T10:00:00',
): Promise<void> {
  await page.clock.pauseAt(manilaDate(localIso));
}

/**
 * Resumes real timers after Rest Timer assertions before reloads or SW operations.
 */
export async function resumeAppClock(page: Page): Promise<void> {
  await page.clock.resume();
}
