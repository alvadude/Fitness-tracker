import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createWorkoutTemplateForDayType } from '../domain/defaults';
import { createInitialSeedState } from '../domain/seed';
import { formatIsoDateLocal, getDayTypeForDate } from '../domain/training';
import type {
  AppSettings,
  CardioLog,
  FitnessAppState,
  FoodPreset,
  IsoDate,
  MacroTargets,
  MealEntry,
  UserProfile,
  WeighInEntry,
  WorkoutSession,
} from '../domain/types';
import {
  getFitnessRepository,
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
  type FitnessStorageAdapter,
} from '../services/storage';

function generateId(prefix: string): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function computeCurrentWeightKg(state: FitnessAppState): number {
  if (state.weighIns.length === 0) {
    return state.profile.startWeightKg;
  }
  const sorted = [...state.weighIns].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt);
  });
  return sorted[sorted.length - 1].weightKg;
}

export interface FitnessContextValue {
  state: FitnessAppState;
  isLoading: boolean;
  error: string | null;
  selectedDate: IsoDate;
  setSelectedDate: (date: IsoDate) => void;
  currentWeightKg: number;
  geminiApiKey: string;
  addMeal: (meal: Omit<MealEntry, 'id' | 'createdAt'>) => Promise<MealEntry>;
  updateMeal: (meal: MealEntry) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  addPreset: (preset: Omit<FoodPreset, 'id'>) => Promise<FoodPreset>;
  deletePreset: (id: string) => Promise<void>;
  getOrCreateWorkoutForDate: (date: IsoDate) => WorkoutSession;
  saveWorkout: (session: WorkoutSession) => Promise<void>;
  logCardioForDate: (
    date: IsoDate,
    cardio: Omit<CardioLog, 'id'>,
  ) => Promise<WorkoutSession>;
  addOrUpdateWeighIn: (
    entry: Omit<WeighInEntry, 'id' | 'createdAt'> & { id?: string },
  ) => Promise<WeighInEntry>;
  deleteWeighIn: (id: string) => Promise<void>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  updateTargets: (targets: MacroTargets) => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  saveGeminiApiKey: (key: string) => void;
  exportBackupJson: () => Promise<string>;
  importBackupJson: (jsonText: string) => Promise<void>;
  resetAllToSeed: () => Promise<void>;
}

const FitnessContext = createContext<FitnessContextValue | null>(null);

export interface FitnessProviderProps {
  children: ReactNode;
  repository?: FitnessStorageAdapter;
  initialDate?: IsoDate;
}

export function FitnessProvider({
  children,
  repository,
  initialDate,
}: FitnessProviderProps) {
  const repo = useMemo(
    () => repository ?? getFitnessRepository(),
    [repository],
  );
  const [state, setState] = useState<FitnessAppState>(() => ({
    ...createInitialSeedState(),
    initialized: false,
  }));
  const stateRef = useRef<FitnessAppState>(state);
  const mutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const hydratedRepoRef = useRef<FitnessStorageAdapter | null>(null);
  const activeRepoRef = useRef<FitnessStorageAdapter>(repo);

  const enqueueMutation = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    const next = mutationQueueRef.current.then(op, op);
    mutationQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, []);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<IsoDate>(
    () => initialDate ?? formatIsoDateLocal(new Date()),
  );
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() =>
    getStoredGeminiApiKey(),
  );

  const hydrateRepo = useCallback(
    async (targetRepo: FitnessStorageAdapter): Promise<FitnessAppState> => {
      if (
        hydratedRepoRef.current === targetRepo &&
        stateRef.current.initialized
      ) {
        return stateRef.current;
      }
      const hydrated = await targetRepo.initializeIfNeeded();
      if (activeRepoRef.current === targetRepo) {
        hydratedRepoRef.current = targetRepo;
        stateRef.current = hydrated;
        setState(hydrated);
        setIsLoading(false);
        setError(null);
      }
      return hydrated;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    activeRepoRef.current = repo;
    if (hydratedRepoRef.current !== repo) {
      hydratedRepoRef.current = null;
      stateRef.current = { ...stateRef.current, initialized: false };
      setIsLoading(true);
      setError(null);
    }

    void enqueueMutation(async () => {
      if (activeRepoRef.current !== repo) {
        return;
      }
      try {
        const hydrated = await hydrateRepo(repo);
        if (!active || activeRepoRef.current !== repo) {
          return;
        }
        stateRef.current = hydrated;
        setState(hydrated);
        setIsLoading(false);
        setError(null);
      } catch (err: unknown) {
        if (!active || activeRepoRef.current !== repo) {
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Failed to initialize storage.',
        );
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [enqueueMutation, hydrateRepo, repo]);

  const currentWeightKg = useMemo(() => computeCurrentWeightKg(state), [state]);

  const addMeal = useCallback(
    (mealInput: Omit<MealEntry, 'id' | 'createdAt'>) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        const meal: MealEntry = {
          ...mealInput,
          id: generateId('meal'),
          createdAt: new Date().toISOString(),
        };
        await repo.upsertMeal(meal);
        const nextState: FitnessAppState = {
          ...current,
          meals: [...current.meals, meal],
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
        return meal;
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const updateMeal = useCallback(
    (meal: MealEntry) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        await repo.upsertMeal(meal);
        const exists = current.meals.some((m) => m.id === meal.id);
        const nextState: FitnessAppState = {
          ...current,
          meals: exists
            ? current.meals.map((m) => (m.id === meal.id ? meal : m))
            : [...current.meals, meal],
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const deleteMeal = useCallback(
    (id: string) => {
      if (activeRepoRef.current === repo && stateRef.current.initialized) {
        const optimistic: FitnessAppState = {
          ...stateRef.current,
          meals: stateRef.current.meals.filter((m) => m.id !== id),
        };
        stateRef.current = optimistic;
        setState(optimistic);
      }
      return enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        await repo.deleteMeal(id);
        const nextState: FitnessAppState = {
          ...current,
          meals: current.meals.filter((m) => m.id !== id),
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      });
    },
    [enqueueMutation, hydrateRepo, repo],
  );

  const addPreset = useCallback(
    (presetInput: Omit<FoodPreset, 'id'>) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        const preset: FoodPreset = {
          ...presetInput,
          id: generateId('preset'),
        };
        const nextPresets = [...current.presets, preset];
        await repo.savePresets(nextPresets);
        const nextState: FitnessAppState = {
          ...current,
          presets: nextPresets,
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
        return preset;
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const deletePreset = useCallback(
    (id: string) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        const nextPresets = current.presets.filter((p) => p.id !== id);
        await repo.savePresets(nextPresets);
        const nextState: FitnessAppState = {
          ...current,
          presets: nextPresets,
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const getOrCreateWorkoutForDate = useCallback(
    (date: IsoDate): WorkoutSession => {
      const existing = stateRef.current.workouts.find((w) => w.date === date);
      if (existing) {
        return existing;
      }
      const dayType = getDayTypeForDate(date);
      return createWorkoutTemplateForDayType(dayType, date, currentWeightKg);
    },
    [currentWeightKg],
  );

  const saveWorkout = useCallback(
    (session: WorkoutSession) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        await repo.upsertWorkout(session);
        const exists = current.workouts.some((w) => w.id === session.id);
        const nextState: FitnessAppState = {
          ...current,
          workouts: exists
            ? current.workouts.map((w) => (w.id === session.id ? session : w))
            : [...current.workouts, session],
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const logCardioForDate = useCallback(
    (date: IsoDate, cardioInput: Omit<CardioLog, 'id'>) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        const existing = current.workouts.find((w) => w.date === date);
        const base =
          existing ??
          createWorkoutTemplateForDayType(
            getDayTypeForDate(date),
            date,
            computeCurrentWeightKg(current),
          );
        const cardioEntry: CardioLog = {
          ...cardioInput,
          id: generateId('cardio'),
        };
        const updated: WorkoutSession = {
          ...base,
          cardio: [...base.cardio, cardioEntry],
        };
        await repo.upsertWorkout(updated);
        const exists = current.workouts.some((w) => w.id === updated.id);
        const nextState: FitnessAppState = {
          ...current,
          workouts: exists
            ? current.workouts.map((w) => (w.id === updated.id ? updated : w))
            : [...current.workouts, updated],
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
        return updated;
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const addOrUpdateWeighIn = useCallback(
    (entry: Omit<WeighInEntry, 'id' | 'createdAt'> & { id?: string }) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        const existing = entry.id
          ? current.weighIns.find((w) => w.id === entry.id)
          : current.weighIns.find((w) => w.date === entry.date);
        const weighIn: WeighInEntry = {
          id: entry.id ?? existing?.id ?? generateId('weighin'),
          date: entry.date,
          weightKg: entry.weightKg,
          isFasted: entry.isFasted,
          notes: entry.notes,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        await repo.upsertWeighIn(weighIn);
        const idx = current.weighIns.findIndex((w) => w.id === weighIn.id);
        const nextWeighIns =
          idx >= 0
            ? current.weighIns.map((w) => (w.id === weighIn.id ? weighIn : w))
            : [...current.weighIns, weighIn];
        const nextState: FitnessAppState = {
          ...current,
          weighIns: nextWeighIns,
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
        return weighIn;
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const deleteWeighIn = useCallback(
    (id: string) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        await repo.deleteWeighIn(id);
        const nextState: FitnessAppState = {
          ...current,
          weighIns: current.weighIns.filter((w) => w.id !== id),
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const updateProfile = useCallback(
    (profile: UserProfile) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        await repo.saveProfile(profile);
        const nextState: FitnessAppState = {
          ...current,
          profile,
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const updateTargets = useCallback(
    (targets: MacroTargets) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        await repo.saveTargets(targets);
        const nextState: FitnessAppState = {
          ...current,
          targets,
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const updateSettings = useCallback(
    (partial: Partial<AppSettings>) =>
      enqueueMutation(async () => {
        const current = await hydrateRepo(repo);
        const nextSettings: AppSettings = {
          ...current.settings,
          ...partial,
        };
        await repo.saveSettings(nextSettings);
        const nextState: FitnessAppState = {
          ...current,
          settings: nextSettings,
        };
        if (activeRepoRef.current === repo) {
          stateRef.current = nextState;
          setState(nextState);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const saveGeminiApiKey = useCallback((key: string) => {
    setStoredGeminiApiKey(key);
    setGeminiApiKey(key.trim());
  }, []);

  const exportBackupJson = useCallback(
    () =>
      enqueueMutation(async () => {
        await hydrateRepo(repo);
        const payload = await repo.exportBackup();
        return JSON.stringify(payload, null, 2);
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const importBackupJson = useCallback(
    (jsonText: string) =>
      enqueueMutation(async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          throw new Error('Invalid JSON file. Could not parse backup.');
        }
        if (
          hydratedRepoRef.current !== repo ||
          !stateRef.current.initialized
        ) {
          try {
            await hydrateRepo(repo);
          } catch {
            // Allow backup import to recover even if initial storage hydration fails.
          }
        }
        const restored = await repo.importBackup(parsed);
        const normalized: FitnessAppState = {
          ...restored,
          initialized: true,
        };
        if (activeRepoRef.current === repo) {
          hydratedRepoRef.current = repo;
          stateRef.current = normalized;
          setState(normalized);
          setIsLoading(false);
          setError(null);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const resetAllToSeed = useCallback(
    () =>
      enqueueMutation(async () => {
        if (
          hydratedRepoRef.current !== repo ||
          !stateRef.current.initialized
        ) {
          try {
            await hydrateRepo(repo);
          } catch {
            // Allow reset to recover even if initial storage hydration fails.
          }
        }
        const seed = await repo.resetToSeed();
        const normalized: FitnessAppState = {
          ...seed,
          initialized: true,
        };
        if (activeRepoRef.current === repo) {
          hydratedRepoRef.current = repo;
          stateRef.current = normalized;
          setState(normalized);
          setIsLoading(false);
          setError(null);
        }
      }),
    [enqueueMutation, hydrateRepo, repo],
  );

  const value = useMemo<FitnessContextValue>(
    () => ({
      state,
      isLoading,
      error,
      selectedDate,
      setSelectedDate,
      currentWeightKg,
      geminiApiKey,
      addMeal,
      updateMeal,
      deleteMeal,
      addPreset,
      deletePreset,
      getOrCreateWorkoutForDate,
      saveWorkout,
      logCardioForDate,
      addOrUpdateWeighIn,
      deleteWeighIn,
      updateProfile,
      updateTargets,
      updateSettings,
      saveGeminiApiKey,
      exportBackupJson,
      importBackupJson,
      resetAllToSeed,
    }),
    [
      state,
      isLoading,
      error,
      selectedDate,
      currentWeightKg,
      geminiApiKey,
      addMeal,
      updateMeal,
      deleteMeal,
      addPreset,
      deletePreset,
      getOrCreateWorkoutForDate,
      saveWorkout,
      logCardioForDate,
      addOrUpdateWeighIn,
      deleteWeighIn,
      updateProfile,
      updateTargets,
      updateSettings,
      saveGeminiApiKey,
      exportBackupJson,
      importBackupJson,
      resetAllToSeed,
    ],
  );

  return (
    <FitnessContext.Provider value={value}>{children}</FitnessContext.Provider>
  );
}

export function useFitness(): FitnessContextValue {
  const ctx = useContext(FitnessContext);
  if (!ctx) {
    throw new Error('useFitness must be used within a FitnessProvider.');
  }
  return ctx;
}
