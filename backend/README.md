# Backend README

## FastAPI Backend

This is the backend API for the Garmin Workout Tracker, built with FastAPI. It serves the Streamlit frontend and is designed to be easily adapted for React.js or mobile apps in the future.

### Setup

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your Garmin Connect credentials and any other settings.

### Run

```bash
poetry run uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. OpenAPI docs: `http://localhost:8000/docs`

### Current Structure

- `app/main.py` — FastAPI app initialization, CORS setup, health check
- `app/config.py` — Environment variables, user physiological profile, training rules
- `app/models/workout.py` — Data models (`Workout`, `WeeklyVolume`)
- `app/services/garmin_service.py` — Garmin API integration (stub)
- `app/api/routes.py` — Route handlers (endpoints for workouts, stats, notes)

### Development Notes

- **Garmin API**: Currently a stub. Will integrate once approach is finalized (community SDK vs. official Health API)
- **Database**: Placeholder. SQLite for local dev; cloud storage (e.g., Firestore, PostgreSQL) for production
- **Authentication**: Not implemented yet (focus on core functionality first)
- **Google Sheets Integration**: Optional; can be added as a service similar to `garmin_service.py`

### Endpoints (Planned)

- `GET /api/workouts` — Retrieve recent workouts
- `POST /api/workouts/{id}/notes` — Add post-workout notes (RPE, subjective effort)
- `GET /api/stats/weekly` — Weekly training volume and metrics
- `GET /health` — Health check

### Next Steps

1. Choose Garmin API integration approach
2. Implement `GarminService` with real API calls
3. Add data persistence (SQLite or cloud)
4. Build analytics for volume progression and rule validation
