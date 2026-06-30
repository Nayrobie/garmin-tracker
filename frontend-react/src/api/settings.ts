/**
 * API client: fetch wrapper for user settings endpoints (GET, PUT /api/settings).
 */
import type { UserSettings, UserSettingsUpdate } from '../types';

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

export const settingsApi = {
  get: (): Promise<UserSettings> =>
    request<UserSettings>('/settings'),

  update: (payload: UserSettingsUpdate): Promise<UserSettings> =>
    request<UserSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
