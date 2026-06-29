/**
 * Cycle page: sleep, HRV, and menstrual cycle tracking.
 * Unified view correlating sleep quality with cycle phases.
 */
import { useEffect, useState, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, subMonths, addMonths, startOfYear, endOfYear, isSameMonth, differenceInDays, addDays } from 'date-fns';
import { Moon, RefreshCw, ChevronLeft, ChevronRight, Heart, Activity, Droplets } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

import type { SleepRecord, MenstrualCycle } from '../types';
import { sleepApi } from '../api/sleep';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-gray-100';
  if (score >= 80) return 'bg-green-50';
  if (score >= 60) return 'bg-yellow-50';
  return 'bg-red-50';
}

const PHASE_COLORS: Record<string, string> = {
  menstruation: '#f87171',
  follicular: '#60a5fa',
  ovulation: '#34d399',
  luteal: '#fbbf24',
};

const PHASE_META: Record<string, { label: string; emoji: string; desc: string }> = {
  menstruation: { label: 'Period', emoji: '🔴', desc: 'Rest & recover' },
  follicular: { label: 'Follicular', emoji: '🔵', desc: 'Energy rising' },
  ovulation: { label: 'Ovulation', emoji: '🟢', desc: 'Peak performance' },
  luteal: { label: 'Luteal', emoji: '🟡', desc: 'Wind down' },
};

type Granularity = 'month' | 'year';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CyclePage() {
  const [records, setRecords] = useState<SleepRecord[]>([]);
  const [cycles, setCycles] = useState<MenstrualCycle[]>([]);
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
    Promise.all([
      sleepApi.getRecords(start, end),
      sleepApi.getCycles(),
    ])
      .then(([sleepData, cycleData]) => {
        setRecords(sleepData);
        setCycles(cycleData);
      })
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

  const goBack = () => setAnchor((prev) => granularity === 'year' ? subMonths(prev, 12) : subMonths(prev, 1));
  const goForward = () => setAnchor((prev) => granularity === 'year' ? addMonths(prev, 12) : addMonths(prev, 1));
  const goToNow = () => setAnchor(new Date());

  const isCurrentPeriod = granularity === 'month'
    ? isSameMonth(anchor, new Date())
    : anchor.getFullYear() === new Date().getFullYear();

  const periodLabel = granularity === 'year' ? format(anchor, 'yyyy') : format(anchor, 'MMMM yyyy');

  // Chart data: oldest first
  const chartData = [...records].reverse().map((r) => ({
    date: format(parseISO(r.date), granularity === 'year' ? 'd/M' : 'd'),
    fullDate: format(parseISO(r.date), 'EEE d MMM'),
    Deep: +((r.deep_sleep_min ?? 0) / 60).toFixed(2),
    Light: +((r.light_sleep_min ?? 0) / 60).toFixed(2),
    REM: +((r.rem_sleep_min ?? 0) / 60).toFixed(2),
    Awake: +((r.awake_min ?? 0) / 60).toFixed(2),
    score: r.sleep_score ?? null,
    hrv: r.hrv_overnight ?? null,
    rhr: r.resting_hr ?? null,
    cycleDay: r.cycle_day ?? null,
    phase: r.cycle_phase ?? null,
  }));

  // Computed stats
  const validRecords = records.filter((r) => r.total_sleep_min != null);
  const avgTotal = validRecords.length
    ? Math.round(validRecords.reduce((s, r) => s + (r.total_sleep_min ?? 0), 0) / validRecords.length)
    : null;
  const avgTotalHours = avgTotal != null ? +(avgTotal / 60).toFixed(2) : null;
  const avgScore = (() => {
    const ws = records.filter((r) => r.sleep_score != null);
    return ws.length ? Math.round(ws.reduce((s, r) => s + (r.sleep_score ?? 0), 0) / ws.length) : null;
  })();
  const avgHrv = (() => {
    const wh = records.filter((r) => r.hrv_overnight != null);
    return wh.length ? Math.round(wh.reduce((s, r) => s + (r.hrv_overnight ?? 0), 0) / wh.length) : null;
  })();
  const avgRhr = (() => {
    const wr = records.filter((r) => r.resting_hr != null);
    return wr.length ? Math.round(wr.reduce((s, r) => s + (r.resting_hr ?? 0), 0) / wr.length) : null;
  })();

  const hasCycleData = records.some((r) => r.cycle_phase != null);

  // Current cycle computation
  const currentCycleInfo = (() => {
    if (cycles.length === 0) return null;
    const today = new Date();
    // Find the most recent cycle that started on or before today
    const sorted = [...cycles].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const current = sorted.find((c) => parseISO(c.start_date) <= today);
    if (!current) return null;
    const cycleStart = parseISO(current.start_date);
    const dayNum = differenceInDays(today, cycleStart) + 1;
    const cycleLen = current.cycle_length ?? 28;
    const periodLen = current.period_length ?? 5;
    const fertileStart = current.fertile_window_start_day ?? 12;
    const fertileLen = current.fertile_window_length ?? 5;

    // Determine current phase
    let phase: string;
    if (dayNum <= periodLen) phase = 'menstruation';
    else if (dayNum < fertileStart) phase = 'follicular';
    else if (dayNum < fertileStart + fertileLen) phase = 'ovulation';
    else phase = 'luteal';

    // Days until next period
    const daysUntilNext = Math.max(0, cycleLen - dayNum + 1);
    const nextPeriod = addDays(cycleStart, cycleLen);

    // Phase segments for timeline (proportional widths)
    const segments = [
      { phase: 'menstruation', start: 1, end: periodLen },
      { phase: 'follicular', start: periodLen + 1, end: fertileStart - 1 },
      { phase: 'ovulation', start: fertileStart, end: fertileStart + fertileLen - 1 },
      { phase: 'luteal', start: fertileStart + fertileLen, end: cycleLen },
    ];

    return { dayNum, cycleLen, phase, daysUntilNext, nextPeriod, segments, periodLen };
  })();

  return (
    <div className="space-y-4">
      {/* Header: title + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-900">Cycle & Sleep</h1>
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={goBack} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-600 min-w-[100px] text-center capitalize">{periodLabel}</span>
            <button onClick={goForward} disabled={isCurrentPeriod} className="p-1 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-20">
              <ChevronRight size={16} />
            </button>
            {!isCurrentPeriod && (
              <button onClick={goToNow} className="ml-1 px-2 py-0.5 text-[11px] rounded bg-gray-100 text-gray-500 hover:bg-gray-200">
                Today
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-[11px]">
            {(['month', 'year'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 capitalize ${
                  granularity === g ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={handleSync} loading={syncing}>
            <RefreshCw size={12} />
            Sync
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Avg Sleep</p>
          <p className="text-base font-semibold text-gray-800">{formatHoursMin(avgTotal)}</p>
        </Card>
        <Card padding="sm" className={`text-center ${scoreBg(avgScore)}`}>
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Score</p>
          <p className={`text-base font-semibold ${scoreColor(avgScore)}`}>{avgScore ?? '—'}</p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">HRV</p>
          <p className="text-base font-semibold text-emerald-600">{avgHrv ?? '—'}<span className="text-[10px] text-gray-400 ml-0.5">ms</span></p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Resting HR</p>
          <p className="text-base font-semibold text-amber-600">{avgRhr ?? '—'}<span className="text-[10px] text-gray-400 ml-0.5">bpm</span></p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Nights</p>
          <p className="text-base font-semibold text-gray-800">{validRecords.length}</p>
        </Card>
      </div>

      {/* Cycle tracker card */}
      {currentCycleInfo && (
        <Card className="overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Current status */}
            <div className="flex items-center gap-3 min-w-[180px]">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg shadow-sm"
                style={{ backgroundColor: PHASE_COLORS[currentCycleInfo.phase] + '33', borderColor: PHASE_COLORS[currentCycleInfo.phase], borderWidth: 2 }}
              >
                {PHASE_META[currentCycleInfo.phase].emoji}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Day {currentCycleInfo.dayNum}
                  <span className="text-gray-400 font-normal"> / {currentCycleInfo.cycleLen}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {PHASE_META[currentCycleInfo.phase].label} — {PHASE_META[currentCycleInfo.phase].desc}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="flex-1">
              <div className="flex rounded-full overflow-hidden h-4 shadow-inner bg-gray-100">
                {currentCycleInfo.segments.map((seg) => {
                  const width = ((seg.end - seg.start + 1) / currentCycleInfo.cycleLen) * 100;
                  const isActive = currentCycleInfo.phase === seg.phase;
                  return (
                    <div
                      key={seg.phase}
                      className="relative flex items-center justify-center transition-all"
                      style={{
                        width: `${width}%`,
                        backgroundColor: PHASE_COLORS[seg.phase] + (isActive ? '' : '80'),
                        opacity: isActive ? 1 : 0.55,
                      }}
                      title={`${PHASE_META[seg.phase].label}: days ${seg.start}–${seg.end}`}
                    >
                      {width > 12 && (
                        <span className="text-[9px] font-medium text-white drop-shadow-sm truncate px-1">
                          {PHASE_META[seg.phase].label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Day marker */}
              <div className="relative h-2 mt-0.5">
                <div
                  className="absolute w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent border-b-gray-700"
                  style={{ left: `${((currentCycleInfo.dayNum - 0.5) / currentCycleInfo.cycleLen) * 100}%`, transform: 'translateX(-4px) rotate(180deg)' }}
                />
              </div>
            </div>

            {/* Next period */}
            <div className="text-right min-w-[90px]">
              <div className="flex items-center justify-end gap-1.5">
                <Droplets size={13} className="text-rose-400" />
                <span className="text-sm font-semibold text-gray-700">{currentCycleInfo.daysUntilNext}d</span>
              </div>
              <p className="text-[10px] text-gray-400">
                Next period ~{format(currentCycleInfo.nextPeriod, 'MMM d')}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Phase strip on charts (when viewing historical data without current cycle card) */}
      {hasCycleData && !currentCycleInfo && (
        <div>
          <div className="flex rounded-full overflow-hidden h-3 shadow-sm">
            {chartData.map((d, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ backgroundColor: d.phase ? PHASE_COLORS[d.phase] : '#f3f4f6' }}
                title={d.phase ? `${d.fullDate} – Day ${d.cycleDay} (${d.phase})` : d.fullDate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main chart: Sleep stages + Score overlay */}
      {loading ? (
        <Card>
          <div className="h-52 flex items-center justify-center text-sm text-gray-400">Loading...</div>
        </Card>
      ) : chartData.length === 0 ? (
        <Card>
          <div className="h-52 flex items-center justify-center text-sm text-gray-400">
            No sleep data. Sync from Garmin to get started.
          </div>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Moon size={14} className="text-indigo-500" />
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Sleep Duration & Score</h2>
              </div>
              <div className="flex gap-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#4338ca]" />Deep</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#818cf8]" />Light</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#a78bfa]" />REM</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#fbbf24]" />Awake</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6366f1]" />Score</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} barCategoryGap="15%" margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="hours" tick={{ fontSize: 10 }} unit="h" axisLine={false} tickLine={false} domain={[0, 'dataMax + 1']} />
                <YAxis yAxisId="score" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(value, name) => {
                    if (name === 'score') return [`${value}`, 'Score'];
                    return [`${formatHoursMin(Math.round(Number(value) * 60))}`, name as string];
                  }}
                  labelFormatter={(label) => {
                    const item = chartData.find((d) => d.date === label);
                    return item?.fullDate ?? label;
                  }}
                />
                {avgTotalHours != null && (
                  <ReferenceLine yAxisId="hours" y={avgTotalHours} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />
                )}
                <Bar yAxisId="hours" dataKey="Deep" stackId="sleep" fill="#4338ca" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="hours" dataKey="Light" stackId="sleep" fill="#818cf8" />
                <Bar yAxisId="hours" dataKey="REM" stackId="sleep" fill="#a78bfa" />
                <Bar yAxisId="hours" dataKey="Awake" stackId="sleep" fill="#fbbf24" radius={[2, 2, 0, 0]} />
                <Line yAxisId="score" type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* HRV & Resting HR */}
          {chartData.some((d) => d.hrv != null) && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-emerald-500" />
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">HRV & Resting Heart Rate</h2>
                </div>
                <div className="flex gap-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />HRV</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />RHR</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="hrv" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                  <YAxis yAxisId="rhr" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(value, name) => [`${value}${name === 'HRV' ? ' ms' : ' bpm'}`, name as string]}
                    labelFormatter={(label) => {
                      const item = chartData.find((d) => d.date === label);
                      return item?.fullDate ?? label;
                    }}
                  />
                  {avgHrv != null && (
                    <ReferenceLine yAxisId="hrv" y={avgHrv} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" />
                  )}
                  <Line yAxisId="hrv" type="monotone" dataKey="hrv" name="HRV" stroke="#10b981" strokeWidth={2} dot={{ r: 2, fill: '#10b981' }} connectNulls />
                  <Line yAxisId="rhr" type="monotone" dataKey="rhr" name="RHR" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 1.5, fill: '#f59e0b' }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}

      {/* Recent nights table */}
      {records.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <Heart size={14} className="text-rose-400" />
            <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Nightly Details</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="overflow-y-auto max-h-[220px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white/90 backdrop-blur-sm">
                  <tr className="text-left text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3">Bed</th>
                    <th className="pb-2 pr-3 text-right">Sleep</th>
                    <th className="pb-2 pr-3 text-right">Score</th>
                    <th className="pb-2 pr-3 text-right">HRV</th>
                    <th className="pb-2 pr-3 text-right">RHR</th>
                    <th className="pb-2 text-center">Cycle</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-1.5 pr-3 text-gray-700 whitespace-nowrap">{format(parseISO(r.date), 'EEE d')}</td>
                      <td className="py-1.5 pr-3 text-gray-400 whitespace-nowrap">
                        {r.start_time && r.end_time ? `${r.start_time}–${r.end_time}` : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-medium text-gray-800">{formatHoursMin(r.total_sleep_min)}</td>
                      <td className={`py-1.5 pr-3 text-right font-semibold ${scoreColor(r.sleep_score)}`}>
                        {r.sleep_score ?? '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-emerald-600 font-medium">{r.hrv_overnight ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-right text-amber-600">{r.resting_hr ?? '—'}</td>
                      <td className="py-1.5 text-center">
                        {r.cycle_phase ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium text-gray-700"
                            style={{ backgroundColor: PHASE_COLORS[r.cycle_phase] + '40', borderLeft: `3px solid ${PHASE_COLORS[r.cycle_phase]}` }}
                          >
                            {PHASE_META[r.cycle_phase]?.label ?? r.cycle_phase}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
