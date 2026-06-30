/**
 * Race countdown widget: displays next 3 upcoming races in sidebar with days remaining and opens RaceManager modal.
 */
import { useState } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { Flag } from 'lucide-react';
import { useRaces } from '../../hooks/useRaces';
import { RaceManager } from './RaceManager';

const RACE_TYPE_LABELS: Record<string, string> = {
  trail: 'Trail',
  semi: 'Semi',
  '10k': '10k',
  marathon: 'Marathon',
  other: 'Other',
};

export function RaceCountdown() {
  const { races, loading, refetch } = useRaces();
  const [managerOpen, setManagerOpen] = useState(false);

  const today = new Date();
  const upcoming = races
    .filter(r => parseISO(r.date) >= today)
    .slice(0, 3); // show max 3 in sidebar

  return (
    <>
      <button
        onClick={() => setManagerOpen(true)}
        className="w-full text-left group"
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Races
          </span>
          <span className="text-[11px] text-gray-400 group-hover:text-[var(--color-accent)] transition-colors">
            Manage →
          </span>
        </div>

        {loading ? (
          <div className="text-xs text-gray-400 px-1">Loading…</div>
        ) : upcoming.length === 0 ? (
          <div className="text-xs text-gray-400 px-1 italic">No upcoming races</div>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map(race => {
              const days = differenceInDays(parseISO(race.date), today);
              const urgent = days <= 30;
              return (
                <div
                  key={race.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg bg-gray-100/60 hover:bg-gray-100 transition-colors"
                >
                  <Flag
                    size={13}
                    className={urgent ? 'text-orange-400' : 'text-[var(--color-accent)]'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-800 truncate">
                      {race.name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {RACE_TYPE_LABELS[race.type]} · {race.distance_km}km{race.elevation_m ? ` · ${race.elevation_m}m↑` : ''}
                    </div>
                  </div>
                  <span
                    className={[
                      'text-[11px] font-semibold shrink-0 tabular-nums',
                      urgent ? 'text-orange-400' : 'text-[var(--color-accent)]',
                    ].join(' ')}
                  >
                    {days}d
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </button>

      <RaceManager open={managerOpen} onClose={() => { setManagerOpen(false); refetch(); }} />
    </>
  );
}
