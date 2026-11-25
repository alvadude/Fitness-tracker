export interface ResizedImageResult {
  base64: string;
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
  originalSizeBytes: number;
  resizedSizeBytes: number;
}

export interface ResizeImageOptions {
  maxDimension?: number;
  quality?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_DIMENSION = 1024;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_TIMEOUT_MS = 5000;

export function extractBase64FromDataUrl(dataUrl: string): {
  base64: string;
  mimeType: string;
} {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    return {
      base64: dataUrl.trim(),
      mimeType: 'image/jpeg',
    };
  }

  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1).trim();
  const mimeMatch = /^data:([^;]+);base64$/i.exec(header.trim());
  const mimeType = mimeMatch?.[1]?.toLowerCase() || 'image/jpeg';
  return { base64, mimeType };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read image as data URL.'));
        }
      };
      reader.onerror = () => {
        reject(new Error('Failed to read image file.'));
      };
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const mimeType = blob.type || 'image/jpeg';
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

function isCanvasResizeSupported(): boolean {
  if (
    typeof document === 'undefined' ||
    typeof HTMLCanvasElement === 'undefined'
  ) {
    return false;
  }
  if (
    typeof navigator !== 'undefined' &&
    /jsdom/i.test(navigator.userAgent ?? '')
  ) {
    return false;
  }
  return true;
}

async function decodeImageFromDataUrl(
  dataUrl: string,
  timeoutMs: number,
): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timed out while decoding meal image.'));
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Unable to decode image for resizing.'));
      }
    };
    img.src = dataUrl;
  });
}

function estimateDecodedByteLength(base64: string): number {
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export async function resizeImageForAi(
  file: Blob,
  options: ResizeImageOptions = {},
): Promise<ResizedImageResult> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file.');
  }
  if (file.size === 0) {
    throw new Error('Selected image file is empty.');
  }

  const maxDimension =
    options.maxDimension && options.maxDimension > 0
      ? options.maxDimension
      : DEFAULT_MAX_DIMENSION;
  const quality =
    options.quality !== undefined &&
    options.quality > 0 &&
    options.quality <= 1
      ? options.quality
      : DEFAULT_QUALITY;
  const timeoutMs =
    options.timeoutMs && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const dataUrl = await blobToDataUrl(file);
  const extracted = extractBase64FromDataUrl(dataUrl);
  const fallbackMime = file.type || extracted.mimeType || 'image/jpeg';

  const fallbackResult: ResizedImageResult = {
    base64: extracted.base64,
    mimeType: fallbackMime,
    dataUrl,
    width: 0,
    height: 0,
    originalSizeBytes: file.size,
    resizedSizeBytes: Math.max(
      estimateDecodedByteLength(extracted.base64),
      file.size,
    ),
  };

  if (!isCanvasResizeSupported()) {
    return fallbackResult;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    let drawable: CanvasImageSource;
    let srcWidth = 0;
    let srcHeight = 0;

    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
      drawable = bitmap;
      srcWidth = bitmap.width;
      srcHeight = bitmap.height;
    } else {
      const img = await decodeImageFromDataUrl(dataUrl, timeoutMs);
      drawable = img;
      srcWidth = img.naturalWidth || img.width;
      srcHeight = img.naturalHeight || img.height;
    }

    if (srcWidth <= 0 || srcHeight <= 0) {
      return fallbackResult;
    }

    const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
    const targetWidth = Math.max(1, Math.round(srcWidth * scale));
    const targetHeight = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return fallbackResult;
    }

    ctx.drawImage(drawable, 0, 0, targetWidth, targetHeight);
    const resizedDataUrl = canvas.toDataURL('image/jpeg', quality);
    const resizedExtracted = extractBase64FromDataUrl(resizedDataUrl);
    if (!resizedExtracted.base64) {
      return fallbackResult;
    }

    return {
      base64: resizedExtracted.base64,
      mimeType: 'image/jpeg',
      dataUrl: resizedDataUrl,
      width: targetWidth,
      height: targetHeight,
      originalSizeBytes: file.size,
      resizedSizeBytes: estimateDecodedByteLength(resizedExtracted.base64),
    };
  } catch {
    return fallbackResult;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}
