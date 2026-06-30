/**
 * Left sidebar: navigation menu with links to pages and race countdown widget.
 */
import { NavLink } from 'react-router-dom';
import { Calendar, Heart, Moon, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { RaceCountdown } from '../races/RaceCountdown';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', icon: <Calendar size={20} />, label: 'Calendar' },
  { to: '/health', icon: <Heart size={20} />, label: 'Health'},
  { to: '/cycle', icon: <Moon size={20} />, label: 'Cycle' },
  { to: '/settings', icon: <Settings size={20} />, label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="flex flex-col w-[220px] shrink-0 h-full bg-white/40 backdrop-blur-2xl border-r border-gray-200/60">
      {/* App name */}
      <div className="px-5 pt-6 pb-4">
        <span className="text-gray-800 font-semibold text-sm tracking-wide">
          Garmin Tracker
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon, label, disabled }) =>
          disabled ? (
            <div
              key={label}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-300 cursor-not-allowed select-none"
              title="Coming soon"
            >
              {icon}
              <span className="text-sm">{label}</span>
            </div>
          ) : (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150',
                  isActive
                    ? 'bg-[var(--color-accent)] text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    animate={{ scale: isActive ? 1.1 : 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    {icon}
                  </motion.span>
                  <span className="text-sm font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>

      {/* Race countdown at the bottom */}
      <div className="px-3 pb-5 mt-4">
        <RaceCountdown />
      </div>
    </aside>
  );
}
