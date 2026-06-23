"""Configuration settings for the backend application."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env file from project root before reading any env vars
PROJECT_ROOT = Path(__file__).parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

# Project root (for app code reference)
BASE_DIR = Path(__file__).parent.parent

# Environment
DEBUG = os.getenv("DEBUG", "False").lower() == "true"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Garmin API
GARMIN_EMAIL = os.getenv("GARMIN_EMAIL")
GARMIN_PASSWORD = os.getenv("GARMIN_PASSWORD")
GARMIN_API_KEY = os.getenv("GARMIN_API_KEY")
GARMIN_API_SECRET = os.getenv("GARMIN_API_SECRET")

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./workouts.db")

# Google Sheets
GOOGLE_SHEETS_API_KEY = os.getenv("GOOGLE_SHEETS_API_KEY")
GOOGLE_SHEETS_SPREADSHEET_ID = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")

# User physiological profile (for context in analysis)
USER_PROFILE = {
    "age": 26,
    "weight_kg": 59,
    "vo2_max": 45,
    "lactate_threshold_bpm": 186,
    "lactate_threshold_pace": "5:30",  # min/km
    "lactate_threshold_power": 256,  # watts
    "vma": 12,  # km/h (Vitesse Maximale Aérobie)
    "training_goal": "Lower heart rate while maintaining pace; semi-marathon readiness",
}

# Training constraints
TRAINING_RULES = {
    "min_runs_per_week": 2,
    "max_runs_per_week": 3,
    "max_weekly_volume_increase_percent": 10,
    "strength_sessions_per_week": 2,
    "strength_duration_minutes": 30,
}
