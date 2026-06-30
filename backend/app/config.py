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
# Values are loaded from environment variables to keep personal data out of version control.
USER_PROFILE = {
    "age": int(os.getenv("USER_AGE", "0")) or None,
    "weight_kg": float(os.getenv("USER_WEIGHT_KG", "0")) or None,
    "vo2_max": float(os.getenv("USER_VO2_MAX", "0")) or None,
    "lactate_threshold_bpm": int(os.getenv("USER_LT_BPM", "0")) or None,
    "lactate_threshold_pace": os.getenv("USER_LT_PACE"),  # min/km
    "lactate_threshold_power": int(os.getenv("USER_LT_POWER", "0")) or None,  # watts
    "vma": float(os.getenv("USER_VMA", "0")) or None,  # km/h (Vitesse Maximale Aérobie)
    "training_goal": os.getenv("USER_TRAINING_GOAL", ""),
}

# Training hyper-parameters are now stored in the `user_settings` DB table
# and managed via the GET/PUT /api/settings endpoints.
# See app/models/workout.py → UserSettingsORM for the full list of defaults.
