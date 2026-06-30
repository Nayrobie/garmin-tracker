/**
 * RunningStatsPanel: displays running progression (monthly/yearly) with a bar chart,
 * personal records, and total activities count.
 */
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Trophy, Activity, TrendingUp } from 'lucide-react';

import type { RunningStats } from '../../types';
import { statsApi } from '../../api/stats';
import { Card } from '../ui/Card';

type Granularity = 'yearly' | 'monthly';

export function RunningStatsPanel() {
  const [stats, setStats] = useState<RunningStats | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    statsApi
      .getRunningStats(granularity)
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [granularity]);

  if (loading && !stats) {
    return (
      <Card className="animate-pulse">
        <div className="h-6 w-48 bg-gray-200 rounded mb-4" />
        <div className="h-40 bg-gray-100 rounded" />
      </Card>
    );
  }
  if (error) {
    return (
      <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
        Running stats: {error}
      </p>
    );
  }
  if (!stats) return null;

  const chartData = stats.progression.map((p) => {
    let label: string;
    if (granularity === 'monthly') {
      // p.period is "YYYY-MM" → format as "Jan", "Feb", etc.
      const [yr, mo] = p.period.split('-').map(Number);
      const d = new Date(yr, mo - 1, 1);
      // Always show year suffix for monthly labels for disambiguation
      label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    } else {
      label = p.period; // "2025", "2026"
    }
    return {
      period: label,
      fullPeriod: p.period,
      km: p.total_km,
      runs: p.run_count,
      pace: p.avg_pace,
      hr: p.avg_hr,
    };
  });

  return (
    <Card className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-gray-800">Running Progression</h3>
        </div>
        <div className="flex items-center gap-1 bg-white/60 rounded-lg border border-white/50 p-0.5">
          <button
            onClick={() => setGranularity('yearly')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              granularity === 'yearly'
                ? 'bg-[var(--color-accent)] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Year
          </button>
          <button
            onClick={() => setGranularity('monthly')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              granularity === 'monthly'
                ? 'bg-[var(--color-accent)] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Bar chart */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              unit=" km"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                    <p className="font-semibold text-gray-800">{d.fullPeriod}</p>
                    <p className="text-gray-600">{d.km} km · {d.runs} runs</p>
                    {d.pace && <p className="text-gray-500">Avg pace: {d.pace}/km</p>}
                    {d.hr && <p className="text-gray-500">Avg HR: {d.hr} bpm</p>}
                  </div>
                );
              }}
            />
            <Bar dataKey="km" radius={[4, 4, 0, 0]}>
              {chartData.map((_, idx) => (
                <Cell
                  key={idx}
                  fill={idx === chartData.length - 1 ? 'var(--color-accent)' : '#c7d2fe'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row: PRs + Total activities */}
      <div className="flex gap-3 flex-wrap">
        {/* Personal Records */}
        <div className="flex-1 min-w-[200px] rounded-[var(--radius-card)] border border-white/60 bg-white/70 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Trophy size={13} className="text-amber-500" />
            <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
              Personal Records
            </span>
          </div>
          {stats.personal_records.length === 0 ? (
            <p className="text-xs text-gray-400">No records yet</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {stats.personal_records.map((pr) => (
                <div key={pr.distance_label} className="flex items-baseline gap-1.5">
                  <span className="text-[11px] font-medium text-gray-500 w-12">
                    {pr.distance_label}
                  </span>
                  <span className="text-[13px] font-semibold text-gray-900">{pr.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total activities */}
        <div className="rounded-[var(--radius-card)] border border-white/60 bg-white/70 p-3 flex items-center gap-3">
          <Activity size={20} className="text-[var(--color-accent)]" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
              Total Activities
            </p>
            <p className="text-xl font-bold text-gray-900">{stats.total_activities}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
