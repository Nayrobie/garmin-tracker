/**
 * Health page: body composition trends from Feelfit import.
 * Charts weight, body fat %, muscle mass, and BMI over time.
 * Granularity: 1M (last 30 days), 1Y (last 12 months), All time.
 */
import { useEffect, useState } from 'react';
import { format, subMonths, subYears } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card } from '../components/ui/Card';
import { fetchBodyComposition } from '../api/bodyComposition';
import type { BodyCompositionRecord } from '../types';

// ── granularity ───────────────────────────────────────────────────────────────

type Granularity = '1M' | '1Y' | 'all';

function filterRecords(records: BodyCompositionRecord[], g: Granularity): BodyCompositionRecord[] {
  if (g === 'all') return records;
  const now = new Date();
  const cutoff = g === '1Y' ? subYears(now, 1) : subMonths(now, 1);
  return records.filter((r) => new Date(r.measured_at) >= cutoff);
}

function dateFormat(g: Granularity): string {
  return g === '1M' ? 'd MMM' : "MMM ''yy";
}

// ── chart data ────────────────────────────────────────────────────────────────

interface ChartPoint {
  date: string;
  isoDate: string;
  weight: number;
  bodyFat: number | null;
  muscleMass: number | null;
  bmi: number | null;
}

function toChartPoints(records: BodyCompositionRecord[], g: Granularity): ChartPoint[] {
  const fmt = dateFormat(g);
  return records.map((r) => ({
    date: format(new Date(r.measured_at), fmt),
    isoDate: r.measured_at,
    weight: r.weight_kg,
    bodyFat: r.body_fat_pct,
    muscleMass: r.muscle_mass_kg,
    bmi: r.bmi,
  }));
}

/** Returns the first data point for each year — used to draw year labels in All view. */
function yearBoundaries(points: ChartPoint[]): { date: string; year: number }[] {
  const out: { date: string; year: number }[] = [];
  let last: number | null = null;
  for (const p of points) {
    const y = new Date(p.isoDate).getFullYear();
    if (y !== last) { out.push({ date: p.date, year: y }); last = y; }
  }
  return out;
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, unit, delta, prevLabel }: {
  label: string;
  value: number | null;
  unit: string;
  delta: number | null;
  prevLabel: string | null;
}) {
  if (value == null) return null;
  return (
    <Card>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">
        {value.toFixed(1)}<span className="text-base font-normal text-gray-500 ml-1">{unit}</span>
      </p>
      {delta != null && prevLabel && (
        <p className={`text-xs mt-1 font-medium ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-green-600' : 'text-gray-400'}`}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {Math.abs(delta).toFixed(1)}{unit ? ` ${unit}` : ''} vs {prevLabel}
        </p>
      )}
    </Card>
  );
}

// ── granularity toggle ────────────────────────────────────────────────────────

function GranularityBar({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  const opts: { key: Granularity; label: string }[] = [
    { key: '1M', label: '1M' },
    { key: '1Y', label: '1Y' },
    { key: 'all', label: 'All' },
  ];
  return (
    <div className="flex gap-1 bg-white/60 rounded-lg border border-white/50 p-0.5">
      {opts.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
            value === key ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── trend chart ───────────────────────────────────────────────────────────────

function TrendChart({ data, dataKey, label, unit, color, referenceValue, granularity }: {
  data: ChartPoint[];
  dataKey: keyof ChartPoint;
  label: string;
  unit: string;
  color: string;
  referenceValue?: number;
  granularity: Granularity;
}) {
  const boundaries = granularity === 'all' ? yearBoundaries(data) : [];

  return (
    <Card>
      <p className="text-sm font-medium text-gray-700 mb-3">{label}</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: granularity === 'all' ? 18 : 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} domain={['auto', 'auto']} />
          <Tooltip
            formatter={(v) => {
              const num = typeof v === 'number' ? v.toFixed(1) : v;
              return [`${num}${unit ? ` ${unit}` : ''}`, label];
            }}
            labelStyle={{ fontSize: 12 }}
            contentStyle={{ fontSize: 12 }}
          />
          {referenceValue != null && (
            <ReferenceLine y={referenceValue} stroke="#d1d5db" strokeDasharray="4 4" />
          )}
          {boundaries.map((b) => (
            <ReferenceLine
              key={b.year}
              x={b.date}
              stroke="#e5e7eb"
              label={{ value: String(b.year), position: 'top', fontSize: 11, fill: '#6b7280', fontWeight: 600 }}
            />
          ))}
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export function HealthPage() {
  const [records, setRecords] = useState<BodyCompositionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('1Y');

  useEffect(() => {
    fetchBodyComposition()
      .then(setRecords)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Health</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Health</h1>
        <Card><p className="text-sm text-red-500">{error}</p></Card>
      </div>
    );
  }

  const latest = records[records.length - 1] ?? null;
  const prev = records[records.length - 2] ?? null;
  const prevLabel = prev ? format(new Date(prev.measured_at), "MMM ''yy") : null;

  const delta = (key: keyof BodyCompositionRecord): number | null => {
    const l = latest?.[key] as number | null | undefined;
    const p = prev?.[key] as number | null | undefined;
    return l != null && p != null ? l - p : null;
  };

  const filtered = filterRecords(records, granularity);
  const points = toChartPoints(filtered, granularity);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-gray-900">Health</h1>
        <GranularityBar value={granularity} onChange={setGranularity} />
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Body composition · {records.length} measurements ·{' '}
        {records[0] ? format(new Date(records[0].measured_at), 'MMM yyyy') : ''} →{' '}
        {latest ? format(new Date(latest.measured_at), 'MMM yyyy') : ''}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <StatCard label="Weight" value={latest?.weight_kg ?? null} unit="kg" delta={delta('weight_kg')} prevLabel={prevLabel} />
        <StatCard label="Body Fat" value={latest?.body_fat_pct ?? null} unit="%" delta={delta('body_fat_pct')} prevLabel={prevLabel} />
        <StatCard label="Muscle Mass" value={latest?.muscle_mass_kg ?? null} unit="kg" delta={delta('muscle_mass_kg')} prevLabel={prevLabel} />
        <StatCard label="BMI" value={latest?.bmi ?? null} unit="" delta={delta('bmi')} prevLabel={prevLabel} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TrendChart data={points} dataKey="weight" label="Weight (kg)" unit="kg" color="#6366f1" granularity={granularity} />
        <TrendChart data={points} dataKey="bodyFat" label="Body Fat (%)" unit="%" color="#f59e0b" granularity={granularity} />
        <TrendChart data={points} dataKey="muscleMass" label="Muscle Mass (kg)" unit="kg" color="#10b981" granularity={granularity} />
        <TrendChart data={points} dataKey="bmi" label="BMI" unit="" color="#8b5cf6" referenceValue={22.5} granularity={granularity} />
      </div>
    </div>
  );
}




