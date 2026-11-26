import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Copy,
  Flame,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { MacroRings } from '../../components/MacroRings';
import {
  computeRemainingMacros,
  generateEveningAdvice,
  sumDailyMacros,
} from '../../domain/nutrition';
import { SEED_DATES } from '../../domain/seed';
import {
  addDaysIsoDate,
  estimateTreadmillCalories,
  formatIsoDateLocal,
} from '../../domain/training';
import type { MealEntry } from '../../domain/types';
import { useFitness } from '../../state/FitnessContext';
import { MealPhotoModal } from './MealPhotoModal';
import { QuickAddSheet } from './QuickAddSheet';

function getCurrentHHmm(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function TodayView() {
  const {
    state,
    selectedDate,
    setSelectedDate,
    currentWeightKg,
    addMeal,
    deleteMeal,
    logCardioForDate,
  } = useFitness();

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<
    'presets' | 'manual' | 'edit'
  >('presets');
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null);
  const [mealPhotoOpen, setMealPhotoOpen] = useState(false);
  const [advisorStatus, setAdvisorStatus] = useState<string | null>(null);

  const todayIso = formatIsoDateLocal(new Date());

  const dayMeals = useMemo(
    () =>
      state.meals
        .filter((m) => m.date === selectedDate)
        .sort(
          (a, b) =>
            a.time.localeCompare(b.time) ||
            a.createdAt.localeCompare(b.createdAt),
        ),
    [state.meals, selectedDate],
  );

  const logged = useMemo(() => sumDailyMacros(dayMeals), [dayMeals]);
  const remaining = useMemo(
    () => computeRemainingMacros(state.targets, logged),
    [state.targets, logged],
  );

  const dayWorkout = useMemo(
    () => state.workouts.find((w) => w.date === selectedDate),
    [state.workouts, selectedDate],
  );

  const cardioBurnToday = useMemo(
    () =>
      dayWorkout
        ? dayWorkout.cardio.reduce(
            (sum, c) => sum + c.estimatedCaloriesBurned,
            0,
          )
        : 0,
    [dayWorkout],
  );

  const advice = useMemo(
    () =>
      generateEveningAdvice({
        remainingKcal: remaining.calories,
        remainingProteinG: remaining.proteinG,
        loggedFatG: logged.fatG,
        targetFatG: state.targets.fatG,
        cardioBurnToday,
        currentHour: new Date().getHours(),
        currentWeightKg,
      }),
    [
      remaining.calories,
      remaining.proteinG,
      logged.fatG,
      state.targets.fatG,
      cardioBurnToday,
      currentWeightKg,
    ],
  );

  function openQuickAdd(mode: 'presets' | 'manual') {
    setEditingMeal(null);
    setQuickAddMode(mode);
    setQuickAddOpen(true);
  }

  function openEditMeal(meal: MealEntry) {
    setEditingMeal(meal);
    setQuickAddMode('edit');
    setQuickAddOpen(true);
  }

  async function handleDuplicateMeal(meal: MealEntry) {
    await addMeal({
      date: selectedDate,
      time: meal.time,
      name: meal.name,
      calories: meal.calories,
      proteinG: meal.proteinG,
      carbsG: meal.carbsG,
      fatG: meal.fatG,
      source: meal.source,
      isCaffeinated: meal.isCaffeinated,
      caffeineVariant: meal.caffeineVariant,
      notes: meal.notes,
      photoUrl: meal.photoUrl,
      aiItems: meal.aiItems,
    });
  }

  async function handleAdvisorWhey(scoops: 1 | 2) {
    const isTwo = scoops === 2;
    await addMeal({
      date: selectedDate,
      time: getCurrentHHmm(),
      name: isTwo
        ? 'Active Whey Protein (2 scoops, Caffeine-Free)'
        : 'Active Whey Protein (1 scoop, Caffeine-Free)',
      calories: isTwo ? 248 : 124,
      proteinG: isTwo ? 48 : 24,
      carbsG: isTwo ? 6 : 3,
      fatG: isTwo ? 4 : 2,
      source: 'preset',
      isCaffeinated: false,
      caffeineVariant: 'caffeine-free',
    });
    setAdvisorStatus(
      `Logged ${scoops} scoop${isTwo ? 's' : ''} caffeine-free Active Whey.`,
    );
  }

  async function handleAdvisorInclineWalk() {
    const durationMin = advice.suggestedWalkMinutes ?? 20;
    const inclinePct = 8;
    const speedKph = 4.5;
    const burn =
      advice.suggestedWalkBurnKcal ??
      estimateTreadmillCalories({
        durationMin,
        inclinePct,
        speedKph,
        bodyWeightKg: currentWeightKg,
        mode: 'incline_walk',
      });

    await logCardioForDate(selectedDate, {
      mode: 'incline_walk',
      durationMin,
      inclinePct,
      speedKph,
      bodyWeightKgUsed: currentWeightKg,
      estimatedCaloriesBurned: burn,
      notes: 'Smart Evening Advisor incline walk',
    });
    setAdvisorStatus(`Logged ${durationMin}m incline walk (~${burn} kcal).`);
  }

  async function handlePrimaryAdvisorAction() {
    const actionType = advice.recommendedAction?.type;
    if (!actionType || actionType === 'none') return;
    if (actionType === 'add_whey_1_caffeine_free') {
      await handleAdvisorWhey(1);
    } else if (actionType === 'add_whey_2_caffeine_free') {
      await handleAdvisorWhey(2);
    } else if (actionType === 'log_incline_walk') {
      await handleAdvisorInclineWalk();
    }
  }

  const quickDates = [
    { label: 'Today', date: todayIso },
    { label: 'Nov 24', date: SEED_DATES.DAY_1 },
    { label: 'Nov 25', date: SEED_DATES.DAY_2 },
    { label: 'Nov 26', date: SEED_DATES.DAY_3 },
  ];

  return (
    <section className="space-y-4">
      {/* Date Switcher & Daily Macros Card */}
      <div className="min-w-0 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">
              Daily Macros · {selectedDate}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => {
                setSelectedDate(addDaysIsoDate(selectedDate, -1));
                setAdvisorStatus(null);
              }}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 transition-colors hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              aria-label="Select date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setAdvisorStatus(null);
                }
              }}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 text-center text-sm font-medium text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              aria-label="Next day"
              onClick={() => {
                setSelectedDate(addDaysIsoDate(selectedDate, 1));
                setAdvisorStatus(null);
              }}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 transition-colors hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {quickDates.map((pill) => {
              const isActive = selectedDate === pill.date;
              return (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => {
                    setSelectedDate(pill.date);
                    setAdvisorStatus(null);
                  }}
                  className={`min-h-[44px] rounded-xl px-3 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        <MacroRings
          targets={state.targets}
          logged={logged}
          remaining={remaining}
          cardioBurnToday={cardioBurnToday}
        />

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => openQuickAdd('presets')}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" />
            <span>Quick Add</span>
          </button>
          <button
            type="button"
            onClick={() => setMealPhotoOpen(true)}
            className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 text-sm font-bold text-cyan-300 transition-colors hover:bg-cyan-500/25"
          >
            <Camera className="h-4 w-4" />
            <span>AI Meal Photo</span>
          </button>
        </div>
      </div>

      {/* Smart Evening Advisor Card */}
      <div className="min-w-0 space-y-2.5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Smart Evening Advisor
          </span>
          {advice.type === 'cardio_offset' && (
            <Flame className="h-4 w-4 text-amber-400" />
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-100">
            {advice.title}
          </h3>
          <p className="text-xs leading-relaxed text-slate-300">
            {advice.message}
          </p>
        </div>

        {advisorStatus && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300">
            {advisorStatus}
          </div>
        )}

        {advice.recommendedAction &&
          advice.recommendedAction.type !== 'none' && (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => void handlePrimaryAdvisorAction()}
                className="min-h-[44px] w-full rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30 transition-colors hover:bg-slate-700"
              >
                {advice.recommendedAction.label}
              </button>
              {advice.type === 'whey_plus_walk' &&
                advice.suggestedWalkMinutes && (
                  <button
                    type="button"
                    onClick={() => void handleAdvisorInclineWalk()}
                    className="min-h-[44px] w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
                  >
                    Log {advice.suggestedWalkMinutes}m Incline Walk (~
                    {advice.suggestedWalkBurnKcal ?? 125} kcal)
                  </button>
                )}
            </div>
          )}
      </div>

      {/* Daily Meal Log CRUD */}
      <div className="min-w-0 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            Meals ({dayMeals.length})
          </h3>
          <button
            type="button"
            onClick={() => openQuickAdd('manual')}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Manual
          </button>
        </div>

        {dayMeals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-4 py-6 text-center text-xs text-slate-400">
            No meals logged for {selectedDate}. Use Quick Add or AI Meal Photo
            to log your first meal.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {dayMeals.map((meal) => (
              <li
                key={meal.id}
                className="min-w-0 space-y-2 rounded-2xl border border-slate-800/90 bg-slate-950/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">
                        {meal.time}
                      </span>
                      {meal.source === 'ai_photo' && (
                        <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                          AI Photo
                        </span>
                      )}
                      {meal.isCaffeinated && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          <Coffee className="h-3 w-3" />
                          Caffeinated
                        </span>
                      )}
                      {meal.caffeineVariant === 'caffeine-free' && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          Caffeine-Free
                        </span>
                      )}
                    </div>
                    <div className="break-words text-sm font-medium text-slate-100">
                      {meal.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      <span className="font-semibold text-slate-200">
                        {meal.calories} kcal
                      </span>{' '}
                      · {meal.proteinG}g P · {meal.carbsG}g C · {meal.fatG}g F
                    </div>
                    {meal.notes && (
                      <p className="text-[11px] text-slate-400">{meal.notes}</p>
                    )}
                    {meal.aiItems &&
                      meal.aiItems.length > 0 &&
                      (meal.aiItems.length > 1 ||
                        meal.aiItems[0].name.trim().toLowerCase() !==
                          meal.name.trim().toLowerCase()) && (
                        <div className="text-[11px] text-slate-400">
                          {meal.aiItems
                            .map((i) => `${i.name} (${i.portion})`)
                            .join(' · ')}
                        </div>
                      )}
                  </div>
                  {meal.photoUrl && (
                    <img
                      src={meal.photoUrl}
                      alt={meal.name}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-xl border border-slate-800 object-cover"
                    />
                  )}
                </div>

                <div className="flex items-center justify-end gap-1.5 border-t border-slate-800/70 pt-2">
                  <button
                    type="button"
                    aria-label={`Edit ${meal.name}`}
                    onClick={() => openEditMeal(meal)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate ${meal.name}`}
                    onClick={() => void handleDuplicateMeal(meal)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${meal.name}`}
                    onClick={() => void deleteMeal(meal.id)}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-xs font-medium text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <QuickAddSheet
        isOpen={quickAddOpen}
        onClose={() => {
          setQuickAddOpen(false);
          setEditingMeal(null);
        }}
        selectedDate={selectedDate}
        initialMode={quickAddMode}
        editingMeal={editingMeal}
      />

      <MealPhotoModal
        isOpen={mealPhotoOpen}
        onClose={() => setMealPhotoOpen(false)}
      />
    </section>
  );
}
