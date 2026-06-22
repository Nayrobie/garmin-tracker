# Frontend README

## Streamlit UI

This is the frontend for the Garmin Workout Tracker, built with Streamlit for rapid prototyping and local development.

### Setup

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### Run

```bash
streamlit run streamlit_app.py
```

The app will open at `http://localhost:8501`

### Future Migrations

When moving to React.js or a native iOS app, this Streamlit frontend will be deprecated in favor of a web UI or mobile app that consumes the same backend API. The backend (FastAPI) will remain the source of truth for all data operations.

### Structure

- `streamlit_app.py` - Main app entry point with navigation
- `pages/` - Individual page modules (future expansion)
