/**
 * Main layout wrapper: contains sidebar and main content area with gradient background.
 */
import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse 80% 55% at 65% 20%, oklch(0.87 0.09 240 / 0.45), transparent),' +
          'radial-gradient(ellipse 55% 65% at 25% 75%, oklch(0.87 0.08 195 / 0.38), transparent),' +
          'radial-gradient(ellipse 45% 45% at 55% 68%, oklch(0.87 0.07 295 / 0.28), transparent),' +
          'oklch(0.97 0.003 264)',
      }}
    >
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto relative">
        <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
