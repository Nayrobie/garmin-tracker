/**
 * API client for Google Tasks OAuth endpoints.
 */
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

export const googleApi = {
  getAuthUrl: (): Promise<{ url: string }> =>
    request<{ url: string }>('/google/auth-url'),

  getStatus: (): Promise<{ connected: boolean }> =>
    request<{ connected: boolean }>('/google/status'),

  disconnect: (): Promise<{ status: string }> =>
    request<{ status: string }>('/google/disconnect', { method: 'POST' }),

  pushWeekTasks: (weekStart?: string): Promise<{ created: number; skipped: number }> => {
    const params = new URLSearchParams();
    if (weekStart) params.set('week_start', weekStart);
    return request<{ created: number; skipped: number }>(`/google/push-week-tasks?${params.toString()}`, { method: 'POST' });
  },
};
