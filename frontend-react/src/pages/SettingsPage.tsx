/**
 * Settings page: user-configurable hyper-parameters persisted in the database,
 * organised into grouped sections (races, paces, goal, schedule, workouts).
 */
import { useEffect, useState, useCallback } from 'react';
import { Check, Loader2, Zap } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DatePicker } from '../components/ui/DatePicker';
import { RaceManager } from '../components/races/RaceManager';
import { useRaces } from '../hooks/useRaces';
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

  // VMA calculator local state
  const [vmaInput, setVmaInput] = useState<string>('');
  const [paceMode, setPaceMode] = useState<'auto' | 'manual'>('manual');

  const { races } = useRaces();

  const load = useCallback(async () => {
    try {
      const data = await settingsApi.get();
      setSettings(data);
      if (data.vma_kmh) {
        setVmaInput(String(data.vma_kmh));
        setPaceMode('auto');
      }
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

  /** Convert VMA (km/h) + percentage to pace string "MM:SS". */
  const vmaToPace = (vma: number, pct: number): string => {
    const minPerKm = 60 / (pct * vma);
    const mins = Math.floor(minPerKm);
    const secs = Math.round((minPerKm - mins) * 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const applyVma = (vmaStr: string) => {
    const vma = parseFloat(vmaStr);
    if (!vma || vma <= 0 || !settings) return;
    setSettings({
      ...settings,
      vma_kmh: vma,
      pace_easy: vmaToPace(vma, 0.75),
      pace_long: vmaToPace(vma, 0.85),
      pace_intervals: vmaToPace(vma, 1.0),
    });
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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/60 rounded-lg border border-white/50 p-0.5">
              <button
                type="button"
                onClick={() => setPaceMode('auto')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  paceMode === 'auto' ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                From VMA
              </button>
              <button
                type="button"
                onClick={() => setPaceMode('manual')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  paceMode === 'manual' ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Manual
              </button>
            </div>
            <SaveButton
              state={saveStates['paces'] ?? 'idle'}
              onClick={() => saveSection('paces', {
                pace_easy: settings.pace_easy,
                pace_intervals: settings.pace_intervals,
                pace_long: settings.pace_long,
                vma_kmh: settings.vma_kmh,
              })}
            />
          </div>
        </div>

        {paceMode === 'auto' && (
          <div className="flex items-end gap-3 mb-4 p-3 rounded-xl bg-[var(--color-accent-light)] border border-[var(--color-accent)]/20">
            <Field label="VMA (km/h)" hint="Vitesse Maximale Aérobie">
              <div className="flex gap-2">
                <input
                  type="number"
                  min="6"
                  max="25"
                  step="0.1"
                  placeholder="e.g. 11"
                  value={vmaInput}
                  onChange={e => setVmaInput(e.target.value)}
                  className={inputClass + ' w-28'}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => applyVma(vmaInput)}
                >
                  <Zap size={13} />
                  Compute
                </Button>
              </div>
            </Field>
            <p className="text-[10px] text-[var(--color-accent)] pb-2 leading-tight">
              Easy = 75% · Long = 85% · Intervals = 100%
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <Field label="Easy pace (min/km)" hint="Zone 2 — 75% VMA">
            <input
              type="text"
              placeholder="e.g. 7:30"
              value={settings.pace_easy}
              onChange={e => update('pace_easy', e.target.value)}
              disabled={paceMode === 'auto'}
              className={inputClass + (paceMode === 'auto' ? ' opacity-60 cursor-not-allowed' : '')}
            />
          </Field>
          <Field label="Long run pace (min/km)" hint="85% VMA — 10k race pace">
            <input
              type="text"
              placeholder="e.g. 6:00"
              value={settings.pace_long}
              onChange={e => update('pace_long', e.target.value)}
              disabled={paceMode === 'auto'}
              className={inputClass + (paceMode === 'auto' ? ' opacity-60 cursor-not-allowed' : '')}
            />
          </Field>
          <Field label="Interval pace (min/km)" hint="100% VMA — max aerobic effort">
            <input
              type="text"
              placeholder="e.g. 5:00"
              value={settings.pace_intervals}
              onChange={e => update('pace_intervals', e.target.value)}
              disabled={paceMode === 'auto'}
              className={inputClass + (paceMode === 'auto' ? ' opacity-60 cursor-not-allowed' : '')}
            />
          </Field>
        </div>
      </Card>

      {/* ── Training Goal ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">Training Goal</h2>
          <SaveButton
            state={saveStates['goal'] ?? 'idle'}
            onClick={() => saveSection('goal', {
              training_goal: settings.training_goal,
              max_long_run_km: settings.max_long_run_km,
              max_weekly_volume_increase_pct: settings.max_weekly_volume_increase_pct,
              starting_volume_km: settings.starting_volume_km,
              goal_hr_avg_bpm: settings.goal_hr_avg_bpm,
              goal_pace_start: settings.goal_pace_start,
              goal_pace_target: settings.goal_pace_target,
            })}
          />
        </div>

        {/* Goal selector */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {([
            { key: 'prepare_race', label: 'Prepare for race' },
            { key: 'lower_bpm', label: 'Lower BPM' },
            { key: 'improve_pace', label: 'Improve pace' },
            { key: 'maintain', label: 'Maintain' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => update('training_goal', key)}
              className={[
                'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                settings.training_goal === key
                  ? 'bg-[var(--color-accent)] text-white border-transparent'
                  : 'bg-white/70 text-gray-600 border-black/10 hover:bg-white',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* prepare_race: race picker + volume */}
        {settings.training_goal === 'prepare_race' && (
          <>
            <div className="mb-4 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100">
              <Field label="Target race" hint="Max long run auto-set to race distance − 5 km">
                <select
                  className={inputClass}
                  defaultValue=""
                  onChange={e => {
                    const race = races.find(r => String(r.id) === e.target.value);
                    if (race) update('max_long_run_km', Math.max(5, race.distance_km - 5));
                  }}
                >
                  <option value="" disabled>Select a race…</option>
                  {races.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.distance_km} km ({r.date})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Max long run (km)" hint="Set by race selection">
                <input type="number" min="1" step="0.5"
                  value={settings.max_long_run_km}
                  onChange={e => update('max_long_run_km', parseFloat(e.target.value) || 0)}
                  className={inputClass}
                />
              </Field>
              <Field label="Max weekly increase %" hint="10% rule — avoid injury">
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
            </div>
          </>
        )}

        {/* lower_bpm: goal HR only */}
        {settings.training_goal === 'lower_bpm' && (
          <div className="grid grid-cols-1 gap-4 max-w-xs">
            <Field label="Goal avg BPM" hint="Target average HR during easy runs">
              <input type="number" min="100" max="200" step="1"
                placeholder="e.g. 145"
                value={settings.goal_hr_avg_bpm ?? ''}
                onChange={e => update('goal_hr_avg_bpm', e.target.value ? parseInt(e.target.value) : null)}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {/* improve_pace: current + target pace */}
        {settings.training_goal === 'improve_pace' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starting pace (min/km)" hint="Your current easy run pace">
              <input type="text" placeholder="e.g. 7:00"
                value={settings.goal_pace_start ?? ''}
                onChange={e => update('goal_pace_start', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Target pace (min/km)" hint="Pace you want to reach">
              <input type="text" placeholder="e.g. 6:00"
                value={settings.goal_pace_target ?? ''}
                onChange={e => update('goal_pace_target', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {/* maintain: no params */}
        {settings.training_goal === 'maintain' && (
          <p className="text-xs text-gray-400 italic">
            No extra parameters needed — the plan keeps your current volume and intensity steady.
          </p>
        )}
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
            <DatePicker
              value={settings.training_epoch}
              onChange={v => update('training_epoch', v)}
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
            })}
          />
        </div>
        <Field
          label="Complementary workouts per week"
          hint="The plan schedules 1 strength + soft workouts (yoga, mobility, stretching) to fill the rest"
        >
          <div className="flex gap-2 mt-1">
            {[0, 1, 2, 3].map(n => (
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
      </Card>

      {/* ── Garmin ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 tracking-wide uppercase">Garmin</h2>
            <p className="text-xs text-gray-500 mt-1">
              Controls behaviour when pushing workouts to Garmin Connect.
            </p>
          </div>
          <SaveButton
            state={saveStates['garmin'] ?? 'idle'}
            onClick={() => saveSection('garmin', { flush_garmin_on_push: settings.flush_garmin_on_push })}
          />
        </div>
        <label className="flex items-center gap-3 cursor-pointer" onClick={() => update('flush_garmin_on_push', !settings.flush_garmin_on_push)}>
          <div
            className={[
              'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
              settings.flush_garmin_on_push ? 'bg-[var(--color-accent)]' : 'bg-gray-200',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                settings.flush_garmin_on_push ? 'translate-x-4' : '',
              ].join(' ')}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 select-none">Flush last week on push</p>
            <p className="text-[11px] text-gray-400 leading-snug">
              When pushing this week, automatically delete last week's Garmin workouts first.
            </p>
          </div>
        </label>
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