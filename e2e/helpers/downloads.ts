import fs from 'node:fs';
import type { Download, Page } from '@playwright/test';

export interface CapturedDownload {
  filename: string;
  content: string;
  filePath: string | null;
}

export async function captureDownload(
  page: Page,
  trigger: () => Promise<void>,
): Promise<CapturedDownload> {
  const [download]: [Download, void] = await Promise.all([
    page.waitForEvent('download'),
    trigger(),
  ]);

  const filename = download.suggestedFilename();
  const filePath = await download.path();
  let content = '';

  if (filePath && fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  } else {
    const stream = await download.createReadStream();
    if (stream) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      content = Buffer.concat(chunks).toString('utf8');
    }
  }

  return { filename, content, filePath };
}
