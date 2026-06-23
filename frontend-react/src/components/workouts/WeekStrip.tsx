/**
 * WeekStrip: horizontal 7-day layout showing planned and actual workouts per day.
 *
 * Supports:
 * - Navigation to previous/next week
 * - Drag-and-drop of WorkoutCards between day columns (via @dnd-kit)
 * - Add new planned workout by clicking any day column
 * - Edit / delete planned workouts via WorkoutCard actions
 * - Manual Garmin sync button
 */
import { useState, useCallback } from 'react';
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { format, addDays, addWeeks, subWeeks, startOfWeek, isToday, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import type {
  ActualWorkout,
  CreatePlannedWorkoutPayload,
  DaySchedule,
  PlannedWorkout,
  WeeklySchedule,
} from '../../types';
import { scheduleApi } from '../../api/schedule';
import { WorkoutCard } from './WorkoutCard';
import { PlanWorkoutModal } from './PlanWorkoutModal';
import { WorkoutDetailModal } from './WorkoutDetailModal';
import {
  typeIcon,
  typeLabel,
  getActualStats,
  rpeColors,
} from './workoutUtils.tsx';

// ---------------------------------------------------------------------------
// Hook: useWeekSchedule
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useWeekSchedule(_weekStart: Date) {
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ws: Date) => {
    setLoading(true);
    setError(null);
    try {
      const data = await scheduleApi.getWeek(format(ws, 'yyyy-MM-dd'));
      setSchedule(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { schedule, setSchedule, loading, error, load };
}

// ---------------------------------------------------------------------------
// DayColumn
// ---------------------------------------------------------------------------

interface DayColumnProps {
  day: DaySchedule;
  onAddClick: (date: string) => void;
  onEdit: (workout: PlannedWorkout) => void;
  onDelete: (id: number) => void;
  onCardClick: (planned: PlannedWorkout | null, actual: ActualWorkout | null) => void;
}

function DayColumn({ day, onAddClick, onEdit, onDelete, onCardClick }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: day.date });
  const dateObj = parseISO(day.date);
  const today = isToday(dateObj);

  // Match actual workouts to planned by planned_workout_id
  function getActualFor(planned: PlannedWorkout): ActualWorkout | null {
    return day.actual.find((a) => a.planned_workout_id === planned.id) ?? null;
  }

  // Find orphan actual workouts (no planned_workout_id and not matched to any planned)
  const orphanActuals = day.actual.filter(
    (a) => a.planned_workout_id == null && !day.planned.some((p) => getActualFor(p)?.id === a.id),
  );

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex flex-col min-w-[130px] flex-1',
        'rounded-2xl border transition-colors',
        today
          ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5'
          : isOver ? 'border-blue-300/60 bg-blue-50/30' : 'border-white/40 bg-white/30',
        'p-2 gap-2',
      ].join(' ')}
    >
      {/* Day header */}
      <div className="text-center mb-1">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">
          {format(dateObj, 'EEE')}
        </p>
        <p
          className={[
            'text-lg font-semibold leading-none mt-0.5',
            today ? 'text-[var(--color-accent)]' : 'text-gray-800',
          ].join(' ')}
        >
          {format(dateObj, 'd')}
        </p>
      </div>

      {/* Workout cards */}
      <div className="flex flex-col gap-1.5 flex-1">
        {/* Planned workouts with matched actual data */}
        {day.planned.map((p) => (
          <WorkoutCard
            key={p.id}
            planned={p}
            actual={getActualFor(p)}
            onEdit={onEdit}
            onDelete={onDelete}
            onClick={(pw, aw) => onCardClick(pw, aw)}
          />
        ))}

          {/* Orphan actual workouts (Garmin synced, no planned match) */}
          {orphanActuals.map((a) => {
            const chips = getActualStats(a);
            return (
              <div
                key={a.id}
                className="relative rounded-xl border border-amber-200/80 bg-amber-50/60 backdrop-blur-sm shadow-sm overflow-hidden cursor-pointer hover:bg-amber-100/60 transition-colors"
                onClick={() => onCardClick(null, a)}
              >
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400/60 rounded-l-xl" />
                <div className="pl-4 pr-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="[&>svg]:w-4 [&>svg]:h-4 text-amber-500">{typeIcon[a.type]}</span>
                    <span className="text-[13px] font-semibold text-amber-900 leading-tight">
                      {a.name ?? typeLabel[a.type]}
                    </span>
                  </div>
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {chips.map((s) => (
                        <span key={s} className="text-[11px] font-medium text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded-md">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
                {a.rpe != null && (
                  <span className={`absolute top-1.5 right-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rpeColors[a.rpe] ?? 'bg-gray-100 text-gray-600'}`}>
                    {a.rpe}
                  </span>
                )}
              </div>
            );
          })}
      </div>

      {/* Add button */}
      <button
        onClick={() => onAddClick(day.date)}
        className="flex items-center justify-center gap-1 w-full py-1.5 rounded-lg text-[11px] text-gray-400 hover:text-[var(--color-accent)] hover:bg-white/50 border border-dashed border-gray-200 hover:border-[var(--color-accent)]/40 transition-colors"
      >
        <Plus size={11} />
        <span>Plan</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekStrip
// ---------------------------------------------------------------------------

export function WeekStrip() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const { schedule, setSchedule, loading, error, load } = useWeekSchedule(weekStart);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PlannedWorkout | null>(null);
  const [addDate, setAddDate] = useState<string>('');

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPlanned, setDetailPlanned] = useState<PlannedWorkout | null>(null);
  const [detailActual, setDetailActual] = useState<ActualWorkout | null>(null);

  function openDetail(planned: PlannedWorkout | null, actual: ActualWorkout | null) {
    setDetailPlanned(planned);
    setDetailActual(actual);
    setDetailOpen(true);
  }

  // Load on mount + week change
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    load(weekStart);
  }

  // Week navigation
  function goToPrevWeek() {
    const ws = subWeeks(weekStart, 1);
    setWeekStart(ws);
    load(ws);
  }
  function goToNextWeek() {
    const ws = addWeeks(weekStart, 1);
    setWeekStart(ws);
    load(ws);
  }

  // Garmin sync
  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const result = await scheduleApi.triggerSync();
      if (result.error) {
        setSyncMsg(`Sync: ${result.error}`);
      } else {
        setSyncMsg(`Synced ${result.synced} new, ${result.updated} updated.`);
        load(weekStart);
      }
    } catch {
      setSyncMsg('Sync failed — check backend logs.');
    } finally {
      setSyncing(false);
    }
  }

  // Drag end: move planned workout to a new day
  function handleDragStart() {
    document.body.style.overflow = 'hidden';
  }

  async function handleDragEnd(event: DragEndEvent) {
    document.body.style.overflow = '';
    const { active, over } = event;
    if (!over || !schedule) return;

    const draggedId = active.id as number;
    const targetDate = String(over.id); // over.id is always a day date string (useDroppable)

    const sourceDay = schedule.days.find((d) => d.planned.some((p) => p.id === draggedId));
    if (!sourceDay || sourceDay.date === targetDate) return;

    const targetDay = schedule.days.find((d) => d.date === targetDate);
    if (!targetDay) return;

    try {
      await scheduleApi.updateWorkout(draggedId, { date: targetDate });
      setSchedule((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) => {
            if (d.date === sourceDay.date) {
              return { ...d, planned: d.planned.filter((p) => p.id !== draggedId) };
            }
            if (d.date === targetDate) {
              const moved = sourceDay.planned.find((p) => p.id === draggedId)!;
              return { ...d, planned: [...d.planned, { ...moved, date: targetDate }] };
            }
            return d;
          }),
        };
      });
    } catch {
      load(weekStart);
    }
  }

  // Create / edit modal handlers
  function openAdd(date: string) {
    setEditTarget(null);
    setAddDate(date);
    setModalOpen(true);
  }
  function openEdit(workout: PlannedWorkout) {
    setEditTarget(workout);
    setModalOpen(true);
  }

  async function handleSave(payload: CreatePlannedWorkoutPayload, id?: number) {
    if (id != null) {
      const updated = await scheduleApi.updateWorkout(id, payload);
      setSchedule((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) => ({
            ...d,
            planned: d.planned.map((p) => (p.id === id ? updated : p)),
          })),
        };
      });
    } else {
      const created = await scheduleApi.createWorkout(payload);
      setSchedule((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((d) => {
            if (d.date === created.date) {
              return { ...d, planned: [...d.planned, created] };
            }
            return d;
          }),
        };
      });
    }
  }

  async function handleDelete(id: number) {
    await scheduleApi.deleteWorkout(id);
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) => ({
          ...d,
          planned: d.planned.filter((p) => p.id !== id),
        })),
      };
    });
  }

  async function handleDeleteGroup(groupId: string) {
    await scheduleApi.deleteWorkoutGroup(groupId);
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) => ({
          ...d,
          planned: d.planned.filter((p) => p.recurrence_group_id !== groupId),
        })),
      };
    });
  }

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevWeek}
            className="p-1.5 rounded-lg hover:bg-white/50 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-gray-800">
            {format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM yyyy')}
          </h2>
          <button
            onClick={goToNextWeek}
            className="p-1.5 rounded-lg hover:bg-white/50 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {syncMsg && <p className="text-[11px] text-gray-500">{syncMsg}</p>}
          {schedule?.last_sync && (
            <p className="text-[11px] text-gray-400">
              Last sync: {format(parseISO(schedule.last_sync), 'HH:mm')}
            </p>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/60 border border-white/50 text-gray-600 hover:bg-white/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            Sync Garmin
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Week grid */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center h-48 text-sm text-gray-400"
          >
            Loading…
          </motion.div>
        ) : (
          <motion.div
            key={format(weekStart, 'yyyy-MM-dd')}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {(schedule?.days ?? []).map((day) => (
                <DayColumn
                  key={day.date}
                  day={day}
                  onAddClick={openAdd}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onCardClick={openDetail}
                />
              ))}
            </DndContext>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plan/edit modal */}
      <PlanWorkoutModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialWorkout={editTarget}
        initialDate={addDate}
        onSave={handleSave}
      />

      {/* Detail modal */}
      <WorkoutDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        planned={detailPlanned}
        actual={detailActual}
        onEdit={detailPlanned ? () => { setDetailOpen(false); openEdit(detailPlanned); } : undefined}
        onDelete={handleDelete}
        onDeleteGroup={handleDeleteGroup}
      />
    </div>
  );
}
