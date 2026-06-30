/**
 * Styled date picker: replaces the native input[type="date"] with a custom
 * Apple-inspired calendar popover built on react-day-picker v9.
 */
import { useState, useRef, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parseISO, isValid } from 'date-fns';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  /** ISO date string 'YYYY-MM-DD' or empty string */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}

const triggerClass =
  'w-full h-9 px-3 text-sm rounded-xl bg-white/70 border border-black/10 ' +
  'text-gray-800 flex items-center justify-between gap-2 ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] ' +
  'transition-colors hover:bg-white/90 cursor-pointer';

export function DatePicker({ value, onChange, required, className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = value && isValid(parseISO(value)) ? parseISO(value) : undefined;
  const defaultMonth = selected ?? new Date();

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={['relative', className].filter(Boolean).join(' ')}>
      {/* Hidden native input keeps form validation working */}
      <input type="hidden" value={value} required={required} />

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={triggerClass}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? format(selected, 'dd.MM.yyyy') : '—'}
        </span>
        <Calendar size={14} className="shrink-0 text-gray-400" />
      </button>

      {/* Popover — CSS variable overrides scoped to this element */}
      {open && (
        <div
          role="dialog"
          aria-label="Date picker"
          className={[
            'absolute z-50 mt-1 p-2',
            'bg-white/95 backdrop-blur-2xl',
            'rounded-2xl border border-black/8',
            'shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
            'left-0',
          ].join(' ')}
        >
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={defaultMonth}
            onSelect={(day) => {
              if (day) {
                onChange(format(day, 'yyyy-MM-dd'));
                setOpen(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
