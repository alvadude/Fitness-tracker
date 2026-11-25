import { AlertTriangle, Coffee, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { shouldWarnCaffeine } from '../../domain/nutrition';
import type { FoodPreset, IsoDate, MealEntry } from '../../domain/types';
import { useFitness } from '../../state/FitnessContext';

export interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: IsoDate;
  initialMode?: 'presets' | 'manual' | 'edit';
  editingMeal?: MealEntry | null;
  defaultTime?: string;
}

type PendingCaffeineAction =
  | {
      kind: 'preset';
      preset: FoodPreset;
      variant: 'caffeinated' | 'caffeine-free';
    }
  | {
      kind: 'manual';
      mealData: Omit<MealEntry, 'id' | 'createdAt'>;
      isEdit: boolean;
    };

function getCurrentHHmm(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatCutoffLabel(cutoffHour: number): string {
  if (cutoffHour === 18) return '6:00 PM';
  const suffix = cutoffHour >= 12 ? 'PM' : 'AM';
  const hour12 = cutoffHour % 12 === 0 ? 12 : cutoffHour % 12;
  return `${hour12}:00 ${suffix}`;
}

export function QuickAddSheet({
  isOpen,
  onClose,
  selectedDate,
  initialMode = 'presets',
  editingMeal = null,
  defaultTime,
}: QuickAddSheetProps) {
  const { state, addMeal, updateMeal, addPreset, deletePreset } = useFitness();

  const isEditMode = initialMode === 'edit' && editingMeal !== null;
  const [activeMode, setActiveMode] = useState<'presets' | 'manual'>(
    initialMode === 'manual' || isEditMode ? 'manual' : 'presets',
  );
  const [time, setTime] = useState<string>(
    editingMeal?.time ?? defaultTime ?? getCurrentHHmm(),
  );
  const [variantByPresetId, setVariantByPresetId] = useState<
    Record<string, 'caffeinated' | 'caffeine-free'>
  >({});

  // Manual / edit form fields
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [carbsG, setCarbsG] = useState('');
  const [fatG, setFatG] = useState('');
  const [isCaffeinated, setIsCaffeinated] = useState(false);
  const [notes, setNotes] = useState('');
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [servingLabel, setServingLabel] = useState('1 serving');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCaffeine, setPendingCaffeine] =
    useState<PendingCaffeineAction | null>(null);
  const [showNewPresetForm, setShowNewPresetForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetCalories, setNewPresetCalories] = useState('');
  const [newPresetProtein, setNewPresetProtein] = useState('');
  const [newPresetCarbs, setNewPresetCarbs] = useState('');
  const [newPresetFat, setNewPresetFat] = useState('');
  const [newPresetServing, setNewPresetServing] = useState('1 serving');

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setPendingCaffeine(null);
    setIsSaving(false);
    setShowNewPresetForm(false);
    setNewPresetName('');
    setNewPresetCalories('');
    setNewPresetProtein('');
    setNewPresetCarbs('');
    setNewPresetFat('');
    setNewPresetServing('1 serving');

    if (initialMode === 'edit' && editingMeal) {
      setActiveMode('manual');
      setTime(editingMeal.time);
      setName(editingMeal.name);
      setCalories(String(editingMeal.calories));
      setProteinG(String(editingMeal.proteinG));
      setCarbsG(String(editingMeal.carbsG));
      setFatG(String(editingMeal.fatG));
      setIsCaffeinated(editingMeal.isCaffeinated);
      setNotes(editingMeal.notes ?? '');
      setSaveAsPreset(false);
      setServingLabel('1 serving');
    } else {
      setActiveMode(initialMode === 'manual' ? 'manual' : 'presets');
      setTime(defaultTime ?? getCurrentHHmm());
      setName('');
      setCalories('');
      setProteinG('');
      setCarbsG('');
      setFatG('');
      setIsCaffeinated(false);
      setNotes('');
      setSaveAsPreset(false);
      setServingLabel('1 serving');
    }
  }, [isOpen, initialMode, editingMeal, defaultTime]);

  const cutoffHour = state.profile.caffeineCutoffHour;
  const cutoffLabel = formatCutoffLabel(cutoffHour);

  function getPresetVariant(
    preset: FoodPreset,
  ): 'caffeinated' | 'caffeine-free' {
    return variantByPresetId[preset.id] ?? 'caffeinated';
  }

  const resolvedEffectiveTime = /^\d{2}:\d{2}$/.test(time)
    ? time
    : getCurrentHHmm();
  const hasCaffeinatedWheySelected = state.presets.some(
    (p) => p.supportsCaffeineToggle && getPresetVariant(p) === 'caffeinated',
  );
  const showProactiveCaffeineWarning =
    activeMode === 'presets' &&
    !isEditMode &&
    !pendingCaffeine &&
    hasCaffeinatedWheySelected &&
    shouldWarnCaffeine(resolvedEffectiveTime, true, cutoffHour);

  function handleProactiveSwitchToCaffeineFree() {
    setVariantByPresetId((prev) => {
      const next = { ...prev };
      for (const preset of state.presets) {
        if (preset.supportsCaffeineToggle) {
          next[preset.id] = 'caffeine-free';
        }
      }
      return next;
    });
  }

  async function handleCreateCustomPreset(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = newPresetName.trim();
    if (!trimmed) {
      setFormError('Preset name is required.');
      return;
    }
    const kcal = Number(newPresetCalories === '' ? '0' : newPresetCalories);
    const p = Number(newPresetProtein === '' ? '0' : newPresetProtein);
    const c = Number(newPresetCarbs === '' ? '0' : newPresetCarbs);
    const f = Number(newPresetFat === '' ? '0' : newPresetFat);
    if (![kcal, p, c, f].every((n) => Number.isFinite(n) && n >= 0)) {
      setFormError('Preset macros must be valid non-negative numbers.');
      return;
    }
    setIsSaving(true);
    try {
      await addPreset({
        name: trimmed,
        servingLabel: newPresetServing.trim() || '1 serving',
        calories: Math.round(kcal),
        proteinG: Math.round(p * 10) / 10,
        carbsG: Math.round(c * 10) / 10,
        fatG: Math.round(f * 10) / 10,
        isCaffeinated: false,
        category: 'custom',
      });
      setShowNewPresetForm(false);
      setNewPresetName('');
      setNewPresetCalories('');
      setNewPresetProtein('');
      setNewPresetCarbs('');
      setNewPresetFat('');
      setNewPresetServing('1 serving');
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save custom preset.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function commitPresetMeal(
    preset: FoodPreset,
    variant: 'caffeinated' | 'caffeine-free',
  ) {
    setIsSaving(true);
    setFormError(null);
    try {
      const effectiveCaffeinated = preset.supportsCaffeineToggle
        ? variant === 'caffeinated'
        : preset.isCaffeinated;

      const effectiveName =
        preset.supportsCaffeineToggle && variant === 'caffeine-free'
          ? (preset.caffeineFreeAlternativeName ??
            `${preset.name} (Caffeine-Free)`)
          : preset.supportsCaffeineToggle && preset.caffeinatedVariantLabel
            ? `${preset.name} — ${preset.caffeinatedVariantLabel}`
            : preset.name;

      const effectiveTime = /^\d{2}:\d{2}$/.test(time) ? time : getCurrentHHmm();

      await addMeal({
        date: selectedDate,
        time: effectiveTime,
        name: effectiveName,
        calories: preset.calories,
        proteinG: preset.proteinG,
        carbsG: preset.carbsG,
        fatG: preset.fatG,
        source: 'preset',
        isCaffeinated: effectiveCaffeinated,
        caffeineVariant: preset.supportsCaffeineToggle
          ? variant
          : effectiveCaffeinated
            ? 'caffeinated'
            : undefined,
      });
      onClose();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to log preset meal.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePresetAddClick(preset: FoodPreset) {
    const variant = getPresetVariant(preset);
    const effectiveCaffeinated = preset.supportsCaffeineToggle
      ? variant === 'caffeinated'
      : preset.isCaffeinated;
    const effectiveTime = /^\d{2}:\d{2}$/.test(time) ? time : getCurrentHHmm();

    if (shouldWarnCaffeine(effectiveTime, effectiveCaffeinated, cutoffHour)) {
      setPendingCaffeine({ kind: 'preset', preset, variant });
      return;
    }

    await commitPresetMeal(preset, variant);
  }

  async function commitManualMeal(
    mealData: Omit<MealEntry, 'id' | 'createdAt'>,
    isEdit: boolean,
  ) {
    setIsSaving(true);
    setFormError(null);
    try {
      if (isEdit && editingMeal) {
        await updateMeal({
          ...editingMeal,
          ...mealData,
        });
      } else {
        await addMeal(mealData);
        if (saveAsPreset) {
          await addPreset({
            name: mealData.name,
            servingLabel: servingLabel.trim() || '1 serving',
            calories: mealData.calories,
            proteinG: mealData.proteinG,
            carbsG: mealData.carbsG,
            fatG: mealData.fatG,
            isCaffeinated: mealData.isCaffeinated,
            category: 'custom',
          });
        }
      }
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save meal.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Meal name is required.');
      return;
    }

    const kcalNum = Number(calories === '' ? '0' : calories);
    const pNum = Number(proteinG === '' ? '0' : proteinG);
    const cNum = Number(carbsG === '' ? '0' : carbsG);
    const fNum = Number(fatG === '' ? '0' : fatG);

    if (
      ![kcalNum, pNum, cNum, fNum].every((n) => Number.isFinite(n) && n >= 0)
    ) {
      setFormError('Calories and macros must be valid non-negative numbers.');
      return;
    }

    const validTime = /^\d{2}:\d{2}$/.test(time) ? time : getCurrentHHmm();

    const mealData: Omit<MealEntry, 'id' | 'createdAt'> = {
      date: editingMeal?.date ?? selectedDate,
      time: validTime,
      name: trimmedName,
      calories: Math.round(kcalNum),
      proteinG: Math.round(pNum * 10) / 10,
      carbsG: Math.round(cNum * 10) / 10,
      fatG: Math.round(fNum * 10) / 10,
      source: editingMeal?.source ?? 'manual',
      isCaffeinated,
      caffeineVariant: isCaffeinated
        ? 'caffeinated'
        : editingMeal?.caffeineVariant === 'caffeine-free'
          ? 'caffeine-free'
          : undefined,
      notes: notes.trim() || undefined,
      aiItems: editingMeal?.aiItems,
    };

    if (shouldWarnCaffeine(validTime, isCaffeinated, cutoffHour)) {
      setPendingCaffeine({
        kind: 'manual',
        mealData,
        isEdit: isEditMode,
      });
      return;
    }

    await commitManualMeal(mealData, isEditMode);
  }

  async function handleSwitchToCaffeineFree() {
    if (!pendingCaffeine) return;
    const action = pendingCaffeine;
    setPendingCaffeine(null);
    if (action.kind === 'preset') {
      await commitPresetMeal(action.preset, 'caffeine-free');
    } else {
      await commitManualMeal(
        {
          ...action.mealData,
          isCaffeinated: false,
          caffeineVariant: 'caffeine-free',
        },
        action.isEdit,
      );
    }
  }

  async function handleLogCaffeineAnyway() {
    if (!pendingCaffeine) return;
    const action = pendingCaffeine;
    setPendingCaffeine(null);
    if (action.kind === 'preset') {
      await commitPresetMeal(action.preset, action.variant);
    } else {
      await commitManualMeal(action.mealData, action.isEdit);
    }
  }

  const modalTitle = isEditMode ? 'Edit Meal' : 'Quick Add Meal';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle}>
      <div className="space-y-4">
        {!isEditMode && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-800/80 p-1">
            <button
              type="button"
              onClick={() => {
                setActiveMode('presets');
                setPendingCaffeine(null);
              }}
              className={`min-h-[44px] rounded-lg px-3 text-sm font-semibold transition-colors ${
                activeMode === 'presets'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              Quick Presets
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('manual');
                setPendingCaffeine(null);
              }}
              className={`min-h-[44px] rounded-lg px-3 text-sm font-semibold transition-colors ${
                activeMode === 'manual'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-slate-100'
              }`}
            >
              Manual Entry
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
          <label
            htmlFor="quick-add-time"
            className="text-xs font-medium text-slate-300"
          >
            Meal Time
          </label>
          <input
            id="quick-add-time"
            aria-label="Meal time"
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setPendingCaffeine(null);
            }}
            className="min-h-[44px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {showProactiveCaffeineWarning && (
          <div
            role="alert"
            className="space-y-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-amber-300">
                  After-{cutoffLabel} Caffeine Warning ({resolvedEffectiveTime})
                </div>
                <p className="text-xs leading-relaxed text-amber-100/90">
                  Caramel Macchiato contains caffeine after {cutoffLabel} and
                  can disrupt your 7+ hr sleep.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleProactiveSwitchToCaffeineFree}
              className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              Switch to Caffeine-Free
            </button>
          </div>
        )}

        {pendingCaffeine && (
          <div
            role="alert"
            className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm text-amber-100"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              <div className="space-y-1">
                <div className="font-semibold text-amber-300">
                  After-{cutoffLabel} Caffeine Warning (
                  {/^\d{2}:\d{2}$/.test(time) ? time : getCurrentHHmm()})
                </div>
                <p className="text-xs leading-relaxed text-amber-100/90">
                  Logging caffeine after {cutoffLabel} can disrupt your 7+ hr
                  recovery sleep. Switch to a caffeine-free option?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {(pendingCaffeine.kind === 'manual' ||
                pendingCaffeine.preset.supportsCaffeineToggle) && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSwitchToCaffeineFree}
                  className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                >
                  Switch to Caffeine-Free &amp; Log
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleLogCaffeineAnyway}
                  className="min-h-[44px] rounded-xl border border-amber-500/40 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
                >
                  Log Anyway
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setPendingCaffeine(null)}
                  className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300"
          >
            {formError}
          </div>
        )}

        {activeMode === 'presets' && !isEditMode ? (
          <div className="space-y-2.5">
            {!showNewPresetForm &&
              state.presets.map((preset) => {
                const variant = getPresetVariant(preset);
                const isCaffeinatedPreset = preset.supportsCaffeineToggle
                  ? variant === 'caffeinated'
                  : preset.isCaffeinated;

                return (
                  <div
                    key={preset.id}
                    className="min-w-0 space-y-2.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-100">
                            {preset.name}
                          </span>
                          {isCaffeinatedPreset && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                              <Coffee className="h-3 w-3" />
                              Caffeinated
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {preset.servingLabel} · {preset.calories} kcal ·{' '}
                          {preset.proteinG}g P · {preset.carbsG}g C ·{' '}
                          {preset.fatG}g F
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isSaving}
                          aria-label={`Log ${preset.name}`}
                          onClick={() => void handlePresetAddClick(preset)}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-emerald-500 px-3.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                          Log
                        </button>
                        {preset.category === 'custom' && (
                          <button
                            type="button"
                            aria-label={`Delete preset ${preset.name}`}
                            onClick={() => void deletePreset(preset.id)}
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {preset.supportsCaffeineToggle && (
                      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900 p-1">
                        <button
                          type="button"
                          aria-pressed={variant === 'caffeinated'}
                          onClick={() =>
                            setVariantByPresetId((prev) => ({
                              ...prev,
                              [preset.id]: 'caffeinated',
                            }))
                          }
                          className={`min-h-[44px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                            variant === 'caffeinated'
                              ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {preset.caffeinatedVariantLabel ?? 'Caramel Macchiato'}
                        </button>
                        <button
                          type="button"
                          aria-pressed={variant === 'caffeine-free'}
                          onClick={() =>
                            setVariantByPresetId((prev) => ({
                              ...prev,
                              [preset.id]: 'caffeine-free',
                            }))
                          }
                          className={`min-h-[44px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                            variant === 'caffeine-free'
                              ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {preset.caffeineFreeVariantLabel ?? 'Caffeine-Free'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            <div className={showNewPresetForm ? '' : 'border-t border-slate-800 pt-2.5'}>
              {!showNewPresetForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setShowNewPresetForm(true);
                  }}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-3 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Preset</span>
                </button>
              ) : (
                <form
                  onSubmit={handleCreateCustomPreset}
                  className="space-y-2.5 rounded-2xl border border-slate-700 bg-slate-950/80 p-3"
                >
                  <div className="text-xs font-semibold text-slate-100">
                    New Custom Preset
                  </div>
                  <div>
                    <label
                      htmlFor="custom-preset-name"
                      className="mb-1 block text-xs text-slate-300"
                    >
                      Preset Name
                    </label>
                    <input
                      id="custom-preset-name"
                      type="text"
                      required
                      placeholder="e.g., Greek Yogurt 150g"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="custom-preset-calories"
                        className="mb-1 block text-xs text-slate-300"
                      >
                        Calories (kcal)
                      </label>
                      <input
                        id="custom-preset-calories"
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={newPresetCalories}
                        onChange={(e) => setNewPresetCalories(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="custom-preset-protein"
                        className="mb-1 block text-xs text-slate-300"
                      >
                        Protein (g)
                      </label>
                      <input
                        id="custom-preset-protein"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={newPresetProtein}
                        onChange={(e) => setNewPresetProtein(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="custom-preset-carbs"
                        className="mb-1 block text-xs text-slate-300"
                      >
                        Carbs (g)
                      </label>
                      <input
                        id="custom-preset-carbs"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={newPresetCarbs}
                        onChange={(e) => setNewPresetCarbs(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="custom-preset-fat"
                        className="mb-1 block text-xs text-slate-300"
                      >
                        Fat (g)
                      </label>
                      <input
                        id="custom-preset-fat"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        value={newPresetFat}
                        onChange={(e) => setNewPresetFat(e.target.value)}
                        className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="min-h-[44px] flex-1 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                    >
                      Save Preset
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewPresetForm(false)}
                      className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="manual-meal-name"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Meal Name
              </label>
              <input
                id="manual-meal-name"
                type="text"
                required
                placeholder="e.g., Grilled chicken breast + rice"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="manual-calories"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Calories (kcal)
                </label>
                <input
                  id="manual-calories"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-protein"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Protein (g)
                </label>
                <input
                  id="manual-protein"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="0"
                  value={proteinG}
                  onChange={(e) => setProteinG(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-carbs"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Carbs (g)
                </label>
                <input
                  id="manual-carbs"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="0"
                  value={carbsG}
                  onChange={(e) => setCarbsG(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="manual-fat"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Fat (g)
                </label>
                <input
                  id="manual-fat"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="0"
                  value={fatG}
                  onChange={(e) => setFatG(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={isCaffeinated}
                onChange={(e) => {
                  setIsCaffeinated(e.target.checked);
                  setPendingCaffeine(null);
                }}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-amber-500"
              />
              <span>Contains caffeine</span>
            </label>

            <div>
              <label
                htmlFor="manual-notes"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Notes (optional)
              </label>
              <input
                id="manual-notes"
                type="text"
                placeholder="e.g., Skinless thigh, light sauce"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {!isEditMode && (
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={saveAsPreset}
                    onChange={(e) => setSaveAsPreset(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-500"
                  />
                  <span>Save as custom preset</span>
                </label>
                {saveAsPreset && (
                  <div>
                    <label
                      htmlFor="preset-serving-label"
                      className="mb-1 block text-xs font-medium text-slate-400"
                    >
                      Serving Label
                    </label>
                    <input
                      id="preset-serving-label"
                      type="text"
                      value={servingLabel}
                      onChange={(e) => setServingLabel(e.target.value)}
                      placeholder="1 serving"
                      className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="min-h-[48px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              {isSaving
                ? 'Saving...'
                : isEditMode
                  ? 'Save Changes'
                  : 'Save Meal'}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
