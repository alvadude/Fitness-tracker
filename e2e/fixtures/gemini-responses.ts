export interface GeminiMealItem {
  name: string;
  portion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface GeminiMealPayload {
  mealName: string;
  items: GeminiMealItem[];
  notes?: string;
}

export function buildGeminiSuccessResponse(payload: GeminiMealPayload) {
  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts: [
            {
              text: JSON.stringify(payload),
            },
          ],
        },
        finishReason: 'STOP',
      },
    ],
  };
}

export const GEMINI_CHICKEN_RICE_PAYLOAD: GeminiMealPayload = {
  mealName: 'Chicken Breast & White Rice',
  items: [
    {
      name: 'Chicken Breast',
      portion: '150g',
      calories: 248,
      proteinG: 46,
      carbsG: 0,
      fatG: 5,
    },
    {
      name: 'White Rice',
      portion: '1 cup',
      calories: 208,
      proteinG: 4,
      carbsG: 45,
      fatG: 0,
    },
  ],
  notes: 'Estimated grilled skinless chicken breast with steamed rice.',
};

export const GEMINI_400_PAYLOAD: GeminiMealPayload = {
  mealName: 'Grilled Chicken Bowl',
  items: [
    {
      name: 'Grilled Chicken Bowl',
      portion: '1 bowl',
      calories: 400,
      proteinG: 40,
      carbsG: 40,
      fatG: 8,
    },
  ],
};

export const GEMINI_300_PAYLOAD: GeminiMealPayload = {
  mealName: 'Beef Rice Plate',
  items: [
    {
      name: 'Beef Rice Plate',
      portion: '1 plate',
      calories: 300,
      proteinG: 20,
      carbsG: 30,
      fatG: 10,
    },
  ],
};

export const GEMINI_TWO_ITEM_SAUCE_PAYLOAD: GeminiMealPayload = {
  mealName: 'Chicken with Sauce',
  items: [
    {
      name: 'Chicken',
      portion: '150g',
      calories: 250,
      proteinG: 44,
      carbsG: 0,
      fatG: 6,
    },
    {
      name: 'Sauce',
      portion: '2 tbsp',
      calories: 120,
      proteinG: 1,
      carbsG: 10,
      fatG: 8,
    },
  ],
};

export const GEMINI_310_SAVE_PAYLOAD: GeminiMealPayload = {
  mealName: 'Seared Chicken & Greens',
  items: [
    {
      name: 'Seared Chicken & Greens',
      portion: '1 serving',
      calories: 310,
      proteinG: 35,
      carbsG: 20,
      fatG: 9,
    },
  ],
};

export const GEMINI_350_40P_PAYLOAD: GeminiMealPayload = {
  mealName: 'Lean Chicken Stir-Fry',
  items: [
    {
      name: 'Lean Chicken Stir-Fry',
      portion: '1 bowl',
      calories: 350,
      proteinG: 40,
      carbsG: 28,
      fatG: 8,
    },
  ],
};

export const GEMINI_ROUNDING_PAYLOAD: GeminiMealPayload = {
  mealName: 'Protein Bite',
  items: [
    {
      name: 'Protein Bite',
      portion: '1 piece',
      calories: 125,
      proteinG: 15,
      carbsG: 8,
      fatG: 3,
    },
  ],
};

export const GEMINI_EMPTY_ITEMS_PAYLOAD: GeminiMealPayload = {
  mealName: 'Unrecognized Meal',
  items: [],
  notes: 'No food items detected in image.',
};

export const GEMINI_MALFORMED_TEXT_RESPONSE = {
  candidates: [
    {
      content: {
        role: 'model',
        parts: [
          {
            text: 'Sorry, I cannot see food',
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
};

export const GEMINI_429_BODY = {
  error: {
    code: 429,
    message: 'Resource has been exhausted (rate limit exceeded).',
    status: 'RESOURCE_EXHAUSTED',
  },
};

export const GEMINI_500_BODY = {
  error: {
    code: 500,
    message: 'Internal error encountered.',
    status: 'INTERNAL',
  },
};
