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
├── backend/          # Python FastAPI
├── frontend-react/   # React + TypeScript (active development)
├── notebooks/        # Jupyter notebooks for testing & exploration
└── .github/          # Instructions & skills for Copilot
```

**Status**: Backend API in development. React frontend scaffolded with race management UI. Testing via Jupyter notebooks.

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

**React:**
```bash
cd frontend-react
npm install
```

### Run Locally

**Terminal 1 — Backend**:
```bash
cd backend
python -m uvicorn app.main:app --reload
# → http://localhost:8000
```

**Terminal 2 — React Frontend**:
```bash
cd frontend-react
npm run dev
# → http://localhost:5173
```

## Development

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for full development context, including:
- Local-first workflow
- Code standards (PEP8, type hints)
- Never commit without explicit approval
- Never modify `pyproject.toml` directly; use `poetry add/remove`

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
