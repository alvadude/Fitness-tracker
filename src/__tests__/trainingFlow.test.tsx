import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { RestTimer } from '../features/training/RestTimer';
import { resolveEffectiveWeightKg } from '../features/training/TreadmillLogger';
import {
  IndexedDbRepository,
  type FitnessStorageAdapter,
} from '../services/storage';

async function renderTrainingApp(storageKey: string, initialDate: string) {
  const repo = new IndexedDbRepository({ localStorageKey: storageKey });
  const view = render(
    <App repository={repo} initialTab="training" initialDate={initialDate} />,
  );
  await waitFor(() => {
    expect(screen.queryByText('Loading fitness data...')).not.toBeInTheDocument();
  });
  return { repo, ...view };
}

describe('TrainingView, WorkoutLogger, TreadmillLogger & RestTimer', () => {
  it('shows workday recovery, Nov 24 treadmill log, Nov 25 Pickleball session, and persists Thu Nov 26 sleep + easy walk across remount', async () => {
    const user = userEvent.setup();
    const key = 'test_training_workday_recovery';

    const { unmount } = await renderTrainingApp(key, '2026-11-24');

    expect(
      screen.getByText('Tuesday — Active Recovery Walk'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Workday hours: 7:30 AM – 8:00 PM/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Prioritize 7\+ hours sleep on Tue–Fri workdays/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/22 min @ 8%, 4\.5 kph = 185 kcal/i),
    ).toBeInTheDocument();

    // Navigate to Wed Nov 25 (seeded Pickleball session)
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(
      screen.getByText('Wednesday — Pickleball Session'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pickleball')).toBeInTheDocument();
    expect(screen.getByText(/120 min = 575 kcal/i)).toBeInTheDocument();

    // Navigate to Thu Nov 26 (unlogged workday)
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(
      screen.getByText('Workday — Active Recovery & Sleep'),
    ).toBeInTheDocument();

    const sleepInput = screen.getByLabelText('Sleep (hours)');
    await user.clear(sleepInput);
    await user.type(sleepInput, '7.5');
    await user.click(screen.getByRole('button', { name: 'Save Sleep' }));

    await waitFor(() => {
      expect(screen.getByText(/7\.5h logged · >=7h goal met/i)).toBeInTheDocument();
    });

    // Log default 15 min easy walk (15 min @ 3%, 4.2 kph)
    await user.click(screen.getByRole('button', { name: 'Add Cardio' }));

    await waitFor(() => {
      expect(
        screen.getByText(/15 min @ 3%, 4\.2 kph =/i),
      ).toBeInTheDocument();
    });

    unmount();

    // Remount with fresh repository reading persisted storage
    await renderTrainingApp(key, '2026-11-26');
    expect(screen.getByLabelText('Sleep (hours)')).toHaveValue(7.5);
    expect(screen.getByText(/7\.5h logged · >=7h goal met/i)).toBeInTheDocument();
    expect(screen.getByText(/15 min @ 3%, 4\.2 kph =/i)).toBeInTheDocument();
  });

  it('navigates pre-populated Sat, Sun (4-set Bent-Over Row), and Mon interval run splits', async () => {
    const user = userEvent.setup();
    const key = 'test_training_splits';

    await renderTrainingApp(key, '2026-11-28');

    // Saturday
    expect(
      screen.getByText('Saturday — Lower & Incline Walk'),
    ).toBeInTheDocument();
    expect(screen.getByText('Barbell')).toBeInTheDocument();
    expect(screen.getByText('Adjustable Dumbbells')).toBeInTheDocument();
    expect(screen.getByText('Weight Bench')).toBeInTheDocument();
    expect(screen.getByText('Squat Rack')).toBeInTheDocument();
    expect(screen.getByText('Treadmill')).toBeInTheDocument();

    expect(screen.getByText('Barbell Back Squat')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Barbell Back Squat Set 4 weight (kg)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Barbell Romanian Deadlift')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Barbell Romanian Deadlift Set 3 weight (kg)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/30 min @ 8%, 4\.5 kph = 253 kcal/i),
    ).toBeInTheDocument();

    // Sunday
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByText('Sunday — Upper Push/Pull')).toBeInTheDocument();
    expect(screen.getByText('Barbell Bench Press')).toBeInTheDocument();
    expect(screen.getByText('Barbell Bent-Over Row')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Barbell Bent-Over Row Set 4 reps'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dumbbell Shoulder Press')).toBeInTheDocument();

    // Monday
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(
      screen.getByText('Monday — Full Body & Interval Run'),
    ).toBeInTheDocument();
    expect(screen.getByText('Dumbbell Goblet Squat')).toBeInTheDocument();
    expect(screen.getByText('Incline Dumbbell Press')).toBeInTheDocument();
    expect(screen.getByText(/20 min @ 1%, 5\.9 kph =/i)).toBeInTheDocument();
    expect(screen.getByText(/Jog 8 kph \/ Walk 4\.8 kph/i)).toBeInTheDocument();
    expect(screen.getByText('1 min jog / 2 min walk')).toBeInTheDocument();
  });

  it('persists logged sets/reps/kg and workout completion across remount and shows Prev numbers next Saturday', async () => {
    const user = userEvent.setup();
    const key = 'test_training_overload';

    const { unmount } = await renderTrainingApp(key, '2026-11-28');

    const squatWeight1 = screen.getByLabelText(
      'Barbell Back Squat Set 1 weight (kg)',
    );
    const squatReps1 = screen.getByLabelText('Barbell Back Squat Set 1 reps');
    await user.type(squatWeight1, '60');
    await user.type(squatReps1, '8');

    const completeSet1Btn = screen.getByRole('button', {
      name: 'Complete Set 1 — Barbell Back Squat',
    });
    await user.click(completeSet1Btn);
    expect(completeSet1Btn).toHaveAttribute('aria-pressed', 'true');

    const completeWorkoutBtn = screen.getByRole('button', {
      name: /Complete Workout/i,
    });
    await user.click(completeWorkoutBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Workout Completed/i }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    unmount();

    // Remount on same Saturday to confirm persistence
    await renderTrainingApp(key, '2026-11-28');
    expect(
      screen.getByLabelText('Barbell Back Squat Set 1 weight (kg)'),
    ).toHaveValue(60);
    expect(
      screen.getByLabelText('Barbell Back Squat Set 1 reps'),
    ).toHaveValue(8);
    expect(
      screen.getByRole('button', { name: 'Complete Set 1 — Barbell Back Squat' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /Workout Completed/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Navigate to next Saturday (2026-12-05) via date input and check Prev: 60 kg × 8
    const dateInput = screen.getByLabelText('Training date');
    fireEvent.change(dateInput, { target: { value: '2026-12-05' } });

    await waitFor(() => {
      expect(screen.getByText('Prev: 60 kg × 8')).toBeInTheDocument();
    });
  });

  it('updates live treadmill calorie estimate based on body weight and edits pre-populated cardio without duplication', async () => {
    const user = userEvent.setup();
    const key = 'test_training_treadmill';

    // First check at baseline 84.0 kg on Saturday 2026-11-28
    const { unmount } = await renderTrainingApp(key, '2026-11-28');
    expect(screen.getByText('253 kcal')).toBeInTheDocument();
    expect(screen.getByText(/at 84\.0 kg/i)).toBeInTheDocument();

    // Edit pre-populated cardio in place (no duplicate entry)
    await user.click(screen.getByRole('button', { name: 'Edit cardio 1' }));
    const durationInput = screen.getByLabelText('Duration (min)');
    await user.clear(durationInput);
    await user.type(durationInput, '35');
    await user.click(screen.getByRole('button', { name: 'Save Cardio' }));

    await waitFor(() => {
      expect(
        screen.getByText(/35 min @ 8%, 4\.5 kph = 295 kcal/i),
      ).toBeInTheDocument();
    });

    unmount();

    // Add a 70.0 kg weigh-in on 2026-11-28 and remount to confirm single entry + weight-reactive live burn
    const repo2 = new IndexedDbRepository({ localStorageKey: key });
    await repo2.initializeIfNeeded();
    await repo2.upsertWeighIn({
      id: 'weighin-70',
      date: '2026-11-28',
      weightKg: 70.0,
      isFasted: true,
      createdAt: '2026-11-28T07:00:00.000Z',
    });

    render(
      <App repository={repo2} initialTab="training" initialDate="2026-11-28" />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    // Only 1 saved cardio entry (still 35 min, no duplicate)
    expect(screen.getAllByRole('button', { name: /Edit cardio/i })).toHaveLength(
      1,
    );
    expect(
      screen.getByText(/35 min @ 8%, 4\.5 kph = 295 kcal/i),
    ).toBeInTheDocument();

    // Live estimator form now calibrated to 70.0 kg (30 min @ 8%, 4.5 kph -> 211 kcal)
    expect(screen.getByText('211 kcal')).toBeInTheDocument();
    expect(screen.getByText(/at 70\.0 kg/i)).toBeInTheDocument();
  });

  it('supports RestTimer presets (90s, 2m, 3m), +15s, Start/Pause/Reset, and completion alert in jsdom', () => {
    const vibrateMock = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      configurable: true,
    });

    vi.useFakeTimers();
    try {
      render(<RestTimer />);

      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '01:30',
      );

      fireEvent.click(screen.getByRole('button', { name: '2m' }));
      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '02:00',
      );

      fireEvent.click(screen.getByRole('button', { name: '3m' }));
      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '03:00',
      );

      fireEvent.click(screen.getByRole('button', { name: '90s' }));
      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '01:30',
      );

      // +15s
      fireEvent.click(screen.getByRole('button', { name: /15s/i }));
      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '01:45',
      );

      // Start & advance 15s
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '01:30',
      );

      // Pause & advance 5s (stays paused at 01:30)
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '01:30',
      );

      // Reset -> 01:30
      fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '01:30',
      );

      // Countdown to 00:00
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      act(() => {
        vi.advanceTimersByTime(90_000);
      });

      expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
        '00:00',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Rest complete — ready for next set',
      );
      expect(vibrateMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports adding sets, clearing weight to null, quick-starting exercise rest timer, and removing cardio', async () => {
    const user = userEvent.setup();
    const key = 'test_training_extras';

    await renderTrainingApp(key, '2026-11-28');

    // Add Set to Barbell Back Squat (goes from 4 sets to 5 sets)
    const addSetButtons = screen.getAllByRole('button', { name: /Add Set/i });
    await user.click(addSetButtons[0]);
    expect(
      screen.getByLabelText('Barbell Back Squat Set 5 weight (kg)'),
    ).toBeInTheDocument();

    // Enter then clear weight input -> null (no NaN)
    const set1Weight = screen.getByLabelText(
      'Barbell Back Squat Set 1 weight (kg)',
    );
    await user.type(set1Weight, '80');
    expect(set1Weight).toHaveValue(80);
    await user.clear(set1Weight);
    expect(set1Weight).toHaveValue(null);

    // Quick-start RestTimer via Barbell Back Squat manual Rest 3m button
    await user.click(
      screen.getByRole('button', {
        name: 'Start 3m rest timer',
      }),
    );
    expect(screen.getByLabelText('Remaining rest time')).toHaveTextContent(
      '03:00',
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // Remove pre-populated cardio entry
    await user.click(screen.getByRole('button', { name: 'Remove cardio 1' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Edit cardio 1' }),
      ).not.toBeInTheDocument();
    });
  });

  it('preserves both new cardio and workout completion when Add Cardio and Mark Workout Complete are clicked back-to-back with delayed storage', async () => {
    const user = userEvent.setup();
    const baseRepo = new IndexedDbRepository({
      localStorageKey: 'test_training_async_race',
    });
    const delayedRepo: FitnessStorageAdapter = {
      initializeIfNeeded: () => baseRepo.initializeIfNeeded(),
      getState: () => baseRepo.getState(),
      saveProfile: (p) => baseRepo.saveProfile(p),
      saveTargets: (t) => baseRepo.saveTargets(t),
      savePresets: (ps) => baseRepo.savePresets(ps),
      upsertMeal: (m) => baseRepo.upsertMeal(m),
      deleteMeal: (id) => baseRepo.deleteMeal(id),
      upsertWorkout: async (workout) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return baseRepo.upsertWorkout(workout);
      },
      upsertWeighIn: (w) => baseRepo.upsertWeighIn(w),
      deleteWeighIn: (id) => baseRepo.deleteWeighIn(id),
      saveSettings: (s) => baseRepo.saveSettings(s),
      exportBackup: () => baseRepo.exportBackup(),
      importBackup: (raw) => baseRepo.importBackup(raw),
      resetToSeed: () => baseRepo.resetToSeed(),
    };

    render(
      <App
        repository={delayedRepo}
        initialTab="training"
        initialDate="2026-11-26"
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add Cardio' }));
    await user.click(
      screen.getByRole('button', { name: /Complete Workout/i }),
    );

    await waitFor(async () => {
      const persisted = await baseRepo.getState();
      const thu = persisted.workouts.find((w) => w.date === '2026-11-26');
      expect(thu?.completed).toBe(true);
      expect(thu?.cardio).toHaveLength(1);
      expect(thu?.cardio[0]?.durationMin).toBe(15);
    });

    expect(
      screen.getByRole('button', { name: /Workout Completed/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(/15 min @ 3%, 4\.2 kph =/i),
    ).toBeInTheDocument();
  });

  it('keeps RestTimer idle when navigating Off-Day -> Workday -> Off-Day after resetting a quick-started timer', async () => {
    const user = userEvent.setup();
    await renderTrainingApp('test_training_timer_nav', '2026-11-28');

    await user.click(
      screen.getByRole('button', {
        name: 'Start 3m rest timer',
      }),
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset timer' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    // Navigate to Tuesday (workday, unmounts RestTimer)
    const dateInput = screen.getByLabelText('Training date');
    fireEvent.change(dateInput, { target: { value: '2026-12-01' } });
    expect(screen.getByText(/Workday · Active Recovery/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Rest Timer' }),
    ).not.toBeInTheDocument();

    // Navigate back to Saturday (off-day, remounts RestTimer)
    fireEvent.change(screen.getByLabelText('Training date'), {
      target: { value: '2026-11-28' },
    });
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pause' }),
    ).not.toBeInTheDocument();
  });

  it('ignores non-positive weigh-ins, validates 0 duration cardio with role=alert, and toggles RestTimer mute', async () => {
    const user = userEvent.setup();

    // Defensive resolveEffectiveWeightKg unit checks
    expect(
      resolveEffectiveWeightKg(
        '2026-11-28',
        [
          {
            id: 'w-bad-neg',
            date: '2026-11-28',
            weightKg: -5,
            isFasted: true,
            createdAt: '2026-11-28T07:00:00.000Z',
          },
          {
            id: 'w-bad-zero',
            date: '2026-11-28',
            weightKg: 0,
            isFasted: true,
            createdAt: '2026-11-28T07:05:00.000Z',
          },
        ],
        84,
      ),
    ).toBe(84);
    expect(resolveEffectiveWeightKg('2026-11-28', [], -10)).toBe(84);

    // End-to-end UI check with a corrupted negative weigh-in
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_training_defensive_treadmill',
    });
    await repo.initializeIfNeeded();
    await repo.upsertWeighIn({
      id: 'bad-weighin',
      date: '2026-11-28',
      weightKg: -5,
      isFasted: true,
      createdAt: '2026-11-28T07:00:00.000Z',
    });

    render(
      <App
        repository={repo}
        initialTab="training"
        initialDate="2026-11-28"
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByText(/at 84\.0 kg/i)).toBeInTheDocument();
    expect(screen.queryByText(/at -5\.0 kg/i)).not.toBeInTheDocument();

    // Duration 0 shows role="alert"
    const durationInput = screen.getByLabelText('Duration (min)');
    await user.clear(durationInput);
    await user.type(durationInput, '0');
    await user.click(screen.getByRole('button', { name: 'Add Cardio' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/greater than 0/i);

    // RestTimer mute toggle
    const muteBtn = screen.getByRole('button', { name: 'Mute timer alert' });
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(muteBtn);
    const unmuteBtn = screen.getByRole('button', {
      name: 'Unmute timer alert',
    });
    expect(unmuteBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('validates sleep input on submit/blur without saving partial keystrokes and clears alert on valid save', async () => {
    const user = userEvent.setup();
    const key = 'test_training_sleep_validation';
    const { repo, unmount } = await renderTrainingApp(key, '2026-11-25');

    const sleepInput = screen.getByLabelText('Sleep (hours)');
    await user.clear(sleepInput);
    await user.type(sleepInput, '25');
    fireEvent.blur(sleepInput);

    expect(screen.getByRole('alert')).toHaveTextContent(/between 0 and 24/i);
    expect(sleepInput).toHaveValue(25);
    expect(screen.queryByText(/2h logged/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save Sleep' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/between 0 and 24/i);

    const stateAfterInvalid = await repo.getState();
    const wedInvalid = stateAfterInvalid.workouts.find(
      (w) => w.date === '2026-11-25',
    );
    expect(wedInvalid?.sleepHours).toBeUndefined();

    // Fix to valid 7.5 (alert clears on valid input and persists on save)
    await user.clear(sleepInput);
    await user.type(sleepInput, '7.5');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Sleep' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.getByText(/7\.5h logged · >=7h goal met/i),
      ).toBeInTheDocument();
    });

    unmount();
    await renderTrainingApp(key, '2026-11-25');
    expect(screen.getByLabelText('Sleep (hours)')).toHaveValue(7.5);
  });

  it('preserves newly added cardio when Remove cardio 1 is clicked while Add Cardio is in-flight (Probe 1e-remove)', async () => {
    const user = userEvent.setup();
    const baseRepo = new IndexedDbRepository({
      localStorageKey: 'test_training_probe_1e_remove',
    });
    const delayedRepo: FitnessStorageAdapter = {
      initializeIfNeeded: () => baseRepo.initializeIfNeeded(),
      getState: () => baseRepo.getState(),
      saveProfile: (p) => baseRepo.saveProfile(p),
      saveTargets: (t) => baseRepo.saveTargets(t),
      savePresets: (ps) => baseRepo.savePresets(ps),
      upsertMeal: (m) => baseRepo.upsertMeal(m),
      deleteMeal: (id) => baseRepo.deleteMeal(id),
      upsertWorkout: async (workout) => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return baseRepo.upsertWorkout(workout);
      },
      upsertWeighIn: (w) => baseRepo.upsertWeighIn(w),
      deleteWeighIn: (id) => baseRepo.deleteWeighIn(id),
      saveSettings: (s) => baseRepo.saveSettings(s),
      exportBackup: () => baseRepo.exportBackup(),
      importBackup: (raw) => baseRepo.importBackup(raw),
      resetToSeed: () => baseRepo.resetToSeed(),
    };

    render(
      <App
        repository={delayedRepo}
        initialTab="training"
        initialDate="2026-11-28"
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    // Distinguish the newly added entry (15 min) from the pre-populated 30 min entry
    const durationInput = screen.getByLabelText('Duration (min)');
    await user.clear(durationInput);
    await user.type(durationInput, '15');

    await user.click(screen.getByRole('button', { name: 'Add Cardio' }));
    await user.click(screen.getByRole('button', { name: 'Remove cardio 1' }));

    await waitFor(async () => {
      const persisted = await baseRepo.getState();
      const sat = persisted.workouts.find((w) => w.date === '2026-11-28');
      expect(sat?.cardio).toHaveLength(1);
      expect(sat?.cardio[0]?.durationMin).toBe(15);
    });

    expect(
      screen.queryByText(/30 min @ 8%, 4\.5 kph/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/15 min @ 8%, 4\.5 kph/i)).toBeInTheDocument();
  });

  it('preserves workout completion across A -> B -> A mid-flight navigation before saving sleep (Probe 1d-strict)', async () => {
    const user = userEvent.setup();
    const baseRepo = new IndexedDbRepository({
      localStorageKey: 'test_training_probe_1d_strict',
    });
    const delayedRepo: FitnessStorageAdapter = {
      initializeIfNeeded: () => baseRepo.initializeIfNeeded(),
      getState: () => baseRepo.getState(),
      saveProfile: (p) => baseRepo.saveProfile(p),
      saveTargets: (t) => baseRepo.saveTargets(t),
      savePresets: (ps) => baseRepo.savePresets(ps),
      upsertMeal: (m) => baseRepo.upsertMeal(m),
      deleteMeal: (id) => baseRepo.deleteMeal(id),
      upsertWorkout: async (workout) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return baseRepo.upsertWorkout(workout);
      },
      upsertWeighIn: (w) => baseRepo.upsertWeighIn(w),
      deleteWeighIn: (id) => baseRepo.deleteWeighIn(id),
      saveSettings: (s) => baseRepo.saveSettings(s),
      exportBackup: () => baseRepo.exportBackup(),
      importBackup: (raw) => baseRepo.importBackup(raw),
      resetToSeed: () => baseRepo.resetToSeed(),
    };

    render(
      <App
        repository={delayedRepo}
        initialTab="training"
        initialDate="2026-11-26"
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Complete Workout/i }),
    );

    // Immediately navigate A (2026-11-26) -> B (2026-11-27) -> A (2026-11-26) while write is in-flight
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByText('2026-11-27')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(screen.getByText('2026-11-26')).toBeInTheDocument();

    const sleepInput = screen.getByLabelText('Sleep (hours)');
    await user.type(sleepInput, '7.5');
    await user.click(screen.getByRole('button', { name: 'Save Sleep' }));

    await waitFor(async () => {
      const persisted = await baseRepo.getState();
      const thu = persisted.workouts.find((w) => w.date === '2026-11-26');
      expect(thu?.completed).toBe(true);
      expect(thu?.sleepHours).toBe(7.5);
    });

    expect(
      screen.getByRole('button', { name: /Workout Completed/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(/7\.5h logged · >=7h goal met/i),
    ).toBeInTheDocument();
  });

  it('preserves Squat Set 1 edit across Sat -> Sun -> Sat mid-flight navigation before editing Squat Set 2', async () => {
    const user = userEvent.setup();
    const baseRepo = new IndexedDbRepository({
      localStorageKey: 'test_training_workout_roundtrip',
    });
    const delayedRepo: FitnessStorageAdapter = {
      initializeIfNeeded: () => baseRepo.initializeIfNeeded(),
      getState: () => baseRepo.getState(),
      saveProfile: (p) => baseRepo.saveProfile(p),
      saveTargets: (t) => baseRepo.saveTargets(t),
      savePresets: (ps) => baseRepo.savePresets(ps),
      upsertMeal: (m) => baseRepo.upsertMeal(m),
      deleteMeal: (id) => baseRepo.deleteMeal(id),
      upsertWorkout: async (workout) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return baseRepo.upsertWorkout(workout);
      },
      upsertWeighIn: (w) => baseRepo.upsertWeighIn(w),
      deleteWeighIn: (id) => baseRepo.deleteWeighIn(id),
      saveSettings: (s) => baseRepo.saveSettings(s),
      exportBackup: () => baseRepo.exportBackup(),
      importBackup: (raw) => baseRepo.importBackup(raw),
      resetToSeed: () => baseRepo.resetToSeed(),
    };

    render(
      <App
        repository={delayedRepo}
        initialTab="training"
        initialDate="2026-11-28"
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    const squatSet1Weight = screen.getByLabelText(
      'Barbell Back Squat Set 1 weight (kg)',
    );
    fireEvent.change(squatSet1Weight, { target: { value: '80' } });

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(screen.getByText('Sunday — Upper Push/Pull')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(
      screen.getByText('Saturday — Lower & Incline Walk'),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText('Barbell Back Squat Set 1 weight (kg)'),
    ).toHaveValue(80);

    const squatSet2Weight = screen.getByLabelText(
      'Barbell Back Squat Set 2 weight (kg)',
    );
    fireEvent.change(squatSet2Weight, { target: { value: '85' } });

    await waitFor(async () => {
      const persisted = await baseRepo.getState();
      const sat = persisted.workouts.find((w) => w.date === '2026-11-28');
      const squat = sat?.exercises.find(
        (ex) => ex.exerciseId === 'barbell_back_squat',
      );
      expect(squat?.sets[0]?.weightKg).toBe(80);
      expect(squat?.sets[1]?.weightKg).toBe(85);
    });
  });

  it('preserves newly added cardio when Edit cardio 1 -> Save Cardio runs while Add Cardio is in-flight', async () => {
    const user = userEvent.setup();
    const baseRepo = new IndexedDbRepository({
      localStorageKey: 'test_training_probe_1e_edit_concurrent',
    });
    const delayedRepo: FitnessStorageAdapter = {
      initializeIfNeeded: () => baseRepo.initializeIfNeeded(),
      getState: () => baseRepo.getState(),
      saveProfile: (p) => baseRepo.saveProfile(p),
      saveTargets: (t) => baseRepo.saveTargets(t),
      savePresets: (ps) => baseRepo.savePresets(ps),
      upsertMeal: (m) => baseRepo.upsertMeal(m),
      deleteMeal: (id) => baseRepo.deleteMeal(id),
      upsertWorkout: async (workout) => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return baseRepo.upsertWorkout(workout);
      },
      upsertWeighIn: (w) => baseRepo.upsertWeighIn(w),
      deleteWeighIn: (id) => baseRepo.deleteWeighIn(id),
      saveSettings: (s) => baseRepo.saveSettings(s),
      exportBackup: () => baseRepo.exportBackup(),
      importBackup: (raw) => baseRepo.importBackup(raw),
      resetToSeed: () => baseRepo.resetToSeed(),
    };

    render(
      <App
        repository={delayedRepo}
        initialTab="training"
        initialDate="2026-11-28"
      />,
    );
    await waitFor(() => {
      expect(
        screen.queryByText('Loading fitness data...'),
      ).not.toBeInTheDocument();
    });

    const durationInput = screen.getByLabelText('Duration (min)');
    await user.clear(durationInput);
    await user.type(durationInput, '15');
    await user.click(screen.getByRole('button', { name: 'Add Cardio' }));

    await user.click(screen.getByRole('button', { name: 'Edit cardio 1' }));
    const editDuration = screen.getByLabelText('Duration (min)');
    await user.clear(editDuration);
    await user.type(editDuration, '35');
    await user.click(screen.getByRole('button', { name: 'Save Cardio' }));

    await waitFor(async () => {
      const persisted = await baseRepo.getState();
      const sat = persisted.workouts.find((w) => w.date === '2026-11-28');
      expect(sat?.cardio).toHaveLength(2);
      expect(sat?.cardio.map((c) => c.durationMin)).toEqual([35, 15]);
    });
  });
});
