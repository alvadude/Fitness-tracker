import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { AdherenceBarChart } from '../components/AdherenceBarChart';
import { WeightTrendChart } from '../components/WeightTrendChart';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_TARGETS } from '../domain/defaults';
import {
  computeDailyAdherenceSeries,
  computeWeeklyReport,
} from '../domain/progress';
import { createInitialSeedState } from '../domain/seed';
import type { MealEntry, WeighInEntry, WorkoutSession } from '../domain/types';
import { WeeklyReportCard } from '../features/progress/WeeklyReportCard';
import { WeighInModal } from '../features/progress/WeighInModal';
import {
  DAILY_REMINDER_BODY,
  LOCAL_DAILY_REMINDER_KEY,
  LOCAL_WEEKLY_REMINDER_KEY,
  SATURDAY_REMINDER_BODY,
  downloadCombinedRemindersIcs,
  downloadDailyCheckInIcs,
  downloadSaturdayWeighInIcs,
  evaluateForegroundReminders,
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '../services/notifications/reminderService';
import {
  IndexedDbRepository,
  getStoredGeminiApiKey,
} from '../services/storage';

const originalNotification = window.Notification;

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsText(blob);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: originalNotification,
  });
  localStorage.removeItem(LOCAL_DAILY_REMINDER_KEY);
  localStorage.removeItem(LOCAL_WEEKLY_REMINDER_KEY);
});

describe('ProgressView & WeighInModal', () => {
  it('auto-surfaces dismissible Saturday 7:00 AM weigh-in banner and keeps Log Morning Weigh-In accessible', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_m4_sat_banner',
    });

    render(
      <App
        repository={repo}
        initialTab="progress"
        initialDate="2026-11-28"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Weight Trajectory')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('region', { name: 'Saturday 7:00 AM Weigh-In Prompt' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Morning weigh-in & weekly progress report ready.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(
      screen.queryByRole('region', { name: 'Saturday 7:00 AM Weigh-In Prompt' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Log Weigh-In' }),
    ).toBeInTheDocument();
  });

  it('validates, adds, edits, and 2-step deletes a weigh-in with persistence', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_m4_weighin_crud',
    });

    render(
      <App
        repository={repo}
        initialTab="progress"
        initialDate="2026-11-28"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Weight Trajectory')).toBeInTheDocument();
    });

    // Open modal from Saturday banner CTA
    const logButtons = screen.getAllByRole('button', {
      name: 'Log Weigh-In',
    });
    await user.click(logButtons[0]);

    const weightInput = screen.getByLabelText('Weight (kg)');
    await user.type(weightInput, '500');
    await user.click(screen.getByRole('button', { name: 'Save Weigh-In' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please enter a valid weight between 30 and 300 kg.',
    );

    await user.clear(weightInput);
    await user.type(weightInput, '83.1');
    await user.type(screen.getByLabelText('Notes (optional)'), 'After sleep');
    await user.click(screen.getByRole('button', { name: 'Save Weigh-In' }));

    await waitFor(() => {
      expect(screen.getAllByText('83.1 kg').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('After sleep')).toBeInTheDocument();

    let persisted = await repo.getState();
    expect(persisted.weighIns.some((w) => w.date === '2026-11-28' && w.weightKg === 83.1)).toBe(true);

    // Edit existing weigh-in
    await user.click(
      screen.getByRole('button', { name: 'Edit weigh-in 2026-11-28' }),
    );
    const editWeightInput = screen.getByLabelText('Weight (kg)');
    await user.clear(editWeightInput);
    await user.type(editWeightInput, '82.9');
    await user.click(screen.getByRole('button', { name: 'Update Weigh-In' }));

    await waitFor(() => {
      expect(screen.getAllByText('82.9 kg').length).toBeGreaterThan(0);
    });

    persisted = await repo.getState();
    const nov28Entries = persisted.weighIns.filter((w) => w.date === '2026-11-28');
    expect(nov28Entries).toHaveLength(1);
    expect(nov28Entries[0].weightKg).toBe(82.9);

    // 2-step delete
    await user.click(
      screen.getByRole('button', { name: 'Delete weigh-in 2026-11-28' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm delete weigh-in 2026-11-28' }),
    );

    await waitFor(() => {
      expect(screen.queryByText('82.9 kg')).not.toBeInTheDocument();
    });

    persisted = await repo.getState();
    expect(persisted.weighIns.some((w) => w.date === '2026-11-28')).toBe(false);
  });

  it('prevents synchronous double-submit on WeighInModal while onSave is pending', async () => {
    const user = userEvent.setup();
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onClose = vi.fn();

    render(
      <WeighInModal
        isOpen={true}
        onClose={onClose}
        defaultDate="2026-11-28"
        initialWeightKg={84.0}
        onSave={onSave}
      />,
    );

    await user.type(screen.getByLabelText('Weight (kg)'), '83.4');
    const form = screen
      .getByRole('button', { name: 'Save Weigh-In' })
      .closest('form');
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onSave).toHaveBeenCalledTimes(1);
    resolveSave();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces an accessible error alert and resets delete confirmation if deleteWeighIn fails', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_m4_weighin_delete_error',
    });
    vi.spyOn(repo, 'deleteWeighIn').mockRejectedValueOnce(
      new Error('Disk write failed'),
    );

    render(
      <App
        repository={repo}
        initialTab="progress"
        initialDate="2026-11-25"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Weigh-In History')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: 'Delete weigh-in 2026-11-24' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm delete weigh-in 2026-11-24' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Disk write failed');
    });
    expect(
      screen.queryByRole('button', { name: 'Confirm delete weigh-in 2026-11-24' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete weigh-in 2026-11-24' }),
    ).toBeInTheDocument();
  });
});

describe('WeeklyReportCard & Week N+1 Target Apply', () => {
  it('renders overload + calorie reduction recommendation and prevents double-incrementing Week N+1', async () => {
    const user = userEvent.setup();
    const meals: MealEntry[] = [
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ].map((date, idx) => ({
      id: `m-${idx}`,
      date,
      time: '12:00',
      name: 'Planned Meals',
      calories: 1900,
      proteinG: 160,
      carbsG: 180,
      fatG: 60,
      source: 'manual',
      isCaffeinated: false,
      createdAt: `${date}T12:00:00Z`,
    }));

    const weighIns: WeighInEntry[] = [
      {
        id: 'w-start',
        date: '2026-11-24',
        weightKg: 84.0,
        isFasted: true,
        createdAt: '2026-11-24T07:00:00Z',
      },
      {
        id: 'w-end',
        date: '2026-12-01',
        weightKg: 84.2,
        isFasted: true,
        createdAt: '2026-12-01T07:00:00Z',
      },
    ];

    const workouts: WorkoutSession[] = [
      {
        id: 'wo-sat',
        date: '2026-11-28',
        dayType: 'offday_sat_lower',
        title: 'Saturday Lower',
        completed: true,
        cardio: [],
        exercises: [
          {
            exerciseId: 'barbell_back_squat',
            name: 'Barbell Back Squat',
            equipment: 'barbell',
            defaultRestSec: 180,
            sets: [
              {
                setNumber: 1,
                targetRepsMin: 6,
                targetRepsMax: 8,
                weightKg: 60,
                reps: 8,
                completed: true,
              },
              {
                setNumber: 2,
                targetRepsMin: 6,
                targetRepsMax: 8,
                weightKg: 60,
                reps: 8,
                completed: true,
              },
            ],
          },
        ],
      },
    ];

    const onApply = vi.fn().mockResolvedValue(undefined);
    let currentTargets = { ...DEFAULT_TARGETS };

    const report = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: currentTargets,
      meals,
      workouts,
      weighIns,
    });

    const { rerender } = render(
      <WeeklyReportCard
        report={report}
        profile={DEFAULT_PROFILE}
        currentTargets={currentTargets}
        onApplyNextWeekTargets={onApply}
      />,
    );

    expect(screen.getByText('Weekly Report')).toBeInTheDocument();
    expect(screen.getByText('Barbell Back Squat')).toBeInTheDocument();
    expect(screen.getByText(/60 kg → 62\.5 kg/)).toBeInTheDocument();
    expect(screen.getByText(/1800 kcal/)).toBeInTheDocument();

    const applyBtn = screen.getByRole('button', {
      name: 'Apply Week 2 Targets',
    });
    await user.click(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ weekNumber: 2, calories: 1800 }),
    );

    // Simulate parent context updating targets to Week 2 and recomputing report
    currentTargets = { ...DEFAULT_TARGETS, weekNumber: 2, calories: 1800, carbsG: 155 };
    const recomputedReport = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: currentTargets,
      meals,
      workouts,
      weighIns,
    });

    rerender(
      <WeeklyReportCard
        report={recomputedReport}
        profile={DEFAULT_PROFILE}
        currentTargets={currentTargets}
        onApplyNextWeekTargets={onApply}
      />,
    );

    expect(
      screen.getByText('Applied Week 2 targets (1800 kcal).'),
    ).toBeInTheDocument();
    const appliedBtn = screen.getByRole('button', {
      name: 'Applied Week 2 Targets',
    });
    expect(appliedBtn).toBeDisabled();
    await user.click(appliedBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('clears appliedCycle when weekNumber changes externally on the same report endDate', async () => {
    const user = userEvent.setup();
    const meals: MealEntry[] = [
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ].map((date, idx) => ({
      id: `m-ext-${idx}`,
      date,
      time: '12:00',
      name: 'Planned Meals',
      calories: 1900,
      proteinG: 160,
      carbsG: 180,
      fatG: 60,
      source: 'manual',
      isCaffeinated: false,
      createdAt: `${date}T12:00:00Z`,
    }));

    const weighIns: WeighInEntry[] = [
      {
        id: 'w-ext-start',
        date: '2026-11-24',
        weightKg: 84.0,
        isFasted: true,
        createdAt: '2026-11-24T07:00:00Z',
      },
      {
        id: 'w-ext-end',
        date: '2026-12-01',
        weightKg: 84.2,
        isFasted: true,
        createdAt: '2026-12-01T07:00:00Z',
      },
    ];

    const onApply = vi.fn().mockResolvedValue(undefined);
    let currentTargets = { ...DEFAULT_TARGETS };
    const report1 = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: currentTargets,
      meals,
      workouts: [],
      weighIns,
    });

    const { rerender } = render(
      <WeeklyReportCard
        report={report1}
        profile={DEFAULT_PROFILE}
        currentTargets={currentTargets}
        onApplyNextWeekTargets={onApply}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Apply Week 2 Targets' }));
    expect(onApply).toHaveBeenCalledTimes(1);

    // Card's own apply updates weekNumber 1 -> 2: remains locked for this cycle
    currentTargets = { ...DEFAULT_TARGETS, weekNumber: 2, calories: 1800, carbsG: 155 };
    const report2 = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: currentTargets,
      meals,
      workouts: [],
      weighIns,
    });
    rerender(
      <WeeklyReportCard
        report={report2}
        profile={DEFAULT_PROFILE}
        currentTargets={currentTargets}
        onApplyNextWeekTargets={onApply}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Applied Week 2 Targets' }),
    ).toBeDisabled();

    // External Settings/import increases weekNumber 2 -> 3 on same endDate -> unlocks Week 4
    currentTargets = { ...DEFAULT_TARGETS, weekNumber: 3, calories: 1750, carbsG: 143 };
    const report3 = computeWeeklyReport({
      endDate: '2026-12-01',
      profile: DEFAULT_PROFILE,
      targets: currentTargets,
      meals,
      workouts: [],
      weighIns,
    });
    rerender(
      <WeeklyReportCard
        report={report3}
        profile={DEFAULT_PROFILE}
        currentTargets={currentTargets}
        onApplyNextWeekTargets={onApply}
      />,
    );

    expect(
      screen.queryByText(/Applied Week 2 targets/i),
    ).not.toBeInTheDocument();
    const applyWeek4Btn = screen.getByRole('button', {
      name: 'Apply Week 4 Targets',
    });
    expect(applyWeek4Btn).toBeEnabled();

    await user.click(applyWeek4Btn);
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply).toHaveBeenLastCalledWith(
      expect.objectContaining({ weekNumber: 4 }),
    );
  });
});

describe('SVG Charts (WeightTrendChart & AdherenceBarChart)', () => {
  it('renders WeightTrendChart safely with 0, 1, many, and identical flat weights without NaN', () => {
    const { rerender, container } = render(
      <WeightTrendChart profile={DEFAULT_PROFILE} weighIns={[]} />,
    );
    const svg = screen.getByRole('img', {
      name: 'Weight trend versus target trajectory chart',
    });
    expect(svg).toHaveAttribute('viewBox', '0 0 340 190');
    expect(svg).toHaveClass('w-full');
    expect(screen.getByText('No weigh-ins logged yet')).toBeInTheDocument();
    expect(screen.getByTestId('trajectory-line')).toBeInTheDocument();

    // 1 weigh-in
    rerender(
      <WeightTrendChart
        profile={DEFAULT_PROFILE}
        weighIns={createInitialSeedState().weighIns}
        referenceDate="2026-11-24"
      />,
    );
    expect(screen.getAllByTestId('weighin-point')).toHaveLength(1);
    expect(screen.getByText('84.0 kg')).toBeInTheDocument();

    // Identical weights & degenerate same-date profile
    rerender(
      <WeightTrendChart
        profile={{
          ...DEFAULT_PROFILE,
          targetWeightKg: 84.0,
          targetDate: '2026-11-24',
        }}
        weighIns={[
          {
            id: 'w1',
            date: '2026-11-24',
            weightKg: 84.0,
            isFasted: true,
            createdAt: '2026-11-24T07:00:00Z',
          },
          {
            id: 'w2',
            date: '2026-11-25',
            weightKg: 84.0,
            isFasted: true,
            createdAt: '2026-11-25T07:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('actual-weight-line')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('renders AdherenceBarChart safely with >100% and 0-kcal days and target lines', () => {
    const seed = createInitialSeedState();
    const series = computeDailyAdherenceSeries(
      seed.meals,
      seed.targets,
      '2026-11-25',
      7,
    );

    const { container } = render(
      <AdherenceBarChart series={series} targets={seed.targets} />,
    );

    const svg = screen.getByRole('img', {
      name: '7-day calorie and protein adherence chart',
    });
    expect(svg).toHaveAttribute('viewBox', '0 0 340 224');
    expect(svg).toHaveClass('w-full');
    expect(screen.getByTestId('calories-target-line')).toBeInTheDocument();
    expect(screen.getByTestId('protein-target-line')).toBeInTheDocument();
    expect(screen.getAllByTestId('cal-adherence-bar')).toHaveLength(7);
    expect(screen.getAllByTestId('protein-adherence-bar')).toHaveLength(7);
    expect(container.innerHTML).not.toContain('NaN');
  });
});

describe('reminderService', () => {
  it('handles missing window.Notification gracefully', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(isNotificationSupported()).toBe(false);
    expect(getNotificationPermission()).toBe('unsupported');
    expect(await requestNotificationPermission()).toBe('unsupported');

    const onUpdateSettings = vi.fn();
    const res = await evaluateForegroundReminders({
      now: new Date(2026, 10, 28, 20, 15, 0),
      settings: { ...DEFAULT_SETTINGS, notificationsEnabled: true },
      onUpdateSettings,
    });
    expect(res).toEqual({ dailyTriggered: false, weeklyTriggered: false });
    expect(onUpdateSettings).not.toHaveBeenCalled();
  });

  it('supports legacy callback-style Notification.requestPermission', async () => {
    const mockCtor = Object.assign(vi.fn(), {
      permission: 'default' as NotificationPermission,
      requestPermission: vi.fn((cb?: NotificationPermissionCallback) => {
        if (cb) cb('granted');
        return undefined as unknown as Promise<NotificationPermission>;
      }),
    });

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: mockCtor,
    });

    const perm = await requestNotificationPermission();
    expect(perm).toBe('granted');
  });

  it('fires exact Daily 8 PM and Saturday 7 AM reminders without duplicate triggers on the same date', async () => {
    const notifications: Array<{ title: string; options?: NotificationOptions }> = [];
    class MockNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn().mockResolvedValue('granted');
      constructor(title: string, options?: NotificationOptions) {
        notifications.push({ title, options });
      }
    }

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: MockNotification,
    });

    const onUpdateSettings = vi.fn().mockResolvedValue(undefined);

    // Disabled -> silent
    const disabledRes = await evaluateForegroundReminders({
      now: new Date(2026, 10, 25, 20, 15, 0),
      settings: { ...DEFAULT_SETTINGS, notificationsEnabled: false },
      onUpdateSettings,
    });
    expect(disabledRes).toEqual({ dailyTriggered: false, weeklyTriggered: false });
    expect(notifications).toHaveLength(0);

    // Wed Nov 25 at 20:15 -> fires Daily 8 PM
    const wedRes = await evaluateForegroundReminders({
      now: new Date(2026, 10, 25, 20, 15, 0),
      settings: { ...DEFAULT_SETTINGS, notificationsEnabled: true },
      onUpdateSettings,
    });
    expect(wedRes).toEqual({ dailyTriggered: true, weeklyTriggered: false });
    expect(notifications[0].options?.body).toBe(DAILY_REMINDER_BODY);
    expect(onUpdateSettings).toHaveBeenCalledWith({
      lastDailyReminderDate: '2026-11-25',
    });

    // Repeat call same day -> deduplicated
    const repeatRes = await evaluateForegroundReminders({
      now: new Date(2026, 10, 25, 21, 0, 0),
      settings: { ...DEFAULT_SETTINGS, notificationsEnabled: true },
      onUpdateSettings,
    });
    expect(repeatRes).toEqual({ dailyTriggered: false, weeklyTriggered: false });

    // Sat Nov 28 at 07:30 -> fires Saturday 7 AM
    const satRes = await evaluateForegroundReminders({
      now: new Date(2026, 10, 28, 7, 30, 0),
      settings: { ...DEFAULT_SETTINGS, notificationsEnabled: true },
      onUpdateSettings,
    });
    expect(satRes).toEqual({ dailyTriggered: false, weeklyTriggered: true });
    expect(notifications[1].options?.body).toBe(SATURDAY_REMINDER_BODY);
    expect(onUpdateSettings).toHaveBeenCalledWith({
      lastWeeklyReminderDate: '2026-11-28',
    });
  });

  it('downloads valid .ics files via Blob and revokes object URLs', async () => {
    const blobs: Blob[] = [];
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((obj: Blob | MediaSource) => {
        blobs.push(obj as Blob);
        return 'blob:ics-test';
      });
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadDailyCheckInIcs();
    downloadSaturdayWeighInIcs();
    downloadCombinedRemindersIcs();

    expect(createSpy).toHaveBeenCalledTimes(3);
    expect(revokeSpy).toHaveBeenCalledTimes(3);

    const dailyText = await readBlobText(blobs[0]);
    const satText = await readBlobText(blobs[1]);
    const combinedText = await readBlobText(blobs[2]);

    expect(dailyText).toContain('BEGIN:VCALENDAR');
    expect(dailyText).toContain(DAILY_REMINDER_BODY);
    expect(satText).toContain(SATURDAY_REMINDER_BODY);
    expect(combinedText).toContain(DAILY_REMINDER_BODY);
    expect(combinedText).toContain(SATURDAY_REMINDER_BODY);
  });
});

describe('SettingsView (Profile, Targets, Gemini, Backup & Reset)', () => {
  it('edits profile/targets, manages Gemini API key & endpoint mode, and validates dates', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_m4_settings_profile',
    });

    render(
      <App
        repository={repo}
        initialTab="settings"
        initialDate="2026-11-25"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Profile & Targets')).toBeInTheDocument();
    });
    expect(screen.getByText('18:00')).toBeInTheDocument();

    // Invalid targetDate <= startDate
    const targetDateInput = screen.getByLabelText('Target Date');
    await user.clear(targetDateInput);
    await user.type(targetDateInput, '2026-11-20');
    await user.click(
      screen.getByRole('button', { name: 'Save Profile & Targets' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Target date must be after start date.',
    );

    // Fix date & update target weight, caffeine cutoff, and calories
    await user.clear(targetDateInput);
    await user.type(targetDateInput, '2027-06-15');
    const cutoffInput = screen.getByLabelText('Caffeine Cutoff Hour (0–23)');
    await user.clear(cutoffInput);
    await user.type(cutoffInput, '17');
    const caloriesInput = screen.getByLabelText('Calories (kcal)');
    await user.clear(caloriesInput);
    await user.type(caloriesInput, '1850');

    await user.click(
      screen.getByRole('button', { name: 'Save Profile & Targets' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Profile & targets saved.')).toBeInTheDocument();
    });
    expect(screen.getByText('17:00')).toBeInTheDocument();

    const state = await repo.getState();
    expect(state.profile.caffeineCutoffHour).toBe(17);
    expect(state.targets.calories).toBe(1850);

    // Gemini API key show/hide, save, proxy toggle, clear
    const keyInput = screen.getByLabelText('Gemini API Key');
    expect(keyInput).toHaveAttribute('type', 'password');
    await user.type(keyInput, 'AIzaTestKey123');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(keyInput).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Save API Key' }));
    expect(getStoredGeminiApiKey()).toBe('AIzaTestKey123');

    await user.click(screen.getByRole('button', { name: 'Cloudflare Proxy' }));
    await waitFor(async () => {
      const updated = await repo.getState();
      expect(updated.settings.geminiApiEndpointMode).toBe('proxy');
    });

    await user.click(screen.getByRole('button', { name: 'Clear Key' }));
    expect(getStoredGeminiApiKey()).toBe('');
  });

  it('exports JSON backup, rejects invalid JSON/schema, restores valid backup with synced drafts, and resets to seed', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_m4_settings_backup',
    });

    const exportedBlobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      exportedBlobs.push(obj as Blob);
      return 'blob:backup-test';
    });
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <App
        repository={repo}
        initialTab="settings"
        initialDate="2026-11-25"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Profile & Targets')).toBeInTheDocument();
    });

    // Export
    await user.click(screen.getByRole('button', { name: 'Export JSON Backup' }));
    await waitFor(() => {
      expect(screen.getByText('JSON backup exported.')).toBeInTheDocument();
    });
    expect(revokeSpy).toHaveBeenCalled();

    const exportedJson = await readBlobText(exportedBlobs[0]);
    const parsedExport = JSON.parse(exportedJson);
    expect(parsedExport.schemaVersion).toBe(1);
    expect(parsedExport).not.toHaveProperty('geminiApiKey');

    // Invalid JSON upload
    const fileInput = screen.getByLabelText('Import JSON backup');
    const badJsonFile = new File(['{bad json'], 'bad.json', {
      type: 'application/json',
    });
    await user.upload(fileInput, badJsonFile);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid JSON file. Could not parse backup.',
      );
    });

    // Invalid schema upload
    const badSchemaFile = new File(['{"schemaVersion":99}'], 'bad-schema.json', {
      type: 'application/json',
    });
    await user.upload(fileInput, badSchemaFile);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/schemaVersion/i);
    });

    // Valid modified backup upload -> verify drafts sync immediately
    parsedExport.profile.caffeineCutoffHour = 16;
    parsedExport.targets.calories = 1750;
    const validFile = new File(
      [JSON.stringify(parsedExport)],
      'valid-backup.json',
      { type: 'application/json' },
    );
    await user.upload(fileInput, validFile);

    await waitFor(() => {
      expect(
        screen.getByText('Backup restored successfully.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('16:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Calories (kcal)')).toHaveValue(1750);

    // 2-step Reset to Seed Data
    await user.click(
      screen.getByRole('button', { name: 'Reset to Seed Data' }),
    );
    await user.click(screen.getByRole('button', { name: 'Confirm Reset' }));

    await waitFor(() => {
      expect(
        screen.getByText('Restored initial Nov 24–26 seed data.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Calories (kcal)')).toHaveValue(1900);
  });

  it('rejects empty/whitespace numeric inputs for caffeineCutoffHour, proteinG, carbsG, and fatG and guards double-submit', async () => {
    const user = userEvent.setup();
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_m4_settings_empty_inputs',
    });

    render(
      <App
        repository={repo}
        initialTab="settings"
        initialDate="2026-11-25"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Profile & Targets')).toBeInTheDocument();
    });

    const cutoffInput = screen.getByLabelText('Caffeine Cutoff Hour (0–23)');
    const proteinInput = screen.getByLabelText('Protein (g)');
    const carbsInput = screen.getByLabelText('Carbs (g)');
    const fatInput = screen.getByLabelText('Fat (g)');
    const submitBtn = screen.getByRole('button', {
      name: 'Save Profile & Targets',
    });

    // Empty caffeineCutoffHour -> shows --:-- (not 00:00), rejects submit, preserves 18
    await user.clear(cutoffInput);
    expect(screen.getByText('--:--')).toBeInTheDocument();
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Caffeine cutoff hour must be an integer from 0 to 23.',
    );
    expect((await repo.getState()).profile.caffeineCutoffHour).toBe(18);
    await user.type(cutoffInput, '18');

    // Empty proteinG -> rejects submit, preserves 160
    await user.clear(proteinInput);
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Protein, carbs, and fat targets/i,
    );
    expect((await repo.getState()).targets.proteinG).toBe(160);
    await user.type(proteinInput, '160');

    // Empty carbsG -> rejects submit, preserves 180
    await user.clear(carbsInput);
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Protein, carbs, and fat targets/i,
    );
    expect((await repo.getState()).targets.carbsG).toBe(180);
    await user.type(carbsInput, '180');

    // Empty fatG -> rejects submit, preserves 60
    await user.clear(fatInput);
    await user.click(submitBtn);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Protein, carbs, and fat targets/i,
    );
    expect((await repo.getState()).targets.fatG).toBe(60);
    await user.type(fatInput, '60');

    // Synchronous double-submit while save is pending calls saveProfile once
    let resolveSave!: () => void;
    const saveProfileSpy = vi.spyOn(repo, 'saveProfile').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const form = submitBtn.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(saveProfileSpy).toHaveBeenCalledTimes(1);
    });
    resolveSave();
    await waitFor(() => {
      expect(screen.getByText('Profile & targets saved.')).toBeInTheDocument();
    });
    expect(saveProfileSpy).toHaveBeenCalledTimes(1);
  });
});
