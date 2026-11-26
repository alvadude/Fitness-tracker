export type IsoDate = string; // "YYYY-MM-DD" in local calendar
export type IsoTimestamp = string; // ISO-8601 UTC timestamp
export type TabId = 'today' | 'training' | 'progress' | 'settings';

export interface UserProfile {
  name?: string; // display name, e.g. 'AJ'
  age: number; // default: 29
  sex: 'male' | 'female'; // default: 'male'
  heightCm: number; // default: 175
  activityLevel: 'desk' | 'light' | 'moderate' | 'active'; // default: 'desk'
  startWeightKg: number; // default: 84.0
  startDate: IsoDate; // default: '2026-11-24'
  targetWeightKg: number; // default: 65.0
  targetDate: IsoDate; // default: '2027-06-15'
  caffeineCutoffHour: number; // default: 18 (6:00 PM)
}

export interface ProfileSummary {
  id: string;
  name: string;
  isSeededDefault: boolean;
  createdAt: IsoTimestamp;
}

export interface MacroTargets {
  calories: number; // Week 1 default: 1900
  proteinG: number; // Week 1 default: 160
  carbsG: number; // Week 1 default: 180
  fatG: number; // Week 1 default: 60
  weekNumber: number; // default: 1
}

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export type FoodPresetCategory = 'drink' | 'protein' | 'carb' | 'meal' | 'custom';

export interface FoodPreset {
  id: string;
  name: string;
  servingLabel: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isCaffeinated: boolean;
  supportsCaffeineToggle?: boolean;
  caffeinatedVariantLabel?: string;
  caffeineFreeVariantLabel?: string;
  caffeineFreeAlternativeName?: string;
  category: FoodPresetCategory;
}

export type MealSource = 'preset' | 'manual' | 'ai_photo' | 'seed';

export interface MealItemBreakdown {
  name: string;
  portion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MealEntry {
  id: string;
  date: IsoDate;
  time: string; // "HH:mm" 24h local
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: MealSource;
  isCaffeinated: boolean;
  caffeineVariant?: 'caffeinated' | 'caffeine-free';
  notes?: string;
  photoUrl?: string;
  aiItems?: MealItemBreakdown[];
  createdAt: IsoTimestamp;
}

export interface ExerciseSetLog {
  setNumber: number;
  targetRepsMin: number;
  targetRepsMax: number;
  weightKg: number | null;
  reps: number | null;
  completed: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  name: string;
  equipment: 'barbell' | 'dumbbell' | 'bodyweight';
  defaultRestSec: 90 | 120 | 180;
  sets: ExerciseSetLog[];
}

export type CardioMode = 'incline_walk' | 'interval_run' | 'easy_walk' | 'sport';

export interface CardioLog {
  id: string;
  mode: CardioMode;
  activityLabel?: string;
  durationMin: number;
  inclinePct: number;
  speedKph: number;
  jogSpeedKph?: number;
  walkSpeedKph?: number;
  bodyWeightKgUsed: number;
  estimatedCaloriesBurned: number;
  notes?: string;
}

export type WorkoutDayType =
  | 'workday_recovery'
  | 'offday_sat_lower'
  | 'offday_sun_upper'
  | 'offday_mon_full';

export type WorkoutCompletionStatus = 'not_completed' | 'partial' | 'completed';

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PlannedWorkoutExercise {
  name: string;
  equipment: string;
  sets: number;
  reps: string;
  notes?: string;
}

export interface PlannedWorkoutDay {
  dayOfWeek: WeekdayIndex;
  dayName: string;
  focus: string;
  isRestDay: boolean;
  estimatedDurationMin: number;
  exercises: PlannedWorkoutExercise[];
  cardioNote?: string;
  coachingTip?: string;
}

export interface WeeklyWorkoutPlan {
  id: string;
  generatedAt: IsoTimestamp;
  goalSummary: string;
  equipmentUsed: string[];
  customNotes?: string;
  modelUsed?: string;
  days: PlannedWorkoutDay[];
  dailyStatusByDate: Record<IsoDate, WorkoutCompletionStatus>;
}

export interface WorkoutSession {
  id: string;
  date: IsoDate;
  dayType: WorkoutDayType;
  title: string;
  exercises: ExerciseLog[];
  cardio: CardioLog[];
  completed: boolean;
  completionStatus?: WorkoutCompletionStatus;
  sleepHours?: number;
  notes?: string;
  completedAt?: IsoTimestamp;
}

export interface WeighInEntry {
  id: string;
  date: IsoDate;
  weightKg: number;
  isFasted: boolean;
  notes?: string;
  createdAt: IsoTimestamp;
}

export type GeminiModelPreference =
  | 'auto'
  | 'gemini-3.8-flash'
  | 'gemini-3.6-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.5-flash-lite';

export interface AppSettings {
  geminiApiEndpointMode: 'direct' | 'proxy';
  geminiModelPreference?: GeminiModelPreference;
  notificationsEnabled: boolean;
  lastDailyReminderDate?: IsoDate;
  lastWeeklyReminderDate?: IsoDate;
  availableEquipment?: string[];
}

export interface FitnessAppState {
  initialized: boolean;
  seedRevision?: number;
  profile: UserProfile;
  targets: MacroTargets;
  presets: FoodPreset[];
  meals: MealEntry[];
  workouts: WorkoutSession[];
  weighIns: WeighInEntry[];
  settings: AppSettings;
  weeklyPlan?: WeeklyWorkoutPlan;
}

export interface FitnessBackupPayload {
  schemaVersion: 1;
  exportedAt: IsoTimestamp;
  profile: UserProfile;
  targets: MacroTargets;
  presets: FoodPreset[];
  meals: MealEntry[];
  workouts: WorkoutSession[];
  weighIns: WeighInEntry[];
  settings: AppSettings;
  weeklyPlan?: WeeklyWorkoutPlan;
}

export type EveningAdviceType =
  | 'cardio_offset'
  | 'whey_two_scoops'
  | 'whey_one_scoop'
  | 'whey_plus_walk'
  | 'on_track';

export type EveningAdviceActionType =
  | 'add_whey_1_caffeine_free'
  | 'add_whey_2_caffeine_free'
  | 'log_incline_walk'
  | 'none';

export interface EveningAdviceInput {
  remainingKcal: number;
  remainingProteinG: number;
  loggedFatG: number;
  targetFatG: number;
  cardioBurnToday: number;
  currentHour: number;
  currentWeightKg: number;
}

export interface EveningAdviceResult {
  type: EveningAdviceType;
  title: string;
  message: string;
  suggestedWalkMinutes?: number;
  suggestedWalkBurnKcal?: number;
  recommendedAction?: {
    type: EveningAdviceActionType;
    label: string;
  };
}

export interface TreadmillBurnInput {
  durationMin: number;
  inclinePct: number;
  speedKph: number;
  bodyWeightKg: number;
  mode?: CardioMode;
  jogSpeedKph?: number;
  walkSpeedKph?: number;
}

export interface OverloadSuggestion {
  exerciseId: string;
  exerciseName: string;
  currentWeightKg: number;
  suggestedWeightKg: number;
  incrementKg: number;
  reason: string;
}

export interface DailyAdherencePoint {
  date: IsoDate;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  hasLogs: boolean;
  calorieAdherencePct: number;
  proteinAdherencePct: number;
}

export interface WeeklyReportSummary {
  startDate: IsoDate;
  endDate: IsoDate;
  currentWeightKg: number;
  expectedWeightKg: number;
  deltaVsTrajectoryKg: number;
  weeklyLossRateKg: number | null;
  loggedDaysCount: number;
  avgCalories: number;
  avgProteinG: number;
  calorieAdherencePct: number;
  proteinAdherencePct: number;
  daysWithinCalorieTarget: number;
  daysHitProteinTarget: number;
  completedWorkoutsCount: number;
  completedStrengthSplitsCount: number;
  plannedStrengthSplitsCount: number;
  overloadSuggestions: OverloadSuggestion[];
  nextWeekRecommendation: {
    action: 'maintain' | 'decrease_calories' | 'increase_calories';
    summary: string;
    suggestedTargets: MacroTargets;
  };
}
