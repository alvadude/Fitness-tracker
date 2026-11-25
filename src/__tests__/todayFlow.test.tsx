import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { IndexedDbRepository } from '../services/storage';

function createTestRepo(suffix: string) {
  return new IndexedDbRepository({
    localStorageKey: `test_fittrack_today_${suffix}`,
  });
}

async function uploadMealPhotoAndWaitReady(
  user: ReturnType<typeof userEvent.setup>,
  modal: HTMLElement,
  file: File,
) {
  await user.upload(within(modal).getByLabelText('Upload meal photo'), file);
  const analyzeBtn = await within(modal).findByRole('button', {
    name: /Analyze Meal/i,
  });
  await waitFor(() => {
    expect(analyzeBtn).toBeEnabled();
  });
  return analyzeBtn;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('Today View & AI Meal Photo end-to-end flow', () => {
  it('renders Nov 24 seed macros, net calorie badge, and switches to Nov 25', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('seed_nav');
    render(<App repository={repo} initialDate="2026-11-24" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-24')).toBeInTheDocument();
    });

    expect(screen.getByText('2318')).toBeInTheDocument();
    expect(screen.getByText('170g')).toBeInTheDocument();
    expect(screen.getByText('199g')).toBeInTheDocument();
    expect(screen.getByText('92g')).toBeInTheDocument();
    expect(screen.getByText('418 kcal over')).toBeInTheDocument();
    expect(screen.getByText(/Burned 185 kcal · Net 2133 kcal/i)).toBeInTheDocument();
    expect(screen.getByText('Meals (6)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next day' }));

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('1865 kcal left')).toBeInTheDocument();
    expect(
      screen.getByText('Black coffee + 1 mini Meiji matcha chocolate'),
    ).toBeInTheDocument();
  });

  it('logs quick-add presets and saves custom presets from manual entry', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('presets');
    render(<App repository={repo} initialDate="2026-11-25" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Quick Add/i }));
    const dialog = screen.getByRole('dialog', { name: 'Quick Add Meal' });
    await user.clear(within(dialog).getByLabelText('Meal time'));
    await user.type(within(dialog).getByLabelText('Meal time'), '09:00');
    await user.click(
      within(dialog).getByRole('button', { name: 'Log Black Coffee' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Meals (2)')).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Quick Add Meal' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('40')).toBeInTheDocument();

    // Manual entry + save as custom preset
    await user.click(screen.getByRole('button', { name: /Manual/i }));
    const manualDialog = screen.getByRole('dialog', {
      name: 'Quick Add Meal',
    });
    await user.type(
      within(manualDialog).getByLabelText('Meal Name'),
      'Boiled Egg (2 pcs)',
    );
    await user.type(
      within(manualDialog).getByLabelText('Calories (kcal)'),
      '140',
    );
    await user.type(within(manualDialog).getByLabelText('Protein (g)'), '12');
    await user.type(within(manualDialog).getByLabelText('Carbs (g)'), '1');
    await user.type(within(manualDialog).getByLabelText('Fat (g)'), '10');
    await user.click(
      within(manualDialog).getByLabelText('Save as custom preset'),
    );
    await user.click(
      within(manualDialog).getByRole('button', { name: 'Save Meal' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Meals (3)')).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Quick Add Meal' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('180')).toBeInTheDocument();

    // Verify custom preset is available and deletable
    await user.click(screen.getByRole('button', { name: /Quick Add/i }));
    const reopenDialog = screen.getByRole('dialog', {
      name: 'Quick Add Meal',
    });
    expect(
      within(reopenDialog).getByRole('button', {
        name: 'Log Boiled Egg (2 pcs)',
      }),
    ).toBeInTheDocument();
    await user.click(
      within(reopenDialog).getByRole('button', {
        name: 'Delete preset Boiled Egg (2 pcs)',
      }),
    );
    await waitFor(() => {
      expect(
        within(reopenDialog).queryByRole('button', {
          name: 'Log Boiled Egg (2 pcs)',
        }),
      ).not.toBeInTheDocument();
    });
  });

  it('triggers after-6:00 PM caffeine warning and offers 1-tap switch to Caffeine-Free', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('caffeine_warning');
    render(<App repository={repo} initialDate="2026-11-25" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Quick Add/i }));
    const dialog = screen.getByRole('dialog', { name: 'Quick Add Meal' });
    await user.clear(within(dialog).getByLabelText('Meal time'));
    await user.type(within(dialog).getByLabelText('Meal time'), '19:30');

    // Active Whey 2 scoops defaults to Caramel Macchiato (caffeinated)
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Log Active Whey Protein (2 scoops)',
      }),
    );

    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent(/6:00 PM Caffeine Warning/i);
    // Still only 1 meal logged before choosing
    expect(screen.getByText('Meals (1)')).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', {
        name: /Switch to Caffeine-Free & Log/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Meals (2)')).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Quick Add Meal' }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByText('Active Whey Protein (2 scoops, Caffeine-Free)'),
    ).toBeInTheDocument();
    expect(screen.getByText('283')).toBeInTheDocument();
    expect(screen.getByText('48g')).toBeInTheDocument();
  });

  it('supports editing, duplicating, and deleting meals with live macro recalculation', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('meal_crud');
    render(<App repository={repo} initialDate="2026-11-25" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    // Duplicate seeded meal (35 kcal -> 70 kcal)
    await user.click(
      screen.getByRole('button', {
        name: 'Duplicate Black coffee + 1 mini Meiji matcha chocolate',
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('Meals (2)')).toBeInTheDocument();
    });
    expect(screen.getByText('70')).toBeInTheDocument();

    // Edit first meal
    const editButtons = screen.getAllByRole('button', {
      name: 'Edit Black coffee + 1 mini Meiji matcha chocolate',
    });
    await user.click(editButtons[0]);
    const editDialog = screen.getByRole('dialog', { name: 'Edit Meal' });
    const calInput = within(editDialog).getByLabelText('Calories (kcal)');
    await user.clear(calInput);
    await user.type(calInput, '100');
    await user.click(
      within(editDialog).getByRole('button', { name: 'Save Changes' }),
    );

    await waitFor(() => {
      expect(screen.getByText('135')).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Edit Meal' }),
      ).not.toBeInTheDocument();
    });

    // Delete second meal
    const deleteButtons = screen.getAllByRole('button', {
      name: 'Remove Black coffee + 1 mini Meiji matcha chocolate',
    });
    await user.click(deleteButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('Meals (1)')).toBeInTheDocument();
    });
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('executes Smart Evening Advisor 1-tap whey and incline walk actions', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('advisor');
    render(<App repository={repo} initialDate="2026-11-25" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    // On Nov 25 (1865 kcal left, 160g protein left), advisor recommends 2 scoops whey
    expect(
      screen.getByText('2 Scoops Caffeine-Free Active Whey'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Add 2 Scoops Caffeine-Free Whey' }),
    );

    await waitFor(() => {
      expect(screen.getByText('283')).toBeInTheDocument();
    });
    expect(screen.getByText('48g')).toBeInTheDocument();

    // Now switch to Nov 24, delete cardio or add surplus meal to trigger cardio_offset
    await user.click(screen.getByRole('button', { name: 'Nov 24' }));
    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-24')).toBeInTheDocument();
    });

    // Nov 24 net remaining is -233 kcal (over by >100 kcal even with 185 cardio burn),
    // so Smart Evening Advisor recommends an incline walk offset
    expect(
      screen.getByText('Offset Surplus with Incline Walk'),
    ).toBeInTheDocument();
    const walkCta = screen.getByRole('button', {
      name: /Log \d+m Incline Walk/i,
    });
    await user.click(walkCta);

    await waitFor(() => {
      expect(
        screen.getByText(/Logged \d+m incline walk/i),
      ).toBeInTheDocument();
    });
    // Cardio burn increased beyond 185 kcal
    expect(screen.queryByText(/Burned 185 kcal/i)).not.toBeInTheDocument();
  });

  it('runs AI Meal Photo Estimator flow with missing-key recovery, multiplier scaling, and item edits', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('ai_photo');
    render(<App repository={repo} initialDate="2026-11-25" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /AI Meal Photo/i }));
    const modal = screen.getByRole('dialog', {
      name: 'AI Meal Photo Estimator',
    });

    const photoFile = new File(['fake-jpeg-bytes'], 'chicken-rice.jpg', {
      type: 'image/jpeg',
    });
    const analyzeBtn = await uploadMealPhotoAndWaitReady(
      user,
      modal,
      photoFile,
    );
    await user.type(
      within(modal).getByLabelText('Meal context'),
      'peeled chicken skin',
    );

    // First attempt without API key shows graceful recovery UI
    await user.click(analyzeBtn);
    await waitFor(() => {
      expect(within(modal).getByRole('alert')).toHaveTextContent(
        /No Gemini API key is configured/i,
      );
    });

    // Mock Gemini 2.5 Flash response and recover via inline quick-add key
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      mealName: 'Skinless Chicken & Rice',
                      items: [
                        {
                          name: 'Skinless Chicken Thigh',
                          portion: '150g',
                          calories: 240,
                          proteinG: 36,
                          carbsG: 0,
                          fatG: 10,
                        },
                        {
                          name: 'Steamed White Rice',
                          portion: '1 cup',
                          calories: 200,
                          proteinG: 4,
                          carbsG: 44,
                          fatG: 0,
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

    await user.type(
      within(modal).getByLabelText('Gemini API key'),
      'AIza-test-key',
    );
    await user.click(
      within(modal).getByRole('button', { name: /Save & Retry/i }),
    );

    await waitFor(() => {
      expect(
        within(modal).getByDisplayValue('Skinless Chicken & Rice'),
      ).toBeInTheDocument();
    });

    // Apply 1.5x portion multiplier (440 * 1.5 = 660 kcal, 40 * 1.5 = 60g P)
    await user.click(within(modal).getByRole('button', { name: '1.5x' }));
    expect(within(modal).getByText('660')).toBeInTheDocument();
    expect(within(modal).getByText('60g')).toBeInTheDocument();

    // Edit item 2 calories from 300 to 250 -> total becomes 360 + 250 = 610 kcal
    const item2Calories = within(modal).getByLabelText('Item 2 calories');
    await user.clear(item2Calories);
    await user.type(item2Calories, '250');
    expect(within(modal).getByText('610')).toBeInTheDocument();

    await user.click(
      within(modal).getByRole('button', { name: 'Save to Daily Log' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Meals (2)')).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'AI Meal Photo Estimator' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('Skinless Chicken & Rice')).toBeInTheDocument();
    // 35 seeded + 610 AI meal = 645
    expect(screen.getByText('645')).toBeInTheDocument();
  });

  it('aborts in-flight AI analysis on photo swap and ignores stale responses', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('photo_swap_abort');
    localStorage.setItem('fittrack_gemini_api_key', 'AIza-test-key');

    let capturedSignal: AbortSignal | undefined;
    let resolveFirstFetch: ((res: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          capturedSignal = init?.signal ?? undefined;
          resolveFirstFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<App repository={repo} initialDate="2026-11-25" />);
    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /AI Meal Photo/i }));
    const modal = screen.getByRole('dialog', {
      name: 'AI Meal Photo Estimator',
    });

    const photo1 = new File(['photo-1'], 'photo1.jpg', { type: 'image/jpeg' });
    const analyzeBtn1 = await uploadMealPhotoAndWaitReady(user, modal, photo1);

    await user.click(analyzeBtn1);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(capturedSignal?.aborted).toBe(false);

    // Swap photo while first analysis is still pending
    const photo2 = new File(['photo-2'], 'photo2.jpg', { type: 'image/jpeg' });
    await user.upload(within(modal).getByLabelText('Upload meal photo'), photo2);

    expect(capturedSignal?.aborted).toBe(true);
    await waitFor(() => {
      expect(within(modal).getByText('photo2.jpg')).toBeInTheDocument();
    });
    const analyzeBtnAfterSwap = await within(modal).findByRole('button', {
      name: /Analyze Meal/i,
    });
    await waitFor(() => {
      expect(analyzeBtnAfterSwap).toBeEnabled();
    });

    // Even if the stale request resolves later, it must NOT overwrite UI
    resolveFirstFetch?.(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      mealName: 'Stale Photo 1 Meal',
                      items: [
                        {
                          name: 'Old Food',
                          portion: '1 serving',
                          calories: 500,
                          proteinG: 30,
                          carbsG: 40,
                          fatG: 20,
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

    await new Promise((resolve) => setTimeout(resolve, 0));
    await waitFor(() => {
      expect(
        within(modal).queryByDisplayValue('Stale Photo 1 Meal'),
      ).not.toBeInTheDocument();
      expect(within(modal).queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('triggers caffeine warning at >= 18:00 even when meal time input is cleared', async () => {
    const user = userEvent.setup();
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(19);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(30);

    const repo = createTestRepo('cleared_time_caffeine');
    render(<App repository={repo} initialDate="2026-11-25" />);
    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Quick Add/i }));
    const dialog = screen.getByRole('dialog', { name: 'Quick Add Meal' });
    await user.clear(within(dialog).getByLabelText('Meal time'));

    await user.click(
      within(dialog).getByRole('button', { name: 'Log Black Coffee' }),
    );

    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent(/6:00 PM Caffeine Warning \(19:30\)/i);
    expect(screen.getByText('Meals (1)')).toBeInTheDocument();
  });

  it('clears advisorStatus confirmation banner when clicking Previous day or Next day', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('advisor_nav_clear');
    render(<App repository={repo} initialDate="2026-11-24" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-24')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Log \d+m Incline Walk/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Logged \d+m incline walk/i),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Logged \d+m incline walk/i),
    ).not.toBeInTheDocument();

    // Also test Previous day clearing advisorStatus
    await user.click(
      screen.getByRole('button', { name: 'Add 2 Scoops Caffeine-Free Whey' }),
    );
    await waitFor(() => {
      expect(
        screen.getByText('Logged 2 scoops caffeine-free Active Whey.'),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-24')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Logged 2 scoops caffeine-free Active Whey.'),
    ).not.toBeInTheDocument();
  });

  it('shows validation hint on invalid custom multiplier (0 / negative) and resets on blur', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('invalid_multiplier');
    localStorage.setItem('fittrack_gemini_api_key', 'AIza-test-key');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        mealName: 'Test Bowl',
                        items: [
                          {
                            name: 'Chicken',
                            portion: '150g',
                            calories: 300,
                            proteinG: 40,
                            carbsG: 10,
                            fatG: 8,
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
      ),
    );

    render(<App repository={repo} initialDate="2026-11-25" />);
    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /AI Meal Photo/i }));
    const modal = screen.getByRole('dialog', {
      name: 'AI Meal Photo Estimator',
    });
    const analyzeBtn = await uploadMealPhotoAndWaitReady(
      user,
      modal,
      new File(['bytes'], 'bowl.jpg', { type: 'image/jpeg' }),
    );
    await user.click(analyzeBtn);

    await waitFor(() => {
      expect(
        within(modal).getByDisplayValue('Test Bowl'),
      ).toBeInTheDocument();
    });

    await user.click(within(modal).getByRole('button', { name: '1.5x' }));
    const customInput = within(modal).getByLabelText(
      'Custom portion multiplier',
    ) as HTMLInputElement;
    await user.clear(customInput);
    await user.type(customInput, '0');

    expect(
      within(modal).getByText(
        /Enter a multiplier greater than 0 \(using 1\.5x\)/i,
      ),
    ).toBeInTheDocument();

    await user.tab();
    expect(customInput.value).toBe('1.5');
    expect(
      within(modal).queryByText(/Enter a multiplier greater than 0/i),
    ).not.toBeInTheDocument();
  });

  it('preserves caffeine-free badge when editing a caffeine-free meal', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('edit_caffeine_free');
    render(<App repository={repo} initialDate="2026-11-24" />);

    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-24')).toBeInTheDocument();
    });

    expect(screen.getByText('Caffeine-Free')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Edit Dinner — 2 scoops caffeine-free Active Whey',
      }),
    );

    const editDialog = screen.getByRole('dialog', { name: 'Edit Meal' });
    const notesInput = within(editDialog).getByLabelText('Notes (optional)');
    await user.type(notesInput, 'With cold water');
    await user.click(
      within(editDialog).getByRole('button', { name: 'Save Changes' }),
    );

    await waitFor(() => {
      expect(screen.getByText('With cold water')).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Edit Meal' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('Caffeine-Free')).toBeInTheDocument();
  });

  it('gates inline API key recovery on direct mode and offers Direct switch on proxy 401', async () => {
    const user = userEvent.setup();
    const repo = createTestRepo('proxy_auth_recovery');
    await repo.initializeIfNeeded();
    const seededState = await repo.getState();
    await repo.saveSettings({
      ...seededState.settings,
      geminiApiEndpointMode: 'proxy',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Proxy key unauthorized' }), {
          status: 401,
        }),
      ),
    );

    render(<App repository={repo} initialDate="2026-11-25" />);
    await waitFor(() => {
      expect(screen.getByText('Daily Macros · 2026-11-25')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /AI Meal Photo/i }));
    const modal = screen.getByRole('dialog', {
      name: 'AI Meal Photo Estimator',
    });
    const analyzeBtn = await uploadMealPhotoAndWaitReady(
      user,
      modal,
      new File(['bytes'], 'meal.jpg', { type: 'image/jpeg' }),
    );
    await user.click(analyzeBtn);

    await waitFor(() => {
      expect(within(modal).getByRole('alert')).toHaveTextContent(
        /Proxy key unauthorized/i,
      );
    });

    // In proxy mode, inline client API key input must NOT be shown
    expect(
      within(modal).queryByLabelText('Gemini API key'),
    ).not.toBeInTheDocument();
    expect(within(modal).getByRole('alert')).toHaveTextContent(
      /GEMINI_API_KEY/i,
    );

    // Clicking Switch to Direct Mode transitions to direct mode & reveals key recovery
    await user.click(
      within(modal).getByRole('button', { name: 'Switch to Direct Mode' }),
    );
    await waitFor(() => {
      expect(within(modal).getByLabelText('Gemini API key')).toBeInTheDocument();
    });
  });
});
