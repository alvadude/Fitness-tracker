import type { Page, Request, Route } from '@playwright/test';
import {
  GEMINI_429_BODY,
  GEMINI_500_BODY,
  GEMINI_EMPTY_ITEMS_PAYLOAD,
  GEMINI_MALFORMED_TEXT_RESPONSE,
  type GeminiMealPayload,
  buildGeminiSuccessResponse,
} from '../fixtures/gemini-responses.js';

export type GeminiMockBehavior =
  | { kind: 'success'; payload: GeminiMealPayload }
  | { kind: 'empty' }
  | { kind: 'malformed' }
  | { kind: 'status'; status: 429 | 500; body?: unknown }
  | { kind: 'abort'; errorCode?: string };

export interface CapturedAiRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  rawBody: string;
  parsedBody: unknown;
}

export interface AiRouteController {
  requests: CapturedAiRequest[];
  setBehavior: (next: GeminiMockBehavior) => void;
  unroute: () => Promise<void>;
}

const GEMINI_PATTERN = '**/v1beta/models/gemini-2.5-flash*';
const PROXY_PATTERN = '**/api/analyze-meal*';

function parseBodySafe(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function mockAiEndpoints(
  page: Page,
  initialBehavior: GeminiMockBehavior,
): Promise<AiRouteController> {
  let behavior: GeminiMockBehavior = initialBehavior;
  const requests: CapturedAiRequest[] = [];

  const handler = async (route: Route, request: Request) => {
    const rawBody = request.postData() ?? '';
    requests.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      rawBody,
      parsedBody: parseBodySafe(rawBody),
    });

    if (behavior.kind === 'abort') {
      await route.abort(behavior.errorCode ?? 'internetdisconnected');
      return;
    }

    if (behavior.kind === 'status') {
      const body =
        behavior.body ??
        (behavior.status === 429 ? GEMINI_429_BODY : GEMINI_500_BODY);
      await route.fulfill({
        status: behavior.status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }

    if (behavior.kind === 'malformed') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(GEMINI_MALFORMED_TEXT_RESPONSE),
      });
      return;
    }

    if (behavior.kind === 'empty') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildGeminiSuccessResponse(GEMINI_EMPTY_ITEMS_PAYLOAD),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildGeminiSuccessResponse(behavior.payload)),
    });
  };

  await page.route(GEMINI_PATTERN, handler);
  await page.route(PROXY_PATTERN, handler);

  return {
    requests,
    setBehavior: (next: GeminiMockBehavior) => {
      behavior = next;
    },
    unroute: async () => {
      await page.unroute(GEMINI_PATTERN, handler);
      await page.unroute(PROXY_PATTERN, handler);
    },
  };
}
