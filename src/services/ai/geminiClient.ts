import type { GeminiModelPreference } from '../../domain/types';

export const GEMINI_MODEL = 'gemini-3.8-flash';
export const GEMINI_MODEL_FALLBACK_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
] as const;

export function buildGeminiModelUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const GEMINI_ENDPOINT = buildGeminiModelUrl(GEMINI_MODEL);

export function getModelAttemptOrder(
  preference?: GeminiModelPreference,
): string[] {
  if (!preference || preference === 'auto') {
    return [...GEMINI_MODEL_FALLBACK_CHAIN];
  }
  return [
    preference,
    ...GEMINI_MODEL_FALLBACK_CHAIN.filter((m) => m !== preference),
  ];
}

export function isRetryableFallbackStatus(status: number): boolean {
  return (
    status === 404 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export interface GeminiFallbackFetchOptions {
  apiKey: string;
  modelPreference?: GeminiModelPreference;
  contents: unknown[];
  generationConfig: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface GeminiFallbackFetchResult {
  response: Response;
  modelUsed: string;
  attemptedModels: string[];
}

function buildRequestBody(
  contents: unknown[],
  generationConfig: Record<string, unknown>,
  includeThinkingLow: boolean,
): string {
  const nextConfig = includeThinkingLow
    ? {
        ...generationConfig,
        thinkingConfig: { thinkingLevel: 'LOW' },
      }
    : generationConfig;
  return JSON.stringify({
    contents,
    generationConfig: nextConfig,
  });
}

async function peekErrorText(response: Response): Promise<string> {
  try {
    return await response.clone().text();
  } catch {
    return '';
  }
}

/**
 * Calls Gemini generateContent with automatic fallback across the Flash / Flash-Lite
 * model chain on 503/429/404/5xx errors, using thinkingLevel="LOW" on Gemini 3.x models.
 */
export async function fetchGeminiWithFallback(
  options: GeminiFallbackFetchOptions,
): Promise<GeminiFallbackFetchResult> {
  const models = getModelAttemptOrder(options.modelPreference);
  const attemptedModels: string[] = [];
  let lastResponse: Response | null = null;
  let lastModel = models[0] ?? GEMINI_MODEL;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    attemptedModels.push(model);
    lastModel = model;

    const url = buildGeminiModelUrl(model);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': options.apiKey,
    };
    const supportsThinkingLevel = model.startsWith('gemini-3.');

    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: buildRequestBody(
        options.contents,
        options.generationConfig,
        supportsThinkingLevel,
      ),
      signal: options.signal,
    });

    // If a specific point release rejects thinkingConfig with 400, retry once without thinkingConfig
    if (response.status === 400 && supportsThinkingLevel) {
      const errText = await peekErrorText(response);
      if (/thinking/i.test(errText)) {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: buildRequestBody(
            options.contents,
            options.generationConfig,
            false,
          ),
          signal: options.signal,
        });
      }
    }

    lastResponse = response;

    if (response.ok) {
      return { response, modelUsed: model, attemptedModels };
    }

    // Fail fast on auth errors or client bad-request errors
    if (!isRetryableFallbackStatus(response.status)) {
      return { response, modelUsed: model, attemptedModels };
    }
  }

  return {
    response: lastResponse!,
    modelUsed: lastModel,
    attemptedModels,
  };
}
