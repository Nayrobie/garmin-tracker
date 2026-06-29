/**
 * API client for body composition endpoints.
 */
import type { BodyCompositionRecord } from '../types';

const BASE_URL = 'http://localhost:8000/api';

export async function fetchBodyComposition(): Promise<BodyCompositionRecord[]> {
  const res = await fetch(`${BASE_URL}/body-composition`);
  if (!res.ok) throw new Error(`Failed to load body composition data: ${res.status}`);
  return res.json();
}
