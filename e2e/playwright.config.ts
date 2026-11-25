import { defineConfig } from '@playwright/test';

const chromePath =
  process.env.E2E_CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    acceptDownloads: true,
    locale: 'en-US',
    timezoneId: 'Asia/Manila',
    colorScheme: 'dark',
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
    launchOptions: {
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    },
  },
});
