import {
  AlertCircle,
  AlertTriangle,
  Camera,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Modal } from '../../components/Modal';
import { shouldWarnCaffeine } from '../../domain/nutrition';
import type { MealItemBreakdown } from '../../domain/types';
import {
  resizeImageForAi,
  type ResizedImageResult,
} from '../../services/ai/imageResize';
import {
  estimateMealFromImage,
  isAbortError,
  MealEstimatorError,
  PORTION_MULTIPLIERS,
  scaleMealItems,
  sumMealItemMacros,
} from '../../services/ai/mealEstimator';
import { useFitness } from '../../state/FitnessContext';

export interface MealPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTime?: string;
  onOpenSettings?: () => void;
}

function getCurrentHHmm(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function MealPhotoModal({
  isOpen,
  onClose,
  defaultTime,
  onOpenSettings,
}: MealPhotoModalProps) {
  const {
    state,
    selectedDate,
    geminiApiKey,
    saveGeminiApiKey,
    updateSettings,
    addMeal,
  } = useFitness();

  const abortRef = useRef<AbortController | null>(null);
  const fileSeqRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resizedImage, setResizedImage] = useState<ResizedImageResult | null>(
    null,
  );
  const [contextText, setContextText] = useState('');

  const [statusPhase, setStatusPhase] = useState<
    'idle' | 'preparing' | 'analyzing'
  >('idle');
  const [errorInfo, setErrorInfo] = useState<{
    code?: string;
    message: string;
    actionableHint?: string;
  } | null>(null);

  const [quickApiKey, setQuickApiKey] = useState('');

  // Editable review state
  const [hasEstimate, setHasEstimate] = useState(false);
  const [mealName, setMealName] = useState('');
  const [aiNotes, setAiNotes] = useState('');
  const [baseItems, setBaseItems] = useState<MealItemBreakdown[]>([]);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [customMultiplierText, setCustomMultiplierText] = useState('1');
  const [mealTime, setMealTime] = useState(defaultTime ?? getCurrentHHmm());
  const [isCaffeinated, setIsCaffeinated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      abortRef.current = null;
      fileSeqRef.current += 1;
      return;
    }

    fileSeqRef.current += 1;
    setSelectedFile(null);
    setResizedImage(null);
    setContextText('');
    setStatusPhase('idle');
    setErrorInfo(null);
    setQuickApiKey('');
    setHasEstimate(false);
    setMealName('');
    setAiNotes('');
    setBaseItems([]);
    setMultiplier(1);
    setCustomMultiplierText('1');
    setMealTime(defaultTime ?? getCurrentHHmm());
    setIsCaffeinated(false);
    setIsSaving(false);

    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      fileSeqRef.current += 1;
    };
  }, [isOpen, defaultTime]);

  const effectiveItems = useMemo(() => {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return baseItems;
    }
    return scaleMealItems(baseItems, multiplier);
  }, [baseItems, multiplier]);

  const totals = useMemo(
    () => sumMealItemMacros(effectiveItems),
    [effectiveItems],
  );

  const effectiveMealTime = /^\d{2}:\d{2}$/.test(mealTime)
    ? mealTime
    : getCurrentHHmm();

  const showCaffeineWarning = shouldWarnCaffeine(
    effectiveMealTime,
    isCaffeinated,
    state.profile.caffeineCutoffHour,
  );

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    abortRef.current?.abort();
    abortRef.current = null;
    const fileSeq = ++fileSeqRef.current;

    setSelectedFile(file);
    setResizedImage(null);
    setHasEstimate(false);
    setMealName('');
    setAiNotes('');
    setBaseItems([]);
    setMultiplier(1);
    setCustomMultiplierText('1');
    setErrorInfo(null);
    setStatusPhase('preparing');

    try {
      const prepared = await resizeImageForAi(file);
      if (fileSeqRef.current !== fileSeq) return;
      setResizedImage(prepared);
    } catch (err: unknown) {
      if (fileSeqRef.current !== fileSeq) return;
      setResizedImage(null);
      setErrorInfo({
        message:
          err instanceof Error ? err.message : 'Unable to prepare image file.',
        actionableHint: 'Choose a JPEG, PNG, or WebP meal photo and retry.',
      });
    } finally {
      if (fileSeqRef.current === fileSeq && abortRef.current === null) {
        setStatusPhase('idle');
      }
    }
  }

  async function runAnalysis(explicitApiKey?: string) {
    if (!selectedFile && !resizedImage) {
      setErrorInfo({
        message: 'Please choose or take a meal photo first.',
        actionableHint: 'Select an image above before analyzing.',
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const analysisFileSeq = fileSeqRef.current;

    setErrorInfo(null);

    try {
      let prepared = resizedImage;
      if (!prepared && selectedFile) {
        setStatusPhase('preparing');
        prepared = await resizeImageForAi(selectedFile);
        if (
          abortRef.current !== controller ||
          controller.signal.aborted ||
          fileSeqRef.current !== analysisFileSeq
        ) {
          return;
        }
        setResizedImage(prepared);
      }
      if (!prepared) {
        return;
      }

      setStatusPhase('analyzing');
      const result = await estimateMealFromImage({
        imageBase64: prepared.base64,
        mimeType: prepared.mimeType,
        contextText: contextText.trim() || undefined,
        apiKey: explicitApiKey ?? (geminiApiKey || undefined),
        endpointMode: state.settings.geminiApiEndpointMode,
        signal: controller.signal,
      });

      if (
        abortRef.current !== controller ||
        controller.signal.aborted ||
        fileSeqRef.current !== analysisFileSeq
      ) {
        return;
      }

      setMealName(result.mealName);
      setAiNotes(result.notes ?? '');
      setBaseItems(result.items);
      setMultiplier(1);
      setCustomMultiplierText('1');
      setHasEstimate(true);
    } catch (err: unknown) {
      if (
        isAbortError(err) ||
        abortRef.current !== controller ||
        controller.signal.aborted
      ) {
        return;
      }
      if (err instanceof MealEstimatorError) {
        setErrorInfo({
          code: err.code,
          message: err.message,
          actionableHint: err.actionableHint,
        });
      } else {
        setErrorInfo({
          message:
            err instanceof Error ? err.message : 'Meal photo analysis failed.',
          actionableHint: 'Check your connection or API key and try again.',
        });
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStatusPhase('idle');
      }
    }
  }

  async function handleSaveQuickApiKey() {
    const trimmed = quickApiKey.trim();
    if (!trimmed) {
      setErrorInfo({
        code: 'MISSING_API_KEY',
        message: 'Please enter a valid Gemini API key.',
        actionableHint: 'Paste your Gemini API key and click Save & Retry.',
      });
      return;
    }
    saveGeminiApiKey(trimmed);
    await runAnalysis(trimmed);
  }

  function applyMultiplier(next: number) {
    if (!Number.isFinite(next) || next <= 0) return;
    setMultiplier(next);
    setCustomMultiplierText(String(next));
  }

  function updateItemField(
    index: number,
    field: keyof MealItemBreakdown,
    rawValue: string,
  ) {
    // Bake current scaled items into baseItems so manual edits never drift
    const baked = effectiveItems.map((item, idx) => {
      if (idx !== index) return item;
      if (field === 'name' || field === 'portion') {
        return { ...item, [field]: rawValue };
      }
      const num = Number(rawValue === '' ? '0' : rawValue);
      const safeNum = Number.isFinite(num) && num >= 0 ? num : 0;
      return {
        ...item,
        [field]:
          field === 'calories'
            ? Math.round(safeNum)
            : Math.round(safeNum * 10) / 10,
      };
    });

    setBaseItems(baked);
    setMultiplier(1);
    setCustomMultiplierText('1');
  }

  function handleRemoveItem(index: number) {
    const remaining = effectiveItems.filter((_, idx) => idx !== index);
    setBaseItems(remaining);
    setMultiplier(1);
    setCustomMultiplierText('1');
  }

  function handleAddItem() {
    setBaseItems([
      ...effectiveItems,
      {
        name: 'Extra item',
        portion: '1 serving',
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      },
    ]);
    setMultiplier(1);
    setCustomMultiplierText('1');
  }

  async function handleSaveToDailyLog() {
    const trimmedMealName = mealName.trim() || 'AI Estimated Meal';
    const sanitizedItems = effectiveItems
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        portion: item.portion.trim() || '1 serving',
      }))
      .filter((item) => item.name.length > 0);

    if (sanitizedItems.length === 0) {
      setErrorInfo({
        message: 'Add at least one food item with a name before saving.',
      });
      return;
    }

    const finalTotals = sumMealItemMacros(sanitizedItems);
    const validTime = /^\d{2}:\d{2}$/.test(mealTime)
      ? mealTime
      : getCurrentHHmm();

    setIsSaving(true);
    setErrorInfo(null);
    try {
      await addMeal({
        date: selectedDate,
        time: validTime,
        name: trimmedMealName,
        calories: finalTotals.calories,
        proteinG: finalTotals.proteinG,
        carbsG: finalTotals.carbsG,
        fatG: finalTotals.fatG,
        source: 'ai_photo',
        isCaffeinated,
        caffeineVariant: isCaffeinated ? 'caffeinated' : undefined,
        notes: aiNotes.trim() || undefined,
        aiItems: sanitizedItems,
      });
      onClose();
    } catch (err: unknown) {
      setErrorInfo({
        message: err instanceof Error ? err.message : 'Failed to save AI meal.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  const isBusy = statusPhase !== 'idle';
  const isProxyMode = state.settings.geminiApiEndpointMode === 'proxy';
  const showDirectKeyRecovery =
    !isProxyMode &&
    (errorInfo?.code === 'MISSING_API_KEY' || errorInfo?.code === 'AUTH_ERROR');
  const showProxyAuthRecovery =
    isProxyMode && errorInfo?.code === 'AUTH_ERROR';

  const parsedCustomMultiplier = Number(customMultiplierText);
  const isCustomMultiplierInvalid =
    customMultiplierText.trim() !== '' &&
    (!Number.isFinite(parsedCustomMultiplier) || parsedCustomMultiplier <= 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Meal Photo Estimator">
      <div className="space-y-4">
        {/* Upload / Camera Controls (single file input shared by gallery & camera) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Upload meal photo"
          onChange={handleFileChange}
          className="sr-only"
        />
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              const input = fileInputRef.current;
              if (!input) return;
              input.removeAttribute('capture');
              input.click();
            }}
            className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 px-3 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800"
          >
            <ImagePlus className="h-4 w-4 text-emerald-400" />
            <span>Upload Photo</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const input = fileInputRef.current;
              if (!input) return;
              input.setAttribute('capture', 'environment');
              input.click();
            }}
            className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 px-3 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800"
          >
            <Camera className="h-4 w-4 text-cyan-400" />
            <span>Take Photo</span>
          </button>
        </div>

        {resizedImage && (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
            <img
              src={resizedImage.dataUrl}
              alt="Selected meal preview"
              className="max-h-44 w-full object-cover"
            />
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400">
              <span className="truncate pr-2">
                {selectedFile?.name ?? 'Meal photo'}
              </span>
              <span className="shrink-0">
                {Math.max(1, Math.round(resizedImage.resizedSizeBytes / 1024))}{' '}
                KB
              </span>
            </div>
          </div>
        )}

        <div>
          <label
            htmlFor="ai-meal-context"
            className="mb-1 block text-xs font-medium text-slate-300"
          >
            Optional Context
          </label>
          <input
            id="ai-meal-context"
            aria-label="Meal context"
            type="text"
            placeholder="e.g., peeled chicken skin, 2 tbsp rice, no sauce"
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <button
          type="button"
          aria-busy={isBusy}
          disabled={isBusy || !resizedImage}
          onClick={() => void runAnalysis()}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {statusPhase === 'preparing'
                  ? 'Preparing photo...'
                  : 'Analyzing with Gemini 2.5 Flash...'}
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              <span>{hasEstimate ? 'Re-Analyze Meal' : 'Analyze Meal'}</span>
            </>
          )}
        </button>

        {errorInfo && (
          <div
            role="alert"
            className="space-y-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-100"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div className="space-y-1">
                <div className="font-semibold text-rose-300">
                  {errorInfo.message}
                </div>
                {errorInfo.actionableHint && (
                  <p className="text-rose-200/90">{errorInfo.actionableHint}</p>
                )}
              </div>
            </div>

            {showDirectKeyRecovery && (
              <div className="space-y-2 border-t border-rose-500/20 pt-2.5">
                <label
                  htmlFor="quick-gemini-key"
                  className="block text-[11px] font-medium text-slate-200"
                >
                  Quick-Add Gemini API Key (or open Settings tab below)
                </label>
                <div className="flex gap-2">
                  <input
                    id="quick-gemini-key"
                    aria-label="Gemini API key"
                    type="password"
                    placeholder="AIza..."
                    value={quickApiKey}
                    onChange={(e) => setQuickApiKey(e.target.value)}
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleSaveQuickApiKey()}
                    className="min-h-[44px] shrink-0 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save &amp; Retry
                  </button>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Open Settings
                  </button>
                )}
              </div>
            )}

            {showProxyAuthRecovery && (
              <div className="space-y-2 border-t border-rose-500/20 pt-2.5">
                <p className="text-[11px] text-rose-100/90">
                  Proxy mode uses the server{' '}
                  <code className="font-mono">GEMINI_API_KEY</code> environment
                  variable. Switch to Direct mode to use a personal API key.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void updateSettings({ geminiApiEndpointMode: 'direct' })
                    }
                    className="min-h-[44px] w-full rounded-xl bg-emerald-500 px-3 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    Switch to Direct Mode
                  </button>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                    >
                      Open Settings
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {hasEstimate && (
          <div className="space-y-4 border-t border-slate-800 pt-4">
            <div>
              <label
                htmlFor="ai-meal-name"
                className="mb-1 block text-xs font-medium text-slate-300"
              >
                Meal Name
              </label>
              <input
                id="ai-meal-name"
                aria-label="Meal name"
                type="text"
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Portion Multiplier Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">
                  Portion Multiplier
                </span>
                <span className="text-slate-400">{multiplier}x</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {PORTION_MULTIPLIERS.map((presetMult) => (
                  <button
                    key={presetMult}
                    type="button"
                    aria-pressed={multiplier === presetMult}
                    onClick={() => applyMultiplier(presetMult)}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                      multiplier === presetMult
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                        : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {presetMult}x
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="custom-multiplier-input"
                    className="text-xs text-slate-400"
                  >
                    Custom:
                  </label>
                  <input
                    id="custom-multiplier-input"
                    aria-label="Custom portion multiplier"
                    aria-invalid={isCustomMultiplierInvalid}
                    type="number"
                    min="0.1"
                    step="0.05"
                    value={customMultiplierText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomMultiplierText(val);
                      const parsed = Number(val);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        setMultiplier(parsed);
                      }
                    }}
                    onBlur={() => {
                      const parsed = Number(customMultiplierText);
                      if (
                        customMultiplierText.trim() === '' ||
                        !Number.isFinite(parsed) ||
                        parsed <= 0
                      ) {
                        setCustomMultiplierText(String(multiplier));
                      }
                    }}
                    className={`min-h-[44px] w-24 rounded-xl border bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none ${
                      isCustomMultiplierInvalid
                        ? 'border-amber-500 focus:border-amber-400'
                        : 'border-slate-700 focus:border-emerald-500'
                    }`}
                  />
                </div>
                {isCustomMultiplierInvalid && (
                  <p role="note" className="text-[11px] text-amber-300">
                    Enter a multiplier greater than 0 (using {multiplier}x).
                  </p>
                )}
              </div>
            </div>

            {/* Editable Item Breakdown */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Items ({effectiveItems.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </button>
              </div>

              <ul className="space-y-2.5">
                {effectiveItems.map((item, idx) => (
                  <li
                    key={idx}
                    className="min-w-0 space-y-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                      <span className="font-semibold text-slate-100">
                        {item.name || `Item ${idx + 1}`}
                      </span>
                      <span className="tabular-nums text-slate-400">
                        {item.portion} · {item.calories} kcal
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input
                          type="text"
                          aria-label={`Item ${idx + 1} name`}
                          value={item.name}
                          onChange={(e) =>
                            updateItemField(idx, 'name', e.target.value)
                          }
                          placeholder="Food item name"
                          className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
                        />
                        <input
                          type="text"
                          aria-label={`Item ${idx + 1} portion`}
                          value={item.portion}
                          onChange={(e) =>
                            updateItemField(idx, 'portion', e.target.value)
                          }
                          placeholder="Portion (e.g. 150g)"
                          className="min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name || `item ${idx + 1}`}`}
                        onClick={() => handleRemoveItem(idx)}
                        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:border-rose-500/40 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-[11px] text-slate-400">
                        Kcal
                        <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`Item ${idx + 1} calories`}
                          value={item.calories}
                          onChange={(e) =>
                            updateItemField(idx, 'calories', e.target.value)
                          }
                          className="mt-0.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-sm text-slate-100"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Protein (g)
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          aria-label={`Item ${idx + 1} protein`}
                          value={item.proteinG}
                          onChange={(e) =>
                            updateItemField(idx, 'proteinG', e.target.value)
                          }
                          className="mt-0.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-sm text-slate-100"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Carbs (g)
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          aria-label={`Item ${idx + 1} carbs`}
                          value={item.carbsG}
                          onChange={(e) =>
                            updateItemField(idx, 'carbsG', e.target.value)
                          }
                          className="mt-0.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-sm text-slate-100"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Fat (g)
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          aria-label={`Item ${idx + 1} fat`}
                          value={item.fatG}
                          onChange={(e) =>
                            updateItemField(idx, 'fatG', e.target.value)
                          }
                          className="mt-0.5 min-h-[44px] w-full rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-sm text-slate-100"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Live Preview Totals */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                Preview Totals
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <div className="font-bold text-slate-50">
                    {totals.calories}
                  </div>
                  <div className="text-slate-400">kcal</div>
                </div>
                <div>
                  <div className="font-bold text-emerald-300">
                    {totals.proteinG}g
                  </div>
                  <div className="text-slate-400">Protein</div>
                </div>
                <div>
                  <div className="font-bold text-cyan-300">
                    {totals.carbsG}g
                  </div>
                  <div className="text-slate-400">Carbs</div>
                </div>
                <div>
                  <div className="font-bold text-amber-300">{totals.fatG}g</div>
                  <div className="text-slate-400">Fat</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="ai-meal-time"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Meal Time
                </label>
                <input
                  id="ai-meal-time"
                  aria-label="AI meal time"
                  type="time"
                  value={mealTime}
                  onChange={(e) => setMealTime(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                />
              </div>
              <label className="mt-5 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 text-xs text-slate-200">
                <input
                  type="checkbox"
                  checked={isCaffeinated}
                  onChange={(e) => setIsCaffeinated(e.target.checked)}
                  className="h-4 w-4 rounded accent-amber-500"
                />
                <span>Contains caffeine</span>
              </label>
            </div>

            {showCaffeineWarning && (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Caffeine logged after cutoff ({effectiveMealTime}).</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCaffeinated(false)}
                  className="min-h-[44px] shrink-0 rounded-lg bg-emerald-500 px-2.5 text-[11px] font-bold text-slate-950"
                >
                  Switch to Caffeine-Free
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={isSaving || effectiveItems.length === 0}
              onClick={() => void handleSaveToDailyLog()}
              className="min-h-[48px] w-full rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save to Daily Log'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
