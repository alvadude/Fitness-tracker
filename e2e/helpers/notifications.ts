import type { Page } from '@playwright/test';

export type NotificationStubPermission = 'default' | 'granted' | 'denied';

export interface NotificationStubConfig {
  mode: NotificationStubPermission | 'undefined';
  requestPermissionResult?: NotificationStubPermission;
}

export interface CapturedNotification {
  source: 'window' | 'sw';
  title: string;
  body: string;
}

export async function installNotificationStub(
  page: Page,
  config: NotificationStubConfig,
): Promise<void> {
  await page.addInitScript((cfg: NotificationStubConfig) => {
    const win = window as unknown as Record<string, unknown>;
    const captured: CapturedNotification[] = [];
    win.__capturedNotifications = captured;

    if (cfg.mode === 'undefined') {
      try {
        Object.defineProperty(window, 'Notification', {
          configurable: true,
          writable: true,
          value: undefined,
        });
      } catch {
        delete win.Notification;
      }
      return;
    }

    let currentPermission: NotificationStubPermission = cfg.mode;
    const nextResult: NotificationStubPermission =
      cfg.requestPermissionResult ?? 'granted';

    class MockNotification {
      static get permission(): NotificationStubPermission {
        return currentPermission;
      }

      static async requestPermission(): Promise<NotificationStubPermission> {
        currentPermission = nextResult;
        return currentPermission;
      }

      title: string;
      body: string;

      constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        this.body = options?.body ?? '';
        captured.push({
          source: 'window',
          title: this.title,
          body: this.body,
        });
      }

      close(): void {}
    }

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: MockNotification,
    });

    if (typeof ServiceWorkerRegistration !== 'undefined') {
      ServiceWorkerRegistration.prototype.showNotification = async function (
        title: string,
        options?: NotificationOptions,
      ): Promise<void> {
        captured.push({
          source: 'sw',
          title,
          body: options?.body ?? '',
        });
      };
    }
  }, config);
}

export async function getCapturedNotifications(
  page: Page,
): Promise<CapturedNotification[]> {
  return page.evaluate(() => {
    const win = window as unknown as {
      __capturedNotifications?: CapturedNotification[];
    };
    return win.__capturedNotifications ?? [];
  });
}
