/**
 * WorkoutCard: compact draggable card for a planned workout with optional Garmin actual data.
 */
import { type CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Pencil, Trash2 } from 'lucide-react';

import type { ActualWorkout, PlannedWorkout } from '../../types';
import {
  typeIcon,
  typeLabel,
  formatDuration,
  getActualStats,
  rpeColors,
} from './workoutUtils.tsx';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkoutCardProps {
  planned: PlannedWorkout;
  actual?: ActualWorkout | null;
  onEdit: (workout: PlannedWorkout) => void;
  onDelete: (id: number) => void;
  onClick: (planned: PlannedWorkout, actual: ActualWorkout | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkoutCard({ planned, actual, onEdit, onDelete, onClick }: WorkoutCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: planned.id });

  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  // Visual state: completed (green) vs planned-only (gray dashed)
  const isCompleted = actual != null;
  const cardBorder = isCompleted
    ? 'border-green-300/80'
    : 'border-gray-200 border-dashed';
  const cardBg = isCompleted
    ? 'bg-green-50/60'
    : 'bg-white/50';
  const accentBar = isCompleted
    ? 'bg-green-500/60'
    : 'bg-gray-300/60';
  const textColor = isCompleted
    ? 'text-green-800'
    : 'text-gray-500';

  const plannedChips = [
    planned.goal_duration_min ? formatDuration(planned.goal_duration_min) : null,
    planned.goal_pace_per_km ? `${planned.goal_pace_per_km}/km` : null,
  ].filter((s): s is string => s !== null);

  const actualChips = actual ? getActualStats(actual) : [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group relative rounded-xl border overflow-hidden',
        'backdrop-blur-none shadow-sm',
        'cursor-grab active:cursor-grabbing select-none',
        cardBorder,
        cardBg,
        textColor,
      ].join(' ')}
      {...attributes}
      {...listeners}
      onClick={() => onClick(planned, actual ?? null)}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${accentBar}`} />

      <div className="pl-4 pr-3 py-2">
        {/* Icon + label */}
        <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`[&>svg]:w-4 [&>svg]:h-4 ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>{typeIcon[planned.type]}</span>
            <span className={`text-[13px] font-semibold leading-tight ${isCompleted ? 'text-green-800' : 'text-gray-700'}`}>{typeLabel[planned.type]}</span>
            {isCompleted && <span className="text-[10px] text-green-600">✓</span>}
        </div>
        {/* Hover actions (absolutely positioned) */}
        <div
          className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-0.5 bg-white/90 rounded-md shadow-sm border border-gray-100 px-0.5 py-0.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button onClick={(e) => { e.stopPropagation(); onEdit(planned); }}
            className="p-1 rounded-md hover:bg-black/10 text-current opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Edit">
            <Pencil size={11} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(planned.id); }}
            className="p-1 rounded-md hover:bg-red-100 text-current opacity-60 hover:opacity-100 text-red-500 transition-opacity"
            aria-label="Delete">
            <Trash2 size={11} />
          </button>
        </div>

        {/* Planned chips */}
        {plannedChips.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            <span className="text-[10px] text-gray-400 self-center">↑</span>
            {plannedChips.map((s) => (
              <span key={s} className="text-[11px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">{s}</span>
            ))}
          </div>
        )}

        {/* Actual chips */}
        {actualChips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-green-500 self-center">✓</span>
            {actualChips.map((s) => (
              <span key={s} className="text-[11px] font-medium bg-green-100/80 text-green-700 px-1.5 py-0.5 rounded-md">{s}</span>
            ))}
          </div>
        )}

        {planned.notes && (
          <p className="mt-1 text-[10px] text-gray-400 line-clamp-1">{planned.notes}</p>
        )}
      </div>

      {actual?.rpe != null && (
        <span className={`absolute top-1.5 right-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rpeColors[actual.rpe] ?? 'bg-gray-100 text-gray-600'}`}>
          {actual.rpe}
        </span>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkoutCardProps {
  planned: PlannedWorkout;
  actual?: ActualWorkout | null;
  onEdit: (workout: PlannedWorkout) => void;
  onDelete: (id: number) => void;
  onClick: (planned: PlannedWorkout, actual: ActualWorkout | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
