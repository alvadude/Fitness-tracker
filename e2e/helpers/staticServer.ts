import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_DIST_DIR = path.resolve(__dirname, '../../dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

function getMimeType(filePath: string): string {
  const base = path.basename(filePath);
  if (base === '_redirects') {
    return 'text/plain; charset=utf-8';
  }
  if (base === 'manifest.json') {
    return 'application/manifest+json; charset=utf-8';
  }
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function sendFile(res: ServerResponse, filePath: string): void {
  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Content-Length': data.byteLength,
    'Cache-Control': 'no-cache',
  });
  res.end(data);
}

export async function startStaticServer(
  distDir: string = DEFAULT_DIST_DIR,
): Promise<StaticServerHandle> {
  const resolvedRoot = path.resolve(distDir);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(
      `Static server root directory does not exist: ${resolvedRoot}. Run "npm run build" at project root first or set E2E_BASE_URL.`,
    );
  }

  const indexHtmlPath = path.join(resolvedRoot, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`Missing index.html in static server root: ${indexHtmlPath}`);
  }

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url ?? '/';
    const urlPath = rawUrl.split('?')[0] ?? '/';

    // Mirror Cloudflare Pages /api/* boundary -> 404 when no Pages Function handles it
    if (urlPath === '/api' || urlPath.startsWith('/api/')) {
      const body = JSON.stringify({ error: 'Not found' });
      res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(urlPath);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    const relativePath = decodedPath.replace(/^\/+/, '');
    const candidatePath = path.resolve(resolvedRoot, relativePath);

    // Block path traversal outside distDir
    if (
      candidatePath !== resolvedRoot &&
      !candidatePath.startsWith(resolvedRoot + path.sep)
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      sendFile(res, candidatePath);
      return;
    }

    // If path points to a directory with index.html
    const dirIndex = path.join(candidatePath, 'index.html');
    if (fs.existsSync(dirIndex) && fs.statSync(dirIndex).isFile()) {
      sendFile(res, dirIndex);
      return;
    }

    // If request looks like a missing static asset (e.g. .js, .css, .png), return 404
    const ext = path.extname(decodedPath);
    if (ext && ext !== '.html') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    // SPA fallback matching public/_redirects ("/* /index.html 200")
    sendFile(res, indexHtmlPath);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Failed to resolve static server port');
  }

  const url = `http://127.0.0.1:${addr.port}`;

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close(() => resolve());
    });

  return { url, port: addr.port, close };
}
