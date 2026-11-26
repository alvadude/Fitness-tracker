import { Check, Copy, Plus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { calculateRecommendedTargets } from '../../domain/nutrition';
import {
  addDaysIsoDate,
  formatIsoDateLocal,
  parseIsoDateLocal,
} from '../../domain/training';
import type {
  MacroTargets,
  ProfileSummary,
  UserProfile,
} from '../../domain/types';

export interface ProfileSwitcherModalProps {
  isOpen: boolean;
  initialMode?: 'list' | 'create';
  profiles: readonly ProfileSummary[];
  activeProfileId: string;
  onClose: () => void;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (
    profile: UserProfile,
    targets: MacroTargets,
  ) => Promise<void>;
  onDeleteProfile: (profileId: string) => void;
}

interface NewProfileDraft {
  name: string;
  sex: UserProfile['sex'];
  age: string;
  heightCm: string;
  startWeightKg: string;
  targetWeightKg: string;
  startDate: string;
  targetDate: string;
  activityLevel: UserProfile['activityLevel'];
  caffeineCutoffHour: string;
}

interface TargetDraft {
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

function makeDefaultDraft(): NewProfileDraft {
  const today = formatIsoDateLocal(new Date());
  const targetDate = addDaysIsoDate(today, 180);
  return {
    name: '',
    sex: 'female',
    age: '29',
    heightCm: '162',
    startWeightKg: '62',
    targetWeightKg: '55',
    startDate: today,
    targetDate,
    activityLevel: 'light',
    caffeineCutoffHour: '18',
  };
}

function tryBuildProfile(draft: NewProfileDraft): UserProfile | null {
  const age = Number(draft.age.trim());
  const heightCm = Number(draft.heightCm.trim());
  const startWeightKg = Number(draft.startWeightKg.trim());
  const targetWeightKg = Number(draft.targetWeightKg.trim());
  const caffeineCutoffHour = Number(draft.caffeineCutoffHour.trim());
  if (
    !Number.isFinite(age) ||
    age < 13 ||
    age > 120 ||
    !Number.isFinite(heightCm) ||
    heightCm < 100 ||
    heightCm > 250 ||
    !Number.isFinite(startWeightKg) ||
    startWeightKg < 30 ||
    startWeightKg > 300 ||
    !Number.isFinite(targetWeightKg) ||
    targetWeightKg < 30 ||
    targetWeightKg > 300 ||
    !Number.isInteger(caffeineCutoffHour) ||
    caffeineCutoffHour < 0 ||
    caffeineCutoffHour > 23
  ) {
    return null;
  }
  try {
    parseIsoDateLocal(draft.startDate);
    parseIsoDateLocal(draft.targetDate);
  } catch {
    return null;
  }
  if (draft.targetDate <= draft.startDate) {
    return null;
  }
  return {
    name: draft.name.trim(),
    age: Math.round(age),
    sex: draft.sex,
    heightCm: Math.round(heightCm),
    activityLevel: draft.activityLevel,
    startWeightKg: Math.round(startWeightKg * 10) / 10,
    startDate: draft.startDate.trim(),
    targetWeightKg: Math.round(targetWeightKg * 10) / 10,
    targetDate: draft.targetDate.trim(),
    caffeineCutoffHour,
  };
}

function targetsToStrings(t: MacroTargets): TargetDraft {
  return {
    calories: String(t.calories),
    proteinG: String(t.proteinG),
    carbsG: String(t.carbsG),
    fatG: String(t.fatG),
  };
}

export function getProfileSetupInviteUrl(): string {
  if (typeof window === 'undefined') {
    return '/?setup=1';
  }
  return `${window.location.origin}${window.location.pathname}?setup=1`;
}

export function ProfileSwitcherModal({
  isOpen,
  initialMode = 'list',
  profiles,
  activeProfileId,
  onClose,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
}: ProfileSwitcherModalProps) {
  const [mode, setMode] = useState<'list' | 'create'>(initialMode);
  const [draft, setDraft] = useState<NewProfileDraft>(() => makeDefaultDraft());
  const [targetsEditedManually, setTargetsEditedManually] = useState(false);
  const [targetDraft, setTargetDraft] = useState<TargetDraft>(() => {
    const initial = tryBuildProfile(makeDefaultDraft())!;
    return targetsToStrings(calculateRecommendedTargets(initial));
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setFormError(null);
      setConfirmDeleteId(null);
      setCopyStatus(null);
      if (initialMode === 'create') {
        const fresh = makeDefaultDraft();
        setDraft(fresh);
        setTargetsEditedManually(false);
        const built = tryBuildProfile(fresh);
        if (built) {
          setTargetDraft(targetsToStrings(calculateRecommendedTargets(built)));
        }
      }
    }
  }, [isOpen, initialMode]);

  if (!isOpen) {
    return null;
  }

  const updateDraftField = <K extends keyof NewProfileDraft>(
    key: K,
    value: NewProfileDraft[K],
  ) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (!targetsEditedManually) {
        const built = tryBuildProfile(next);
        if (built) {
          setTargetDraft(targetsToStrings(calculateRecommendedTargets(built)));
        }
      }
      return next;
    });
  };

  const handleRecalculateTargets = () => {
    setFormError(null);
    const built = tryBuildProfile(draft);
    if (!built) {
      setFormError(
        'Enter valid age, height, weights, and target date to auto-calculate targets.',
      );
      return;
    }
    setTargetsEditedManually(false);
    setTargetDraft(targetsToStrings(calculateRecommendedTargets(built)));
  };

  const handleCopyInviteLink = async () => {
    const inviteUrl = getProfileSetupInviteUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        setCopyStatus('Setup link copied! Share it to open her setup screen.');
      } else {
        setCopyStatus(`Share link: ${inviteUrl}`);
      }
    } catch {
      setCopyStatus(`Share link: ${inviteUrl}`);
    }
  };

  const handleSubmitNewProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    if (draft.name.trim().length === 0) {
      setFormError('Please enter a name for this profile.');
      return;
    }

    const builtProfile = tryBuildProfile(draft);
    if (!builtProfile) {
      setFormError(
        'Please enter valid age (13–120), height (100–250 cm), weights (30–300 kg), and a target date after the start date.',
      );
      return;
    }

    const calories = Number(targetDraft.calories.trim());
    const proteinG = Number(targetDraft.proteinG.trim());
    const carbsG = Number(targetDraft.carbsG.trim());
    const fatG = Number(targetDraft.fatG.trim());
    if (
      !Number.isFinite(calories) ||
      calories < 800 ||
      !Number.isFinite(proteinG) ||
      proteinG < 0 ||
      !Number.isFinite(carbsG) ||
      carbsG < 0 ||
      !Number.isFinite(fatG) ||
      fatG < 0
    ) {
      setFormError(
        'Daily calories must be at least 800 kcal and macro targets must be non-negative numbers.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateProfile(builtProfile, {
        calories: Math.round(calories),
        proteinG: Math.round(proteinG),
        carbsG: Math.round(carbsG),
        fatG: Math.round(fatG),
        weekNumber: 1,
      });
      onClose();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to create profile.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profiles & Setup"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-800 bg-[#0d1320] p-4 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              {mode === 'create' ? (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Users className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                {mode === 'create' ? 'Set Up New Profile' : 'Profiles'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {mode === 'create'
                  ? 'Separate meals, workouts, weight log & macro targets'
                  : 'Switch person or add a new profile on this device'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profiles modal"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'list' ? (
          <div className="space-y-3">
            <ul className="space-y-2">
              {profiles.map((p) => {
                const isActive = p.id === activeProfileId;
                const initials = p.name.trim().slice(0, 2).toUpperCase() || 'U';
                return (
                  <li
                    key={p.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      isActive
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-slate-800 bg-slate-900/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProfile(p.id);
                          onClose();
                        }}
                        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isActive
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          {initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-100">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {isActive
                              ? 'Active profile'
                              : 'Tap to switch to this profile'}
                          </div>
                        </div>
                        {isActive && (
                          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        )}
                      </button>

                      {!p.isSeededDefault && (
                        <button
                          type="button"
                          aria-label={`Delete profile ${p.name}`}
                          onClick={() =>
                            setConfirmDeleteId(
                              confirmDeleteId === p.id ? null : p.id,
                            )
                          }
                          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {confirmDeleteId === p.id && (
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
                        <span className="text-[11px] text-rose-200">
                          Remove {p.name}&apos;s profile &amp; logs?
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteProfile(p.id);
                              setConfirmDeleteId(null);
                            }}
                            className="min-h-[36px] rounded-lg bg-rose-500 px-2.5 text-xs font-semibold text-slate-950"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[36px] rounded-lg border border-slate-700 bg-slate-800 px-2.5 text-xs text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={() => {
                const fresh = makeDefaultDraft();
                setDraft(fresh);
                setTargetsEditedManually(false);
                const built = tryBuildProfile(fresh);
                if (built) {
                  setTargetDraft(
                    targetsToStrings(calculateRecommendedTargets(built)),
                  );
                }
                setFormError(null);
                setMode('create');
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              <span>Add New Person</span>
            </button>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
              <p className="text-xs leading-relaxed text-slate-400">
                Using a separate phone? Send her the direct setup link so her
                phone opens straight to her own profile setup:
              </p>
              <button
                type="button"
                onClick={() => void handleCopyInviteLink()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Setup Link for Another Phone</span>
              </button>
              {copyStatus && (
                <p role="status" className="text-[11px] text-emerald-300">
                  {copyStatus}
                </p>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmitNewProfile}
            noValidate
            className="space-y-3"
          >
            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
              >
                {formError}
              </div>
            )}

            <div className="space-y-1">
              <label
                htmlFor="new-profile-name"
                className="block text-xs text-slate-400"
              >
                Name
              </label>
              <input
                id="new-profile-name"
                type="text"
                placeholder="e.g. Sarah"
                value={draft.name}
                onChange={(e) => updateDraftField('name', e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label
                  htmlFor="new-profile-sex"
                  className="block text-xs text-slate-400"
                >
                  Sex
                </label>
                <select
                  id="new-profile-sex"
                  value={draft.sex}
                  onChange={(e) =>
                    updateDraftField(
                      'sex',
                      e.target.value as UserProfile['sex'],
                    )
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-profile-age"
                  className="block text-xs text-slate-400"
                >
                  Age
                </label>
                <input
                  id="new-profile-age"
                  type="number"
                  inputMode="numeric"
                  value={draft.age}
                  onChange={(e) => updateDraftField('age', e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-profile-height"
                  className="block text-xs text-slate-400"
                >
                  Height (cm)
                </label>
                <input
                  id="new-profile-height"
                  type="number"
                  inputMode="numeric"
                  value={draft.heightCm}
                  onChange={(e) => updateDraftField('heightCm', e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-profile-activity"
                  className="block text-xs text-slate-400"
                >
                  Activity Level
                </label>
                <select
                  id="new-profile-activity"
                  value={draft.activityLevel}
                  onChange={(e) =>
                    updateDraftField(
                      'activityLevel',
                      e.target.value as UserProfile['activityLevel'],
                    )
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
                  htmlFor="new-profile-start-weight"
                  className="block text-xs text-slate-400"
                >
                  Current Weight (kg)
                </label>
                <input
                  id="new-profile-start-weight"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={draft.startWeightKg}
                  onChange={(e) =>
                    updateDraftField('startWeightKg', e.target.value)
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-profile-target-weight"
                  className="block text-xs text-slate-400"
                >
                  Goal Weight (kg)
                </label>
                <input
                  id="new-profile-target-weight"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  value={draft.targetWeightKg}
                  onChange={(e) =>
                    updateDraftField('targetWeightKg', e.target.value)
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-profile-start-date"
                  className="block text-xs text-slate-400"
                >
                  Start Date
                </label>
                <input
                  id="new-profile-start-date"
                  type="date"
                  value={draft.startDate}
                  onChange={(e) =>
                    updateDraftField('startDate', e.target.value)
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-profile-target-date"
                  className="block text-xs text-slate-400"
                >
                  Target Date
                </label>
                <input
                  id="new-profile-target-date"
                  type="date"
                  value={draft.targetDate}
                  onChange={(e) =>
                    updateDraftField('targetDate', e.target.value)
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-300">
                  Daily Macro Targets (Auto-Calculated)
                </span>
                <button
                  type="button"
                  onClick={handleRecalculateTargets}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                >
                  Recalculate
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label
                    htmlFor="new-targets-calories"
                    className="block text-[11px] text-slate-400"
                  >
                    Daily Calories (kcal)
                  </label>
                  <input
                    id="new-targets-calories"
                    type="number"
                    inputMode="numeric"
                    value={targetDraft.calories}
                    onChange={(e) => {
                      setTargetsEditedManually(true);
                      setTargetDraft((prev) => ({
                        ...prev,
                        calories: e.target.value,
                      }));
                    }}
                    className="min-h-[40px] w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="new-targets-protein"
                    className="block text-[11px] text-slate-400"
                  >
                    Protein (g)
                  </label>
                  <input
                    id="new-targets-protein"
                    type="number"
                    inputMode="numeric"
                    value={targetDraft.proteinG}
                    onChange={(e) => {
                      setTargetsEditedManually(true);
                      setTargetDraft((prev) => ({
                        ...prev,
                        proteinG: e.target.value,
                      }));
                    }}
                    className="min-h-[40px] w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="new-targets-carbs"
                    className="block text-[11px] text-slate-400"
                  >
                    Carbs (g)
                  </label>
                  <input
                    id="new-targets-carbs"
                    type="number"
                    inputMode="numeric"
                    value={targetDraft.carbsG}
                    onChange={(e) => {
                      setTargetsEditedManually(true);
                      setTargetDraft((prev) => ({
                        ...prev,
                        carbsG: e.target.value,
                      }));
                    }}
                    className="min-h-[40px] w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="new-targets-fat"
                    className="block text-[11px] text-slate-400"
                  >
                    Fat (g)
                  </label>
                  <input
                    id="new-targets-fat"
                    type="number"
                    inputMode="numeric"
                    value={targetDraft.fatG}
                    onChange={(e) => {
                      setTargetsEditedManually(true);
                      setTargetDraft((prev) => ({
                        ...prev,
                        fatG: e.target.value,
                      }));
                    }}
                    className="min-h-[40px] w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 text-sm tabular-nums text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setMode('list');
                }}
                className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Creating...'
                  : 'Create Profile & Start Tracking'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
