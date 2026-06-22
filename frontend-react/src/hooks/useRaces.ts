import { useState, useEffect, useCallback } from 'react';
import { racesApi } from '../api/races';
import type { Race, CreateRacePayload, UpdateRacePayload } from '../types';

export function useRaces() {
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await racesApi.list();
      setRaces(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load races');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRaces();
  }, [fetchRaces]);

  const createRace = useCallback(async (payload: CreateRacePayload) => {
    const created = await racesApi.create(payload);
    setRaces(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
    return created;
  }, []);

  const updateRace = useCallback(async (id: number, payload: UpdateRacePayload) => {
    const updated = await racesApi.update(id, payload);
    setRaces(prev =>
      prev
        .map(r => (r.id === id ? updated : r))
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
    return updated;
  }, []);

  const deleteRace = useCallback(async (id: number) => {
    await racesApi.delete(id);
    setRaces(prev => prev.filter(r => r.id !== id));
  }, []);

  return { races, loading, error, refetch: fetchRaces, createRace, updateRace, deleteRace };
}
