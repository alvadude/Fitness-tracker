import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createInitialSeedState } from '../domain/seed';
import type { FitnessAppState, FitnessBackupPayload } from '../domain/types';
import {
  IndexedDbRepository,
  validateBackupPayload,
  type FitnessStorageAdapter,
} from '../services/storage';
import {
  FitnessProvider,
  useFitness,
  type FitnessContextValue,
} from '../state/FitnessContext';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createSlowCustomAdapter(options?: {
  initDelayMs?: number;
  writeDelayMs?: number;
  failInit?: boolean;
  initialState?: FitnessAppState;
}): {
  adapter: FitnessStorageAdapter;
  getBackingState: () => FitnessAppState;
  getInitCallCount: () => number;
} {
  let backingState: FitnessAppState = structuredClone(
    options?.initialState ?? createInitialSeedState(),
  );
  let initCallCount = 0;
  const initDelayMs = options?.initDelayMs ?? 40;
  const writeDelayMs = options?.writeDelayMs ?? 5;

  const adapter: FitnessStorageAdapter = {
    async initializeIfNeeded() {
      initCallCount += 1;
      const snapshotAtCallStart = structuredClone(backingState);
      await delay(initDelayMs);
      if (options?.failInit) {
        throw new Error('Simulated slow storage init failure');
      }
      return snapshotAtCallStart;
    },
    async getState() {
      await delay(writeDelayMs);
      return structuredClone(backingState);
    },
    async saveProfile(profile) {
      await delay(writeDelayMs);
      backingState = { ...backingState, profile: structuredClone(profile) };
    },
    async saveTargets(targets) {
      await delay(writeDelayMs);
      backingState = { ...backingState, targets: structuredClone(targets) };
    },
    async savePresets(presets) {
      await delay(writeDelayMs);
      backingState = { ...backingState, presets: structuredClone(presets) };
    },
    async upsertMeal(meal) {
      await delay(writeDelayMs);
      const idx = backingState.meals.findIndex((m) => m.id === meal.id);
      const meals =
        idx >= 0
          ? backingState.meals.map((m) => (m.id === meal.id ? meal : m))
          : [...backingState.meals, structuredClone(meal)];
      backingState = { ...backingState, meals };
    },
    async deleteMeal(mealId) {
      await delay(writeDelayMs);
      backingState = {
        ...backingState,
        meals: backingState.meals.filter((m) => m.id !== mealId),
      };
    },
    async upsertWorkout(workout) {
      await delay(writeDelayMs);
      const idx = backingState.workouts.findIndex((w) => w.id === workout.id);
      const workouts =
        idx >= 0
          ? backingState.workouts.map((w) => (w.id === workout.id ? workout : w))
          : [...backingState.workouts, structuredClone(workout)];
      backingState = { ...backingState, workouts };
    },
    async upsertWeighIn(weighIn) {
      await delay(writeDelayMs);
      const idx = backingState.weighIns.findIndex((w) => w.id === weighIn.id);
      const weighIns =
        idx >= 0
          ? backingState.weighIns.map((w) => (w.id === weighIn.id ? weighIn : w))
          : [...backingState.weighIns, structuredClone(weighIn)];
      backingState = { ...backingState, weighIns };
    },
    async deleteWeighIn(weighInId) {
      await delay(writeDelayMs);
      backingState = {
        ...backingState,
        weighIns: backingState.weighIns.filter((w) => w.id !== weighInId),
      };
    },
    async saveSettings(settings) {
      await delay(writeDelayMs);
      backingState = { ...backingState, settings: structuredClone(settings) };
    },
    async exportBackup(): Promise<FitnessBackupPayload> {
      await delay(writeDelayMs);
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        profile: structuredClone(backingState.profile),
        targets: structuredClone(backingState.targets),
        presets: structuredClone(backingState.presets),
        meals: structuredClone(backingState.meals),
        workouts: structuredClone(backingState.workouts),
        weighIns: structuredClone(backingState.weighIns),
        settings: structuredClone(backingState.settings),
      };
    },
    async importBackup(rawPayload) {
      await delay(writeDelayMs);
      const validated = validateBackupPayload(rawPayload);
      backingState = {
        initialized: true,
        profile: structuredClone(validated.profile),
        targets: structuredClone(validated.targets),
        presets: structuredClone(validated.presets),
        meals: structuredClone(validated.meals),
        workouts: structuredClone(validated.workouts),
        weighIns: structuredClone(validated.weighIns),
        settings: structuredClone(validated.settings),
      };
      return structuredClone(backingState);
    },
    async resetToSeed() {
      await delay(writeDelayMs);
      backingState = createInitialSeedState();
      return structuredClone(backingState);
    },
  };

  return {
    adapter,
    getBackingState: () => structuredClone(backingState),
    getInitCallCount: () => initCallCount,
  };
}

describe('FitnessContext serialized mutation queue', () => {
  it('preserves all concurrent addPreset and logCardioForDate writes in React state and persisted storage', async () => {
    const repo = new IndexedDbRepository({
      localStorageKey: 'test_fittrack_concurrent_ctx',
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <FitnessProvider repository={repo} initialDate="2026-11-25">
        {children}
      </FitnessProvider>
    );

    const { result } = renderHook(() => useFitness(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialPresetCount = result.current.state.presets.length;

    await act(async () => {
      await Promise.all([
        result.current.addPreset({
          name: 'Concurrent Preset A',
          servingLabel: '1 serving',
          calories: 150,
          proteinG: 20,
          carbsG: 10,
          fatG: 3,
          isCaffeinated: false,
          category: 'custom',
        }),
        result.current.addPreset({
          name: 'Concurrent Preset B',
          servingLabel: '1 serving',
          calories: 200,
          proteinG: 10,
          carbsG: 25,
          fatG: 6,
          isCaffeinated: false,
          category: 'custom',
        }),
      ]);
    });

    expect(result.current.state.presets).toHaveLength(initialPresetCount + 2);
    expect(
      result.current.state.presets.some((p) => p.name === 'Concurrent Preset A'),
    ).toBe(true);
    expect(
      result.current.state.presets.some((p) => p.name === 'Concurrent Preset B'),
    ).toBe(true);

    const persistedAfterPresets = await repo.getState();
    expect(persistedAfterPresets.presets).toHaveLength(initialPresetCount + 2);
    expect(
      persistedAfterPresets.presets.some((p) => p.name === 'Concurrent Preset A'),
    ).toBe(true);
    expect(
      persistedAfterPresets.presets.some((p) => p.name === 'Concurrent Preset B'),
    ).toBe(true);

    await act(async () => {
      await Promise.all([
        result.current.logCardioForDate('2026-11-25', {
          mode: 'easy_walk',
          durationMin: 15,
          inclinePct: 4,
          speedKph: 4.5,
          bodyWeightKgUsed: 84.0,
          estimatedCaloriesBurned: 90,
          notes: 'Morning walk',
        }),
        result.current.logCardioForDate('2026-11-25', {
          mode: 'incline_walk',
          durationMin: 20,
          inclinePct: 8,
          speedKph: 4.5,
          bodyWeightKgUsed: 84.0,
          estimatedCaloriesBurned: 168,
          notes: 'Evening walk',
        }),
      ]);
    });

    const ctxWorkout = result.current.state.workouts.find(
      (w) => w.date === '2026-11-25',
    );
    expect(ctxWorkout).toBeDefined();
    expect(ctxWorkout?.cardio).toHaveLength(2);
    expect(ctxWorkout?.cardio.map((c) => c.notes)).toEqual([
      'Morning walk',
      'Evening walk',
    ]);

    const persistedAfterCardio = await repo.getState();
    const repoWorkout = persistedAfterCardio.workouts.find(
      (w) => w.date === '2026-11-25',
    );
    expect(repoWorkout).toBeDefined();
    expect(repoWorkout?.cardio).toHaveLength(2);
    expect(repoWorkout?.cardio.map((c) => c.notes)).toEqual([
      'Morning walk',
      'Evening walk',
    ]);

    // A rejected importBackupJson must not break the queue for subsequent writes
    await act(async () => {
      await expect(
        result.current.importBackupJson('{"schemaVersion": 99}'),
      ).rejects.toThrow();
      await result.current.updateSettings({ notificationsEnabled: true });
    });

    expect(result.current.state.settings.notificationsEnabled).toBe(true);
    expect((await repo.getState()).settings.notificationsEnabled).toBe(true);
  });

  it('serializes slow custom FitnessStorageAdapter initializeIfNeeded with early addMeal while isLoading is true', async () => {
    const { adapter, getBackingState } = createSlowCustomAdapter({
      initDelayMs: 40,
      writeDelayMs: 5,
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <FitnessProvider repository={adapter} initialDate="2026-11-25">
        {children}
      </FitnessProvider>
    );

    const { result } = renderHook(() => useFitness(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await result.current.addMeal({
        date: '2026-11-25',
        time: '12:00',
        name: 'Early Mount Meal',
        calories: 420,
        proteinG: 35,
        carbsG: 40,
        fatG: 12,
        source: 'manual',
        isCaffeinated: false,
      });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(
      getBackingState().meals.some((m) => m.name === 'Early Mount Meal'),
    ).toBe(true);
    expect(
      result.current.state.meals.some((m) => m.name === 'Early Mount Meal'),
    ).toBe(true);
  });

  it('retains meal when child useEffect dispatches addMeal before parent FitnessProvider initialization resolves', async () => {
    const { adapter, getBackingState, getInitCallCount } =
      createSlowCustomAdapter({
        initDelayMs: 40,
        writeDelayMs: 5,
      });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <FitnessProvider repository={adapter} initialDate="2026-11-25">
        {children}
      </FitnessProvider>
    );

    const { result } = renderHook(
      () => {
        const ctx = useFitness();
        useEffect(() => {
          void ctx.addMeal({
            date: '2026-11-25',
            time: '12:30',
            name: 'Child Effect Early Meal',
            calories: 310,
            proteinG: 28,
            carbsG: 22,
            fatG: 10,
            source: 'manual',
            isCaffeinated: false,
          });
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
        return ctx;
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(
        result.current.state.meals.some(
          (m) => m.name === 'Child Effect Early Meal',
        ),
      ).toBe(true);
    });

    // Wait an extra tick beyond initDelayMs to ensure no late hydration overwrites state
    await act(async () => {
      await delay(60);
    });

    expect(getInitCallCount()).toBe(1);
    expect(
      getBackingState().meals.some(
        (m) => m.name === 'Child Effect Early Meal',
      ),
    ).toBe(true);
    expect(
      result.current.state.meals.some(
        (m) => m.name === 'Child Effect Early Meal',
      ),
    ).toBe(true);
  });

  it('handles repository prop swaps on a mounted FitnessProvider without leaking stale repo state or losing early writes', async () => {
    const repoA = createSlowCustomAdapter({
      initDelayMs: 10,
      writeDelayMs: 5,
    });
    const stateB = createInitialSeedState();
    stateB.targets = { ...stateB.targets, calories: 2150, weekNumber: 2 };
    const repoB = createSlowCustomAdapter({
      initDelayMs: 40,
      writeDelayMs: 5,
      initialState: stateB,
    });

    const latestCtxRef: { current: FitnessContextValue | null } = {
      current: null,
    };
    function Probe() {
      const ctx = useFitness();
      latestCtxRef.current = ctx;
      return (
        <div data-testid="calories">
          {ctx.isLoading ? 'loading' : ctx.state.targets.calories}
        </div>
      );
    }

    const { rerender } = render(
      <FitnessProvider repository={repoA.adapter} initialDate="2026-11-25">
        <Probe />
      </FitnessProvider>,
    );

    await waitFor(() => {
      expect(latestCtxRef.current?.isLoading).toBe(false);
    });
    expect(latestCtxRef.current?.state.targets.calories).toBe(1900);

    // Swap repository prop on the same mounted FitnessProvider instance
    rerender(
      <FitnessProvider repository={repoB.adapter} initialDate="2026-11-25">
        <Probe />
      </FitnessProvider>,
    );

    await waitFor(() => {
      expect(latestCtxRef.current?.isLoading).toBe(true);
    });

    await act(async () => {
      await latestCtxRef.current!.addMeal({
        date: '2026-11-25',
        time: '18:30',
        name: 'Swapped Repo Meal',
        calories: 500,
        proteinG: 42,
        carbsG: 50,
        fatG: 14,
        source: 'manual',
        isCaffeinated: false,
      });
    });

    await waitFor(() => {
      expect(latestCtxRef.current?.isLoading).toBe(false);
    });

    expect(latestCtxRef.current?.state.targets.calories).toBe(2150);
    expect(
      latestCtxRef.current?.state.meals.some(
        (m) => m.name === 'Swapped Repo Meal',
      ),
    ).toBe(true);
    expect(
      repoB.getBackingState().meals.some((m) => m.name === 'Swapped Repo Meal'),
    ).toBe(true);
    expect(
      repoA.getBackingState().meals.some((m) => m.name === 'Swapped Repo Meal'),
    ).toBe(false);
  });

  it('allows importBackupJson to recover when initial slow initializeIfNeeded fails', async () => {
    const { adapter, getBackingState } = createSlowCustomAdapter({
      initDelayMs: 30,
      writeDelayMs: 5,
      failInit: true,
    });

    const backupSeed = createInitialSeedState();
    backupSeed.targets = { ...backupSeed.targets, calories: 2050, weekNumber: 3 };
    const backupPayload: FitnessBackupPayload = {
      schemaVersion: 1,
      exportedAt: '2026-11-25T02:00:00.000Z',
      profile: backupSeed.profile,
      targets: backupSeed.targets,
      presets: backupSeed.presets,
      meals: backupSeed.meals,
      workouts: backupSeed.workouts,
      weighIns: backupSeed.weighIns,
      settings: backupSeed.settings,
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <FitnessProvider repository={adapter} initialDate="2026-11-25">
        {children}
      </FitnessProvider>
    );

    const { result } = renderHook(() => useFitness(), { wrapper });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await result.current.importBackupJson(JSON.stringify(backupPayload));
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.state.targets.calories).toBe(2050);
    expect(getBackingState().targets.calories).toBe(2050);
  });
});
