/**
 * WorkoutDetailModal: full detail view for either a Garmin activity or a planned workout.
 *
 * - Garmin-only: shows all synced metrics in a clean grid.
 * - Planned: shows goal vs actual comparison; delete-single and delete-series options.
 */
import { format, parseISO } from 'date-fns';
import { Trash2, RepeatIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { ActualWorkout, PlannedWorkout } from '../../types';
import { typeIcon, typeLabel, typeColor, formatDuration, rpeColors } from './workoutUtils.tsx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-black/5 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkoutDetailModalProps {
  open: boolean;
  onClose: () => void;
  /** The planned workout (present for planned cards, absent for orphan Garmin cards) */
  planned?: PlannedWorkout | null;
  /** The actual (Garmin) workout */
  actual?: ActualWorkout | null;
  onEdit?: () => void;
  onDelete?: (id: number) => void;
  onDeleteGroup?: (groupId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkoutDetailModal({
  open,
  onClose,
  planned,
  actual,
  onEdit,
  onDelete,
  onDeleteGroup,
}: WorkoutDetailModalProps) {
  const activity = actual ?? planned;
  if (!activity) return null;

  const type = activity.type;
  const colorClass = typeColor[type];
  const title = actual?.name ?? typeLabel[type];
  const dateStr = format(parseISO(activity.date), 'EEEE d MMMM yyyy');
  const isRecurring = planned?.recurrence && planned.recurrence !== 'none';

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Header badge */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${colorClass}`}>
          <span className="[&>svg]:w-4 [&>svg]:h-4">{typeIcon[type]}</span>
          <span>{typeLabel[type]}</span>
          <span className="text-current/50 font-normal">&mdash; {dateStr}</span>
        </div>

        {/* Planned section */}
        {planned && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Goal</p>
            <div className="rounded-xl bg-black/[0.03] px-3 py-1">
              <StatRow label="Duration" value={planned.goal_duration_min ? formatDuration(planned.goal_duration_min) : null} />
              <StatRow label="Pace" value={planned.goal_pace_per_km ? `${planned.goal_pace_per_km}/km` : null} />
              <StatRow label="Notes" value={planned.notes} />
              {isRecurring && (
                <div className="flex items-center gap-1.5 py-1.5 text-xs text-indigo-500">
                  <RepeatIcon size={12} />
                  <span>Recurring — {planned.recurrence}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actual section */}
        {actual && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              {planned ? 'Result (Garmin)' : 'Garmin Activity'}
            </p>
            <div className="rounded-xl bg-black/[0.03] px-3 py-1">
              <StatRow label="Duration" value={actual.duration_min ? formatDuration(actual.duration_min) : null} />
              <StatRow label="Distance" value={actual.distance_km ? `${actual.distance_km.toFixed(2)} km` : null} />
              <StatRow label="Avg pace" value={actual.avg_pace_per_km ? `${actual.avg_pace_per_km}/km` : null} />
              <StatRow label="Avg HR" value={actual.avg_hr ? `${actual.avg_hr} bpm` : null} />
              <StatRow label="Calories" value={actual.calories ? `${actual.calories} kcal` : null} />
              {actual.rpe != null && (
                <div className="flex justify-between items-baseline py-1.5 border-b border-black/5 last:border-0">
                  <span className="text-xs text-gray-400">RPE</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rpeColors[actual.rpe] ?? 'bg-gray-100 text-gray-600'}`}>
                    {actual.rpe} / 10
                  </span>
                </div>
              )}
              {actual.notes && <StatRow label="Notes" value={actual.notes} />}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            {planned && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { onDelete(planned.id); onClose(); }}
                className="text-red-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 size={13} className="mr-1" />
                Delete
              </Button>
            )}
            {planned && isRecurring && onDeleteGroup && planned.recurrence_group_id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { onDeleteGroup(planned.recurrence_group_id!); onClose(); }}
                className="text-red-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 size={13} className="mr-1" />
                Delete series
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            {planned && onEdit && (
              <Button size="sm" onClick={() => { onClose(); onEdit(); }}>Edit</Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
