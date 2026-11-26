import type { MacroTotals, MealItemBreakdown } from '../../domain/types';
import { getStoredGeminiApiKey } from '../storage';

export const GEMINI_MODEL = 'gemini-3.8-flash';
export const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
export const PROXY_ENDPOINT = '/api/analyze-meal';
export const PORTION_MULTIPLIERS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type MealEstimatorErrorCode =
  | 'MISSING_API_KEY'
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'EMPTY_RESULT';

export class MealEstimatorError extends Error {
  readonly code: MealEstimatorErrorCode;
  readonly status?: number;
  readonly actionableHint: string;

  constructor(
    code: MealEstimatorErrorCode,
    message: string,
    options: { status?: number; actionableHint: string },
  ) {
    super(message);
    this.name = 'MealEstimatorError';
    this.code = code;
    this.status = options.status;
    this.actionableHint = options.actionableHint;
  }
}

export interface EstimateMealInput {
  imageBase64: string;
  mimeType: string;
  contextText?: string;
  apiKey?: string;
  endpointMode?: 'direct' | 'proxy';
  signal?: AbortSignal;
}

export interface EstimateMealResult {
  mealName: string;
  items: MealItemBreakdown[];
  totals: MacroTotals;
  notes?: string;
}

export const GEMINI_MEAL_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['mealName', 'items'],
  properties: {
    mealName: {
      type: 'STRING',
      description: 'Short descriptive name for the overall meal.',
    },
    notes: {
      type: 'STRING',
      description: 'Brief nutrition or portion estimation caveats if helpful.',
    },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: [
          'name',
          'portion',
          'calories',
          'proteinG',
          'carbsG',
          'fatG',
        ],
        properties: {
          name: { type: 'STRING' },
          portion: { type: 'STRING' },
          calories: { type: 'NUMBER' },
          proteinG: { type: 'NUMBER' },
          carbsG: { type: 'NUMBER' },
          fatG: { type: 'NUMBER' },
        },
      },
    },
  },
} as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function resolveGeminiApiKey(explicitKey?: string): string {
  const fromArg = explicitKey?.trim();
  if (fromArg) {
    return fromArg;
  }

  const fromStorage = getStoredGeminiApiKey().trim();
  if (fromStorage) {
    return fromStorage;
  }

  const fromEnv =
    typeof import.meta !== 'undefined' &&
    typeof import.meta.env?.VITE_GEMINI_API_KEY === 'string'
      ? import.meta.env.VITE_GEMINI_API_KEY.trim()
      : '';

  return fromEnv;
}

export function buildMealEstimationPrompt(contextText?: string): string {
  const basePrompt = [
    'Analyze the meal in this photo and estimate every visible food or drink item.',
    'Return realistic portion sizes (e.g. "150g", "1 cup", "2 tbsp") and macros (calories, proteinG, carbsG, fatG) for each item.',
    'Keep all macro numbers non-negative. Return valid JSON matching the schema.',
  ].join(' ');

  const trimmedContext = contextText?.trim();
  if (!trimmedContext) {
    return basePrompt;
  }

  return `${basePrompt} Additional user context: ${trimmedContext}`;
}

export function sumMealItemMacros(
  items: readonly MealItemBreakdown[],
): MacroTotals {
  let calories = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;

  for (const item of items) {
    calories += item.calories;
    proteinG += item.proteinG;
    carbsG += item.carbsG;
    fatG += item.fatG;
  }

  return {
    calories: Math.round(calories),
    proteinG: round1(proteinG),
    carbsG: round1(carbsG),
    fatG: round1(fatG),
  };
}

export function scaleMealItems(
  items: readonly MealItemBreakdown[],
  multiplier: number,
): MealItemBreakdown[] {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error('Portion multiplier must be greater than 0.');
  }

  return items.map((item) => ({
    name: item.name,
    portion: item.portion,
    calories: Math.round(item.calories * multiplier),
    proteinG: round1(item.proteinG * multiplier),
    carbsG: round1(item.carbsG * multiplier),
    fatG: round1(item.fatG * multiplier),
  }));
}

function stripJsonCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function isValidNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeParsedPayload(candidate: unknown): EstimateMealResult {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new MealEstimatorError(
      'MALFORMED_RESPONSE',
      'AI response was not a structured meal object.',
      {
        actionableHint:
          'Retry the photo analysis or add context like portion sizes.',
      },
    );
  }

  const record = candidate as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    throw new MealEstimatorError(
      'MALFORMED_RESPONSE',
      'AI response is missing the items breakdown array.',
      {
        actionableHint:
          'Retry the photo analysis with a clearer photo of the meal.',
      },
    );
  }

  if (record.items.length === 0) {
    throw new MealEstimatorError(
      'EMPTY_RESULT',
      'No food items were detected in the photo.',
      {
        actionableHint:
          'Try a closer photo or add context describing what is on the plate.',
      },
    );
  }

  const items: MealItemBreakdown[] = record.items.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new MealEstimatorError(
        'MALFORMED_RESPONSE',
        `Item #${index + 1} in AI response is invalid.`,
        {
          actionableHint: 'Retry the photo analysis.',
        },
      );
    }

    const item = rawItem as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) {
      throw new MealEstimatorError(
        'MALFORMED_RESPONSE',
        `Item #${index + 1} is missing a food name.`,
        {
          actionableHint: 'Retry the photo analysis.',
        },
      );
    }

    if (
      !isValidNonNegativeFinite(item.calories) ||
      !isValidNonNegativeFinite(item.proteinG) ||
      !isValidNonNegativeFinite(item.carbsG) ||
      !isValidNonNegativeFinite(item.fatG)
    ) {
      throw new MealEstimatorError(
        'MALFORMED_RESPONSE',
        `Item "${name}" returned invalid macro values.`,
        {
          actionableHint: 'Retry the photo analysis.',
        },
      );
    }

    const rawPortion =
      typeof item.portion === 'string' ? item.portion.trim() : '';

    return {
      name,
      portion: rawPortion || '1 serving',
      calories: Math.round(item.calories),
      proteinG: round1(item.proteinG),
      carbsG: round1(item.carbsG),
      fatG: round1(item.fatG),
    };
  });

  const rawMealName =
    typeof record.mealName === 'string' ? record.mealName.trim() : '';
  const mealName = rawMealName || items[0].name || 'Estimated Meal';
  const notes =
    typeof record.notes === 'string' && record.notes.trim()
      ? record.notes.trim()
      : undefined;

  return {
    mealName,
    items,
    totals: sumMealItemMacros(items),
    notes,
  };
}

export function parseMealEstimatePayload(rawJson: unknown): EstimateMealResult {
  if (typeof rawJson === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonCodeFences(rawJson));
    } catch {
      throw new MealEstimatorError(
        'MALFORMED_RESPONSE',
        'Failed to parse AI meal JSON response.',
        {
          actionableHint: 'Retry the analysis or enter macros manually.',
        },
      );
    }
    return normalizeParsedPayload(parsed);
  }

  if (rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson)) {
    const obj = rawJson as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return normalizeParsedPayload(obj);
    }

    if (Array.isArray(obj.candidates)) {
      const firstCandidate = obj.candidates[0] as
        | { content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }
        | undefined;
      const parts = firstCandidate?.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) {
        throw new MealEstimatorError(
          'MALFORMED_RESPONSE',
          'Gemini returned an empty candidate response.',
          {
            actionableHint: 'Retry the photo analysis.',
          },
        );
      }
      const joinedText = parts
        .filter((p) => p?.thought !== true)
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();

      if (!joinedText) {
        throw new MealEstimatorError(
          'MALFORMED_RESPONSE',
          'Gemini candidate did not contain JSON text.',
          {
            actionableHint: 'Retry the photo analysis.',
          },
        );
      }

      return parseMealEstimatePayload(joinedText);
    }
  }

  throw new MealEstimatorError(
    'MALFORMED_RESPONSE',
    'Unexpected response structure from AI meal estimator.',
    {
      actionableHint: 'Retry the photo analysis or log macros manually.',
    },
  );
}

async function extractErrorMessage(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (typeof json.error === 'string' && json.error.trim()) {
        return json.error.trim();
      }
      if (
        json.error &&
        typeof json.error === 'object' &&
        typeof (json.error as Record<string, unknown>).message === 'string'
      ) {
        return ((json.error as Record<string, unknown>).message as string).trim();
      }
    } catch {
      return text.slice(0, 200);
    }
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    return null;
  }
  return null;
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

function buildHttpError(
  status: number,
  upstreamMessage: string | null,
  endpointMode: 'direct' | 'proxy' = 'direct',
): MealEstimatorError {
  if (status === 401 || status === 403) {
    return new MealEstimatorError(
      'AUTH_ERROR',
      upstreamMessage ||
        (endpointMode === 'proxy'
          ? 'Server proxy Gemini API key was rejected.'
          : 'Gemini API key was rejected.'),
      {
        status,
        actionableHint:
          endpointMode === 'proxy'
            ? 'Check the server GEMINI_API_KEY configuration or switch to Direct mode.'
            : 'Verify or replace your Gemini API key below or in the Settings tab.',
      },
    );
  }
  if (status === 429) {
    return new MealEstimatorError(
      'RATE_LIMITED',
      upstreamMessage || 'Gemini rate limit exceeded.',
      {
        status,
        actionableHint: 'Wait a few seconds and retry analyzing the meal.',
      },
    );
  }
  if (status >= 500) {
    return new MealEstimatorError(
      'SERVER_ERROR',
      upstreamMessage || 'Meal estimation service is temporarily unavailable.',
      {
        status,
        actionableHint: 'Retry shortly or use manual macro entry.',
      },
    );
  }
  return new MealEstimatorError(
    'HTTP_ERROR',
    upstreamMessage || `Request failed with status ${status}.`,
    {
      status,
      actionableHint: 'Check your photo and retry, or enter macros manually.',
    },
  );
}

export async function estimateMealFromImage(
  input: EstimateMealInput,
): Promise<EstimateMealResult> {
  const mode = input.endpointMode ?? 'direct';
  const mimeType = input.mimeType?.trim() || 'image/jpeg';

  let url: string;
  let headers: Record<string, string>;
  let body: string;

  if (mode === 'proxy') {
    url = PROXY_ENDPOINT;
    headers = {
      'Content-Type': 'application/json',
    };
    body = JSON.stringify({
      imageBase64: input.imageBase64,
      mimeType,
      contextText: input.contextText?.trim() || undefined,
    });
  } else {
    const apiKey = resolveGeminiApiKey(input.apiKey);
    if (!apiKey) {
      throw new MealEstimatorError(
        'MISSING_API_KEY',
        'No Gemini API key is configured.',
        {
          actionableHint:
            'Add your Gemini API key below or in the Settings tab (or switch endpoint mode to Proxy).',
        },
      );
    }

    url = GEMINI_ENDPOINT;
    headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
    body = JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildMealEstimationPrompt(input.contextText) },
            {
              inlineData: {
                mimeType,
                data: input.imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_MEAL_RESPONSE_SCHEMA,
      },
    });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: input.signal,
    });
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new MealEstimatorError(
      'NETWORK_ERROR',
      'Unable to reach the meal estimator service.',
      {
        actionableHint: 'Check your internet connection and retry.',
      },
    );
  }

  if (!response.ok) {
    const upstreamMsg = await extractErrorMessage(response);
    throw buildHttpError(response.status, upstreamMsg, mode);
  }

  let jsonPayload: unknown;
  try {
    jsonPayload = await response.json();
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new MealEstimatorError(
      'MALFORMED_RESPONSE',
      'Received non-JSON response from meal estimator.',
      {
        actionableHint: 'Retry the analysis or log macros manually.',
      },
    );
  }

  return parseMealEstimatePayload(jsonPayload);
}
