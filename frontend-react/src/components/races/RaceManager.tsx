/**
 * Race manager modal: full CRUD interface to create, edit, and delete races with form validation.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, Pencil, Trash2, Mountain, MapPin } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useRaces } from '../../hooks/useRaces';
import type { Race, CreateRacePayload, RaceType } from '../../types';

interface RaceManagerProps {
  open: boolean;
  onClose: () => void;
  /** When true, renders the race list inline (no wrapping Modal). */
  inline?: boolean;
}

const RACE_TYPES: { value: RaceType; label: string }[] = [
  { value: 'trail', label: 'Trail' },
  { value: 'semi', label: 'Semi-marathon' },
  { value: '10k', label: '10k' },
  { value: 'marathon', label: 'Marathon' },
  { value: 'other', label: 'Other' },
];

const emptyForm: CreateRacePayload = {
  name: '',
  distance_km: 0,
  elevation_m: null,
  date: '',
  place: '',
  type: 'trail',
};

export function RaceManager({ open, onClose, inline = false }: RaceManagerProps) {
  const { races, loading, createRace, updateRace, deleteRace } = useRaces();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Race | null>(null);
  const [form, setForm] = useState<CreateRacePayload>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setFormOpen(true);
  };

  const openEdit = (race: Race) => {
    setEditing(race);
    setForm({
      name: race.name,
      distance_km: race.distance_km,
      elevation_m: race.elevation_m,
      date: race.date,
      place: race.place,
      type: race.type,
    });
    setError(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.date || !form.place || !form.distance_km) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateRace(editing.id, form);
      } else {
        await createRace(form);
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteRace(id);
      setConfirmDelete(null);
    } catch {
      // ignore
    }
  };

  /** Shared race list + add button (rendered inline or inside modal). */
  const raceListContent = (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : races.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No races yet. Add your first one!</p>
      ) : (
        <ul className="space-y-2">
          {races.map(race => (
            <li
              key={race.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-black/3 border border-black/5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900">
                        {race.name}
                      </span>
                      <span className="text-[10px] bg-[var(--color-accent-light)] text-[var(--color-accent)] px-2 py-0.5 rounded-full font-medium">
                        {RACE_TYPES.find(t => t.value === race.type)?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      <span>{format(parseISO(race.date), 'MMM d, yyyy')}</span>
                      <span className="flex items-center gap-0.5">
                        <MapPin size={10} />
                        {race.place}
                      </span>
                      <span>{race.distance_km} km</span>
                      {race.elevation_m && (
                        <span className="flex items-center gap-0.5">
                          <Mountain size={10} />
                          {race.elevation_m}m
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(race)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-colors"
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    {confirmDelete === race.id ? (
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="danger" onClick={() => handleDelete(race.id)}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(race.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button variant="secondary" size="sm" onClick={openAdd} className="w-full mt-1">
            <Plus size={14} />
            Add race
          </Button>
        </div>
  );

  /** Shared add/edit form modal. */
  const formModal = (
    <Modal
      open={formOpen}
      onClose={() => setFormOpen(false)}
      title={editing ? 'Edit race' : 'Add race'}
    >
      <div className="space-y-4">
        {error && (
          <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
        <Field label="Race name *">
          <input type="text" placeholder="e.g. Tignes Trail"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Type *">
            <select value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as RaceType }))}
              className={inputClass}
            >
              {RACE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (km) *">
            <input type="number" min="0" step="0.1" placeholder="12"
              value={form.distance_km || ''}
              onChange={e => setForm(f => ({ ...f, distance_km: parseFloat(e.target.value) || 0 }))}
              className={inputClass}
            />
          </Field>
          <Field label="Elevation (m)">
            <input type="number" min="0" step="10" placeholder="700 (optional)"
              value={form.elevation_m ?? ''}
              onChange={e => setForm(f => ({ ...f, elevation_m: e.target.value ? parseInt(e.target.value) : null }))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Place *">
          <input type="text" placeholder="e.g. Tignes, France"
            value={form.place}
            onChange={e => setForm(f => ({ ...f, place: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button variant="primary" onClick={handleSave} loading={saving} className="flex-1">
            {editing ? 'Save changes' : 'Add race'}
          </Button>
          <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (inline) {
    return (
      <>
        {raceListContent}
        {formModal}
      </>
    );
  }

  // Default: wrapped in outer Modal (used from sidebar RaceCountdown etc.)
  return (
    <>
      <Modal open={open} onClose={onClose} title="Races" maxWidth="max-w-xl">
        {raceListContent}
      </Modal>
      {formModal}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-gray-500 tracking-wide">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full h-9 px-3 text-sm rounded-xl bg-white/70 border border-black/10 ' +
  'text-gray-800 placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-colors';
