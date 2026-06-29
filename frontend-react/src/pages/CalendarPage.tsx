/**
 * Calendar page: weekly drag-and-drop workout planner with stats dashboard.
 */
import { useState, useCallback } from 'react';
import { WeekStrip } from '../components/workouts/WeekStrip';
import { WeeklyStatsBar } from '../components/workouts/WeeklyStatsBar';
import { RunningStatsPanel } from '../components/workouts/RunningStatsPanel';
import { TrainingPlanPanel } from '../components/workouts/TrainingPlanPanel';

export function CalendarPage() {
  const [weekStart, setWeekStart] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleWeekChange = useCallback((ws: Date) => {
    setWeekStart(ws);
  }, []);

  const handleSyncComplete = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Calendar</h1>
      <div className="space-y-4">
        <WeeklyStatsBar weekStart={weekStart} refreshKey={refreshKey} />
        <WeekStrip onWeekChange={handleWeekChange} onSyncComplete={handleSyncComplete} />
        <TrainingPlanPanel />
        <RunningStatsPanel />
      </div>
    </div>
  );
}
