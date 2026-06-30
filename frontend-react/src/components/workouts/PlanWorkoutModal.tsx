/**
 * PlanWorkoutModal: form dialog for creating or editing a planned workout.
 *
 * Fields: type, date, goal duration, goal pace (runs only), notes, recurrence.
 */
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import type { CreatePlannedWorkoutPayload, PlannedWorkout, Recurrence, WorkoutType } from '../../types';

const WORKOUT_TYPES: { value: WorkoutType; label: string }[] = [
  { value: 'run', label: 'Run' },
  { value: 'cycle', label: 'Cycle' },
  { value: 'strength', label: 'Strength' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'other', label: 'Other' },
];

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

interface FormState {
  date: string;
  type: WorkoutType;
  goal_duration_min: string;
  goal_pace_per_km: string;
  notes: string;
  recurrence: Recurrence;
  recurrence_weeks: string;
}

function toForm(w: PlannedWorkout): FormState {
  return {
    date: w.date,
    type: w.type,
    goal_duration_min: w.goal_duration_min != null ? String(w.goal_duration_min) : '',
    goal_pace_per_km: w.goal_pace_per_km ?? '',
    notes: w.notes ?? '',
    recurrence: 'none',
    recurrence_weeks: '12',
  };
}

function emptyForm(date: string): FormState {
  return { date, type: 'run', goal_duration_min: '', goal_pace_per_km: '', notes: '', recurrence: 'none', recurrence_weeks: '12' };
}

interface PlanWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  initialWorkout?: PlannedWorkout | null;
  initialDate?: string;
  onSave: (payload: CreatePlannedWorkoutPayload, id?: number) => Promise<void>;
}

export function PlanWorkoutModal({ open, onClose, initialWorkout, initialDate, onSave }: PlanWorkoutModalProps) {
  const [form, setForm] = useState<FormState>(
    initialWorkout ? toForm(initialWorkout) : emptyForm(initialDate ?? ''),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialWorkout ? toForm(initialWorkout) : emptyForm(initialDate ?? ''));
      setError(null);
    }
  }, [open, initialWorkout, initialDate]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: CreatePlannedWorkoutPayload = {
        date: form.date,
        type: form.type,
        goal_duration_min: form.goal_duration_min ? Number(form.goal_duration_min) : null,
        goal_pace_per_km: form.goal_pace_per_km || null,
        notes: form.notes || null,
        recurrence: form.recurrence,
        recurrence_weeks: form.recurrence !== 'none' ? Number(form.recurrence_weeks) : undefined,
      };
      await onSave(payload, initialWorkout?.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save workout.');
    } finally {
      setSaving(false);
    }
  }

  const isEdit = !!initialWorkout;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit workout' : 'Plan a workout'}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
          <DatePicker value={form.date} onChange={v => set('date', v)} required />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <div className="flex gap-2 flex-wrap">
            {WORKOUT_TYPES.map(({ value, label }) => (
              <button key={value} type="button" onClick={() => set('type', value)}
                className={['px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  form.type === value ? 'bg-[var(--color-accent)] text-white border-transparent' : 'bg-white/60 text-gray-600 border-gray-200 hover:border-gray-300'].join(' ')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Goal duration */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Goal duration (minutes)</label>
          <input type="number" min={1} max={600} value={form.goal_duration_min}
            onChange={(e) => set('goal_duration_min', e.target.value)} placeholder="e.g. 45"
            className="w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent" />
        </div>

        {/* Goal pace — runs only */}
        {form.type === 'run' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Goal pace (MM:SS /km)</label>
            <input type="text" value={form.goal_pace_per_km}
              onChange={(e) => set('goal_pace_per_km', e.target.value)}
              placeholder="e.g. 6:30" pattern="[0-9]{1,2}:[0-5][0-9]"
              className="w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent" />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
            placeholder="Optional notes…" rows={2}
            className="w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none" />
        </div>

        {/* Recurrence — create mode only */}
        {!isEdit && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
            <label className="block text-xs font-medium text-gray-700">Repeat</label>
            <div className="flex gap-2 flex-wrap">
              {RECURRENCE_OPTIONS.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => set('recurrence', value)}
                  className={['px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    form.recurrence === value ? 'bg-indigo-500 text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'].join(' ')}>
                  {label}
                </button>
              ))}
            </div>
            {form.recurrence !== 'none' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">For</label>
                <input type="number" min={1} max={52} value={form.recurrence_weeks}
                  onChange={(e) => set('recurrence_weeks', e.target.value)}
                  className="w-16 rounded-lg border border-gray-200 bg-white/80 px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <label className="text-xs text-gray-500">weeks</label>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" loading={saving}>
            {isEdit ? 'Save changes' : form.recurrence !== 'none' ? `Add ${form.recurrence_weeks} workouts` : 'Add workout'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

