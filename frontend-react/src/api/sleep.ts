/**
 * API client for sleep endpoints.
 */
import type { MenstrualCycle, SleepRecord } from '../types';

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
  return res.json() as Promise<T>;
}

export const sleepApi = {
  /** Get sleep records for a date range. */
  getRecords: (start: string, end: string): Promise<SleepRecord[]> =>
    request<SleepRecord[]>(`/sleep?start=${start}&end=${end}`),

  /** Trigger a Garmin sleep sync. */
  sync: (daysBack: number = 30): Promise<{ synced: number; error: string | null }> =>
    request(`/sleep/sync?days_back=${daysBack}`, { method: 'POST' }),

  /** Enrich sleep records with HRV + cycle day. */
  enrich: (daysBack: number = 30): Promise<{ enriched: number; error: string | null }> =>
    request(`/sleep/enrich?days_back=${daysBack}`, { method: 'POST' }),

  /** Get menstrual cycles. */
  getCycles: (): Promise<MenstrualCycle[]> =>
    request<MenstrualCycle[]>('/cycles'),

  /** Sync menstrual cycles from Garmin. */
  syncCycles: (daysBack: number = 365): Promise<{ synced: number; error: string | null }> =>
    request(`/cycles/sync?days_back=${daysBack}`, { method: 'POST' }),
};
