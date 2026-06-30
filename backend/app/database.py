"""SQLAlchemy database setup."""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./garmin_tracker.db")

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
    ]
    with engine.connect() as conn:
        for col_name, col_def in new_columns:
            try:
                conn.execute(text(f"ALTER TABLE user_settings ADD COLUMN {col_name} {col_def}"))
                conn.commit()
            except Exception:
                pass  # Column already exists
