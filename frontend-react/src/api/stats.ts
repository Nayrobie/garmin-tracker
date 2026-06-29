/**
 * API client: fetch wrapper for weekly stats endpoint.
 */
import type { WeeklyStats } from '../types';

const BASE = '/api';

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const statsApi = {
  /** Fetch aggregated weekly stats for the week containing `date` (YYYY-MM-DD). */
  getWeeklyStats: (date?: string): Promise<WeeklyStats> => {
    const qs = date ? `?date_str=${date}` : '';
    return request<WeeklyStats>(`/stats/weekly${qs}`);
  },
};
