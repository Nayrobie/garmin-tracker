/**
 * API client: fetch wrapper for schedule and Garmin sync endpoints.
 * Mirrors backend routes: /api/schedule/week, /api/schedule/workout, /api/garmin/sync.
 */
import type {
  CreatePlannedWorkoutPayload,
  UpdatePlannedWorkoutPayload,
  PlannedWorkout,
  WeeklySchedule,
} from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  // 204 No Content has no body
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const scheduleApi = {
  /** Fetch the weekly schedule for the week containing `date` (YYYY-MM-DD). Defaults to today. */
  getWeek: (date?: string): Promise<WeeklySchedule> => {
    const qs = date ? `?date_str=${date}` : '';
    return request<WeeklySchedule>(`/schedule/week${qs}`);
  },

  createWorkout: (payload: CreatePlannedWorkoutPayload): Promise<PlannedWorkout> =>
    request<PlannedWorkout>('/schedule/workout', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWorkout: (id: number, payload: UpdatePlannedWorkoutPayload): Promise<PlannedWorkout> =>
    request<PlannedWorkout>(`/schedule/workout/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteWorkout: (id: number): Promise<void> =>
    request<void>(`/schedule/workout/${id}`, { method: 'DELETE' }),

  deleteWorkoutGroup: (groupId: string): Promise<void> =>
    request<void>(`/schedule/workout/group/${groupId}`, { method: 'DELETE' }),

  /** Trigger a manual Garmin sync. Returns { synced, updated, error }. */
  triggerSync: (): Promise<{ synced: number; updated: number; error: string | null }> =>
    request('/garmin/sync', { method: 'POST' }),

  getSyncStatus: (): Promise<{ last_sync: string | null }> =>
    request('/garmin/sync/status'),
};
