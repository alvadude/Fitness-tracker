import { test as base, expect } from '@playwright/test';
import { startStaticServer } from './staticServer.js';

interface WorkerFixtures {
  resolvedBaseUrl: string;
}

export const test = base.extend<object, WorkerFixtures>({
  resolvedBaseUrl: [
    async ({}, use) => {
      const envUrl = process.env.E2E_BASE_URL;
      if (envUrl) {
        await use(envUrl);
        return;
      }
      const handle = await startStaticServer();
      try {
        await use(handle.url);
      } finally {
        await handle.close();
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ resolvedBaseUrl }, use) => {
    await use(resolvedBaseUrl);
  },
});

export { expect };
