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
from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Integer, String
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

