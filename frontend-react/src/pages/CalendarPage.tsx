import { Card } from '../components/ui/Card';

export function CalendarPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Calendar</h1>
      <Card>
        <p className="text-sm text-gray-500">
          Weekly calendar with drag-and-drop workouts — coming in Phase 1.
        </p>
      </Card>
    </div>
  );
}
