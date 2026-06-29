/**
 * TrainingPlanPanel: generates and displays a multi-week progressive training plan.
 *
 * Persists plan in localStorage so it survives page refresh.
 * Shows weekly volume targets with a "Generate Plan" and "Adjust from Progress" button.
 * Includes complementary workouts (strength, yoga/mobility).
 */
import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Calendar, RefreshCw, Zap, TrendingUp, Dumbbell, Sparkles } from 'lucide-react';

import type { TrainingPlanResponse, TrainingPlanWeek } from '../../types';
import { scheduleApi } from '../../api/schedule';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const STORAGE_KEY = 'training-plan';

function loadSavedPlan(): TrainingPlanResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePlan(plan: TrainingPlanResponse) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}

export function TrainingPlanPanel() {
  const [plan, setPlan] = useState<TrainingPlanResponse | null>(loadSavedPlan);
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist whenever plan changes
  useEffect(() => {
    if (plan) savePlan(plan);
  }, [plan]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await scheduleApi.generatePlan({
        startingVolumeKm: 12,
        weeksAhead: 17,
      });
      setPlan(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async () => {
    setAdjusting(true);
    setError(null);
    try {
      const result = await scheduleApi.adjustPlan();
      setPlan(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust plan');
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-[var(--color-accent)]" />
          <h2 className="text-lg font-semibold text-gray-800">Training Plan</h2>
        </div>
        <div className="flex gap-2">
          {plan && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAdjust}
              loading={adjusting}
            >
              <RefreshCw size={13} />
              Adjust from progress
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            loading={loading}
          >
            <Zap size={13} />
            {plan ? 'Regenerate' : 'Generate Plan'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {plan && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
            <span className="flex items-center gap-1">
              <TrendingUp size={14} />
              {plan.weeks_generated} weeks &middot; +10%/week
            </span>
            <span>
              {plan.starting_volume_km}km &rarr;{' '}
              {Math.max(...plan.weeks.map((w) => w.total_km))}km peak
            </span>
            <span className="flex items-center gap-1">
              <Dumbbell size={14} />
              Strength + 2x mobility/week
            </span>
          </div>

          {/* Weekly breakdown table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[220px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-sm z-10">
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="pb-2 pr-3">Week</th>
                  <th className="pb-2 pr-3">Dates</th>
                  <th className="pb-2 pr-3 text-right">Easy</th>
                  <th className="pb-2 pr-3 text-right">Short</th>
                  <th className="pb-2 pr-3 text-right">Long</th>
                  <th className="pb-2 text-right">Total</th>
                  <th className="pb-2 pl-3">Type</th>
                </tr>
              </thead>
              <tbody>
                {plan.weeks.map((week) => (
                  <WeekRow
                    key={week.week}
                    week={week}
                    maxKm={Math.max(...plan.weeks.map((w) => w.total_km))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!plan && !loading && (
        <p className="text-sm text-gray-400 text-center py-4">
          Generate a plan to see your progressive weekly targets.
          <br />
          <span className="text-xs">
            Starts at 12km/week &middot; +10% progression &middot; taper before races
            &middot; strength + mobility included
          </span>
        </p>
      )}
    </Card>
  );
}

function WeekRow({ week, maxKm }: { week: TrainingPlanWeek; maxKm: number }) {
  const weekStart = parseISO(week.week_start);
  const barWidth = maxKm > 0 ? Math.round((week.total_km / maxKm) * 100) : 0;

  const typeBadge = () => {
    if (week.week_type === 'taper') {
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
          Taper
        </span>
      );
    }
    if (week.week_type === 'race') {
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
          Race
        </span>
      );
    }
    if (week.is_interval_week) {
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">
          Intervals
        </span>
      );
    }
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
        Easy
      </span>
    );
  };

  const rowBg =
    week.week_type === 'taper'
      ? 'bg-blue-50/30'
      : week.week_type === 'race'
        ? 'bg-purple-50/30'
        : '';

  return (
    <tr className={`border-b border-gray-50 hover:bg-white/40 transition-colors ${rowBg}`}>
      <td className="py-2 pr-3 font-medium text-gray-700">W{week.week}</td>
      <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap">
        {format(weekStart, 'MMM d')}
      </td>
      <td className="py-2 pr-3 text-right text-gray-600">{week.easy_km}km</td>
      <td className="py-2 pr-3 text-right text-gray-600">{week.short_km}km</td>
      <td className="py-2 pr-3 text-right font-medium text-gray-800">
        {week.long_km > 0 ? `${week.long_km}km` : '—'}
      </td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)]/70 rounded-full transition-all"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="font-semibold text-gray-800 tabular-nums w-12 text-right">
            {week.total_km}km
          </span>
        </div>
      </td>
      <td className="py-2 pl-3 flex items-center gap-1">
        {typeBadge()}
        {week.cross_training && week.cross_training.length > 0 && (
          <span className="text-[10px] text-gray-400" title="Strength + mobility sessions">
            <Sparkles size={11} className="inline" />
          </span>
        )}
      </td>
    </tr>
  );
}
