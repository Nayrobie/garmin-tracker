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
  { to: '/health', icon: <Heart size={20} />, label: 'Health', disabled: true },
  { to: '/cycle', icon: <Moon size={20} />, label: 'Cycle', disabled: true },
  { to: '/settings', icon: <Settings size={20} />, label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="flex flex-col w-[220px] shrink-0 h-full bg-gray-900/55 backdrop-blur-2xl border-r border-white/10">
      {/* App name */}
      <div className="px-5 pt-6 pb-4">
        <span className="text-white font-semibold text-sm tracking-wide">
          Garmin Tracker
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon, label, disabled }) =>
          disabled ? (
            <div
              key={label}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 cursor-not-allowed select-none"
              title="Coming soon"
            >
              {icon}
              <span className="text-sm">{label}</span>
              <span className="ml-auto text-[10px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full">
                soon
              </span>
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
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-white/75 hover:bg-white/10 hover:text-white',
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
