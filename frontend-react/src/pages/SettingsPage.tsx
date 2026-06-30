/**
 * Settings page: user-configurable hyper-parameters persisted in the database,
 * organised into grouped sections (races, paces, volume, schedule, durations, sync).
 */
import { useEffect, useState, useCallback } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { RaceManager } from '../components/races/RaceManager';
import { settingsApi } from '../api/settings';
import type { UserSettings, UserSettingsUpdate } from '../types';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const inputClass =
  'w-full h-9 px-3 text-sm rounded-xl bg-white/70 border border-black/10 ' +
  'text-gray-800 placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-colors';

const segmentClass = (active: boolean) =>
  [
    'flex-1 h-9 rounded-xl text-sm font-medium border transition-colors',
    active
      ? 'bg-[var(--color-accent)] text-white border-transparent'
      : 'bg-white/70 text-gray-700 border-black/10 hover:bg-white',
  ].join(' ');

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-gray-500 tracking-wide">{label}</span>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </label>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SaveButton({ state, onClick }: { state: SaveState; onClick: () => void }) {
  return (
    <Button
      variant="primary"
      size="sm"
      onClick={onClick}
      disabled={state === 'saving'}
      className="min-w-[80px]"
    >
      {state === 'saving' && <Loader2 size={14} className="animate-spin" />}
      {state === 'saved' && <Check size={14} />}
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save'}
    </Button>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  const load = useCallback(async () => {
    try {
      const data = await settingsApi.get();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSection = async (section: string, updates: UserSettingsUpdate) => {
    setSaveStates(s => ({ ...s, [section]: 'saving' }));
    try {
      const updated = await settingsApi.update(updates);
      setSettings(updated);
      setSaveStates(s => ({ ...s, [section]: 'saved' }));
      setTimeout(() => setSaveStates(s => ({ ...s, [section]: 'idle' })), 2000);
    } catch {
      setSaveStates(s => ({ ...s, [section]: 'error' }));
    }
  };

  const update = (field: keyof UserSettings, value: UserSettings[keyof UserSettings]) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Settings</h1>
        <Card>
          <p className="text-sm text-red-500">{error ?? 'Failed to load settings'}</p>
          <Button variant="secondary" size="sm" onClick={load} className="mt-2">Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

      {/* ── Races ── */}
      <Card>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">Races</h2>
          <p className="text-xs text-gray-500 mt-1">
            Add, edit, or remove your target races. The training plan auto-tapers before race weeks.
          </p>
        </div>
        <RaceManager open={false} onClose={() => {}} inline />
      </Card>

      {/* ── Paces ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">Paces</h2>
          <SaveButton
            state={saveStates['paces'] ?? 'idle'}
            onClick={() => saveSection('paces', {
              pace_easy: settings.pace_easy,
              pace_intervals: settings.pace_intervals,
              pace_long: settings.pace_long,
            })}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Easy pace (min/km)" hint="Zone 2 — 75% VMA">
            <input
              type="text"
              placeholder="e.g. 7:30"
              value={settings.pace_easy}
              onChange={e => update('pace_easy', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Interval pace (min/km)" hint="100% VMA — max aerobic effort">
            <input
              type="text"
              placeholder="e.g. 5:00"
              value={settings.pace_intervals}
              onChange={e => update('pace_intervals', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Long run pace (min/km)" hint="85% VMA — 10k race pace">
            <input
              type="text"
              placeholder="e.g. 6:00"
              value={settings.pace_long}
              onChange={e => update('pace_long', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {/* ── Training Volume ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">Training Volume</h2>
          <SaveButton
            state={saveStates['volume'] ?? 'idle'}
            onClick={() => saveSection('volume', {
              dist_easy_pct: settings.dist_easy_pct,
              dist_short_pct: settings.dist_short_pct,
              dist_long_pct: settings.dist_long_pct,
              max_long_run_km: settings.max_long_run_km,
              max_weekly_volume_increase_pct: settings.max_weekly_volume_increase_pct,
              taper_volume_factor: settings.taper_volume_factor,
              starting_volume_km: settings.starting_volume_km,
            })}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Easy run %" hint="Proportion of weekly volume">
            <input type="number" min="0" max="1" step="0.01"
              value={settings.dist_easy_pct}
              onChange={e => update('dist_easy_pct', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="Short run %" hint="Proportion of weekly volume">
            <input type="number" min="0" max="1" step="0.01"
              value={settings.dist_short_pct}
              onChange={e => update('dist_short_pct', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="Long run %" hint="Proportion of weekly volume">
            <input type="number" min="0" max="1" step="0.01"
              value={settings.dist_long_pct}
              onChange={e => update('dist_long_pct', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="Max long run (km)">
            <input type="number" min="1" step="0.5"
              value={settings.max_long_run_km}
              onChange={e => update('max_long_run_km', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="Max weekly increase %" hint="10% rule">
            <input type="number" min="0" max="50" step="1"
              value={settings.max_weekly_volume_increase_pct}
              onChange={e => update('max_weekly_volume_increase_pct', parseInt(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="Starting volume (km)" hint="Week 1 total distance">
            <input type="number" min="1" step="0.5"
              value={settings.starting_volume_km}
              onChange={e => update('starting_volume_km', parseFloat(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
          <Field label="Taper factor" hint="Volume multiplier for taper weeks">
            <input type="number" min="0.1" max="1" step="0.05"
              value={settings.taper_volume_factor}
              onChange={e => update('taper_volume_factor', parseFloat(e.target.value) || 0.6)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {/* ── Schedule ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">Schedule</h2>
          <SaveButton
            state={saveStates['schedule'] ?? 'idle'}
            onClick={() => saveSection('schedule', {
              training_epoch: settings.training_epoch,
              day_long: settings.day_long,
              rest_day: settings.rest_day,
            })}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Training epoch" hint="Monday of first training week (W1)">
            <input
              type="date"
              value={settings.training_epoch}
              onChange={e => update('training_epoch', e.target.value)}
              className={inputClass}
            />
          </Field>
          <DaySelect
            label="Long run day"
            value={settings.day_long}
            onChange={v => update('day_long', v)}
          />
          <DaySelect
            label="Rest day"
            value={settings.rest_day}
            onChange={v => update('rest_day', v)}
          />
        </div>
      </Card>

      {/* ── Workout Durations ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">Workouts</h2>
          <SaveButton
            state={saveStates['durations'] ?? 'idle'}
            onClick={() => saveSection('durations', {
              complementary_workouts_per_week: settings.complementary_workouts_per_week,
              strength_duration_min: settings.strength_duration_min,
              stretching_duration_min: settings.stretching_duration_min,
            })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Complementary workouts / week"
            hint="1 = strength only · 2 = + stretching"
          >
            <div className="flex gap-2 mt-1">
              {[1, 2].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => update('complementary_workouts_per_week', n)}
                  className={segmentClass(settings.complementary_workouts_per_week === n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <div /> {/* spacer */}
          <Field label="Strength workout duration (min)">
            <input type="number" min="5" step="5"
              value={settings.strength_duration_min}
              onChange={e => update('strength_duration_min', parseInt(e.target.value) || 30)}
              className={inputClass}
            />
          </Field>
          <Field label="Stretching workout duration (min)">
            <input type="number" min="5" step="5"
              value={settings.stretching_duration_min}
              onChange={e => update('stretching_duration_min', parseInt(e.target.value) || 15)}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

function DaySelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className={inputClass}
      >
        {DAY_LABELS.map((day, idx) => (
          <option key={idx} value={idx}>{day}</option>
        ))}
      </select>
    </Field>
  );
}