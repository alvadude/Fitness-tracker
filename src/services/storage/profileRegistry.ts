import { createBlankProfileState } from '../../domain/seed';
import type {
  FitnessAppState,
  MacroTargets,
  ProfileSummary,
  UserProfile,
} from '../../domain/types';
import { IndexedDbRepository } from './indexedDbRepository';
import type { FitnessStorageAdapter } from './repository';

export const PROFILES_STORAGE_KEY = 'fittrack_profiles_v1';
export const ACTIVE_PROFILE_STORAGE_KEY = 'fittrack_active_profile_v1';
export const DEFAULT_PROFILE_ID = 'default';

const DEFAULT_PROFILE_SUMMARY: ProfileSummary = {
  id: DEFAULT_PROFILE_ID,
  name: 'AJ',
  isSeededDefault: true,
  createdAt: '2026-11-24T00:00:00.000Z',
};

function sanitizeSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return slug || 'user';
}

export function loadProfiles(): ProfileSummary[] {
  try {
    if (typeof localStorage === 'undefined') {
      return [{ ...DEFAULT_PROFILE_SUMMARY }];
    }
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) {
      return [{ ...DEFAULT_PROFILE_SUMMARY }];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [{ ...DEFAULT_PROFILE_SUMMARY }];
    }
    const valid: ProfileSummary[] = parsed
      .filter(
        (item): item is ProfileSummary =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as ProfileSummary).id === 'string' &&
          (item as ProfileSummary).id.trim().length > 0 &&
          typeof (item as ProfileSummary).name === 'string' &&
          (item as ProfileSummary).name.trim().length > 0,
      )
      .map((item) => ({
        id: item.id.trim(),
        name: item.name.trim(),
        isSeededDefault: Boolean(item.isSeededDefault),
        createdAt:
          typeof item.createdAt === 'string'
            ? item.createdAt
            : new Date().toISOString(),
      }));
    return valid.length > 0 ? valid : [{ ...DEFAULT_PROFILE_SUMMARY }];
  } catch {
    return [{ ...DEFAULT_PROFILE_SUMMARY }];
  }
}

export function saveProfiles(profiles: ProfileSummary[]): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // Ignore restricted storage environments
  }
}

export function getActiveProfileId(profiles: readonly ProfileSummary[]): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
      if (stored && profiles.some((p) => p.id === stored)) {
        return stored;
      }
    }
  } catch {
    // Fallback below
  }
  return profiles[0]?.id ?? DEFAULT_PROFILE_ID;
}

export function setActiveProfileId(profileId: string): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // Ignore storage errors
  }
}

export function getLocalStorageKeyForProfile(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID
    ? 'fittrack_state_v1'
    : `fittrack_state_${profileId}`;
}

export function getRecordKeyForProfile(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? 'root' : `profile_${profileId}`;
}

export function createRepositoryForProfile(
  profile: ProfileSummary,
  initialBlankSeed?: { profile: UserProfile; targets: MacroTargets },
): FitnessStorageAdapter {
  if (profile.isSeededDefault || profile.id === DEFAULT_PROFILE_ID) {
    return new IndexedDbRepository();
  }
  const initialStateFactory: () => FitnessAppState = initialBlankSeed
    ? () =>
        createBlankProfileState(
          initialBlankSeed.profile,
          initialBlankSeed.targets,
        )
    : () =>
        createBlankProfileState(
          {
            name: profile.name,
            age: 29,
            sex: 'female',
            heightCm: 162,
            activityLevel: 'light',
            startWeightKg: 60,
            startDate: new Date().toISOString().slice(0, 10),
            targetWeightKg: 55,
            targetDate: new Date(Date.now() + 180 * 86_400_000)
              .toISOString()
              .slice(0, 10),
            caffeineCutoffHour: 18,
          },
          {
            calories: 1450,
            proteinG: 100,
            carbsG: 160,
            fatG: 45,
            weekNumber: 1,
          },
        );

  return new IndexedDbRepository({
    recordKey: getRecordKeyForProfile(profile.id),
    localStorageKey: getLocalStorageKeyForProfile(profile.id),
    enableSeedMigration: false,
    initialStateFactory,
  });
}

export async function createNewProfileWithState(
  profile: UserProfile,
  targets: MacroTargets,
): Promise<{
  summary: ProfileSummary;
  profiles: ProfileSummary[];
  repository: FitnessStorageAdapter;
}> {
  const displayName = profile.name?.trim() || 'New User';
  const normalizedProfile: UserProfile = {
    ...profile,
    name: displayName,
  };
  const suffix = Math.random().toString(36).slice(2, 7);
  const summary: ProfileSummary = {
    id: `${sanitizeSlug(displayName)}-${suffix}`,
    name: displayName,
    isSeededDefault: false,
    createdAt: new Date().toISOString(),
  };

  const existing = loadProfiles();
  const nextProfiles = [...existing, summary];
  saveProfiles(nextProfiles);
  setActiveProfileId(summary.id);

  const repository = createRepositoryForProfile(summary, {
    profile: normalizedProfile,
    targets,
  });
  await repository.initializeIfNeeded();

  return { summary, profiles: nextProfiles, repository };
}

export function renameProfileInRegistry(
  profileId: string,
  newName: string,
): ProfileSummary[] {
  const trimmed = newName.trim();
  const existing = loadProfiles();
  if (!trimmed) {
    return existing;
  }
  const next = existing.map((p) =>
    p.id === profileId ? { ...p, name: trimmed } : p,
  );
  saveProfiles(next);
  return next;
}

export function deleteProfileFromRegistry(profileId: string): {
  profiles: ProfileSummary[];
  nextActiveId: string;
} {
  const existing = loadProfiles();
  const target = existing.find((p) => p.id === profileId);
  if (!target || target.isSeededDefault || existing.length <= 1) {
    return {
      profiles: existing,
      nextActiveId: getActiveProfileId(existing),
    };
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(getLocalStorageKeyForProfile(profileId));
    }
  } catch {
    // Ignore storage errors
  }

  const nextProfiles = existing.filter((p) => p.id !== profileId);
  saveProfiles(nextProfiles);
  const currentActive = getActiveProfileId(existing);
  const nextActiveId =
    currentActive === profileId
      ? nextProfiles[0].id
      : nextProfiles.some((p) => p.id === currentActive)
        ? currentActive
        : nextProfiles[0].id;
  setActiveProfileId(nextActiveId);
  return { profiles: nextProfiles, nextActiveId };
}
