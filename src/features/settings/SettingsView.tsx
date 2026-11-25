import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { parseIsoDateLocal } from '../../domain/training';
import type { MacroTargets, UserProfile } from '../../domain/types';
import {
  DAILY_REMINDER_BODY,
  SATURDAY_REMINDER_BODY,
  downloadCombinedRemindersIcs,
  downloadDailyCheckInIcs,
  downloadSaturdayWeighInIcs,
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  triggerTextFileDownload,
  type NotificationPermissionState,
} from '../../services/notifications/reminderService';
import { useFitness } from '../../state/FitnessContext';

interface ProfileDraft {
  age: string;
  sex: UserProfile['sex'];
  heightCm: string;
  activityLevel: UserProfile['activityLevel'];
  startWeightKg: string;
  startDate: string;
  targetWeightKg: string;
  targetDate: string;
  caffeineCutoffHour: string;
}

interface TargetsDraft {
  weekNumber: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

function profileToDraft(profile: UserProfile): ProfileDraft {
  return {
    age: String(profile.age),
    sex: profile.sex,
    heightCm: String(profile.heightCm),
    activityLevel: profile.activityLevel,
    startWeightKg: String(profile.startWeightKg),
    startDate: profile.startDate,
    targetWeightKg: String(profile.targetWeightKg),
    targetDate: profile.targetDate,
    caffeineCutoffHour: String(profile.caffeineCutoffHour),
  };
}

function targetsToDraft(targets: MacroTargets): TargetsDraft {
  return {
    weekNumber: String(targets.weekNumber),
    calories: String(targets.calories),
    proteinG: String(targets.proteinG),
    carbsG: String(targets.carbsG),
    fatG: String(targets.fatG),
  };
}

function parseRequiredNumber(raw: string): number {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? Number(trimmed) : Number.NaN;
}

function readUploadedTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Could not read the selected backup file.'));
    };
    reader.readAsText(file);
  });
}

export function SettingsView() {
  const {
    state,
    selectedDate,
    geminiApiKey,
    updateProfile,
    updateTargets,
    updateSettings,
    saveGeminiApiKey,
    exportBackupJson,
    importBackupJson,
    resetAllToSeed,
  } = useFitness();

  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() =>
    profileToDraft(state.profile),
  );
  const [targetsDraft, setTargetsDraft] = useState<TargetsDraft>(() =>
    targetsToDraft(state.targets),
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const isSavingProfileRef = useRef<boolean>(false);

  const [apiKeyDraft, setApiKeyDraft] = useState<string>(geminiApiKey);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [apiStatus, setApiStatus] = useState<string | null>(null);

  const [permissionState, setPermissionState] =
    useState<NotificationPermissionState>(() => getNotificationPermission());
  const [notificationStatus, setNotificationStatus] = useState<string | null>(
    null,
  );

  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [isBusyBackup, setIsBusyBackup] = useState<boolean>(false);

  const [syncedProfile, setSyncedProfile] = useState<UserProfile>(state.profile);
  const [syncedTargets, setSyncedTargets] = useState<MacroTargets>(state.targets);
  const [syncedApiKey, setSyncedApiKey] = useState<string>(geminiApiKey);

  // Sync drafts immediately during render whenever context state updates (including JSON import & Reset to Seed).
  if (syncedProfile !== state.profile) {
    setSyncedProfile(state.profile);
    setProfileDraft(profileToDraft(state.profile));
  }
  if (syncedTargets !== state.targets) {
    setSyncedTargets(state.targets);
    setTargetsDraft(targetsToDraft(state.targets));
  }
  if (syncedApiKey !== geminiApiKey) {
    setSyncedApiKey(geminiApiKey);
    setApiKeyDraft(geminiApiKey);
  }

  const parsedCutoffHour = parseRequiredNumber(profileDraft.caffeineCutoffHour);
  const formattedCutoffTime =
    Number.isInteger(parsedCutoffHour) &&
    parsedCutoffHour >= 0 &&
    parsedCutoffHour <= 23
      ? `${String(parsedCutoffHour).padStart(2, '0')}:00`
      : '--:--';

  const handleSaveProfileAndTargets = async (event: FormEvent) => {
    event.preventDefault();
    if (isSavingProfileRef.current || isSavingProfile) {
      return;
    }
    setProfileError(null);
    setProfileStatus(null);

    const age = parseRequiredNumber(profileDraft.age);
    const heightCm = parseRequiredNumber(profileDraft.heightCm);
    const startWeightKg = parseRequiredNumber(profileDraft.startWeightKg);
    const targetWeightKg = parseRequiredNumber(profileDraft.targetWeightKg);
    const caffeineCutoffHour = parseRequiredNumber(
      profileDraft.caffeineCutoffHour,
    );

    if (!Number.isFinite(age) || age < 13 || age > 120) {
      setProfileError('Age must be between 13 and 120.');
      return;
    }
    if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
      setProfileError('Height must be between 100 and 250 cm.');
      return;
    }
    if (
      !Number.isFinite(startWeightKg) ||
      startWeightKg < 30 ||
      startWeightKg > 300 ||
      !Number.isFinite(targetWeightKg) ||
      targetWeightKg < 30 ||
      targetWeightKg > 300
    ) {
      setProfileError('Start and target weights must be between 30 and 300 kg.');
      return;
    }
    if (
      !Number.isInteger(caffeineCutoffHour) ||
      caffeineCutoffHour < 0 ||
      caffeineCutoffHour > 23
    ) {
      setProfileError('Caffeine cutoff hour must be an integer from 0 to 23.');
      return;
    }

    try {
      parseIsoDateLocal(profileDraft.startDate);
      parseIsoDateLocal(profileDraft.targetDate);
    } catch {
      setProfileError(
        'Start date and target date must be valid YYYY-MM-DD calendar dates.',
      );
      return;
    }

    if (profileDraft.targetDate <= profileDraft.startDate) {
      setProfileError('Target date must be after start date.');
      return;
    }

    const weekNumber = parseRequiredNumber(targetsDraft.weekNumber);
    const calories = parseRequiredNumber(targetsDraft.calories);
    const proteinG = parseRequiredNumber(targetsDraft.proteinG);
    const carbsG = parseRequiredNumber(targetsDraft.carbsG);
    const fatG = parseRequiredNumber(targetsDraft.fatG);

    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      setProfileError('Week number must be an integer of 1 or higher.');
      return;
    }
    if (!Number.isFinite(calories) || calories <= 0) {
      setProfileError('Daily calories target must be greater than 0.');
      return;
    }
    if (
      !Number.isFinite(proteinG) ||
      proteinG < 0 ||
      !Number.isFinite(carbsG) ||
      carbsG < 0 ||
      !Number.isFinite(fatG) ||
      fatG < 0
    ) {
      setProfileError(
        'Protein, carbs, and fat targets must be valid non-negative numbers.',
      );
      return;
    }

    const nextProfile: UserProfile = {
      age: Math.round(age),
      sex: profileDraft.sex,
      heightCm: Math.round(heightCm),
      activityLevel: profileDraft.activityLevel,
      startWeightKg: Math.round(startWeightKg * 100) / 100,
      startDate: profileDraft.startDate.trim(),
      targetWeightKg: Math.round(targetWeightKg * 100) / 100,
      targetDate: profileDraft.targetDate.trim(),
      caffeineCutoffHour,
    };
    const nextTargets: MacroTargets = {
      weekNumber,
      calories: Math.round(calories),
      proteinG: Math.round(proteinG),
      carbsG: Math.round(carbsG),
      fatG: Math.round(fatG),
    };

    const profileUnchanged =
      nextProfile.age === state.profile.age &&
      nextProfile.sex === state.profile.sex &&
      nextProfile.heightCm === state.profile.heightCm &&
      nextProfile.activityLevel === state.profile.activityLevel &&
      nextProfile.startWeightKg === state.profile.startWeightKg &&
      nextProfile.startDate === state.profile.startDate &&
      nextProfile.targetWeightKg === state.profile.targetWeightKg &&
      nextProfile.targetDate === state.profile.targetDate &&
      nextProfile.caffeineCutoffHour === state.profile.caffeineCutoffHour;
    const targetsUnchanged =
      nextTargets.weekNumber === state.targets.weekNumber &&
      nextTargets.calories === state.targets.calories &&
      nextTargets.proteinG === state.targets.proteinG &&
      nextTargets.carbsG === state.targets.carbsG &&
      nextTargets.fatG === state.targets.fatG;

    if (profileUnchanged && targetsUnchanged && apiKeyDraft !== geminiApiKey) {
      saveGeminiApiKey(apiKeyDraft);
      setApiStatus(
        apiKeyDraft.trim().length > 0
          ? 'Gemini API key saved locally.'
          : 'Gemini API key cleared.',
      );
      return;
    }

    isSavingProfileRef.current = true;
    setIsSavingProfile(true);
    try {
      await updateProfile(nextProfile);
      await updateTargets(nextTargets);
      if (apiKeyDraft !== geminiApiKey) {
        saveGeminiApiKey(apiKeyDraft);
      }
      setProfileStatus('Profile & targets saved.');
    } catch (err: unknown) {
      setProfileError(
        err instanceof Error
          ? err.message
          : 'Failed to save profile and targets.',
      );
    } finally {
      isSavingProfileRef.current = false;
      setIsSavingProfile(false);
    }
  };

  const handleSaveApiKey = () => {
    saveGeminiApiKey(apiKeyDraft);
    setApiStatus(
      apiKeyDraft.trim().length > 0
        ? 'Gemini API key saved locally.'
        : 'Gemini API key cleared.',
    );
  };

  const handleClearApiKey = () => {
    setApiKeyDraft('');
    saveGeminiApiKey('');
    setApiStatus('Gemini API key cleared.');
  };

  const handleEndpointModeChange = async (mode: 'direct' | 'proxy') => {
    setApiStatus(null);
    await updateSettings({ geminiApiEndpointMode: mode });
    setApiStatus(
      mode === 'direct'
        ? 'Switched AI endpoint mode to Direct Browser API.'
        : 'Switched AI endpoint mode to Cloudflare Proxy (/api/analyze-meal).',
    );
  };

  const handleToggleNotifications = async () => {
    setNotificationStatus(null);
    if (state.settings.notificationsEnabled) {
      await updateSettings({ notificationsEnabled: false });
      setNotificationStatus('Browser reminder checks disabled.');
      return;
    }

    const perm = await requestNotificationPermission();
    setPermissionState(perm);
    if (perm === 'granted') {
      await updateSettings({ notificationsEnabled: true });
      setNotificationStatus('Browser reminder checks enabled.');
    } else if (perm === 'unsupported') {
      await updateSettings({ notificationsEnabled: false });
      setNotificationStatus(
        'Browser notifications are not supported on this device. Use the .ics calendar downloads below.',
      );
    } else {
      await updateSettings({ notificationsEnabled: false });
      setNotificationStatus(
        'Notification permission was denied. Enable notifications in browser settings or use the .ics calendar downloads below.',
      );
    }
  };

  const handleSendTestNotification = async () => {
    const result = await sendTestNotification();
    setPermissionState(result.status);
    setNotificationStatus(result.message);
  };

  const handleExportBackup = async () => {
    setBackupError(null);
    setBackupStatus(null);
    setIsBusyBackup(true);
    try {
      const json = await exportBackupJson();
      triggerTextFileDownload(
        `fittrack-backup-${selectedDate}.json`,
        json,
        'application/json;charset=utf-8',
      );
      setBackupStatus('JSON backup exported.');
    } catch (err: unknown) {
      setBackupError(
        err instanceof Error ? err.message : 'Failed to export backup.',
      );
    } finally {
      setIsBusyBackup(false);
    }
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBackupError(null);
    setBackupStatus(null);
    setIsBusyBackup(true);
    try {
      const text = await readUploadedTextFile(file);
      await importBackupJson(text);
      setBackupStatus('Backup restored successfully.');
    } catch (err: unknown) {
      setBackupError(
        err instanceof Error ? err.message : 'Invalid backup file.',
      );
    } finally {
      event.target.value = '';
      setIsBusyBackup(false);
    }
  };

  const handleConfirmReset = async () => {
    setBackupError(null);
    setBackupStatus(null);
    setIsBusyBackup(true);
    try {
      await resetAllToSeed();
      setConfirmReset(false);
      setBackupStatus('Restored initial Nov 24–25 seed data.');
    } catch (err: unknown) {
      setBackupError(
        err instanceof Error ? err.message : 'Failed to reset to seed data.',
      );
    } finally {
      setIsBusyBackup(false);
    }
  };

  return (
    <section className="space-y-4">
      {/* 1. Profile & Targets */}
      <form
        onSubmit={handleSaveProfileAndTargets}
        noValidate
        className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Profile &amp; Targets
            </h2>
            <p className="text-[11px] text-slate-400">
              {state.profile.age}y · {state.profile.heightCm} cm ·{' '}
              {state.profile.activityLevel === 'desk'
                ? 'Desk job'
                : `${state.profile.activityLevel} activity`}
            </p>
          </div>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs tabular-nums text-slate-300">
            Caffeine cutoff: <span>{formattedCutoffTime}</span>
          </span>
        </div>

        {profileError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
          >
            {profileError}
          </div>
        )}

        {profileStatus && (
          <div
            role="status"
            className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
          >
            {profileStatus}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label
              htmlFor="profile-age"
              className="block text-xs text-slate-400"
            >
              Age
            </label>
            <input
              id="profile-age"
              type="number"
              inputMode="numeric"
              value={profileDraft.age}
              onChange={(e) =>
                setProfileDraft((d) => ({ ...d, age: e.target.value }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-sex"
              className="block text-xs text-slate-400"
            >
              Sex
            </label>
            <select
              id="profile-sex"
              value={profileDraft.sex}
              onChange={(e) =>
                setProfileDraft((d) => ({
                  ...d,
                  sex: e.target.value as UserProfile['sex'],
                }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-height"
              className="block text-xs text-slate-400"
            >
              Height (cm)
            </label>
            <input
              id="profile-height"
              type="number"
              inputMode="numeric"
              value={profileDraft.heightCm}
              onChange={(e) =>
                setProfileDraft((d) => ({ ...d, heightCm: e.target.value }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-activity"
              className="block text-xs text-slate-400"
            >
              Activity
            </label>
            <select
              id="profile-activity"
              value={profileDraft.activityLevel}
              onChange={(e) =>
                setProfileDraft((d) => ({
                  ...d,
                  activityLevel: e.target.value as UserProfile['activityLevel'],
                }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="desk">Desk</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="active">Active</option>
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-start-weight"
              className="block text-xs text-slate-400"
            >
              Start Weight (kg)
            </label>
            <input
              id="profile-start-weight"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={profileDraft.startWeightKg}
              onChange={(e) =>
                setProfileDraft((d) => ({
                  ...d,
                  startWeightKg: e.target.value,
                }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-target-weight"
              className="block text-xs text-slate-400"
            >
              Target Weight (kg)
            </label>
            <input
              id="profile-target-weight"
              type="number"
              step="0.1"
              inputMode="decimal"
              value={profileDraft.targetWeightKg}
              onChange={(e) =>
                setProfileDraft((d) => ({
                  ...d,
                  targetWeightKg: e.target.value,
                }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-start-date"
              className="block text-xs text-slate-400"
            >
              Start Date
            </label>
            <input
              id="profile-start-date"
              type="date"
              value={profileDraft.startDate}
              onChange={(e) =>
                setProfileDraft((d) => ({ ...d, startDate: e.target.value }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="profile-target-date"
              className="block text-xs text-slate-400"
            >
              Target Date
            </label>
            <input
              id="profile-target-date"
              type="date"
              value={profileDraft.targetDate}
              onChange={(e) =>
                setProfileDraft((d) => ({ ...d, targetDate: e.target.value }))
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="profile-caffeine-cutoff"
            className="block text-xs text-slate-400"
          >
            Caffeine Cutoff Hour (0–23)
          </label>
          <input
            id="profile-caffeine-cutoff"
            type="number"
            min={0}
            max={23}
            inputMode="numeric"
            value={profileDraft.caffeineCutoffHour}
            onChange={(e) =>
              setProfileDraft((d) => ({
                ...d,
                caffeineCutoffHour: e.target.value,
              }))
            }
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="mb-2 text-xs font-semibold text-slate-200">
            Daily Macro Targets
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label
                htmlFor="targets-week"
                className="block text-xs text-slate-400"
              >
                Week Number
              </label>
              <input
                id="targets-week"
                type="number"
                min={1}
                inputMode="numeric"
                value={targetsDraft.weekNumber}
                onChange={(e) =>
                  setTargetsDraft((d) => ({ ...d, weekNumber: e.target.value }))
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="targets-calories"
                className="block text-xs text-slate-400"
              >
                Calories (kcal)
              </label>
              <input
                id="targets-calories"
                type="number"
                min={1}
                inputMode="numeric"
                value={targetsDraft.calories}
                onChange={(e) =>
                  setTargetsDraft((d) => ({ ...d, calories: e.target.value }))
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="targets-protein"
                className="block text-xs text-slate-400"
              >
                Protein (g)
              </label>
              <input
                id="targets-protein"
                type="number"
                min={0}
                inputMode="numeric"
                value={targetsDraft.proteinG}
                onChange={(e) =>
                  setTargetsDraft((d) => ({ ...d, proteinG: e.target.value }))
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="targets-carbs"
                className="block text-xs text-slate-400"
              >
                Carbs (g)
              </label>
              <input
                id="targets-carbs"
                type="number"
                min={0}
                inputMode="numeric"
                value={targetsDraft.carbsG}
                onChange={(e) =>
                  setTargetsDraft((d) => ({ ...d, carbsG: e.target.value }))
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <label
                htmlFor="targets-fat"
                className="block text-xs text-slate-400"
              >
                Fat (g)
              </label>
              <input
                id="targets-fat"
                type="number"
                min={0}
                inputMode="numeric"
                value={targetsDraft.fatG}
                onChange={(e) =>
                  setTargetsDraft((d) => ({ ...d, fatG: e.target.value }))
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSavingProfile}
          className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
        >
          {isSavingProfile ? 'Saving...' : 'Save Profile & Targets'}
        </button>
      </form>

      {/* 2. AI Meal Estimator (Gemini) */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            AI Meal Estimator (Gemini)
          </h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              geminiApiKey.length > 0
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {geminiApiKey.length > 0 ? 'Key configured' : 'No key saved'}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-slate-400">
          Your Gemini API key is stored only in this browser&apos;s local
          storage and is never included in JSON backups.
        </p>

        <div className="space-y-1.5">
          <span className="block text-xs text-slate-400">
            API Endpoint Mode
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={state.settings.geminiApiEndpointMode === 'direct'}
              onClick={() => void handleEndpointModeChange('direct')}
              className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                state.settings.geminiApiEndpointMode === 'direct'
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Direct API
            </button>
            <button
              type="button"
              aria-pressed={state.settings.geminiApiEndpointMode === 'proxy'}
              onClick={() => void handleEndpointModeChange('proxy')}
              className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                state.settings.geminiApiEndpointMode === 'proxy'
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Cloudflare Proxy
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="gemini-api-key"
            className="block text-xs text-slate-400"
          >
            Gemini API Key
          </label>
          <div className="flex gap-2">
            <input
              id="gemini-api-key"
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((prev) => !prev)}
              className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
            >
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveApiKey}
            className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            Save API Key
          </button>
          <button
            type="button"
            onClick={handleClearApiKey}
            className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Clear Key
          </button>
        </div>

        {apiStatus && (
          <div
            role="status"
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-200"
          >
            {apiStatus}
          </div>
        )}
      </div>

      {/* 3. Notifications & Calendar Reminders (.ics) */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">
            Notifications &amp; Reminders
          </h2>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-300">
            Permission: {permissionState}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleToggleNotifications()}
            className={`min-h-[44px] flex-1 rounded-xl px-4 text-xs font-semibold transition-colors ${
              state.settings.notificationsEnabled
                ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
            }`}
          >
            {state.settings.notificationsEnabled
              ? 'Disable Notifications'
              : 'Enable Notifications'}
          </button>
          <button
            type="button"
            onClick={() => void handleSendTestNotification()}
            className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            Send Test Notification
          </button>
        </div>

        {notificationStatus && (
          <div
            role="status"
            className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-200"
          >
            {notificationStatus}
          </div>
        )}

        <div className="space-y-2 border-t border-slate-800 pt-3">
          <div className="text-xs font-semibold text-slate-200">
            Recurring Calendar Fallback (.ics)
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            iOS and Android PWAs cannot run background push timers without a
            server. Import these `.ics` files into Apple or Google Calendar for
            native recurring alarms:
          </p>
          <ul className="space-y-1 text-[11px] text-slate-400">
            <li>
              <strong className="text-slate-200">Daily 8:00 PM:</strong>{' '}
              {DAILY_REMINDER_BODY}
            </li>
            <li>
              <strong className="text-slate-200">Saturday 7:00 AM:</strong>{' '}
              {SATURDAY_REMINDER_BODY}
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={downloadCombinedRemindersIcs}
              className="min-h-[44px] flex-1 rounded-xl bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25"
            >
              Combined Reminders (.ics)
            </button>
            <button
              type="button"
              onClick={downloadDailyCheckInIcs}
              className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
            >
              Daily 8:00 PM (.ics)
            </button>
            <button
              type="button"
              onClick={downloadSaturdayWeighInIcs}
              className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
            >
              Saturday 7:00 AM (.ics)
            </button>
          </div>
        </div>
      </div>

      {/* 4. Data Backup & Reset */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <h2 className="text-sm font-semibold text-slate-100">
          Data Backup &amp; Reset
        </h2>
        <p className="text-xs leading-relaxed text-slate-400">
          Export your profile, targets, presets, meals, workouts, and weigh-ins
          to JSON, restore from a backup file, or reset to the Nov 24–25 seed
          data.
        </p>

        {backupError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
          >
            {backupError}
          </div>
        )}

        {backupStatus && (
          <div
            role="status"
            className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
          >
            {backupStatus}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusyBackup}
            onClick={() => void handleExportBackup()}
            className="min-h-[44px] flex-1 rounded-xl bg-slate-800 px-4 text-xs font-semibold text-slate-100 ring-1 ring-slate-700 transition-colors hover:bg-slate-700 disabled:opacity-60"
          >
            Export JSON Backup
          </button>

          <label className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25">
            <span>Import JSON Backup</span>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Import JSON backup"
              disabled={isBusyBackup}
              onChange={(e) => void handleImportBackup(e)}
              className="sr-only"
            />
          </label>
        </div>

        <div className="border-t border-slate-800 pt-3">
          {!confirmReset ? (
            <button
              type="button"
              disabled={isBusyBackup}
              onClick={() => {
                setConfirmReset(true);
                setBackupError(null);
              }}
              className="min-h-[44px] w-full rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-950/60"
            >
              Reset to Seed Data
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border border-rose-500/40 bg-rose-950/30 p-3">
              <p className="text-xs text-rose-200">
                This will overwrite your logged meals, workouts, and weigh-ins
                with the initial Nov 24–25, 2026 seed data.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isBusyBackup}
                  onClick={() => void handleConfirmReset()}
                  className="min-h-[44px] flex-1 rounded-xl bg-rose-500 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-rose-400"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  disabled={isBusyBackup}
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
