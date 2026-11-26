import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMealEstimationPrompt,
  estimateMealFromImage,
  GEMINI_ENDPOINT,
  isAbortError,
  MealEstimatorError,
  parseMealEstimatePayload,
  PROXY_ENDPOINT,
  resolveGeminiApiKey,
  scaleMealItems,
  sumMealItemMacros,
} from '../services/ai/mealEstimator';
import {
  extractBase64FromDataUrl,
  resizeImageForAi,
} from '../services/ai/imageResize';
import { GEMINI_API_KEY_STORAGE_KEY } from '../services/storage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('mealEstimator service & imageResize', () => {
  it('submits structured JSON request to gemini-3.8-flash with optional context and parses breakdown', async () => {
    expect(GEMINI_ENDPOINT).toContain('gemini-3.8-flash');
    const geminiPayload = {
      candidates: [
        {
          content: {
            parts: [
              {
                thought: true,
                text: 'Internal reasoning ignored',
              },
              {
                text: JSON.stringify({
                  mealName: 'Chicken & Rice Bowl',
                  notes: 'Skin removed per user note.',
                  items: [
                    {
                      name: 'Grilled Chicken Breast (skinless)',
                      portion: '150g',
                      calories: 248,
                      proteinG: 46.5,
                      carbsG: 0,
                      fatG: 5.4,
                    },
                    {
                      name: 'Steamed White Rice',
                      portion: '1/2 cup',
                      calories: 104,
                      proteinG: 2,
                      carbsG: 22,
                      fatG: 0.2,
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(geminiPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await estimateMealFromImage({
      imageBase64: 'ZmFrZS1pbWFnZQ==',
      mimeType: 'image/jpeg',
      contextText: 'peeled chicken skin, 1/2 cup rice',
      apiKey: 'test-key-123',
      endpointMode: 'direct',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GEMINI_ENDPOINT);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'test-key-123',
    );

    const parsedBody = JSON.parse(init.body as string) as {
      contents: Array<{
        parts: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      }>;
      generationConfig: {
        responseMimeType: string;
        responseSchema: { type: string; required: string[] };
      };
    };

    expect(parsedBody.generationConfig.responseMimeType).toBe(
      'application/json',
    );
    expect(parsedBody.generationConfig.responseSchema.type).toBe('OBJECT');
    expect(parsedBody.contents[0].parts[0].text).toContain(
      'peeled chicken skin, 1/2 cup rice',
    );
    expect(parsedBody.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'image/jpeg',
      data: 'ZmFrZS1pbWFnZQ==',
    });

    expect(result.mealName).toBe('Chicken & Rice Bowl');
    expect(result.notes).toBe('Skin removed per user note.');
    expect(result.items).toHaveLength(2);
    expect(result.totals).toEqual({
      calories: 352,
      proteinG: 48.5,
      carbsG: 22,
      fatG: 5.6,
    });
  });

  it('resolves API key in order: explicit -> localStorage -> VITE_GEMINI_API_KEY', () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'env-key');
    expect(resolveGeminiApiKey()).toBe('env-key');

    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'storage-key');
    expect(resolveGeminiApiKey()).toBe('storage-key');

    expect(resolveGeminiApiKey('  explicit-key  ')).toBe('explicit-key');
  });

  it('routes to /api/analyze-meal in proxy mode without requiring a client key', async () => {
    const proxyResponse = {
      mealName: 'Adobo & Rice',
      items: [
        {
          name: 'Chicken Adobo',
          portion: '120g',
          calories: 260,
          proteinG: 26,
          carbsG: 4,
          fatG: 15,
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(proxyResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await estimateMealFromImage({
      imageBase64: 'YWJj',
      mimeType: 'image/png',
      contextText: 'no sauce',
      endpointMode: 'proxy',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(PROXY_ENDPOINT);
    expect(JSON.parse(init.body as string)).toEqual({
      imageBase64: 'YWJj',
      mimeType: 'image/png',
      contextText: 'no sauce',
    });
    expect(result.mealName).toBe('Adobo & Rice');
    expect(result.totals.calories).toBe(260);
  });

  it('throws MISSING_API_KEY without calling fetch in direct mode when no key is set', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      estimateMealFromImage({
        imageBase64: 'YWJj',
        mimeType: 'image/jpeg',
        endpointMode: 'direct',
      }),
    ).rejects.toMatchObject({
      name: 'MealEstimatorError',
      code: 'MISSING_API_KEY',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes HTTP 401/403, 429, 502 and network failures', async () => {
    const cases: Array<{ status: number; expectedCode: string }> = [
      { status: 401, expectedCode: 'AUTH_ERROR' },
      { status: 403, expectedCode: 'AUTH_ERROR' },
      { status: 429, expectedCode: 'RATE_LIMITED' },
      { status: 502, expectedCode: 'SERVER_ERROR' },
    ];

    for (const c of cases) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'Upstream fail' } }), {
            status: c.status,
          }),
        ),
      );

      await expect(
        estimateMealFromImage({
          imageBase64: 'YWJj',
          mimeType: 'image/jpeg',
          apiKey: 'key',
        }),
      ).rejects.toMatchObject({
        code: c.expectedCode,
        status: c.status,
      });
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(
      estimateMealFromImage({
        imageBase64: 'YWJj',
        mimeType: 'image/jpeg',
        apiKey: 'key',
      }),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('rejects malformed JSON, empty items, and negative macro values', () => {
    expect(() => parseMealEstimatePayload('not-valid-json')).toThrow(
      MealEstimatorError,
    );
    expect(() =>
      parseMealEstimatePayload({ mealName: 'Empty', items: [] }),
    ).toThrow(/No food items/i);
    expect(() =>
      parseMealEstimatePayload({
        mealName: 'Bad Macros',
        items: [
          {
            name: 'Toast',
            portion: '1 slice',
            calories: -10,
            proteinG: 2,
            carbsG: 12,
            fatG: 1,
          },
        ],
      }),
    ).toThrow(MealEstimatorError);

    // Also supports fenced markdown JSON blocks
    const fenced = parseMealEstimatePayload(
      '```json\n{"mealName":"Oats","items":[{"name":"Oats","portion":"40g","calories":150,"proteinG":5,"carbsG":27,"fatG":2.5}]}\n```',
    );
    expect(fenced.mealName).toBe('Oats');
    expect(fenced.totals.calories).toBe(150);
  });

  it('scales meal items and sums macros accurately across multipliers', () => {
    const base = [
      {
        name: 'Rice',
        portion: '1 cup',
        calories: 208,
        proteinG: 4.1,
        carbsG: 45,
        fatG: 0.4,
      },
      {
        name: 'Egg',
        portion: '1 large',
        calories: 72,
        proteinG: 6.3,
        carbsG: 0.4,
        fatG: 5,
      },
    ];

    const half = scaleMealItems(base, 0.5);
    expect(half[0].calories).toBe(104);
    expect(half[1].proteinG).toBe(3.2);

    const oneAndHalf = scaleMealItems(base, 1.5);
    expect(oneAndHalf[0].calories).toBe(312);
    expect(oneAndHalf[0].proteinG).toBe(6.1);
    expect(oneAndHalf[1].calories).toBe(108);
    expect(oneAndHalf[1].proteinG).toBe(9.5);
    expect(sumMealItemMacros(oneAndHalf)).toEqual({
      calories: 420,
      proteinG: 15.6,
      carbsG: 68.1,
      fatG: 8.1,
    });

    expect(() => scaleMealItems(base, 0)).toThrow();
    expect(buildMealEstimationPrompt('extra sauce')).toContain('extra sauce');
  });

  it('safely processes image files in jsdom via resizeImageForAi without hanging', async () => {
    const fakeFile = new File(['fake-jpeg-bytes'], 'lunch.jpg', {
      type: 'image/jpeg',
    });
    const resized = await resizeImageForAi(fakeFile);

    expect(resized.mimeType).toBe('image/jpeg');
    expect(resized.base64.length).toBeGreaterThan(0);
    expect(resized.dataUrl).toContain('data:image/jpeg;base64,');

    const extracted = extractBase64FromDataUrl(resized.dataUrl);
    expect(extracted.base64).toBe(resized.base64);
    expect(extracted.mimeType).toBe('image/jpeg');

    const invalidFile = new File(['hello'], 'notes.txt', {
      type: 'text/plain',
    });
    await expect(resizeImageForAi(invalidFile)).rejects.toThrow(
      /valid image file/i,
    );
  });

  it('rethrows DOMException AbortError without misclassifying as NETWORK_ERROR', async () => {
    const domAbort = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    expect(isAbortError(domAbort)).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(domAbort));

    let caught: unknown;
    try {
      await estimateMealFromImage({
        imageBase64: 'YWJj',
        mimeType: 'image/jpeg',
        apiKey: 'key',
      });
    } catch (err: unknown) {
      caught = err;
    }

    expect(caught).toBe(domAbort);
    expect(caught).not.toBeInstanceOf(MealEstimatorError);
    expect((caught as { name?: string }).name).toBe('AbortError');
  });

  it('rethrows DOMException AbortError when response.text() aborts on !response.ok', async () => {
    const domAbort = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    const errorResponse = new Response('Upstream error', { status: 500 });
    vi.spyOn(errorResponse, 'text').mockRejectedValue(domAbort);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse));

    let caught: unknown;
    try {
      await estimateMealFromImage({
        imageBase64: 'YWJj',
        mimeType: 'image/jpeg',
        apiKey: 'key',
      });
    } catch (err: unknown) {
      caught = err;
    }

    expect(caught).toBe(domAbort);
    expect(caught).not.toBeInstanceOf(MealEstimatorError);
    expect((caught as { name?: string }).name).toBe('AbortError');
  });

  it('includes proxy-specific actionable hint on proxy mode 401/403 AUTH_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid server key' }), {
          status: 401,
        }),
      ),
    );

    await expect(
      estimateMealFromImage({
        imageBase64: 'YWJj',
        mimeType: 'image/jpeg',
        endpointMode: 'proxy',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_ERROR',
      status: 401,
      actionableHint: expect.stringMatching(/GEMINI_API_KEY/i),
    });
  });

  it('automatically falls back to the next Gemini model when primary model returns 503 high demand', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'This model is currently experiencing high demand.',
            },
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        mealName: 'Fallback Meal',
                        items: [
                          {
                            name: 'Egg Sandwich',
                            portion: '1 whole',
                            calories: 320,
                            proteinG: 16,
                            carbsG: 34,
                            fatG: 12,
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await estimateMealFromImage({
      imageBase64: 'YWJj',
      mimeType: 'image/jpeg',
      apiKey: 'AIza-test',
      endpointMode: 'direct',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-3.8-flash');
    expect(String(fetchMock.mock.calls[1][0])).toContain('gemini-3.6-flash');
    expect(result.modelUsed).toBe('gemini-3.6-flash');
    expect(result.mealName).toBe('Fallback Meal');
  });
});
