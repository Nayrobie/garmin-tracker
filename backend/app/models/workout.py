"""SQLAlchemy ORM models and Pydantic schemas.

Covers two domains:
- Races: goal events (trail, semi, 10k, marathon).
- Workouts: planned sessions and Garmin-synced actual activities.
"""
from __future__ import annotations

import enum
from datetime import date as DateType, datetime
from typing import List, Optional

from pydantic import BaseModel
from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class RaceType(str, enum.Enum):
    trail = "trail"
    semi = "semi"
    ten_k = "10k"
    marathon = "marathon"
    other = "other"


class WorkoutType(str, enum.Enum):
    run = "run"
    cycle = "cycle"
    strength = "strength"
    yoga = "yoga"
    pilates = "pilates"
    other = "other"


class Recurrence(str, enum.Enum):
    none = "none"
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"


# ---------------------------------------------------------------------------
# SQLAlchemy ORM model
# ---------------------------------------------------------------------------


class RaceORM(Base):
    """Persisted race / goal event."""

    __tablename__ = "races"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    elevation_m: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    date: Mapped[DateType] = mapped_column(Date, nullable=False)
    place: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[RaceType] = mapped_column(Enum(RaceType), nullable=False)


# ---------------------------------------------------------------------------
# Pydantic schemas (request / response)
# ---------------------------------------------------------------------------


class RaceBase(BaseModel):
    name: str
    distance_km: float
    elevation_m: Optional[int] = None
    date: DateType
    place: str
    type: RaceType


class RaceCreate(RaceBase):
    pass


class RaceUpdate(BaseModel):
    name: Optional[str] = None
    distance_km: Optional[float] = None
    elevation_m: Optional[int] = None
    date: Optional[DateType] = None
    place: Optional[str] = None
    type: Optional[RaceType] = None


class RaceRead(RaceBase):
    id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# PlannedWorkout ORM model
# ---------------------------------------------------------------------------


class PlannedWorkoutORM(Base):
    """User-created planned workout entry for a specific day."""

    __tablename__ = "planned_workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[DateType] = mapped_column(Date, nullable=False, index=True)
    type: Mapped[WorkoutType] = mapped_column(Enum(WorkoutType), nullable=False)
    goal_duration_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    goal_pace_per_km: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    recurrence: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    recurrence_group_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    actual_workouts: Mapped[List["ActualWorkoutORM"]] = relationship(
        "ActualWorkoutORM", back_populates="planned_workout"
    )


# ---------------------------------------------------------------------------
# ActualWorkout ORM model (Garmin-synced)
# ---------------------------------------------------------------------------


class ActualWorkoutORM(Base):
    """Garmin activity synced from Garmin Connect."""

    __tablename__ = "actual_workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    garmin_activity_id: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True, unique=True
    )
    date: Mapped[DateType] = mapped_column(Date, nullable=False, index=True)
    type: Mapped[WorkoutType] = mapped_column(Enum(WorkoutType), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    duration_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_hr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    avg_pace_per_km: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    calories: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rpe: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    planned_workout_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("planned_workouts.id"), nullable=True
    )

    planned_workout: Mapped[Optional[PlannedWorkoutORM]] = relationship(
        "PlannedWorkoutORM", back_populates="actual_workouts"
    )


# ---------------------------------------------------------------------------
# GarminSyncState ORM model
# ---------------------------------------------------------------------------


class GarminSyncStateORM(Base):
    """Tracks the last successful Garmin sync timestamp (singleton row)."""

    __tablename__ = "garmin_sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Sleep ORM model (Garmin-synced)
# ---------------------------------------------------------------------------


class SleepRecordORM(Base):
    """Garmin sleep data for a single night."""

    __tablename__ = "sleep_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[DateType] = mapped_column(Date, nullable=False, unique=True, index=True)
    total_sleep_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    deep_sleep_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    light_sleep_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rem_sleep_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    awake_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sleep_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    start_time: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    hrv_overnight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hrv_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    resting_hr: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cycle_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cycle_phase: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Pydantic schemas — Sleep
# ---------------------------------------------------------------------------


class SleepRecordRead(BaseModel):
    """Sleep record response schema."""

    id: int
    date: DateType
    total_sleep_min: Optional[int] = None
    deep_sleep_min: Optional[int] = None
    light_sleep_min: Optional[int] = None
    rem_sleep_min: Optional[int] = None
    awake_min: Optional[int] = None
    sleep_score: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    hrv_overnight: Optional[float] = None
    hrv_status: Optional[str] = None
    resting_hr: Optional[int] = None
    cycle_day: Optional[int] = None
    cycle_phase: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Menstrual Cycle ORM model
# ---------------------------------------------------------------------------


class MenstrualCycleORM(Base):
    """A single menstrual cycle (from period start to next period start)."""

    __tablename__ = "menstrual_cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    start_date: Mapped[DateType] = mapped_column(Date, nullable=False, unique=True, index=True)
    period_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cycle_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fertile_window_start_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fertile_window_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_predicted: Mapped[bool] = mapped_column(Boolean, default=False)
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class MenstrualCycleRead(BaseModel):
    """Menstrual cycle response schema."""

    id: int
    start_date: DateType
    period_length: Optional[int] = None
    cycle_length: Optional[int] = None
    fertile_window_start_day: Optional[int] = None
    fertile_window_length: Optional[int] = None
    is_predicted: bool = False

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# User Settings ORM model (singleton row, id=1)
# ---------------------------------------------------------------------------


class UserSettingsORM(Base):
    """Persisted user training hyper-parameters (single row, id=1)."""

    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Paces (min/km as "MM:SS")
    pace_easy: Mapped[str] = mapped_column(String(10), default="7:20")
    pace_intervals: Mapped[str] = mapped_column(String(10), default="5:30")
    pace_long: Mapped[str] = mapped_column(String(10), default="6:30")

    # Training volume
    dist_easy_pct: Mapped[float] = mapped_column(Float, default=0.29)
    dist_short_pct: Mapped[float] = mapped_column(Float, default=0.24)
    dist_long_pct: Mapped[float] = mapped_column(Float, default=0.47)
    max_long_run_km: Mapped[float] = mapped_column(Float, default=15.0)
    max_weekly_volume_increase_pct: Mapped[int] = mapped_column(Integer, default=10)
    min_runs_per_week: Mapped[int] = mapped_column(Integer, default=2)
    max_runs_per_week: Mapped[int] = mapped_column(Integer, default=3)
    taper_volume_factor: Mapped[float] = mapped_column(Float, default=0.6)
    starting_volume_km: Mapped[float] = mapped_column(Float, default=12.0)

    # Schedule (0=Mon … 6=Sun)
    training_epoch: Mapped[DateType] = mapped_column(Date, default=DateType(2026, 1, 19))
    day_easy: Mapped[int] = mapped_column(Integer, default=1)
    day_intervals: Mapped[int] = mapped_column(Integer, default=3)
    day_long: Mapped[int] = mapped_column(Integer, default=5)
    day_strength: Mapped[int] = mapped_column(Integer, default=0)
    day_mobility: Mapped[int] = mapped_column(Integer, default=2)
    day_pilates: Mapped[int] = mapped_column(Integer, default=4)

    # Workout durations
    strength_sessions_per_week: Mapped[int] = mapped_column(Integer, default=2)
    strength_duration_min: Mapped[int] = mapped_column(Integer, default=30)
    yoga_duration_min: Mapped[int] = mapped_column(Integer, default=15)
    pilates_duration_min: Mapped[int] = mapped_column(Integer, default=15)
    stretching_duration_min: Mapped[int] = mapped_column(Integer, default=15)

    # Sync & analysis
    activity_sync_lookback_days: Mapped[int] = mapped_column(Integer, default=30)
    sleep_sync_lookback_days: Mapped[int] = mapped_column(Integer, default=30)
    cycle_sync_lookback_days: Mapped[int] = mapped_column(Integer, default=365)
    hiking_pace_threshold_sec: Mapped[int] = mapped_column(Integer, default=720)

    # Schedule extras
    rest_day: Mapped[int] = mapped_column(Integer, default=6)  # 0=Mon … 6=Sun

    # Complementary workout count (1=strength only, 2=+yoga, 3=+pilates)
    complementary_workouts_per_week: Mapped[int] = mapped_column(Integer, default=3)

    # Unified sync lookback for manual syncs (days)
    sync_lookback_days: Mapped[int] = mapped_column(Integer, default=30)

    # Training goal: 'prepare_race' | 'lower_hr' | 'improve_pace' | 'maintain'
    training_goal: Mapped[str] = mapped_column(String(32), default="prepare_race")

    # VMA (Vitesse Maximale Aérobie) in km/h — used to auto-compute paces
    vma_kmh: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)


# ---------------------------------------------------------------------------
# Pydantic schemas — User Settings
# ---------------------------------------------------------------------------


class UserSettingsRead(BaseModel):
    """User settings response schema (all fields)."""

    # Paces
    pace_easy: str
    pace_intervals: str
    pace_long: str

    # Training volume
    dist_easy_pct: float
    dist_short_pct: float
    dist_long_pct: float
    max_long_run_km: float
    max_weekly_volume_increase_pct: int
    min_runs_per_week: int
    max_runs_per_week: int
    taper_volume_factor: float
    starting_volume_km: float

    # Schedule
    training_epoch: DateType
    day_easy: int
    day_intervals: int
    day_long: int
    day_strength: int
    day_mobility: int
    day_pilates: int

    # Workout durations
    strength_duration_min: int
    stretching_duration_min: int

    # Analysis
    hiking_pace_threshold_sec: int

    # Schedule extras
    rest_day: int
    complementary_workouts_per_week: int

    # Training goal
    training_goal: str
    vma_kmh: Optional[float]

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    """Partial update schema — only supplied fields are changed."""

    pace_easy: Optional[str] = None
    pace_intervals: Optional[str] = None
    pace_long: Optional[str] = None

    dist_easy_pct: Optional[float] = None
    dist_short_pct: Optional[float] = None
    dist_long_pct: Optional[float] = None
    max_long_run_km: Optional[float] = None
    max_weekly_volume_increase_pct: Optional[int] = None
    min_runs_per_week: Optional[int] = None
    max_runs_per_week: Optional[int] = None
    taper_volume_factor: Optional[float] = None
    starting_volume_km: Optional[float] = None

    training_epoch: Optional[DateType] = None
    day_easy: Optional[int] = None
    day_intervals: Optional[int] = None
    day_long: Optional[int] = None
    day_strength: Optional[int] = None
    day_mobility: Optional[int] = None
    day_pilates: Optional[int] = None

    strength_duration_min: Optional[int] = None
    stretching_duration_min: Optional[int] = None

    hiking_pace_threshold_sec: Optional[int] = None

    rest_day: Optional[int] = None
    complementary_workouts_per_week: Optional[int] = None

    training_goal: Optional[str] = None
    vma_kmh: Optional[float] = None


# ---------------------------------------------------------------------------
# Pydantic schemas — PlannedWorkout
# ---------------------------------------------------------------------------


class PlannedWorkoutBase(BaseModel):
    date: DateType
    type: WorkoutType
    goal_duration_min: Optional[int] = None
    goal_pace_per_km: Optional[str] = None
    notes: Optional[str] = None
    recurrence: Recurrence = Recurrence.none


class PlannedWorkoutCreate(PlannedWorkoutBase):
    recurrence_weeks: int = 12


class PlannedWorkoutUpdate(BaseModel):
    date: Optional[DateType] = None
    type: Optional[WorkoutType] = None
    goal_duration_min: Optional[int] = None
    goal_pace_per_km: Optional[str] = None
    notes: Optional[str] = None


class PlannedWorkoutRead(PlannedWorkoutBase):
    id: int
    recurrence_group_id: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Pydantic schemas — ActualWorkout
# ---------------------------------------------------------------------------


class ActualWorkoutRead(BaseModel):
    id: int
    garmin_activity_id: Optional[str]
    date: DateType
    type: WorkoutType
    name: Optional[str]
    duration_min: Optional[float]
    distance_km: Optional[float]
    avg_hr: Optional[int]
    avg_pace_per_km: Optional[str]
    calories: Optional[int]
    rpe: Optional[int]
    notes: Optional[str]
    synced_at: Optional[datetime]
    planned_workout_id: Optional[int]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Pydantic schemas — WeeklySchedule
# ---------------------------------------------------------------------------


class DaySchedule(BaseModel):
    """Planned and actual workouts for a single day."""

    date: DateType
    planned: List[PlannedWorkoutRead]
    actual: List[ActualWorkoutRead]


class WeeklySchedule(BaseModel):
    """7-day schedule response."""

    week_start: DateType
    days: List[DaySchedule]
    last_sync: Optional[datetime]


# ---------------------------------------------------------------------------
# Pydantic schemas — Weekly Stats
# ---------------------------------------------------------------------------


class WeeklyStats(BaseModel):
    """Aggregated training stats for a single week."""

    week_start: DateType
    total_volume_km: float
    run_count: int
    long_run_km: float
    avg_hr: Optional[int]
    total_duration_min: float
    workouts_by_type: dict[str, int]
    planned_count: int
    actual_count: int
    prev_week_volume_km: Optional[float]
    volume_change_pct: Optional[float]
    volume_alert: bool


# ---------------------------------------------------------------------------
# Pydantic schemas — Running Stats & Personal Records
# ---------------------------------------------------------------------------


class RunningPeriodStats(BaseModel):
    """Running metrics for a single time period (month or year)."""

    period: str  # "2026" or "2026-06"
    total_km: float
    run_count: int
    avg_pace: Optional[str]  # "MM:SS"
    avg_hr: Optional[int]


class PersonalRecord(BaseModel):
    """A single personal record entry."""

    distance_label: str  # "1K", "5K", "10K", "Farthest"
    value: str  # pace "MM:SS/km" or distance "X.XX km"
    date: DateType
    activity_name: Optional[str]


class RunningStats(BaseModel):
    """Full running statistics response."""

    progression: List[RunningPeriodStats]
    personal_records: List[PersonalRecord]
    total_activities: int

