interface Env {
  GEMINI_API_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';
const MAX_BASE64_LENGTH = 8_000_000;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: ['mealName', 'items'],
  properties: {
    mealName: { type: 'STRING' },
    notes: { type: 'STRING' },
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
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function buildPrompt(contextText?: string): string {
  const base =
    'Analyze the meal in this photo and estimate every visible food or drink item. Return realistic portion sizes and macros (calories, proteinG, carbsG, fatG) for each item as valid JSON.';
  const trimmed = contextText?.trim();
  return trimmed ? `${base} Additional user context: ${trimmed}` : base;
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const apiKey = context.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse(
      {
        error: 'Server GEMINI_API_KEY is not configured.',
        code: 'MISSING_SERVER_KEY',
      },
      500,
    );
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request body.' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Request body must be a JSON object.' }, 400);
  }

  const record = body as Record<string, unknown>;
  const imageBase64 =
    typeof record.imageBase64 === 'string' ? record.imageBase64.trim() : '';
  if (!imageBase64) {
    return jsonResponse({ error: 'imageBase64 is required.' }, 400);
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return jsonResponse(
      { error: 'Image payload exceeds maximum allowed size.' },
      413,
    );
  }

  const rawMime =
    typeof record.mimeType === 'string' && record.mimeType.trim()
      ? record.mimeType.trim().toLowerCase()
      : 'image/jpeg';
  const mimeType = ALLOWED_MIME_TYPES.has(rawMime) ? rawMime : 'image/jpeg';
  const contextText =
    typeof record.contextText === 'string' ? record.contextText : undefined;

  let geminiRes: Response;
  try {
    geminiRes = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(contextText) },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch {
    return jsonResponse(
      { error: 'Failed to connect to Gemini API.', code: 'NETWORK_ERROR' },
      502,
    );
  }

  if (!geminiRes.ok) {
    const status =
      geminiRes.status === 401 ||
      geminiRes.status === 403 ||
      geminiRes.status === 429
        ? geminiRes.status
        : 502;
    return jsonResponse(
      {
        error: `Gemini API returned status ${geminiRes.status}.`,
        code: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
      },
      status,
    );
  }

  try {
    const data = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.filter((p) => p.thought !== true)
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim() ?? '';

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned) as {
      mealName?: unknown;
      items?: unknown;
      notes?: unknown;
    };

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      return jsonResponse(
        { error: 'No food items detected in photo.', code: 'EMPTY_RESULT' },
        502,
      );
    }

    return jsonResponse(
      {
        mealName:
          typeof parsed.mealName === 'string' && parsed.mealName.trim()
            ? parsed.mealName.trim()
            : 'Estimated Meal',
        items: parsed.items,
        notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
      },
      200,
    );
  } catch {
    return jsonResponse(
      { error: 'Malformed JSON from Gemini API.', code: 'MALFORMED_RESPONSE' },
      502,
    );
  }
}
