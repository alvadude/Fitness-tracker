import {
  generateCombinedRemindersIcs,
  generateDailyCheckInIcs,
  generateSaturdayWeighInIcs,
} from '../../domain/ics';
import { formatIsoDateLocal } from '../../domain/training';
import type { AppSettings, IsoDate } from '../../domain/types';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface ReminderTriggerResult {
  dailyTriggered: boolean;
  weeklyTriggered: boolean;
}

export interface ForegroundReminderParams {
  now?: Date;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void | Promise<void>;
}

export interface TestNotificationResult {
  ok: boolean;
  status: NotificationPermissionState;
  message: string;
}

export const DAILY_REMINDER_TITLE = 'Daily Fitness & Macro Check-In';
export const DAILY_REMINDER_BODY =
  "Time to finish logging today's meals and mark your workout.";
export const SATURDAY_REMINDER_TITLE = 'Saturday Weigh-In & Weekly Report';
export const SATURDAY_REMINDER_BODY =
  'Morning weigh-in & weekly progress report ready.';

export const LOCAL_DAILY_REMINDER_KEY = 'fittrack_reminder_daily_date';
export const LOCAL_WEEKLY_REMINDER_KEY = 'fittrack_reminder_weekly_date';

function safeReadLocalStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
  return null;
}

function safeWriteLocalStorage(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
}

function safeRemoveLocalStorage(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
}

export function isNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.Notification !== 'undefined'
  );
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  if (typeof window.Notification.requestPermission !== 'function') {
    return getNotificationPermission();
  }

  return new Promise<NotificationPermissionState>((resolve) => {
    let settled = false;
    const finish = (perm: NotificationPermissionState) => {
      if (!settled) {
        settled = true;
        resolve(perm);
      }
    };

    try {
      const maybePromise = window.Notification.requestPermission((cbPerm) => {
        finish(cbPerm);
      });
      if (
        maybePromise &&
        typeof (maybePromise as Promise<NotificationPermission>).then ===
          'function'
      ) {
        (maybePromise as Promise<NotificationPermission>).then(
          (perm) => finish(perm),
          () => finish(getNotificationPermission()),
        );
      }
    } catch {
      try {
        const result = window.Notification.requestPermission();
        if (
          result &&
          typeof (result as Promise<NotificationPermission>).then === 'function'
        ) {
          (result as Promise<NotificationPermission>).then(
            (perm) => finish(perm),
            () => finish('denied'),
          );
        } else {
          finish(getNotificationPermission());
        }
      } catch {
        finish('denied');
      }
    }
  });
}

export function showAppNotification(
  title: string,
  body: string,
  tag?: string,
): boolean {
  if (!isNotificationSupported() || window.Notification.permission !== 'granted') {
    return false;
  }

  const options: NotificationOptions = tag ? { body, tag } : { body };
  try {
    new window.Notification(title, options);
    return true;
  } catch {
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      navigator.serviceWorker?.ready
    ) {
      void navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, options))
        .catch(() => undefined);
      return true;
    }
    return false;
  }
}

export async function evaluateForegroundReminders(
  params: ForegroundReminderParams,
): Promise<ReminderTriggerResult> {
  const { settings, onUpdateSettings } = params;
  const now = params.now ?? new Date();

  if (!settings.notificationsEnabled || getNotificationPermission() !== 'granted') {
    return { dailyTriggered: false, weeklyTriggered: false };
  }

  const todayIso: IsoDate = formatIsoDateLocal(now);
  const hour = now.getHours();
  const isSaturday = now.getDay() === 6;

  const storedDailyDate = safeReadLocalStorage(LOCAL_DAILY_REMINDER_KEY);
  const storedWeeklyDate = safeReadLocalStorage(LOCAL_WEEKLY_REMINDER_KEY);

  const shouldDaily =
    hour >= 20 &&
    settings.lastDailyReminderDate !== todayIso &&
    storedDailyDate !== todayIso;

  const shouldWeekly =
    isSaturday &&
    hour >= 7 &&
    settings.lastWeeklyReminderDate !== todayIso &&
    storedWeeklyDate !== todayIso;

  let dailyTriggered = false;
  let weeklyTriggered = false;

  if (shouldDaily) {
    safeWriteLocalStorage(LOCAL_DAILY_REMINDER_KEY, todayIso);
    dailyTriggered = showAppNotification(
      DAILY_REMINDER_TITLE,
      DAILY_REMINDER_BODY,
      'fittrack-daily-8pm',
    );
    if (!dailyTriggered) {
      safeRemoveLocalStorage(LOCAL_DAILY_REMINDER_KEY);
    }
  }

  if (shouldWeekly) {
    safeWriteLocalStorage(LOCAL_WEEKLY_REMINDER_KEY, todayIso);
    weeklyTriggered = showAppNotification(
      SATURDAY_REMINDER_TITLE,
      SATURDAY_REMINDER_BODY,
      'fittrack-sat-7am',
    );
    if (!weeklyTriggered) {
      safeRemoveLocalStorage(LOCAL_WEEKLY_REMINDER_KEY);
    }
  }

  if (dailyTriggered || weeklyTriggered) {
    const partial: Partial<AppSettings> = {};
    if (dailyTriggered) {
      partial.lastDailyReminderDate = todayIso;
    }
    if (weeklyTriggered) {
      partial.lastWeeklyReminderDate = todayIso;
    }
    await onUpdateSettings(partial);
  }

  return { dailyTriggered, weeklyTriggered };
}

export async function sendTestNotification(): Promise<TestNotificationResult> {
  if (!isNotificationSupported()) {
    return {
      ok: false,
      status: 'unsupported',
      message:
        'Browser notifications are not supported in this browser. Use the .ics calendar downloads below for reliable reminders.',
    };
  }

  let permission = getNotificationPermission();
  if (permission === 'default') {
    permission = await requestNotificationPermission();
  }

  if (permission !== 'granted') {
    return {
      ok: false,
      status: permission,
      message:
        'Notification permission was not granted. Allow notifications in browser settings or download the .ics calendar reminders below.',
    };
  }

  const delivered = showAppNotification(
    'FitTrack Reminder Test',
    'Notifications are active on this device.',
    'fittrack-test',
  );

  if (!delivered) {
    return {
      ok: false,
      status: permission,
      message:
        'This device blocked direct notifications. Use the .ics calendar reminders below instead.',
    };
  }

  return {
    ok: true,
    status: permission,
    message: 'Test notification sent.',
  };
}

export function triggerTextFileDownload(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadDailyCheckInIcs(): void {
  triggerTextFileDownload(
    'fittrack-daily-8pm.ics',
    generateDailyCheckInIcs(),
    'text/calendar;charset=utf-8',
  );
}

export function downloadSaturdayWeighInIcs(): void {
  triggerTextFileDownload(
    'fittrack-saturday-7am.ics',
    generateSaturdayWeighInIcs(),
    'text/calendar;charset=utf-8',
  );
}

export function downloadCombinedRemindersIcs(): void {
  triggerTextFileDownload(
    'fittrack-reminders.ics',
    generateCombinedRemindersIcs(),
    'text/calendar;charset=utf-8',
  );
}
