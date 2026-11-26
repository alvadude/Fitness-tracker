import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import {
  buildWeeklyWorkoutPrompt,
  parseWeeklyWorkoutPlanPayload,
} from '../services/ai/workoutPlanner';
import { IndexedDbRepository } from '../services/storage';

const MOCK_GEMINI_WEEKLY_PLAN = {
  candidates: [
    {
      content: {
        parts: [
          {
            thought: true,
            text: 'Planning 7 days based on dumbbells and bands...',
          },
          {
            text: JSON.stringify({
              goalSummary:
                '4-day balanced dumbbell & band split with 3 active recovery days.',
              days: [
                {
                  dayOfWeek: 1,
                  dayName: 'Monday',
                  focus: 'Lower Body Strength',
                  isRestDay: false,
                  estimatedDurationMin: 40,
                  exercises: [
                    {
                      name: 'Goblet Squat',
                      equipment: 'Adjustable Dumbbells',
                      sets: 3,
                      reps: '10-12',
                    },
                    {
                      name: 'Banded Glute Bridge',
                      equipment: 'Resistance Bands',
                      sets: 3,
                      reps: '15',
                    },
                  ],
                  cardioNote: '15 min brisk incline walk',
                  coachingTip: 'Keep core braced on squats.',
                },
                {
                  dayOfWeek: 2,
                  dayName: 'Tuesday',
                  focus: 'Active Recovery Walk',
                  isRestDay: true,
                  estimatedDurationMin: 20,
                  exercises: [],
                  cardioNote: '20 min easy walk',
                },
                {
                  dayOfWeek: 3,
                  dayName: 'Wednesday',
                  focus: 'Upper Body Push & Pull',
                  isRestDay: false,
                  estimatedDurationMin: 35,
                  exercises: [
                    {
                      name: 'Dumbbell Floor Press',
                      equipment: 'Adjustable Dumbbells',
                      sets: 3,
                      reps: '10-12',
                    },
                  ],
                },
                {
                  dayOfWeek: 4,
                  dayName: 'Thursday',
                  focus: 'Mobility & Rest',
                  isRestDay: true,
                  estimatedDurationMin: 15,
                  exercises: [],
                },
                {
                  dayOfWeek: 5,
                  dayName: 'Friday',
                  focus: 'Full Body Circuit',
                  isRestDay: false,
                  estimatedDurationMin: 35,
                  exercises: [
                    {
                      name: 'Dumbbell Romanian Deadlift',
                      equipment: 'Adjustable Dumbbells',
                      sets: 3,
                      reps: '10-12',
                    },
                  ],
                },
                {
                  dayOfWeek: 6,
                  dayName: 'Saturday',
                  focus: 'Cardio & Core',
                  isRestDay: false,
                  estimatedDurationMin: 30,
                  exercises: [
                    {
                      name: 'Dead Bug',
                      equipment: 'Yoga / Exercise Mat',
                      sets: 3,
                      reps: '12',
                    },
                  ],
                },
                {
                  dayOfWeek: 0,
                  dayName: 'Sunday',
                  focus: 'Rest Day',
                  isRestDay: true,
                  estimatedDurationMin: 0,
                  exercises: [],
                },
              ],
            }),
          },
        ],
      },
    },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AI Weekly Workout Planner, Equipment Checklist & Daily Status Ticks', () => {
  it('builds a Gemini prompt with profile stats, checked equipment, and preferences, and parses 7 days ignoring thought parts', () => {
    const prompt = buildWeeklyWorkoutPrompt({
      profile: {
        name: 'Maria',
        age: 28,
        sex: 'female',
        heightCm: 160,
        activityLevel: 'light',
        startWeightKg: 60,
        startDate: '2026-11-26',
        targetWeightKg: 54,
        targetDate: '2027-05-25',
        caffeineCutoffHour: 18,
      },
      targets: {
        calories: 1450,
        proteinG: 100,
        carbsG: 160,
        fatG: 45,
        weekNumber: 1,
      },
      currentWeightKg: 60,
      availableEquipment: ['Adjustable Dumbbells', 'Resistance Bands'],
      preferences: '35 min home sessions, low impact',
    });

    expect(prompt).toContain('Maria');
    expect(prompt).toContain('Adjustable Dumbbells, Resistance Bands');
    expect(prompt).toContain('35 min home sessions, low impact');

    const parsed = parseWeeklyWorkoutPlanPayload(MOCK_GEMINI_WEEKLY_PLAN, {
      equipmentUsed: ['Adjustable Dumbbells', 'Resistance Bands'],
    });
    expect(parsed.days).toHaveLength(7);
    expect(parsed.days[0].dayName).toBe('Monday');
    expect(parsed.days[0].exercises).toHaveLength(2);
    expect(parsed.days[6].dayName).toBe('Sunday');
  });

  it('persists equipment checklist, generates plan via Gemini, ticks Completed/Partial/Not Done daily, and loads exercises into Daily Log', async () => {
    const user = userEvent.setup();
    localStorage.setItem('fittrack_gemini_api_key', 'AIza-planner-test');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(MOCK_GEMINI_WEEKLY_PLAN), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const key = 'test_ai_weekly_planner';
    const repo = new IndexedDbRepository({ localStorageKey: key });
    const { unmount } = render(
      <App repository={repo} initialTab="training" initialDate="2026-12-03" />,
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    // Switch to AI Weekly Plan sub-tab
    await user.click(screen.getByRole('tab', { name: /AI Weekly Plan/i }));

    // Check Resistance Bands & add custom equipment "Pilates Ring"
    const bandsCheckbox = screen.getByLabelText('Resistance Bands');
    expect(bandsCheckbox).not.toBeChecked();
    await user.click(bandsCheckbox);
    expect(bandsCheckbox).toBeChecked();

    await user.type(
      screen.getByLabelText('Add custom equipment'),
      'Pilates Ring',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('Pilates Ring')).toBeChecked();

    // Generate plan with Gemini
    await user.click(
      screen.getByRole('button', { name: /Generate Weekly Plan with Gemini/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/4-day balanced dumbbell & band split/i),
      ).toBeInTheDocument();
    });

    // Verify Gemini prompt received the checked equipment including custom item
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('Resistance Bands');
    expect(String(init.body)).toContain('Pilates Ring');

    // Tick Monday -> Completed, Tuesday -> Partial, Wednesday -> Not Done
    const monGroup = screen.getByRole('group', {
      name: 'Completion status for Monday',
    });
    await user.click(
      within(monGroup).getByRole('button', { name: 'Completed' }),
    );
    const tueGroup = screen.getByRole('group', {
      name: 'Completion status for Tuesday',
    });
    await user.click(within(tueGroup).getByRole('button', { name: 'Partial' }));

    await waitFor(() => {
      expect(screen.getByText('1 Completed')).toBeInTheDocument();
      expect(screen.getByText('1 Partial')).toBeInTheDocument();
      expect(screen.getByText('5 Not Completed')).toBeInTheDocument();
    });

    // Load Monday exercises into Daily Log
    await user.click(
      screen.getByRole('button', {
        name: /Load Monday Exercises into Daily Log/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Goblet Squat')).toBeInTheDocument();
      expect(screen.getByText('Banded Glute Bridge')).toBeInTheDocument();
    });

    // Remount and verify weekly plan, equipment checklist, and daily ticks persisted
    unmount();
    const repo2 = new IndexedDbRepository({ localStorageKey: key });
    render(
      <App repository={repo2} initialTab="training" initialDate="2026-12-03" />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /AI Weekly Plan/i }));
    expect(screen.getByLabelText('Resistance Bands')).toBeChecked();
    expect(screen.getByLabelText('Pilates Ring')).toBeChecked();
    expect(screen.getByText('1 Completed')).toBeInTheDocument();
    expect(screen.getByText('1 Partial')).toBeInTheDocument();
  });
});
