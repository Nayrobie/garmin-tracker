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
