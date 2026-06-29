/**
 * Shared workout utilities and constants.
 */
import { type ReactElement } from 'react';
import {
  Bike,
  Dumbbell,
  SportShoe,
  MoreHorizontal,
  Waves,
} from 'lucide-react';
import type { WorkoutType } from '../../types';

export const typeIcon: Record<WorkoutType, ReactElement> = {
  run: <SportShoe size={14} />,
  cycle: <Bike size={14} />,
  strength: <Dumbbell size={14} />,
  yoga: <Waves size={14} />,
  pilates: <Waves size={14} />,
  other: <MoreHorizontal size={14} />,
};

export const typeColor: Record<WorkoutType, string> = {
  run: 'bg-blue-500/10 text-blue-700 border-blue-200',
  cycle: 'bg-green-500/10 text-green-700 border-green-200',
  strength: 'bg-orange-500/10 text-orange-700 border-orange-200',
  yoga: 'bg-purple-500/10 text-purple-700 border-purple-200',
  pilates: 'bg-pink-500/10 text-pink-700 border-pink-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const typeLabel: Record<WorkoutType, string> = {
  run: 'Run',
  cycle: 'Cycle',
  strength: 'Strength',
  yoga: 'Yoga',
  pilates: 'Pilates',
  other: 'Other',
};

export function formatDuration(min: number | null): string {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}'`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}'`;
}

/** Returns display stats for an actual (Garmin) workout. Pace only shown for runs/cycling. */
export function getActualStats(a: {
  type: string;
  duration_min: number | null;
  distance_km: number | null;
  avg_pace_per_km: string | null;
  avg_hr: number | null;
}): string[] {
  if (a.type === 'run') {
    // Runs: distance + pace
    return [
      a.distance_km ? `${a.distance_km.toFixed(1)} km` : null,
      a.avg_pace_per_km ? `${a.avg_pace_per_km}/km` : null,
    ].filter((s): s is string => s !== null);
  }
  // All other activities: distance (if any) + duration
  return [
    a.distance_km ? `${a.distance_km.toFixed(1)} km` : null,
    a.duration_min ? formatDuration(a.duration_min) : null,
  ].filter((s): s is string => s !== null);
}

export const rpeColors: Record<number, string> = {
  1: 'bg-emerald-100 text-emerald-700',
  2: 'bg-emerald-100 text-emerald-700',
  3: 'bg-lime-100 text-lime-700',
  4: 'bg-yellow-100 text-yellow-700',
  5: 'bg-yellow-100 text-yellow-700',
  6: 'bg-orange-100 text-orange-700',
  7: 'bg-orange-100 text-orange-700',
  8: 'bg-red-100 text-red-700',
  9: 'bg-red-100 text-red-700',
  10: 'bg-red-200 text-red-800',
};
