import { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { formatIsoDateLocal } from './domain/training';
import type { IsoDate, TabId } from './domain/types';
import { ProgressView } from './features/progress/ProgressView';
import { WeighInModal } from './features/progress/WeighInModal';
import { SettingsView } from './features/settings/SettingsView';
import { TodayView } from './features/today/TodayView';
import { TrainingView } from './features/training/TrainingView';
import { evaluateForegroundReminders } from './services/notifications/reminderService';
import type { FitnessStorageAdapter } from './services/storage';
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

function AppShell({ initialTab = 'today' }: { initialTab?: TabId }) {
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

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-hidden bg-[#090d16] text-slate-100 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-400">
              FT
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-50">
                {TAB_TITLES[activeTab]}
              </h1>
              <p className="text-xs text-slate-400">
                Week {state.targets.weekNumber} · {currentWeightKg.toFixed(1)} kg
              </p>
            </div>
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-medium text-emerald-400">
            Goal {state.profile.targetWeightKg} kg
          </span>
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
            {activeTab === 'settings' && <SettingsView />}
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
  return (
    <FitnessProvider repository={repository} initialDate={initialDate}>
      <AppShell initialTab={initialTab} />
    </FitnessProvider>
  );
}

export default App;
