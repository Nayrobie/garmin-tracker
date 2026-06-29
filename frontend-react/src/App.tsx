/**
 * Root component: sets up routing (maps URLs to pages) and wraps all pages in AppShell layout.
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CalendarPage } from './pages/CalendarPage';
import { CyclePage } from './pages/CyclePage';
import { HealthPage } from './pages/HealthPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/cycle" element={<CyclePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
