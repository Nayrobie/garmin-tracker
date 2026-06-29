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

export type WorkoutType = 'run' | 'cycle' | 'strength' | 'yoga' | 'other';

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
}

export type CreatePlannedWorkoutPayload = Omit<PlannedWorkout, 'id' | 'recurrence_group_id'> & {
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
