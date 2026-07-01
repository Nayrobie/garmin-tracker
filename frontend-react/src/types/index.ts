/**
 * TypeScript type definitions: Race interface and related types (similar to Pydantic schemas in backend).
 */
export type RaceType = 'trail' | 'semi' | '10k' | 'marathon' | 'other';

export interface Race {
  id: number;
  name: string;
  distance_km: number;
  elevation_m: number | null;
  date: string; // ISO date string: "YYYY-MM-DD"
  place: string;
  type: RaceType;
}

export type CreateRacePayload = Omit<Race, 'id'>;
export type UpdateRacePayload = Partial<CreateRacePayload>;

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export type WorkoutType = 'run' | 'cycle' | 'strength' | 'yoga' | 'pilates' | 'other';

export type Recurrence = 'none' | 'weekly' | 'biweekly' | 'monthly';

export interface PlannedWorkout {
  id: number;
  date: string; // "YYYY-MM-DD"
  type: WorkoutType;
  goal_duration_min: number | null;
  goal_pace_per_km: string | null; // "MM:SS"
  notes: string | null;
  recurrence: Recurrence;
  recurrence_group_id: string | null;
  garmin_workout_id: string | null;
  google_task_id: string | null;
}

export type CreatePlannedWorkoutPayload = Omit<PlannedWorkout, 'id' | 'recurrence_group_id' | 'garmin_workout_id' | 'google_task_id'> & {
  recurrence_weeks?: number;
};
export type UpdatePlannedWorkoutPayload = Partial<Omit<CreatePlannedWorkoutPayload, 'recurrence' | 'recurrence_weeks'>>;

export interface ActualWorkout {
  id: number;
  garmin_activity_id: string | null;
  date: string;
  type: WorkoutType;
  name: string | null;
  duration_min: number | null;
  distance_km: number | null;
  avg_hr: number | null;
  avg_pace_per_km: string | null;
  calories: number | null;
  rpe: number | null;
  notes: string | null;
  synced_at: string | null;
  planned_workout_id: number | null;
}

export interface DaySchedule {
  date: string;
  planned: PlannedWorkout[];
  actual: ActualWorkout[];
}

export interface WeeklySchedule {
  week_start: string;
  days: DaySchedule[];
  last_sync: string | null;
  last_pushed: string | null;
}

// ---------------------------------------------------------------------------
// Body Composition (Feelfit import)
// ---------------------------------------------------------------------------

export interface BodyCompositionRecord {
  measured_at: string; // ISO datetime string
  weight_kg: number;
  body_fat_pct: number | null;
  bmi: number | null;
  skeletal_muscle_pct: number | null;
  muscle_mass_kg: number | null;
  protein_pct: number | null;
  bmr_kcal: number | null;
  fat_free_weight_kg: number | null;
  subcutaneous_fat_pct: number | null;
  visceral_fat: number | null;
  body_water_pct: number | null;
  bone_mass_kg: number | null;
  health_score: number | null;
  metabolic_age: number | null;
}

// ---------------------------------------------------------------------------
// Weekly Stats
// ---------------------------------------------------------------------------

export interface WeeklyStats {
  week_start: string;
  total_volume_km: number;
  run_count: number;
  long_run_km: number;
  avg_hr: number | null;
  total_duration_min: number;
  workouts_by_type: Record<string, number>;
  planned_count: number;
  actual_count: number;
  prev_week_volume_km: number | null;
  volume_change_pct: number | null;
  volume_alert: boolean;
}

// ---------------------------------------------------------------------------
// Running Stats & Personal Records
// ---------------------------------------------------------------------------

export interface RunningPeriodStats {
  period: string;
  total_km: number;
  run_count: number;
  avg_pace: string | null;
  avg_hr: number | null;
}

export interface PersonalRecord {
  distance_label: string;
  value: string;
  date: string;
  activity_name: string | null;
}

export interface RunningStats {
  progression: RunningPeriodStats[];
  personal_records: PersonalRecord[];
  total_activities: number;
}

// ---------------------------------------------------------------------------
// Training Plan
// ---------------------------------------------------------------------------

export interface TrainingPlanWeek {
  week: number;
  week_start: string;
  total_km: number;
  easy_km: number;
  short_km: number;
  long_km: number;
  is_interval_week: boolean;
  week_type: 'normal' | 'taper' | 'race';
  cross_training: { type: string; duration_min: number }[];
}

export interface TrainingPlanResponse {
  plan_group_id: string;
  weeks_generated: number;
  total_workouts: number;
  starting_volume_km: number;
  weeks: TrainingPlanWeek[];
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

export interface SleepRecord {
  id: number;
  date: string;
  total_sleep_min: number | null;
  deep_sleep_min: number | null;
  light_sleep_min: number | null;
  rem_sleep_min: number | null;
  awake_min: number | null;
  sleep_score: number | null;
  start_time: string | null;
  end_time: string | null;
  hrv_overnight: number | null;
  hrv_status: string | null;
  resting_hr: number | null;
  cycle_day: number | null;
  cycle_phase: string | null;
}

export interface MenstrualCycle {
  id: number;
  start_date: string;
  period_length: number | null;
  cycle_length: number | null;
  fertile_window_start_day: number | null;
  fertile_window_length: number | null;
  is_predicted: boolean;
}

// ---------------------------------------------------------------------------
// User Settings
// ---------------------------------------------------------------------------

export interface UserSettings {
  // Paces
  pace_easy: string;
  pace_intervals: string;
  pace_long: string;
  vma_kmh: number | null;

  // Training volume (used by plan generator, not all shown in UI)
  dist_easy_pct: number;
  dist_short_pct: number;
  dist_long_pct: number;
  max_long_run_km: number;
  max_weekly_volume_increase_pct: number;
  min_runs_per_week: number;
  max_runs_per_week: number;
  taper_volume_factor: number;
  starting_volume_km: number;

  // Training goal
  training_goal: string;
  goal_hr_avg_bpm: number | null;
  goal_pace_start: string | null;
  goal_pace_target: string | null;

  // Schedule (0=Mon … 6=Sun)
  training_epoch: string; // "YYYY-MM-DD"
  day_easy: number;
  day_intervals: number;
  day_long: number;
  day_strength: number;
  day_mobility: number;
  day_pilates: number;

  // Workout durations
  strength_duration_min: number;
  stretching_duration_min: number;

  // Analysis
  hiking_pace_threshold_sec: number;

  // Schedule extras
  rest_day: number;
  complementary_workouts_per_week: number;

  // Garmin
  flush_garmin_on_push: boolean;
}

export type UserSettingsUpdate = Partial<UserSettings>;
