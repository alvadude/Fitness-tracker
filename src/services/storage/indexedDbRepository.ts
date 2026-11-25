import { createInitialSeedState } from '../../domain/seed';
import type {
  AppSettings,
  FitnessAppState,
  FitnessBackupPayload,
  FoodPreset,
  MacroTargets,
  MealEntry,
  UserProfile,
  WeighInEntry,
  WorkoutSession,
} from '../../domain/types';
import {
  validateBackupPayload,
  type FitnessStorageAdapter,
} from './repository';

export interface IndexedDbRepositoryOptions {
  dbName?: string;
  storeName?: string;
  recordKey?: string;
  localStorageKey?: string;
}

const DEFAULT_DB_NAME = 'fitness_tracker_db';
const DEFAULT_STORE_NAME = 'app_state';
const DEFAULT_RECORD_KEY = 'root';
const DEFAULT_LOCAL_STORAGE_KEY = 'fittrack_state_v1';

function cloneState<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export class IndexedDbRepository implements FitnessStorageAdapter {
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly recordKey: string;
  private readonly localStorageKey: string;
  private memoryFallback: FitnessAppState | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(options: IndexedDbRepositoryOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.storeName = options.storeName ?? DEFAULT_STORE_NAME;
    this.recordKey = options.recordKey ?? DEFAULT_RECORD_KEY;
    this.localStorageKey = options.localStorageKey ?? DEFAULT_LOCAL_STORAGE_KEY;
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(op, op);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private hasIndexedDb(): boolean {
    return (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.indexedDB !== 'undefined' &&
      globalThis.indexedDB !== null
    );
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      try {
        const request = globalThis.indexedDB.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error('Failed to open IndexedDB.'));
      } catch (err) {
        reject(err);
      }
    });
  }

  private async readFromIndexedDb(): Promise<FitnessAppState | null> {
    if (!this.hasIndexedDb()) {
      return null;
    }
    let db: IDBDatabase | null = null;
    try {
      db = await this.openDb();
      const database = db;
      return await new Promise<FitnessAppState | null>((resolve, reject) => {
        const tx = database.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(this.recordKey);
        req.onsuccess = () => {
          const result = req.result as FitnessAppState | undefined;
          resolve(result && result.initialized ? result : null);
        };
        req.onerror = () =>
          reject(req.error ?? new Error('Failed to read from IndexedDB.'));
      });
    } catch {
      return null;
    } finally {
      db?.close();
    }
  }

  private async writeToIndexedDb(state: FitnessAppState): Promise<boolean> {
    if (!this.hasIndexedDb()) {
      return false;
    }
    let db: IDBDatabase | null = null;
    try {
      db = await this.openDb();
      const database = db;
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(state, this.recordKey);
        req.onsuccess = () => resolve();
        req.onerror = () =>
          reject(req.error ?? new Error('Failed to write to IndexedDB.'));
      });
      return true;
    } catch {
      return false;
    } finally {
      db?.close();
    }
  }

  private readFromLocalStorage(): FitnessAppState | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      const raw = localStorage.getItem(this.localStorageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as FitnessAppState;
      if (parsed && parsed.initialized === true) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private writeToLocalStorage(state: FitnessAppState): boolean {
    try {
      if (typeof localStorage === 'undefined') {
        return false;
      }
      localStorage.setItem(this.localStorageKey, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  private async readPersistedState(): Promise<FitnessAppState | null> {
    const fromIdb = await this.readFromIndexedDb();
    if (fromIdb) {
      this.memoryFallback = cloneState(fromIdb);
      this.writeToLocalStorage(fromIdb);
      return cloneState(fromIdb);
    }

    const fromLs = this.readFromLocalStorage();
    if (fromLs) {
      this.memoryFallback = cloneState(fromLs);
      return cloneState(fromLs);
    }

    if (this.memoryFallback && this.memoryFallback.initialized) {
      return cloneState(this.memoryFallback);
    }

    return null;
  }

  private async writePersistedState(state: FitnessAppState): Promise<void> {
    const snapshot = cloneState({ ...state, initialized: true });
    this.memoryFallback = snapshot;
    this.writeToLocalStorage(snapshot);
    await this.writeToIndexedDb(snapshot);
  }

  async initializeIfNeeded(): Promise<FitnessAppState> {
    return this.enqueue(async () => {
      const existing = await this.readPersistedState();
      if (existing && existing.initialized) {
        return existing;
      }
      const seed = createInitialSeedState();
      await this.writePersistedState(seed);
      return cloneState(seed);
    });
  }

  async getState(): Promise<FitnessAppState> {
    return this.initializeIfNeeded();
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      state.profile = cloneState(profile);
      await this.writePersistedState(state);
    });
  }

  async saveTargets(targets: MacroTargets): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      state.targets = cloneState(targets);
      await this.writePersistedState(state);
    });
  }

  async savePresets(presets: FoodPreset[]): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      state.presets = cloneState(presets);
      await this.writePersistedState(state);
    });
  }

  async upsertMeal(meal: MealEntry): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      const idx = state.meals.findIndex((m) => m.id === meal.id);
      if (idx >= 0) {
        state.meals[idx] = cloneState(meal);
      } else {
        state.meals.push(cloneState(meal));
      }
      await this.writePersistedState(state);
    });
  }

  async deleteMeal(mealId: string): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      state.meals = state.meals.filter((m) => m.id !== mealId);
      await this.writePersistedState(state);
    });
  }

  async upsertWorkout(workout: WorkoutSession): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      const idx = state.workouts.findIndex((w) => w.id === workout.id);
      if (idx >= 0) {
        state.workouts[idx] = cloneState(workout);
      } else {
        state.workouts.push(cloneState(workout));
      }
      await this.writePersistedState(state);
    });
  }

  async upsertWeighIn(weighIn: WeighInEntry): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      const idx = state.weighIns.findIndex((w) => w.id === weighIn.id);
      if (idx >= 0) {
        state.weighIns[idx] = cloneState(weighIn);
      } else {
        state.weighIns.push(cloneState(weighIn));
      }
      await this.writePersistedState(state);
    });
  }

  async deleteWeighIn(weighInId: string): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      state.weighIns = state.weighIns.filter((w) => w.id !== weighInId);
      await this.writePersistedState(state);
    });
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.enqueue(async () => {
      const state =
        (await this.readPersistedState()) ?? createInitialSeedState();
      state.settings = cloneState(settings);
      await this.writePersistedState(state);
    });
  }

  async exportBackup(): Promise<FitnessBackupPayload> {
    const state = await this.getState();
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      profile: cloneState(state.profile),
      targets: cloneState(state.targets),
      presets: cloneState(state.presets),
      meals: cloneState(state.meals),
      workouts: cloneState(state.workouts),
      weighIns: cloneState(state.weighIns),
      settings: {
        geminiApiEndpointMode: state.settings.geminiApiEndpointMode,
        notificationsEnabled: state.settings.notificationsEnabled,
        lastDailyReminderDate: state.settings.lastDailyReminderDate,
        lastWeeklyReminderDate: state.settings.lastWeeklyReminderDate,
      },
    };
  }

  async importBackup(rawPayload: unknown): Promise<FitnessAppState> {
    const validated = validateBackupPayload(rawPayload);
    const restored: FitnessAppState = {
      initialized: true,
      profile: cloneState(validated.profile),
      targets: cloneState(validated.targets),
      presets: cloneState(validated.presets),
      meals: cloneState(validated.meals),
      workouts: cloneState(validated.workouts),
      weighIns: cloneState(validated.weighIns),
      settings: cloneState(validated.settings),
    };
    return this.enqueue(async () => {
      await this.writePersistedState(restored);
      return cloneState(restored);
    });
  }

  async resetToSeed(): Promise<FitnessAppState> {
    return this.enqueue(async () => {
      const seed = createInitialSeedState();
      await this.writePersistedState(seed);
      return cloneState(seed);
    });
  }
}
