/**
 * API client: thin fetch wrapper for race endpoints (GET, POST, PATCH, DELETE /api/races).
 */
import type { Race, CreateRacePayload, UpdateRacePayload } from '../types';

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

export const racesApi = {
  list: (): Promise<Race[]> =>
    request<Race[]>('/races'),

  create: (payload: CreateRacePayload): Promise<Race> =>
    request<Race>('/races', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: number, payload: UpdateRacePayload): Promise<Race> =>
    request<Race>(`/races/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (id: number): Promise<void> =>
    request<void>(`/races/${id}`, { method: 'DELETE' }),
};
