# Garmin Tracker — React Frontend

Apple-inspired React UI for planning workouts, tracking races, and analyzing Garmin data.

## Setup

```bash
# Install dependencies
cd frontend-react
npm install

# Start dev server (runs on http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

## Connecting to Backend

The dev server proxies `/api/*` requests to `http://localhost:8000` (see `vite.config.ts`). 

**Start the FastAPI backend in another terminal:**
```bash
cd ../backend
poetry run uvicorn app.main:app --reload --port 8000
```

## Stack

- **Vite** + React 19 + TypeScript
- **Tailwind CSS v4** — utility-first styling
- **React Router v7** — client-side routing
- **Framer Motion** — smooth animations
- **Lucide React** — clean icons
- **date-fns** — date utilities
- **@dnd-kit** — drag-and-drop (Phase 1+)

## Project Structure

```
src/
├── components/
│   ├── layout/        (AppShell, Sidebar)
│   ├── ui/            (Card, Button, Modal — design system)
│   ├── races/         (RaceCountdown, RaceManager)
│   └── ...            (more feature components in future phases)
├── pages/             (page-level components)
├── hooks/             (custom React hooks: useRaces, etc.)
├── api/               (API client functions)
├── types/             (TypeScript interfaces)
├── App.tsx            (router setup)
├── main.tsx           (entry point)
└── index.css          (Tailwind + design tokens)
```

## Phase 0 — Design System + Race Management

Currently complete:
- Glasmorphic sidebar with Apple-inspired aesthetic
- Race CRUD: add/edit/delete races (name, distance, elevation, date, place, type)
- Race countdown in sidebar — shows upcoming races with day counters

**Next phase (Phase 1):** Weekly calendar with drag-and-drop workouts, Garmin sync.

## Development

- **Linting**: TypeScript strict mode enabled. No ESLint yet (keep lean).
- **CSS**: Tailwind v4 with `@import "tailwindcss"` in `index.css`.
- **Types**: Use `date as DateType` for Python/Pydantic compatibility in API models.

## Deployment

Currently local-only. When deploying:
1. Build: `npm run build` → outputs to `dist/`
2. Serve dist folder via simple HTTP server or CDN
3. Ensure backend CORS allows the deployed frontend domain

See [`copilot-instructions.md`](../.github/copilot-instructions.md) for full project context.
