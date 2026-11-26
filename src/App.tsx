import { ChevronDown, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { formatIsoDateLocal } from './domain/training';
import type {
  IsoDate,
  MacroTargets,
  ProfileSummary,
  TabId,
  UserProfile,
} from './domain/types';
import { ProfileSwitcherModal } from './features/profiles/ProfileSwitcherModal';
import { ProgressView } from './features/progress/ProgressView';
import { WeighInModal } from './features/progress/WeighInModal';
import { SettingsView } from './features/settings/SettingsView';
import { TodayView } from './features/today/TodayView';
import { TrainingView } from './features/training/TrainingView';
import { evaluateForegroundReminders } from './services/notifications/reminderService';
import {
  createNewProfileWithState,
  createRepositoryForProfile,
  deleteProfileFromRegistry,
  getActiveProfileId,
  loadProfiles,
  renameProfileInRegistry,
  setActiveProfileId,
  type FitnessStorageAdapter,
} from './services/storage';
import { FitnessProvider, useFitness } from './state/FitnessContext';

export interface AppProps {
  repository?: FitnessStorageAdapter;
  initialTab?: TabId;
  initialDate?: IsoDate;
}

const TAB_TITLES: Record<TabId, string> = {
  today: 'Today',
  training: 'Training',
  progress: 'Progress',
  settings: 'Settings',
};

function hasSetupQueryFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('setup') === '1' || params.get('newProfile') === '1';
  } catch {
    return false;
  }
}

function clearSetupQueryFlag(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('setup') || url.searchParams.has('newProfile')) {
      url.searchParams.delete('setup');
      url.searchParams.delete('newProfile');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  } catch {
    // Ignore history API restrictions
  }
}

interface AppShellProps {
  initialTab?: TabId;
  profiles: readonly ProfileSummary[];
  activeProfileId: string;
  activeProfileSummary: ProfileSummary;
  onOpenProfileModal: (mode: 'list' | 'create') => void;
  onSyncProfileName: (profileId: string, name: string) => void;
}

function AppShell({
  initialTab = 'today',
  activeProfileId,
  activeProfileSummary,
  onOpenProfileModal,
  onSyncProfileName,
}: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const {
    isLoading,
    error,
    currentWeightKg,
    state,
    addOrUpdateWeighIn,
    updateSettings,
  } = useFitness();
  const [satModalDismissedDate, setSatModalDismissedDate] = useState<
    string | null
  >(null);

  // Keep profile registry display name synced if edited in Settings
  useEffect(() => {
    const profileName = state.profile.name?.trim();
    if (
      state.initialized &&
      profileName &&
      profileName !== activeProfileSummary.name
    ) {
      onSyncProfileName(activeProfileId, profileName);
    }
  }, [
    state.initialized,
    state.profile.name,
    activeProfileId,
    activeProfileSummary.name,
    onSyncProfileName,
  ]);

  // Evaluate client-side foreground reminders (Daily 8:00 PM & Saturday 7:00 AM) on app launch/focus
  useEffect(() => {
    if (!state.initialized || !state.settings.notificationsEnabled) {
      return;
    }
    void evaluateForegroundReminders({
      settings: state.settings,
      onUpdateSettings: updateSettings,
    });
  }, [state.initialized, state.settings, updateSettings]);

  const now = new Date();
  const todayIso = formatIsoDateLocal(now);
  const isSaturdayMorning =
    now.getDay() === 6 && now.getHours() >= 7 && now.getHours() < 12;
  const hasTodayWeighIn = state.weighIns.some((w) => w.date === todayIso);
  const showAutoSaturdayWeighIn =
    !isLoading &&
    !error &&
    state.initialized &&
    isSaturdayMorning &&
    !hasTodayWeighIn &&
    satModalDismissedDate !== todayIso;

  const displayName =
    state.profile.name?.trim() || activeProfileSummary.name || 'AJ';

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-hidden bg-[#090d16] text-slate-100 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-400">
              FT
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight text-slate-50">
                {TAB_TITLES[activeTab]}
              </h1>
              <p className="truncate text-xs text-slate-400">
                Week {state.targets.weekNumber} · {currentWeightKg.toFixed(1)} kg
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Switch or add profile"
              onClick={() => onOpenProfileModal('list')}
              className="inline-flex min-h-[36px] max-w-[110px] items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
            >
              <User className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <span className="truncate">{displayName}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
            <span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-emerald-400">
              Goal {state.profile.targetWeightKg} kg
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pt-4">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
            Loading fitness data...
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200"
          >
            {error}
          </div>
        ) : (
          <>
            {activeTab === 'today' && <TodayView />}
            {activeTab === 'training' && <TrainingView />}
            {activeTab === 'progress' && <ProgressView />}
            {activeTab === 'settings' && (
              <SettingsView
                activeProfileName={displayName}
                isSeededDefaultProfile={activeProfileSummary.isSeededDefault}
                onOpenProfileSwitcher={onOpenProfileModal}
              />
            )}
          </>
        )}
      </main>

      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      <WeighInModal
        isOpen={showAutoSaturdayWeighIn}
        onClose={() => setSatModalDismissedDate(todayIso)}
        defaultDate={todayIso}
        initialWeightKg={currentWeightKg}
        onSave={addOrUpdateWeighIn}
      />
    </div>
  );
}

export function App({ repository, initialTab = 'today', initialDate }: AppProps) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>(() =>
    loadProfiles(),
  );
  const [activeProfileId, setActiveProfileIdState] = useState<string>(() =>
    getActiveProfileId(loadProfiles()),
  );
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(() =>
    hasSetupQueryFlag(),
  );
  const [profileModalMode, setProfileModalMode] = useState<'list' | 'create'>(
    () => (hasSetupQueryFlag() ? 'create' : 'list'),
  );

  const repoCacheRef = useRef<Map<string, FitnessStorageAdapter>>(new Map());

  const activeProfileSummary = useMemo(
    () =>
      profiles.find((p) => p.id === activeProfileId) ??
      profiles[0] ?? {
        id: 'default',
        name: 'AJ',
        isSeededDefault: true,
        createdAt: '2026-11-24T00:00:00.000Z',
      },
    [profiles, activeProfileId],
  );

  const resolvedRepository = useMemo<FitnessStorageAdapter | undefined>(() => {
    if (repository) {
      return repository;
    }
    const existing = repoCacheRef.current.get(activeProfileSummary.id);
    if (existing) {
      return existing;
    }
    const created = createRepositoryForProfile(activeProfileSummary);
    repoCacheRef.current.set(activeProfileSummary.id, created);
    return created;
  }, [repository, activeProfileSummary]);

  const handleOpenProfileModal = useCallback((mode: 'list' | 'create') => {
    setProfileModalMode(mode);
    setProfileModalOpen(true);
  }, []);

  const handleCloseProfileModal = useCallback(() => {
    setProfileModalOpen(false);
    clearSetupQueryFlag();
  }, []);

  const handleSelectProfile = useCallback((profileId: string) => {
    setActiveProfileId(profileId);
    setActiveProfileIdState(profileId);
  }, []);

  const handleCreateProfile = useCallback(
    async (profile: UserProfile, targets: MacroTargets) => {
      const {
        summary,
        profiles: nextProfiles,
        repository: createdRepo,
      } = await createNewProfileWithState(profile, targets);
      repoCacheRef.current.set(summary.id, createdRepo);
      setProfiles(nextProfiles);
      setActiveProfileIdState(summary.id);
      clearSetupQueryFlag();
    },
    [],
  );

  const handleDeleteProfile = useCallback((profileId: string) => {
    const { profiles: nextProfiles, nextActiveId } =
      deleteProfileFromRegistry(profileId);
    repoCacheRef.current.delete(profileId);
    setProfiles(nextProfiles);
    setActiveProfileIdState(nextActiveId);
  }, []);

  const handleSyncProfileName = useCallback(
    (profileId: string, name: string) => {
      if (repository) return;
      const updated = renameProfileInRegistry(profileId, name);
      setProfiles(updated);
    },
    [repository],
  );

  return (
    <FitnessProvider
      repository={resolvedRepository}
      initialDate={initialDate}
    >
      <AppShell
        initialTab={initialTab}
        profiles={profiles}
        activeProfileId={activeProfileSummary.id}
        activeProfileSummary={activeProfileSummary}
        onOpenProfileModal={handleOpenProfileModal}
        onSyncProfileName={handleSyncProfileName}
      />
      <ProfileSwitcherModal
        isOpen={profileModalOpen}
        initialMode={profileModalMode}
        profiles={profiles}
        activeProfileId={activeProfileSummary.id}
        onClose={handleCloseProfileModal}
        onSelectProfile={handleSelectProfile}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
      />
    </FitnessProvider>
  );
}

export default App;
