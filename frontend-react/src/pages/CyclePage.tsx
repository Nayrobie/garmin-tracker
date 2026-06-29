/**
 * Cycle page: sleep tracking and future menstrual cycle tracking.
 * Displays sleep stages (deep, light, REM, awake), score, and trends.
 */
import { useEffect, useState, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear, endOfYear, isSameMonth } from 'date-fns';
import { Moon, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';

import type { SleepRecord } from '../types';
import { sleepApi } from '../api/sleep';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

function formatHoursMin(min: number | null): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`;
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-500';
}

type Granularity = 'month' | 'year';

export function CyclePage() {
  const [records, setRecords] = useState<SleepRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());

  const getRange = useCallback((g: Granularity, d: Date): { start: string; end: string } => {
    if (g === 'year') {
      return { start: format(startOfYear(d), 'yyyy-MM-dd'), end: format(endOfYear(d), 'yyyy-MM-dd') };
    }
    return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') };
  }, []);

  const loadData = useCallback((g: Granularity, d: Date) => {
    setLoading(true);
    const { start, end } = getRange(g, d);
    sleepApi
      .getRecords(start, end)
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [getRange]);

  useEffect(() => {
    loadData(granularity, anchor);
  }, [granularity, anchor, loadData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await sleepApi.sync(granularity === 'year' ? 365 : 60);
      loadData(granularity, anchor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const goBack = () => {
    setAnchor((prev) => granularity === 'year' ? subMonths(prev, 12) : subMonths(prev, 1));
  };
  const goForward = () => {
    setAnchor((prev) => granularity === 'year' ? addMonths(prev, 12) : addMonths(prev, 1));
  };
  const goToNow = () => setAnchor(new Date());

  const isCurrentPeriod = granularity === 'month'
    ? isSameMonth(anchor, new Date())
    : anchor.getFullYear() === new Date().getFullYear();

  const periodLabel = granularity === 'year'
    ? format(anchor, 'yyyy')
    : format(anchor, 'MMMM yyyy');

  // Chart data: oldest first, values in hours
  const chartData = [...records].reverse().map((r) => ({
    date: format(parseISO(r.date), 'd MMM'),
    Deep: +((r.deep_sleep_min ?? 0) / 60).toFixed(2),
    Light: +((r.light_sleep_min ?? 0) / 60).toFixed(2),
    REM: +((r.rem_sleep_min ?? 0) / 60).toFixed(2),
    Awake: +((r.awake_min ?? 0) / 60).toFixed(2),
    score: r.sleep_score ?? null,
  }));

  // Averages
  const withTotal = records.filter((r) => r.total_sleep_min != null);
  const avgTotal = withTotal.length
    ? Math.round(withTotal.reduce((s, r) => s + (r.total_sleep_min ?? 0), 0) / withTotal.length)
    : null;
  const avgTotalHours = avgTotal != null ? +(avgTotal / 60).toFixed(2) : null;
  const withScore = records.filter((r) => r.sleep_score != null);
  const avgScore = withScore.length
    ? Math.round(withScore.reduce((s, r) => s + (r.sleep_score ?? 0), 0) / withScore.length)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Cycle</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {(['month', 'year'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  granularity === g
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={handleSync} loading={syncing}>
            <RefreshCw size={13} />
            Sync
          </Button>
        </div>
      </div>

      {/* Period navigation */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={goBack} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center capitalize">
          {periodLabel}
        </span>
        <button onClick={goForward} disabled={isCurrentPeriod} className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={18} />
        </button>
        {!isCurrentPeriod && (
          <button onClick={goToNow} className="ml-1 px-2 py-0.5 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
            This {granularity}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card padding="sm" className="text-center">
            <p className="text-[10px] uppercase text-gray-400 tracking-wider">Avg Sleep</p>
            <p className="text-lg font-semibold text-gray-800">{formatHoursMin(avgTotal)}</p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-[10px] uppercase text-gray-400 tracking-wider">Avg Score</p>
            <p className={`text-lg font-semibold ${scoreColor(avgScore)}`}>
              {avgScore ?? '—'}
            </p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-[10px] uppercase text-gray-400 tracking-wider">Nights</p>
            <p className="text-lg font-semibold text-gray-800">{records.length}</p>
          </Card>
          <Card padding="sm" className="text-center">
            <p className="text-[10px] uppercase text-gray-400 tracking-wider">Last Night</p>
            <p className="text-lg font-semibold text-gray-800">
              {records[0] ? formatHoursMin(records[0].total_sleep_min) : '—'}
            </p>
          </Card>
        </div>

        {/* Stacked bar chart */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Moon size={16} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-700">Sleep Stages</h2>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">Loading...</div>
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-gray-400">
              No sleep data. Sync from Garmin to get started.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barCategoryGap="20%">
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="h" label={{ value: 'hours', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip
                  formatter={(value) => [`${formatHoursMin(Math.round(Number(value) * 60))}`]}
                  labelStyle={{ fontSize: 12 }}
                />
                {/* @ts-expect-error recharts Legend payload typing issue */}
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} payload={[
                  { value: 'Awake', type: 'square', color: '#fbbf24' },
                  { value: 'REM', type: 'square', color: '#a78bfa' },
                  { value: 'Light', type: 'square', color: '#818cf8' },
                  { value: 'Deep', type: 'square', color: '#4338ca' },
                ]} />
                {avgTotalHours != null && (
                  <ReferenceLine
                    y={avgTotalHours}
                    stroke="#9ca3af"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    label={{ value: `avg ${formatHoursMin(avgTotal)}`, position: 'right', fontSize: 9, fill: '#6b7280' }}
                  />
                )}
                <Bar dataKey="Deep" stackId="sleep" fill="#4338ca" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Light" stackId="sleep" fill="#818cf8" />
                <Bar dataKey="REM" stackId="sleep" fill="#a78bfa" />
                <Bar dataKey="Awake" stackId="sleep" fill="#fbbf24" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Sleep score chart */}
        {chartData.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Sleep Score</h2>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip labelStyle={{ fontSize: 12 }} />
                {avgScore != null && (
                  <ReferenceLine
                    y={avgScore}
                    stroke="#9ca3af"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    label={{ value: `avg ${avgScore}`, position: 'right', fontSize: 9, fill: '#6b7280' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#6366f1' }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Recent nights table */}
        {records.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Recent Nights</h2>
            <div className="overflow-y-auto max-h-[240px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white/80 backdrop-blur-sm">
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    <th className="pb-2 pr-2">Date</th>
                    <th className="pb-2 pr-2">Time</th>
                    <th className="pb-2 pr-2 text-right">Total</th>
                    <th className="pb-2 pr-2 text-right">Deep</th>
                    <th className="pb-2 pr-2 text-right">Light</th>
                    <th className="pb-2 pr-2 text-right">REM</th>
                    <th className="pb-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-white/40">
                      <td className="py-1.5 pr-2 text-gray-700">{format(parseISO(r.date), 'EEE d MMM')}</td>
                      <td className="py-1.5 pr-2 text-gray-500 text-xs">
                        {r.start_time && r.end_time ? `${r.start_time}–${r.end_time}` : '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-right font-medium text-gray-800">{formatHoursMin(r.total_sleep_min)}</td>
                      <td className="py-1.5 pr-2 text-right text-indigo-700">{formatHoursMin(r.deep_sleep_min)}</td>
                      <td className="py-1.5 pr-2 text-right text-indigo-400">{formatHoursMin(r.light_sleep_min)}</td>
                      <td className="py-1.5 pr-2 text-right text-purple-500">{formatHoursMin(r.rem_sleep_min)}</td>
                      <td className={`py-1.5 text-right font-semibold ${scoreColor(r.sleep_score)}`}>
                        {r.sleep_score ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
