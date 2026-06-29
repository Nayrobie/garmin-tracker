/**
 * WeeklyStatsBar: displays aggregated training stats for the current week.
 *
 * Shows: total volume (km), run count, long run distance, avg HR,
 * planned vs actual compliance, and a volume progression alert.
 */
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import type { WeeklyStats } from '../../types';
import { statsApi } from '../../api/stats';

interface WeeklyStatsBarProps {
  weekStart: Date | null;
  refreshKey: number;
}

export function WeeklyStatsBar({ weekStart, refreshKey }: WeeklyStatsBarProps) {
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weekStart) return;
    setLoading(true);
    setError(null);
    statsApi
      .getWeeklyStats(format(weekStart, 'yyyy-MM-dd'))
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, [weekStart, refreshKey]);

  if (!weekStart) return null;
  if (loading) {
    return (
      <div className="flex gap-3 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 flex-1 rounded-xl bg-white/40" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
        Stats: {error}
      </p>
    );
  }
  if (!stats) return null;

  const volumeIcon =
    stats.volume_change_pct == null ? (
      <Minus size={12} className="text-gray-400" />
    ) : stats.volume_change_pct > 0 ? (
      <TrendingUp size={12} className={stats.volume_alert ? 'text-red-500' : 'text-emerald-500'} />
    ) : (
      <TrendingDown size={12} className="text-amber-500" />
    );

  const volumeChangeLabel =
    stats.volume_change_pct != null
      ? `${stats.volume_change_pct > 0 ? '+' : ''}${stats.volume_change_pct}%`
      : '—';

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Volume */}
      <StatCard
        label="Volume"
        value={`${stats.total_volume_km} km`}
        sub={
          <span className="flex items-center gap-1">
            {volumeIcon}
            <span className={stats.volume_alert ? 'text-red-600 font-semibold' : ''}>
              {volumeChangeLabel}
            </span>
          </span>
        }
        alert={stats.volume_alert}
        alertTooltip="Weekly volume increase exceeds 10% — injury risk!"
      />

      {/* Run count */}
      <StatCard label="Runs" value={String(stats.run_count)} />

      {/* Long run */}
      <StatCard label="Long run" value={stats.long_run_km > 0 ? `${stats.long_run_km} km` : '—'} />

      {/* Avg HR */}
      <StatCard label="Avg HR" value={stats.avg_hr != null ? `${stats.avg_hr} bpm` : '—'} />

      {/* Planned vs Actual */}
      <StatCard
        label="Compliance"
        value={`${stats.actual_count}/${stats.planned_count}`}
        sub={
          stats.planned_count > 0 ? (
            <span className="text-gray-500">
              {Math.round((stats.actual_count / stats.planned_count) * 100)}%
            </span>
          ) : undefined
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard (internal)
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  alert?: boolean;
  alertTooltip?: string;
}

function StatCard({ label, value, sub, alert, alertTooltip }: StatCardProps) {
  return (
    <div
      className={[
        'flex-1 min-w-[100px] rounded-xl border px-3 py-2 relative',
        alert
          ? 'border-red-200 bg-red-50/60'
          : 'border-white/40 bg-white/40 backdrop-blur-sm',
      ].join(' ')}
      title={alert ? alertTooltip : undefined}
    >
      {alert && (
        <AlertTriangle size={12} className="absolute top-1.5 right-1.5 text-red-500" />
      )}
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
      <p className="text-lg font-semibold text-gray-900 leading-tight mt-0.5">{value}</p>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
