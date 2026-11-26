import {
  IndexedDbRepository,
  type IndexedDbRepositoryOptions,
} from './indexedDbRepository';
import type { FitnessStorageAdapter } from './repository';

export { validateBackupPayload, type FitnessStorageAdapter } from './repository';
export {
  IndexedDbRepository,
  type IndexedDbRepositoryOptions,
} from './indexedDbRepository';
export {
  ACTIVE_PROFILE_STORAGE_KEY,
  DEFAULT_PROFILE_ID,
  PROFILES_STORAGE_KEY,
  createNewProfileWithState,
  createRepositoryForProfile,
  deleteProfileFromRegistry,
  getActiveProfileId,
  loadProfiles,
  renameProfileInRegistry,
  saveProfiles,
  setActiveProfileId,
} from './profileRegistry';

export const GEMINI_API_KEY_STORAGE_KEY = 'fittrack_gemini_api_key';

export function getStoredGeminiApiKey(): string {
  try {
    if (typeof localStorage === 'undefined') {
      return '';
    }
    return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredGeminiApiKey(key: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const trimmed = key.trim();
    if (!trimmed) {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, trimmed);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function clearStoredGeminiApiKey(): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

let singletonRepo: FitnessStorageAdapter | null = null;

export function createFitnessRepository(
  options?: IndexedDbRepositoryOptions,
): FitnessStorageAdapter {
  return new IndexedDbRepository(options);
}

export function getFitnessRepository(): FitnessStorageAdapter {
  if (!singletonRepo) {
    singletonRepo = createFitnessRepository();
  }
  return singletonRepo;
}
