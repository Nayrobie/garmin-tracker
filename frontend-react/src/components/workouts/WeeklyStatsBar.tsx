/**
 * WeeklyStatsBar: displays aggregated training stats for the current week.
 *
 * Shows: volume (done vs planned), run count (done vs planned),
 * long run (done vs planned), avg HR, and week score (completion %).
 */
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Flame, Target, Zap, Heart, Trophy, CheckCircle2 } from 'lucide-react';

import type { WeeklyStats } from '../../types';
import { statsApi } from '../../api/stats';
import { Card } from '../ui/Card';

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
          <div key={i} className="h-20 flex-1 rounded-xl bg-white/40" />
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

  const volumeChangePct = stats.volume_change_pct;
  const volumeIcon =
    volumeChangePct == null ? (
      <Minus size={10} className="text-gray-400" />
    ) : volumeChangePct > 0 ? (
      <TrendingUp size={10} className={stats.volume_alert ? 'text-red-500' : 'text-emerald-500'} />
    ) : (
      <TrendingDown size={10} className="text-amber-500" />
    );
  const volumeTrend =
    volumeChangePct != null
      ? `${volumeChangePct > 0 ? '+' : ''}${volumeChangePct}% vs last week`
      : null;

  const completionPct =
    stats.planned_count > 0
      ? Math.round((stats.actual_count / stats.planned_count) * 100)
      : null;

  return (
    <div className="flex gap-2 flex-wrap">
      {/* Volume */}
      <ProgressCard
        label="Volume"
        icon={<Flame size={13} className="text-orange-400" />}
        done={stats.total_volume_km}
        planned={stats.planned_volume_km}
        unit="km"
        alert={stats.volume_alert}
        alertTooltip="Weekly volume increase exceeds 10% — injury risk!"
        trend={
          volumeTrend ? (
            <span className={`flex items-center gap-0.5 ${stats.volume_alert ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
              {volumeIcon} {volumeTrend}
            </span>
          ) : undefined
        }
      />

      {/* Runs */}
      <ProgressCard
        label="Runs"
        icon={<Zap size={13} className="text-sky-400" />}
        done={stats.run_count}
        planned={stats.planned_run_count}
        unit="sessions"
        isCount
      />

      {/* Long run */}
      <LongRunCard
        done={stats.long_run_km}
        planned={stats.planned_long_run_km}
      />

      {/* Avg HR */}
      <SimpleCard
        label="Avg HR"
        icon={<Heart size={13} className="text-rose-400" />}
        value={stats.avg_hr != null ? `${stats.avg_hr} bpm` : '—'}
        sub={stats.avg_hr != null ? hrZoneLabel(stats.avg_hr) : undefined}
      />

      {/* Week Score */}
      <ScoreCard
        label="Week Score"
        icon={<Trophy size={13} className="text-amber-400" />}
        actual={stats.actual_count}
        planned={stats.planned_count}
        pct={completionPct}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hrZoneLabel(hr: number): string {
  if (hr < 115) return 'Zone 1';
  if (hr < 152) return 'Zone 2';
  if (hr < 171) return 'Zone 3';
  if (hr < 190) return 'Zone 4';
  return 'Zone 5';
}

function progressBarColor(pct: number, alert?: boolean): string {
  if (alert) return 'bg-red-400';
  if (pct >= 100) return 'bg-emerald-400';
  if (pct >= 60) return 'bg-sky-400';
  return 'bg-amber-400';
}

// ---------------------------------------------------------------------------
// ProgressCard — done vs planned with progress bar
// ---------------------------------------------------------------------------

interface ProgressCardProps {
  label: string;
  icon: React.ReactNode;
  done: number;
  planned: number;
  unit: string;
  isCount?: boolean;
  alert?: boolean;
  alertTooltip?: string;
  trend?: React.ReactNode;
}

function ProgressCard({ label, icon, done, planned, unit, isCount, alert, alertTooltip, trend }: ProgressCardProps) {
  const hasPlan = planned > 0;
  const pct = hasPlan ? Math.min(Math.round((done / planned) * 100), 100) : null;
  const isDone = hasPlan && pct === 100;
  const barColor = pct != null ? progressBarColor(pct, alert) : 'bg-gray-200';
  const doneLabel = isCount ? String(done) : `${done}`;
  const plannedLabel = isCount ? String(planned) : `${planned}`;

  return (
    <Card
      padding="sm"
      className={[
        'flex-1 min-w-[110px] relative overflow-hidden transition-all duration-300',
        alert ? '!border-red-200 !bg-red-50/60' : isDone ? '!border-emerald-300 !bg-emerald-50/60' : '',
      ].join(' ')}
      title={alert ? alertTooltip : undefined}
    >
      {alert && <AlertTriangle size={11} className="absolute top-1.5 right-1.5 text-red-500" />}
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
        {isDone && <CheckCircle2 size={11} className="text-emerald-500 ml-auto" />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold leading-none ${isDone ? 'text-emerald-700' : 'text-gray-900'}`}>{doneLabel}</span>
        {hasPlan && (
          <span className="text-xs text-gray-400">/ {plannedLabel} {unit}</span>
        )}
        {!hasPlan && (
          <span className="text-xs text-gray-400">{unit}</span>
        )}
      </div>
      {pct != null && (
        <div className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {trend && <div className="text-[10px] mt-1">{trend}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// LongRunCard — pops green when synced, neutral when pending
// ---------------------------------------------------------------------------

interface LongRunCardProps {
  done: number;
  planned: number;
}

function LongRunCard({ done, planned }: LongRunCardProps) {
  const isDone = done > 0;
  return (
    <Card
      padding="sm"
      className={[
        'flex-1 min-w-[110px] relative overflow-hidden transition-all duration-300',
        isDone ? '!border-emerald-300 !bg-emerald-50/60' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1 mb-1">
        <Target size={13} className={isDone ? 'text-emerald-500' : 'text-violet-400'} />
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Long Run</p>
        {isDone && <CheckCircle2 size={11} className="text-emerald-500 ml-auto" />}
      </div>
      {isDone ? (
        <>
          <p className="text-xl font-bold text-emerald-700 leading-none">{done} km</p>
          <p className="text-[10px] text-emerald-500 mt-1 font-medium">Completed ✓</p>
        </>
      ) : (
        <>
          <p className="text-xl font-bold text-gray-300 leading-none">—</p>
          {planned > 0 && (
            <p className="text-[10px] text-gray-400 mt-1">Goal: {planned} km</p>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SimpleCard — single value (no progress bar)
// ---------------------------------------------------------------------------

interface SimpleCardProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  sub?: string;
}

function SimpleCard({ label, icon, value, sub }: SimpleCardProps) {
  return (
    <Card padding="sm" className="flex-1 min-w-[100px]">
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
      </div>
      <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ScoreCard — gamified completion badge
// ---------------------------------------------------------------------------

interface ScoreCardProps {
  label: string;
  icon: React.ReactNode;
  actual: number;
  planned: number;
  pct: number | null;
}

function ScoreCard({ label, icon, actual, planned, pct }: ScoreCardProps) {
  const isDone = pct != null && pct >= 100;
  const badgeColor =
    pct == null
      ? 'bg-gray-100 text-gray-500'
      : pct >= 100
      ? 'bg-emerald-100 text-emerald-700'
      : pct >= 60
      ? 'bg-sky-100 text-sky-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <Card
      padding="sm"
      className={[
        'flex-1 min-w-[110px] transition-all duration-300',
        isDone ? '!border-emerald-300 !bg-emerald-50/60' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{label}</p>
        {isDone && <CheckCircle2 size={11} className="text-emerald-500 ml-auto" />}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xl font-bold leading-none ${isDone ? 'text-emerald-700' : 'text-gray-900'}`}>
          {actual}/{planned}
        </span>
        {pct != null && (
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${badgeColor}`}>
            {pct}%
          </span>
        )}
      </div>
      {pct != null && (
        <div className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressBarColor(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </Card>
  );
}

