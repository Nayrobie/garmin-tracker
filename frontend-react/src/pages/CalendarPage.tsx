/**
 * Calendar page: weekly drag-and-drop workout planner (Phase 1).
 */
import { WeekStrip } from '../components/workouts/WeekStrip';

export function CalendarPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Calendar</h1>
      <WeekStrip />
    </div>
  );
}
