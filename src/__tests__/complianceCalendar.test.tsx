import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import {
  buildMonthComplianceCalendar,
  resolveDayCompliance,
} from '../domain/compliance';
import type { WeeklyWorkoutPlan } from '../domain/types';
import { IndexedDbRepository } from '../services/storage';

const SAMPLE_AI_PLAN: WeeklyWorkoutPlan = {
  id: 'plan-wife-test',
  generatedAt: '2026-11-26T00:00:00.000Z',
  goalSummary: '3-day dumbbell & bands home split with 4 rest days.',
  equipmentUsed: ['Adjustable Dumbbells', 'Resistance Bands', 'Yoga / Exercise Mat'],
  days: [
    {
      dayOfWeek: 1,
      dayName: 'Monday',
      focus: 'Glutes & Core',
      isRestDay: false,
      estimatedDurationMin: 35,
      exercises: [
        {
          name: 'Banded Hip Thrust',
          equipment: 'Resistance Bands',
          sets: 3,
          reps: '15',
        },
      ],
    },
    {
      dayOfWeek: 2,
      dayName: 'Tuesday',
      focus: 'Rest Day',
      isRestDay: true,
      estimatedDurationMin: 0,
      exercises: [],
    },
    {
      dayOfWeek: 3,
      dayName: 'Wednesday',
      focus: 'Upper Body Tone',
      isRestDay: false,
      estimatedDurationMin: 30,
      exercises: [
        {
          name: 'Dumbbell Lateral Raise',
          equipment: 'Adjustable Dumbbells',
          sets: 3,
          reps: '12-15',
        },
      ],
    },
    {
      dayOfWeek: 4,
      dayName: 'Thursday',
      focus: 'Rest Day',
      isRestDay: true,
      estimatedDurationMin: 0,
      exercises: [],
    },
    {
      dayOfWeek: 5,
      dayName: 'Friday',
      focus: 'Full Body Burn',
      isRestDay: false,
      estimatedDurationMin: 35,
      exercises: [
        {
          name: 'Dumbbell Goblet Squat',
          equipment: 'Adjustable Dumbbells',
          sets: 3,
          reps: '10-12',
        },
      ],
    },
    {
      dayOfWeek: 6,
      dayName: 'Saturday',
      focus: 'Rest & Mobility',
      isRestDay: true,
      estimatedDurationMin: 15,
      exercises: [],
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
  dailyStatusByDate: {},
};

afterEach(() => {
  localStorage.clear();
});

describe('AI Weekly Plan Auto-Alignment & Workout Compliance Calendar', () => {
  it('marks rest days as complied by default and evaluates scheduled workout days accurately', () => {
    // Saturday 2026-11-28 is a rest day in SAMPLE_AI_PLAN -> complied by default
    const satRest = resolveDayCompliance({
      date: '2026-11-28',
      todayIso: '2026-11-28',
      startDate: '2026-11-24',
      weeklyPlan: SAMPLE_AI_PLAN,
      workouts: [],
    });
    expect(satRest.isRestDay).toBe(true);
    expect(satRest.status).toBe('rest_complied');

    // Past scheduled training day (Fri 2026-11-27) not completed -> missed
    const friMissed = resolveDayCompliance({
      date: '2026-11-27',
      todayIso: '2026-11-28',
      startDate: '2026-11-24',
      weeklyPlan: SAMPLE_AI_PLAN,
      workouts: [],
    });
    expect(friMissed.isRestDay).toBe(false);
    expect(friMissed.status).toBe('missed');

    // Monthly calendar computes compliance including rest days as complied
    const month = buildMonthComplianceCalendar({
      year: 2026,
      monthIndex: 10, // November
      todayIso: '2026-11-28',
      startDate: '2026-11-24',
      weeklyPlan: {
        ...SAMPLE_AI_PLAN,
        dailyStatusByDate: {
          '2026-11-25': 'completed',
          '2026-11-27': 'partial',
        },
      },
      workouts: [],
    });
    // Evaluated days Nov 24..28 (5 days):
    // 24 Tue (rest_complied), 25 Wed (completed), 26 Thu (rest_complied), 27 Fri (partial), 28 Sat (rest_complied)
    expect(month.evaluatedDaysCount).toBe(5);
    expect(month.completedCount).toBe(1);
    expect(month.restCompliedCount).toBe(3);
    expect(month.partialCount).toBe(1);
    expect(month.missedCount).toBe(0);
    expect(month.compliancePct).toBe(90); // (1 + 3 + 0.5) / 5 = 90%
  });

  it('automatically updates Daily Log workouts when an AI Weekly Plan is saved (no manual Load button required)', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_ai_plan_auto_align',
    });
    await repo.initializeIfNeeded();
    await repo.saveWeeklyPlan(SAMPLE_AI_PLAN);

    // Open Training on Wednesday (default split would say "Workday — Active Recovery & Sleep",
    // but AI Weekly Plan schedules "Wednesday — Upper Body Tone" with Dumbbell Lateral Raise!)
    render(
      <App repository={repo} initialTab="training" initialDate="2026-12-02" />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Wednesday — Upper Body Tone'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Dumbbell Lateral Raise')).toBeInTheDocument();
    expect(
      screen.queryByText('Barbell Back Squat'),
    ).not.toBeInTheDocument();

    // Navigate to Saturday 2026-12-05 (default split would show Barbell Back Squat,
    // but AI Weekly Plan schedules Saturday as "Rest & Mobility" complied by default!)
    await user.click(screen.getByRole('button', { name: 'Next day' })); // Thu
    await user.click(screen.getByRole('button', { name: 'Next day' })); // Fri
    await user.click(screen.getByRole('button', { name: 'Next day' })); // Sat

    await waitFor(() => {
      expect(
        screen.getByText('Saturday — Rest & Mobility'),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Barbell Back Squat'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Rest day — automatically counted as complied by default/i),
    ).toBeInTheDocument();
  });

  it('renders Workout Compliance Calendar in both Training and Progress tabs and syncs compliance ticks', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_compliance_calendar_tabs',
    });
    await repo.initializeIfNeeded();
    await repo.saveWeeklyPlan(SAMPLE_AI_PLAN);

    render(
      <App repository={repo} initialTab="training" initialDate="2026-11-28" />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: 'Workout Compliance Calendar' }),
      ).toBeInTheDocument();
    });

    const trainingCalendar = screen.getByRole('region', {
      name: 'Workout Compliance Calendar',
    });
    // Mark Saturday 2026-11-28 or Friday 2026-11-27 Partial via calendar
    const friCell = within(trainingCalendar).getByRole('button', {
      name: /2026-11-27/i,
    });
    await user.click(friCell);
    await user.click(
      within(trainingCalendar).getByRole('button', {
        name: 'Calendar status: Partially Completed',
      }),
    );

    await waitFor(() => {
      expect(within(trainingCalendar).getByText('1 Partial')).toBeInTheDocument();
    });

    // Switch to Progress tab -> Calendar is visible and shows the synced 1 Partial count
    await user.click(screen.getByRole('button', { name: 'Progress' }));
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: 'Workout Compliance Calendar' }),
      ).toBeInTheDocument();
    });
    const progressCalendar = screen.getByRole('region', {
      name: 'Workout Compliance Calendar',
    });
    expect(within(progressCalendar).getByText('1 Partial')).toBeInTheDocument();
  });
});
