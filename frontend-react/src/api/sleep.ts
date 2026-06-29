/**
 * API client for sleep endpoints.
 */
import type { SleepRecord } from '../types';

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
};
