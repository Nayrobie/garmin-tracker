"""SQLAlchemy database setup."""
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load .env early — database.py is imported before config.py runs load_dotenv,
# so we must do it here to ensure DATABASE_URL is resolved correctly.
_PROJECT_ROOT = Path(__file__).parent.parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

# Use an absolute path so the DB file is always at backend/garmin_tracker.db
# regardless of the working directory uvicorn is launched from.
_BACKEND_DIR = Path(__file__).parent.parent
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_BACKEND_DIR / 'garmin_tracker.db'}")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables if they don't exist yet and seed defaults."""
    from app.models import workout  # noqa: F401 — registers all ORM models with Base
    Base.metadata.create_all(bind=engine)

    # Add new columns to user_settings if they don't exist yet (schema evolution)
    # Must run BEFORE reading the ORM row so that all columns exist.
    _migrate_user_settings()

    # Ensure singleton user_settings row exists
    db = SessionLocal()
    try:
        from app.models.workout import UserSettingsORM
        if db.get(UserSettingsORM, 1) is None:
            db.add(UserSettingsORM(id=1))
            db.commit()
    finally:
        db.close()


def _migrate_user_settings() -> None:
    """Add new user_settings columns to existing databases (safe no-op if already present)."""
    new_columns = [
        ("rest_day", "INTEGER DEFAULT 6"),
        ("complementary_workouts_per_week", "INTEGER DEFAULT 3"),
        ("sync_lookback_days", "INTEGER DEFAULT 30"),
        ("stretching_duration_min", "INTEGER DEFAULT 15"),
        ("training_goal", "TEXT DEFAULT 'prepare_race'"),
        ("vma_kmh", "REAL"),
        ("goal_hr_avg_bpm", "INTEGER"),
        ("goal_pace_start", "TEXT"),
        ("goal_pace_target", "TEXT"),
    ]
    with engine.connect() as conn:
        for col_name, col_def in new_columns:
            try:
                conn.execute(text(f"ALTER TABLE user_settings ADD COLUMN {col_name} {col_def}"))
                conn.commit()
            except Exception:
                pass  # Column already exists

    # planned_workouts migrations
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE planned_workouts ADD COLUMN garmin_workout_id TEXT"))
            conn.commit()
        except Exception:
            pass  # Column already exists
