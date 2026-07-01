# Garmin Workout Tracker

A personal running & health dashboard that syncs with Garmin Connect to track training, generate progressive workout plans, and correlate sleep and menstrual cycle data.

## Features

### Calendar
- **Weekly strip** — view planned vs actual workouts day by day with completion status
- **Training plan generation** — algorithmic plan respecting the 10% weekly volume rule, race taper, and your training goal
- **Running progression chart** — monthly/yearly km bar chart (current year, Jan → now)
- **Personal records** — best pace for 1k / 5k / 10k distances

### Health
- **Body composition trends** — weight, body fat %, muscle mass, BMI from Feelfit CSV import
- Granularity: All / Month / Year (last 12 months)

### Cycle & Sleep
- **Sleep duration & score chart** — stacked bar (Deep / Light / REM / Awake) + score overlay
- **Resting HR chart** — with menstrual cycle phase bands
- **Night details table** — per-night breakdown with HRV, RHR, sleep score, cycle phase
- **Cycle tracker** — phase ring progress, timeline, next period prediction, phase detail cards
- Month / Year navigation with Garmin sync

### Settings
- **Races** — inline add / edit / delete; training plan auto-tapers before race week
- **Paces** — manual entry or auto-computed from VMA (75% easy · 85% long · 100% intervals)
- **Training Goal** — four goal types with goal-specific parameters and plan behaviour:
  - *Prepare for race* — pick a target race; max long run set to race distance − 5 km
  - *Lower BPM* — enter goal avg BPM; plan runs zone-2 only, no intervals, no volume progression
  - *Improve pace* — enter starting pace + target pace; plan includes tempo/interval work
  - *Maintain* — no extra parameters; plan holds volume steady (0% weekly increase)
- **Schedule** — training epoch, long run day, rest day
- **Workouts** — complementary workouts per week (0–3): strength + soft workouts (yoga/mobility/stretching)

## Architecture

```
garmin-tracking-app/
├── backend/                  # Python FastAPI + SQLAlchemy + SQLite
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database.py       # init + incremental migrations
│       ├── api/routes.py     # all REST endpoints
│       ├── models/workout.py # ORM + Pydantic schemas
│       └── services/
│           ├── garmin_service.py
│           ├── training_plan_service.py
│           └── body_composition_service.py
├── frontend-react/           # React 18 + TypeScript + Vite + Tailwind
│   └── src/
│       ├── pages/            # Calendar, Health, Cycle, Settings
│       ├── components/       # WorkoutCard, RaceManager, charts…
│       ├── api/              # fetch wrappers per domain
│       └── hooks/            # useRaces
├── notebooks/                # Jupyter exploration
└── .github/                  # Copilot instructions & skills
```

**Database**: SQLite at `backend/garmin_tracker.db` (single file, auto-migrated on startup).  
**Proxy**: Vite proxies `/api/*` → `http://localhost:8000`.

## Run Locally

### Prerequisites
- Python 3.10+, [Poetry](https://python-poetry.org/)
- Node 18+

### Backend
```bash
cd backend
poetry install
cp .env.example .env      # add Garmin credentials if syncing real data
poetry run uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
```

### Frontend
```bash
cd frontend-react && npm install && npm run dev
# → http://localhost:5173
```

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedule` | Planned + actual workouts for a date range |
| POST | `/api/schedule/generate-plan` | Generate multi-week training plan |
| POST | `/api/schedule/adjust-plan` | Regenerate from current week's actual volume |
| GET | `/api/stats/running` | Running progression (`?granularity=monthly\|yearly`) |
| GET/PUT | `/api/settings` | User settings (paces, goal, schedule, workouts) |
| GET | `/api/races` | All races |
| GET | `/api/sleep` | Sleep records for a date range |
| GET | `/api/cycles` | Menstrual cycle records |
| POST | `/api/sleep/sync` | Incremental sync from Garmin |
| GET | `/api/body-composition` | Body composition records |

## Development Guidelines

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for full rules:
- **Local-first**: always test before generalising
- **Never commit/push** without explicit approval
- **Dependencies**: use `poetry add / poetry remove`, never edit `pyproject.toml` directly
- **Code style**: PEP8, type hints, docstrings per [python-docstrings instructions](.github/instructions/python-docstrings.instructions.md)

## License

Personal project — use as reference only.
