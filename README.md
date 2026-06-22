# Garmin Workout Tracker

A personal workout tracking application that connects to Garmin data to help manage and analyze training, with a focus on progressive running volume management and injury prevention.

## Overview

This project provides a unified interface to:
- Pull workout data from Garmin Connect API
- Track recovery metrics and injury prevention exercises
- Monitor training volume progression (with 10% weekly increase limits)
- Analyze physiological metrics (VO2 Max, lactate threshold, heart rate trends)
- Log subjective effort (RPE) and session notes

## Current Architecture

```
garmin-tracking-app/
├── backend/          # Python FastAPI (separate for future multi-platform support)
├── frontend/         # Streamlit UI (local development; React.js in future)
└── .github/          # Instructions & skills for Copilot
```

## Getting Started

### Prerequisites

- Python 3.10+
- Garmin Connect account
- Optional: Google Sheets integration for extended tracking

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Set up environment variables (copy `.env.example` → `.env`):
```bash
cp .env.example .env
```

Then edit `.env` with your Garmin credentials and Garmin Connect API settings.

### Frontend Setup

```bash
cd frontend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Copy and configure the frontend `.env.example`:
```bash
cp .env.example .env
```

### Run Locally

Start the backend:
```bash
cd backend
python -m uvicorn app.main:app --reload
```

In a separate terminal, start the frontend:
```bash
cd frontend
streamlit run streamlit_app.py
```

Access the app at `http://localhost:8501`

## Project Context

### Physiological Profile

- **Demographics**: 26-year-old female, 59 kg
- **VO2 Max**: ~45 ml/kg/min
- **Lactate Threshold**: 186 bpm, 5:30 min/km pace, 256W, 4.34 W/kg
- **VMA**: 12 km/h (dictates training paces)
- **Current Goal**: Lower heart rate while maintaining pace; prepare for semi-marathon (Oct 25)

### Training Structure

- **Frequency**: 2–3 runs per week
- **Pattern**: Alternate interval runs with easy runs every other week
- **Volume**: Building to 5k (short) + 4k (mid) + 8k (long) = 17 km/week
- **Rule**: Max 10% volume increase per week
- **Cross-training**: Incorporating cycling; 2 x 30min/week strength & plyometrics (hip/knee/shin splint prevention)

### Tracked Metrics

- Post-run notes from Garmin (RPE, perceived effort)
- Recovery status
- Injury prevention check-ins
- Weekly volume totals and long-run progression
- Heart rate zones and aerobic/anaerobic balance

## Future Enhancements

- iOS native app (React Native or Swift)
- Real-time push notifications for anomalies
- Video/form analysis integration
- Google Sheets integration for collaborative analysis
- Power meter integration

## Development Workflow

- **Build incrementally**: Start with mock data, then integrate real Garmin API
- **Keep it lean**: Only add features with clear immediate use cases
- **Code standards**: Follow PEP8; see [instructions](./github/instructions/) for details

## License

Personal project — use as reference only.

## References

- [Garmin Health API Docs](https://developer.garmin.com/)
- Training structure based on aerobic base-building principles
- See `.github/copilot-instructions.md` for development context
