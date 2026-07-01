/**
 * Cycle page: sleep, HRV, and menstrual cycle tracking.
 * Unified view correlating sleep quality with cycle phases.
 */
import { useEffect, useState, useCallback } from 'react';
import { format, parseISO, subMonths, addMonths, startOfYear, endOfYear, isSameMonth, differenceInDays, addDays } from 'date-fns';
import { Moon, RefreshCw, ChevronLeft, ChevronRight, Heart, Droplets } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
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

/** Tiny inline sparkline SVG from an array of numbers. */
function Sparkline({ data, color = '#9ca3af', width = 48, height = 16 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="inline-block ml-1.5 opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-500';
}

const PHASE_COLORS: Record<string, string> = {
  menstruation: '#f87171',
  follicular: '#60a5fa',
  ovulation: '#34d399',
  luteal: '#fbbf24',
};

/** Determine phase name from cycle day number. */
function phaseForDay(day: number, cycle: MenstrualCycle): string {
  const periodLen = cycle.period_length ?? 5;
  const cycleLen = cycle.cycle_length ?? 28;
  const rawFertileStart = cycle.fertile_window_start_day ?? 12;
  const fertileStart = rawFertileStart > cycleLen ? 12 : rawFertileStart;
  const fertileLen = cycle.fertile_window_length ?? 5;
  if (day <= periodLen) return 'menstruation';
  if (day < fertileStart) return 'follicular';
  if (day < fertileStart + fertileLen) return 'ovulation';
  return 'luteal';
}

/** Compute cycle phase for a date. Projects forward from last known cycle if date is beyond its end. */
function computePhaseForDate(dateStr: string, cycles: MenstrualCycle[]): string | null {
  if (cycles.length === 0) return null;
  const target = parseISO(dateStr);
  const sorted = [...cycles].sort((a, b) => a.start_date.localeCompare(b.start_date));

  for (let i = 0; i < sorted.length; i++) {
    const cycleStart = parseISO(sorted[i].start_date);
    const cycleEnd = i + 1 < sorted.length
      ? addDays(parseISO(sorted[i + 1].start_date), -1)
      : addDays(cycleStart, (sorted[i].cycle_length ?? 28) - 1);

    if (target >= cycleStart && target <= cycleEnd) {
      const day = differenceInDays(target, cycleStart) + 1;
      return phaseForDay(day, sorted[i]);
    }
  }

  // Project forward from the last known cycle for dates beyond its tracked end
  const last = sorted[sorted.length - 1];
  const lastStart = parseISO(last.start_date);
  if (target >= lastStart) {
    const cycleLen = last.cycle_length ?? 28;
    const day = (differenceInDays(target, lastStart) % cycleLen) + 1;
    return phaseForDay(day, last);
  }
  return null;
}

const PHASE_META: Record<string, { label: string; emoji: string; desc: string; tip: string; why: string }> = {
  menstruation: {
    label: 'Period', emoji: '🔴', desc: 'Rest & recover',
    tip: 'Yoga, light walks, gentle stretching',
    why: 'Hormones at lowest — body is shedding lining. RHR may drop as progesterone clears.',
  },
  follicular: {
    label: 'Follicular', emoji: '🔵', desc: 'Energy rising',
    tip: 'Best time for hard intervals, strength PRs, long runs',
    why: 'Estrogen rises → better recovery, lower RHR, higher HRV. Peak athletic window.',
  },
  ovulation: {
    label: 'Ovulation', emoji: '🟢', desc: 'Peak performance',
    tip: 'Short intense efforts, but watch for joint laxity',
    why: 'Progesterone spikes → raises body temp, RHR increases, HRV drops. Sleep quality may dip.',
  },
  luteal: {
    label: 'Luteal', emoji: '🟡', desc: 'Wind down',
    tip: 'Steady-state cardio, moderate strength, avoid overtraining',
    why: 'Sustained progesterone → elevated RHR, reduced recovery capacity. Prioritise sleep.',
  },
};

type Granularity = 'Month' | 'Year';

interface CycleInfo {
  dayNum: number;
  cycleLen: number;
  phase: string;
  daysUntilNext: number;
  nextPeriod: Date;
  segments: { phase: string; start: number; end: number }[];
  periodLen: number;
}

function CycleTrackerCard({ cycleInfo }: { cycleInfo: CycleInfo }) {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const activeMeta = PHASE_META[cycleInfo.phase];
  const activeColor = PHASE_COLORS[cycleInfo.phase];

  // Progress through current phase
  const currentSeg = cycleInfo.segments.find((s) => s.phase === cycleInfo.phase);
  const phaseProgress = currentSeg
    ? (cycleInfo.dayNum - currentSeg.start) / (currentSeg.end - currentSeg.start + 1)
    : 0;
  const daysLeftInPhase = currentSeg ? currentSeg.end - cycleInfo.dayNum + 1 : 0;

  // SVG progress ring
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = circumference * phaseProgress;

  return (
    <Card className="overflow-visible">
      <div className="flex flex-col gap-3">
        {/* Top row: status + timeline + next period */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Phase ring + info */}
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="relative w-12 h-12 flex-shrink-0">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle
                  cx="26" cy="26" r={radius}
                  fill="none"
                  stroke={activeColor}
                  strokeWidth="3"
                  strokeDasharray={`${strokeDash} ${circumference}`}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-base">
                {activeMeta.emoji}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Day {cycleInfo.dayNum}
                <span className="text-gray-400 font-normal"> / {cycleInfo.cycleLen}</span>
              </p>
              <p className="text-xs text-gray-600">
                {activeMeta.label} <span className="text-gray-400">· {daysLeftInPhase}d left in phase</span>
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5">
                {activeMeta.tip}
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex-1">
            <div className="relative flex h-5">
              <div className="absolute inset-0 rounded-full shadow-inner bg-gray-100" />
              {cycleInfo.segments.map((seg, idx) => {
                const width = ((seg.end - seg.start + 1) / cycleInfo.cycleLen) * 100;
                const isActive = cycleInfo.phase === seg.phase;
                const isSelected = selectedPhase === seg.phase;
                const meta = PHASE_META[seg.phase];
                const isFirst = idx === 0;
                const isLast = idx === cycleInfo.segments.length - 1;
                return (
                  <button
                    key={seg.phase}
                    type="button"
                    className={`relative flex items-center justify-center z-10 transition-all ${isSelected ? 'scale-y-125' : 'hover:scale-y-110'}`}
                    style={{ width: `${width}%` }}
                    onClick={() => setSelectedPhase(isSelected ? null : seg.phase)}
                  >
                    <div
                      className="absolute inset-0 transition-all"
                      style={{
                        backgroundColor: PHASE_COLORS[seg.phase] + (isActive || isSelected ? '' : '80'),
                        opacity: isActive || isSelected ? 1 : 0.5,
                        borderRadius: isFirst ? '9999px 0 0 9999px' : isLast ? '0 9999px 9999px 0' : '0',
                      }}
                    />
                    <span className="relative text-[9px] font-medium text-white drop-shadow-sm truncate px-1">
                      {width > 12 ? meta.label : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Day marker */}
            <div className="relative h-2 mt-0.5">
              <div
                className="absolute w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent border-b-gray-700 transition-all"
                style={{ left: `${((cycleInfo.dayNum - 0.5) / cycleInfo.cycleLen) * 100}%`, transform: 'translateX(-4px) rotate(180deg)' }}
              />
            </div>
          </div>

          {/* Next period */}
          <div className="text-right min-w-[90px]">
            <div className="flex items-center justify-end gap-1.5">
              <Droplets size={13} className="text-rose-400" />
              <span className="text-sm font-semibold text-gray-700">{cycleInfo.daysUntilNext}d</span>
            </div>
            <p className="text-[10px] text-gray-400">
              Next period ~{format(cycleInfo.nextPeriod, 'MMM d')}
            </p>
          </div>
        </div>

        {/* Expanded phase detail (click a segment to show) */}
        {selectedPhase && (
          <div
            className="flex items-start gap-3 p-3 rounded-lg border transition-all animate-in fade-in duration-200"
            style={{ backgroundColor: PHASE_COLORS[selectedPhase] + '10', borderColor: PHASE_COLORS[selectedPhase] + '40' }}
          >
            <span className="text-lg">{PHASE_META[selectedPhase].emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 mb-0.5">
                {PHASE_META[selectedPhase].label}
                <span className="font-normal text-gray-400 ml-1">
                  · days {cycleInfo.segments.find((s) => s.phase === selectedPhase)?.start}–{cycleInfo.segments.find((s) => s.phase === selectedPhase)?.end}
                </span>
              </p>
              <p className="text-[11px] text-gray-600 mb-1">{PHASE_META[selectedPhase].why}</p>
              <p className="text-[11px] text-emerald-700 font-medium"> {PHASE_META[selectedPhase].tip}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPhase(null)}
              className="text-gray-400 hover:text-gray-600 text-xs p-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CyclePage() {
  const [records, setRecords] = useState<SleepRecord[]>([]);
  const [cycles, setCycles] = useState<MenstrualCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('Month');
  const [anchor, setAnchor] = useState<Date>(new Date());

  const getRange = useCallback((g: Granularity, d: Date): { start: string; end: string } => {
    if (g === 'Year') {
      return { start: format(startOfYear(d), 'yyyy-MM-dd'), end: format(endOfYear(d), 'yyyy-MM-dd') };
    }
    // Month: rolling 30-day window ending at anchor date
    return { start: format(subMonths(d, 1), 'yyyy-MM-dd'), end: format(d, 'yyyy-MM-dd') };
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
      await Promise.all([
        sleepApi.sync(granularity === 'Year' ? 365 : 60),
        sleepApi.syncCycles(),
      ]);
      loadData(granularity, anchor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const goBack = () => setAnchor((prev) => granularity === 'Year' ? subMonths(prev, 12) : subMonths(prev, 1));
  const goForward = () => setAnchor((prev) => granularity === 'Year' ? addMonths(prev, 12) : addMonths(prev, 1));
  const goToNow = () => setAnchor(new Date());

  const isCurrentPeriod = granularity === 'Month'
    ? isSameMonth(anchor, new Date())
    : anchor.getFullYear() === new Date().getFullYear();

  const periodLabel = granularity === 'Year'
    ? format(anchor, 'yyyy')
    : `${format(subMonths(anchor, 1), 'MMM d')} – ${format(anchor, 'MMM d, yyyy')}`;

  // Chart data: oldest first (records from API are already ascending)
  const chartData = [...records].map((r) => ({
    date: format(parseISO(r.date), granularity === 'Year' ? 'd/M' : 'd'),
    fullDate: format(parseISO(r.date), 'EEE d MMM'),
    Deep: +((r.deep_sleep_min ?? 0) / 60).toFixed(2),
    Light: +((r.light_sleep_min ?? 0) / 60).toFixed(2),
    REM: +((r.rem_sleep_min ?? 0) / 60).toFixed(2),
    Awake: +((r.awake_min ?? 0) / 60).toFixed(2),
    score: r.sleep_score ?? null,
    hrv: r.hrv_overnight ?? null,
    rhr: r.resting_hr ?? null,
    cycleDay: r.cycle_day ?? null,
    phase: computePhaseForDate(r.date, cycles),
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
  const avgRhr = (() => {
    const wr = records.filter((r) => r.resting_hr != null);
    return wr.length ? Math.round(wr.reduce((s, r) => s + (r.resting_hr ?? 0), 0) / wr.length) : null;
  })();
  const minRhr = (() => {
    const vals = records.map((r) => r.resting_hr).filter((v): v is number => v != null);
    return vals.length ? Math.min(...vals) : null;
  })();
  const maxRhr = (() => {
    const vals = records.map((r) => r.resting_hr).filter((v): v is number => v != null);
    return vals.length ? Math.max(...vals) : null;
  })();

  // Sparkline data (last 7 days, oldest first — records are ascending)
  const last7 = records.slice(-7);
  const sparkScore = last7.map((r) => r.sleep_score).filter((v): v is number => v != null);
  const sparkRhr = last7.map((r) => r.resting_hr).filter((v): v is number => v != null);
  const sparkSleep = last7.map((r) => r.total_sleep_min).filter((v): v is number => v != null);

  const hasCycleData = cycles.length > 0;

  // Current cycle computation
  const currentCycleInfo = (() => {
    if (cycles.length === 0) return null;
    const today = new Date();
    // Find the most recent cycle that started on or before today
    const sorted = [...cycles].sort((a, b) => b.start_date.localeCompare(a.start_date));
    const current = sorted.find((c) => parseISO(c.start_date) <= today);
    if (!current) return null;
    const cycleStart = parseISO(current.start_date);
    let dayNum = differenceInDays(today, cycleStart) + 1;
    const cycleLen = current.cycle_length ?? 28;
    // Wrap day if it exceeds cycle length (gap between tracked cycles)
    if (dayNum > cycleLen) {
      dayNum = ((dayNum - 1) % cycleLen) + 1;
    }
    const periodLen = current.period_length ?? 5;
    // Clamp fertileStart to reasonable range (max cycle day 18 if value seems wrong)
    const rawFertileStart = current.fertile_window_start_day ?? 12;
    const fertileStart = rawFertileStart > cycleLen ? 12 : rawFertileStart;
    const fertileLen = current.fertile_window_length ?? 5;

    // Determine current phase
    let phase: string;
    if (dayNum <= periodLen) phase = 'menstruation';
    else if (dayNum < fertileStart) phase = 'follicular';
    else if (dayNum < fertileStart + fertileLen) phase = 'ovulation';
    else phase = 'luteal';

    // Days until next period
    const daysUntilNext = Math.max(0, cycleLen - dayNum + 1);
    const nextPeriod = addDays(today, daysUntilNext);

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
          <div className="flex items-center gap-1 bg-white/60 rounded-lg border border-white/50 p-0.5">
            {(['Month', 'Year'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  granularity === g ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Avg Sleep</p>
          <p className="text-base font-semibold text-gray-800">{formatHoursMin(avgTotal)}<Sparkline data={sparkSleep} color="#6366f1" /></p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Sleep Score</p>
          <p className={`text-base font-semibold ${scoreColor(avgScore)}`}>{avgScore ?? '—'}<Sparkline data={sparkScore} color="#14b8a6" /></p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Resting HR</p>
          <p className="text-base font-semibold text-rose-600">{avgRhr ?? '—'}<span className="text-[10px] text-gray-400 ml-0.5">bpm</span><Sparkline data={sparkRhr} color="#f43f5e" /></p>
        </Card>
        <Card padding="sm" className="text-center">
          <p className="text-[9px] uppercase text-gray-400 tracking-wider mb-0.5">Total Nights</p>
          <p className="text-base font-semibold text-gray-800">{validRecords.length}</p>
        </Card>
      </div>

      {/* Cycle tracker card */}
      {currentCycleInfo && (
        <CycleTrackerCard cycleInfo={currentCycleInfo} />
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
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#fbbf24]" />Awake</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#a78bfa]" />REM</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#818cf8]" />Light</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#4338ca]" />Deep</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#14b8a6]" />Score</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={chartData} barCategoryGap="15%" margin={{ top: 5, right: 50, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="hours" tick={{ fontSize: 10 }} unit="h" axisLine={false} tickLine={false} domain={[0, (max: number) => Math.ceil(max + 0.5)]} />
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
                  <ReferenceLine yAxisId="hours" y={avgTotalHours} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" label={{ value: `Avg ${formatHoursMin(avgTotal!)}`, position: 'right', fontSize: 9, fill: '#6b7280', offset: 5 }} />
                )}
                <Bar yAxisId="hours" dataKey="Deep" stackId="sleep" fill="#4338ca" radius={[0, 0, 0, 0]} />
                <Bar yAxisId="hours" dataKey="Light" stackId="sleep" fill="#818cf8" />
                <Bar yAxisId="hours" dataKey="REM" stackId="sleep" fill="#a78bfa" />
                <Bar yAxisId="hours" dataKey="Awake" stackId="sleep" fill="#fbbf24" radius={[2, 2, 0, 0]} />
                <Line yAxisId="score" type="monotone" dataKey="score" stroke="#14b8a6" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Resting HR + Score with cycle phase bands */}
          {chartData.some((d) => d.rhr != null) && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Heart size={14} className="text-rose-500" />
                  <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Resting HR & Cycle Phases</h2>
                </div>
                <div className="flex gap-2 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />RHR</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" />Score</span>
                  {Object.entries(PHASE_META).map(([p, m]) => (
                    <span key={p} className="flex items-center gap-0.5">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: PHASE_COLORS[p] + '60' }} />
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 40, bottom: 0, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="rhr" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} label={{ value: 'RHR (bpm)', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#6b7280', offset: 10 }} />
                  <YAxis yAxisId="score" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: 'Score', angle: 90, position: 'insideRight', fontSize: 9, fill: '#6b7280', offset: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(value, name) => {
                      if (name === 'Score') return [`${value}`, 'Score'];
                      return [`${value} bpm`, 'Resting HR'];
                    }}
                    labelFormatter={(label) => {
                      const item = chartData.find((d) => d.date === label);
                      const phaseLabel = item?.phase ? ` — ${PHASE_META[item.phase]?.label}` : '';
                      return (item?.fullDate ?? label) + phaseLabel;
                    }}
                  />
                  {avgRhr != null && (
                    <ReferenceLine yAxisId="rhr" y={avgRhr} stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 3" label={{ value: `Avg ${avgRhr}`, position: 'insideTopLeft', fontSize: 9, fill: '#6b7280' }} />
                  )}
                  {minRhr != null && (
                    <ReferenceLine yAxisId="rhr" y={minRhr} stroke="#9ca3af" strokeWidth={0.8} strokeDasharray="3 2" label={{ value: `Low ${minRhr}`, position: 'insideBottomLeft', fontSize: 9, fill: '#6b7280' }} />
                  )}
                  {maxRhr != null && (
                    <ReferenceLine yAxisId="rhr" y={maxRhr} stroke="#9ca3af" strokeWidth={0.8} strokeDasharray="3 2" label={{ value: `High ${maxRhr}`, position: 'insideTopLeft', fontSize: 9, fill: '#6b7280' }} />
                  )}
                  {/* Phase background bands */}
                  {(() => {
                    const bands: { startIdx: number; endIdx: number; phase: string }[] = [];
                    let curPhase: string | null = null;
                    let bandStart = 0;
                    chartData.forEach((d, i) => {
                      if (d.phase !== curPhase) {
                        if (curPhase) bands.push({ startIdx: bandStart, endIdx: i - 1, phase: curPhase });
                        curPhase = d.phase;
                        bandStart = i;
                      }
                    });
                    if (curPhase) bands.push({ startIdx: bandStart, endIdx: chartData.length - 1, phase: curPhase });
                    return bands.filter((b) => b.phase).map((b, i) => (
                      <ReferenceArea
                        key={i}
                        yAxisId="rhr"
                        x1={chartData[b.startIdx].date}
                        x2={chartData[b.endIdx].date}
                        fill={PHASE_COLORS[b.phase] + '30'}
                        fillOpacity={1}
                        strokeOpacity={0}
                      />
                    ));
                  })()}
                  <Line yAxisId="rhr" type="monotone" dataKey="rhr" name="RHR" stroke="#f43f5e" strokeWidth={2} dot={{ r: 2, fill: '#f43f5e' }} connectNulls />
                  <Line yAxisId="score" type="monotone" dataKey="score" name="Score" stroke="#14b8a6" strokeWidth={1.5} dot={false} connectNulls />
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
            <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Night Details</h2>
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
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
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
                        {(() => {
                          const phase = computePhaseForDate(r.date, cycles);
                          return phase ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium text-gray-700"
                            style={{ backgroundColor: PHASE_COLORS[phase] + '40', borderLeft: `3px solid ${PHASE_COLORS[phase]}` }}
                          >
                            {PHASE_META[phase]?.label ?? phase}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        );
                        })()}
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
