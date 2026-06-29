"""API route handlers."""
import uuid
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.workout import (
    ActualWorkoutRead,
    DaySchedule,
    GarminSyncStateORM,
    PlannedWorkoutCreate,
    PlannedWorkoutORM,
    PlannedWorkoutRead,
    PlannedWorkoutUpdate,
    ActualWorkoutORM,
    Recurrence,
    RaceORM,
    RaceCreate,
    RaceRead,
    RaceUpdate,
    WeeklySchedule,
    WeeklyStats,
    RunningPeriodStats,
    RunningStats,
    PersonalRecord,
    WorkoutType,
)
from app.services.body_composition_service import BodyCompositionRecord, load_body_composition
from app.services.garmin_service import sync_garmin_activities
from app.services.training_plan_service import adjust_plan_from_progress, generate_training_plan
from app.config import TRAINING_RULES

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Races
# ---------------------------------------------------------------------------


@router.get("/races", response_model=List[RaceRead])
def list_races(db: Session = Depends(get_db)) -> List[RaceORM]:
    """Return all races ordered by date ascending."""
    return db.query(RaceORM).order_by(RaceORM.date).all()


@router.post("/races", response_model=RaceRead, status_code=201)
def create_race(payload: RaceCreate, db: Session = Depends(get_db)) -> RaceORM:
    """Create a new race."""
    race = RaceORM(**payload.model_dump())
    db.add(race)
    db.commit()
    db.refresh(race)
    return race


@router.patch("/races/{race_id}", response_model=RaceRead)
def update_race(
    race_id: int, payload: RaceUpdate, db: Session = Depends(get_db)
) -> RaceORM:
    """Partially update a race."""
    race = db.get(RaceORM, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(race, field, value)
    db.commit()
    db.refresh(race)
    return race


@router.delete("/races/{race_id}", status_code=204)
def delete_race(race_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a race."""
    race = db.get(RaceORM, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")
    db.delete(race)
    db.commit()


# ---------------------------------------------------------------------------
# Schedule (planned workouts)
# ---------------------------------------------------------------------------


@router.get("/schedule/week", response_model=WeeklySchedule)
def get_week_schedule(
    date_str: Optional[str] = None, db: Session = Depends(get_db)
) -> WeeklySchedule:
    """Return the 7-day schedule (planned + actual) for the week containing *date_str*.

    Args:
        date_str: ISO date string (YYYY-MM-DD). Defaults to today.
        db: Database session.

    Returns:
        WeeklySchedule with planned and actual workouts per day.
    """
    target = date.fromisoformat(date_str) if date_str else date.today()
    # Snap to Monday of that week
    week_start = target - timedelta(days=target.weekday())
    week_end = week_start + timedelta(days=6)

    planned_rows = (
        db.query(PlannedWorkoutORM)
        .filter(PlannedWorkoutORM.date >= week_start, PlannedWorkoutORM.date <= week_end)
        .all()
    )
    actual_rows = (
        db.query(ActualWorkoutORM)
        .filter(ActualWorkoutORM.date >= week_start, ActualWorkoutORM.date <= week_end)
        .all()
    )

    planned_by_date: dict[date, List[PlannedWorkoutORM]] = {}
    for p in planned_rows:
        planned_by_date.setdefault(p.date, []).append(p)

    actual_by_date: dict[date, List[ActualWorkoutORM]] = {}
    for a in actual_rows:
        actual_by_date.setdefault(a.date, []).append(a)

    sync_state = db.get(GarminSyncStateORM, 1)
    last_sync = sync_state.last_sync_at if sync_state else None

    days = [
        DaySchedule(
            date=week_start + timedelta(days=i),
            planned=[
                PlannedWorkoutRead.model_validate(p)
                for p in planned_by_date.get(week_start + timedelta(days=i), [])
            ],
            actual=[
                ActualWorkoutRead.model_validate(a)
                for a in actual_by_date.get(week_start + timedelta(days=i), [])
            ],
        )
        for i in range(7)
    ]

    return WeeklySchedule(week_start=week_start, days=days, last_sync=last_sync)


@router.post("/schedule/workout", response_model=PlannedWorkoutRead, status_code=201)
def create_planned_workout(
    payload: PlannedWorkoutCreate, db: Session = Depends(get_db)
) -> PlannedWorkoutORM:
    """Create a planned workout, generating recurring entries if requested.

    Args:
        payload: Workout details including optional recurrence settings.
        db: Database session.

    Returns:
        The first created workout entry.
    """
    base = payload.model_dump(exclude={"recurrence", "recurrence_weeks"})

    if payload.recurrence == Recurrence.none:
        workout = PlannedWorkoutORM(**base, recurrence="none")
        db.add(workout)
        db.commit()
        db.refresh(workout)
        return workout

    delta_map = {
        Recurrence.weekly: timedelta(weeks=1),
        Recurrence.biweekly: timedelta(weeks=2),
        Recurrence.monthly: timedelta(weeks=4),
    }
    delta = delta_map[payload.recurrence]
    group_id = str(uuid.uuid4())
    workouts = [
        PlannedWorkoutORM(
            **base,
            date=payload.date + delta * i,
            recurrence=payload.recurrence.value,
            recurrence_group_id=group_id,
        )
        for i in range(payload.recurrence_weeks)
    ]
    db.add_all(workouts)
    db.commit()
    db.refresh(workouts[0])
    return workouts[0]


@router.patch("/schedule/workout/{workout_id}", response_model=PlannedWorkoutRead)
def update_planned_workout(
    workout_id: int, payload: PlannedWorkoutUpdate, db: Session = Depends(get_db)
) -> PlannedWorkoutORM:
    """Partially update a planned workout (e.g. move to a different day).

    Args:
        workout_id: ID of the planned workout.
        payload: Fields to update.
        db: Database session.

    Returns:
        Updated planned workout.

    Raises:
        HTTPException: 404 if workout not found.
    """
    workout = db.get(PlannedWorkoutORM, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail="Planned workout not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workout, field, value)
    db.commit()
    db.refresh(workout)
    return workout


@router.delete("/schedule/workout/{workout_id}", status_code=204)
def delete_planned_workout(workout_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a planned workout.

    Args:
        workout_id: ID of the planned workout.
        db: Database session.

    Raises:
        HTTPException: 404 if workout not found.
    """
    workout = db.get(PlannedWorkoutORM, workout_id)
    if workout is None:
        raise HTTPException(status_code=404, detail="Planned workout not found")
    db.delete(workout)
    db.commit()


@router.delete("/schedule/workout/group/{group_id}", status_code=204)
def delete_workout_group(group_id: str, db: Session = Depends(get_db)) -> None:
    """Delete all planned workouts belonging to a recurrence group.

    Args:
        group_id: UUID of the recurrence group.
        db: Database session.
    """
    db.query(PlannedWorkoutORM).filter(
        PlannedWorkoutORM.recurrence_group_id == group_id
    ).delete()
    db.commit()


# ---------------------------------------------------------------------------
# Garmin sync
# ---------------------------------------------------------------------------


@router.post("/garmin/sync", status_code=200)
def trigger_garmin_sync(
    all_time: bool = False,
    days_back: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Manually trigger a Garmin activity sync.

    Pulls activities from Garmin Connect and upserts them into
    the actual_workouts table.

    Sync range:
    - ``all_time=true``: fetch entire Garmin history.
    - ``days_back=N``: fetch last N days.
    - Default: incremental sync from last sync date to today.

    Args:
        all_time: If true, pull all historical activities.
        days_back: Explicit lookback in days (overrides incremental).
        db: Database session.

    Returns:
        Dict with sync result summary.
    """
    result = sync_garmin_activities(db, all_time=all_time, days_back=days_back)
    return result


@router.get("/garmin/sync/status")
def get_sync_status(db: Session = Depends(get_db)) -> dict:
    """Return the last Garmin sync timestamp."""
    sync_state = db.get(GarminSyncStateORM, 1)
    return {"last_sync": sync_state.last_sync_at if sync_state else None}


# ---------------------------------------------------------------------------
# Body composition (Feelfit import)
# ---------------------------------------------------------------------------


@router.get("/body-composition", response_model=List[BodyCompositionRecord])
def get_body_composition() -> List[BodyCompositionRecord]:
    """Return all body composition records from the Feelfit CSV export.

    Returns:
        List of records sorted oldest to newest.

    Raises:
        HTTPException: 503 if the data file is missing.
    """
    try:
        return load_body_composition()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Weekly Stats
# ---------------------------------------------------------------------------


@router.get("/stats/weekly", response_model=WeeklyStats)
def get_weekly_stats(
    date_str: Optional[str] = None, db: Session = Depends(get_db)
) -> WeeklyStats:
    """Return aggregated training stats for the week containing *date_str*.

    Includes volume comparison with previous week and a 10% rule alert.

    Args:
        date_str: ISO date string (YYYY-MM-DD). Defaults to today.
        db: Database session.

    Returns:
        WeeklyStats with aggregated metrics and volume change alert.
    """
    target = date.fromisoformat(date_str) if date_str else date.today()
    week_start = target - timedelta(days=target.weekday())
    week_end = week_start + timedelta(days=6)

    prev_week_start = week_start - timedelta(days=7)
    prev_week_end = week_start - timedelta(days=1)

    # Current week data
    actual_rows = (
        db.query(ActualWorkoutORM)
        .filter(ActualWorkoutORM.date >= week_start, ActualWorkoutORM.date <= week_end)
        .all()
    )
    planned_rows = (
        db.query(PlannedWorkoutORM)
        .filter(PlannedWorkoutORM.date >= week_start, PlannedWorkoutORM.date <= week_end)
        .all()
    )

    # Previous week actual workouts (for volume comparison)
    prev_actual_rows = (
        db.query(ActualWorkoutORM)
        .filter(
            ActualWorkoutORM.date >= prev_week_start,
            ActualWorkoutORM.date <= prev_week_end,
        )
        .all()
    )

    # Compute current week aggregates
    distances = [a.distance_km for a in actual_rows if a.distance_km]
    total_volume_km = round(sum(distances), 2)
    long_run_km = round(max(distances), 2) if distances else 0.0
    run_count = sum(1 for a in actual_rows if a.type.value == "run")
    total_duration_min = round(
        sum(a.duration_min for a in actual_rows if a.duration_min), 1
    )

    hr_values = [a.avg_hr for a in actual_rows if a.avg_hr]
    avg_hr = round(sum(hr_values) / len(hr_values)) if hr_values else None

    workouts_by_type: dict[str, int] = {}
    for a in actual_rows:
        workouts_by_type[a.type.value] = workouts_by_type.get(a.type.value, 0) + 1

    # Previous week volume
    prev_distances = [a.distance_km for a in prev_actual_rows if a.distance_km]
    prev_week_volume_km = round(sum(prev_distances), 2) if prev_distances else None

    # Volume change calculation
    volume_change_pct: Optional[float] = None
    volume_alert = False
    if prev_week_volume_km and prev_week_volume_km > 0:
        volume_change_pct = round(
            ((total_volume_km - prev_week_volume_km) / prev_week_volume_km) * 100, 1
        )
        max_increase = TRAINING_RULES["max_weekly_volume_increase_percent"]
        volume_alert = volume_change_pct > max_increase

    return WeeklyStats(
        week_start=week_start,
        total_volume_km=total_volume_km,
        run_count=run_count,
        long_run_km=long_run_km,
        avg_hr=avg_hr,
        total_duration_min=total_duration_min,
        workouts_by_type=workouts_by_type,
        planned_count=len(planned_rows),
        actual_count=len(actual_rows),
        prev_week_volume_km=prev_week_volume_km,
        volume_change_pct=volume_change_pct,
        volume_alert=volume_alert,
    )


# ---------------------------------------------------------------------------
# Running Stats & Personal Records
# ---------------------------------------------------------------------------


def _pace_to_seconds(pace: str) -> float:
    """Convert 'MM:SS' pace string to total seconds."""
    parts = pace.split(":")
    return int(parts[0]) * 60 + int(parts[1])


def _seconds_to_pace(secs: float) -> str:
    """Convert total seconds to 'MM:SS' pace string."""
    m, s = divmod(int(secs), 60)
    return f"{m}:{s:02d}"


@router.get("/stats/running", response_model=RunningStats)
def get_running_stats(
    granularity: str = "yearly", db: Session = Depends(get_db)
) -> RunningStats:
    """Return running progression and personal records.

    Args:
        granularity: 'yearly' or 'monthly'.
        db: Database session.

    Returns:
        RunningStats with progression data, PRs, and total activity count.
    """
    runs = (
        db.query(ActualWorkoutORM)
        .filter(ActualWorkoutORM.type == WorkoutType.run)
        .order_by(ActualWorkoutORM.date)
        .all()
    )

    # Filter out hikes mapped as runs (pace > 12:00/km = hiking)
    actual_runs = [
        r for r in runs
        if r.avg_pace_per_km and _pace_to_seconds(r.avg_pace_per_km) < 720
    ]

    # --- Progression ---
    from collections import defaultdict

    period_data: dict[str, list] = defaultdict(list)
    for r in actual_runs:
        if granularity == "monthly":
            key = r.date.strftime("%Y-%m")
        else:
            key = str(r.date.year)
        period_data[key].append(r)

    progression: list[RunningPeriodStats] = []
    for period_key in sorted(period_data.keys()):
        group = period_data[period_key]
        distances = [r.distance_km for r in group if r.distance_km]
        hrs = [r.avg_hr for r in group if r.avg_hr]
        paces = [_pace_to_seconds(r.avg_pace_per_km) for r in group if r.avg_pace_per_km]

        progression.append(RunningPeriodStats(
            period=period_key,
            total_km=round(sum(distances), 2),
            run_count=len(group),
            avg_pace=_seconds_to_pace(sum(paces) / len(paces)) if paces else None,
            avg_hr=round(sum(hrs) / len(hrs)) if hrs else None,
        ))

    # --- Personal Records ---
    personal_records: list[PersonalRecord] = []

    # Best pace for distances (only if run >= that distance)
    pr_distances = [
        ("1K", 1.0),
        ("5K", 5.0),
        ("10K", 10.0),
        ("15K", 15.0),
        ("20K", 20.0),
    ]
    for label, min_km in pr_distances:
        eligible = [
            r for r in actual_runs
            if r.distance_km and r.distance_km >= min_km and r.avg_pace_per_km
        ]
        if eligible:
            best = min(eligible, key=lambda r: _pace_to_seconds(r.avg_pace_per_km))
            personal_records.append(PersonalRecord(
                distance_label=label,
                value=f"{best.avg_pace_per_km}/km",
                date=best.date,
                activity_name=best.name,
            ))

    # Farthest run
    if actual_runs:
        farthest = max(actual_runs, key=lambda r: r.distance_km or 0)
        if farthest.distance_km:
            personal_records.append(PersonalRecord(
                distance_label="Farthest",
                value=f"{farthest.distance_km:.2f} km",
                date=farthest.date,
                activity_name=farthest.name,
            ))

    # Longest run (by duration)
    runs_with_duration = [r for r in actual_runs if r.duration_min]
    if runs_with_duration:
        longest = max(runs_with_duration, key=lambda r: r.duration_min)
        hours, mins = divmod(int(longest.duration_min), 60)
        duration_str = f"{hours}h{mins:02d}" if hours else f"{int(longest.duration_min)} min"
        personal_records.append(PersonalRecord(
            distance_label="Longest",
            value=duration_str,
            date=longest.date,
            activity_name=longest.name,
        ))

    # Total activities (all types)
    total_activities = db.query(ActualWorkoutORM).count()

    return RunningStats(
        progression=progression,
        personal_records=personal_records,
        total_activities=total_activities,
    )


# ---------------------------------------------------------------------------
# Training Plan Generation
# ---------------------------------------------------------------------------


class GeneratePlanRequest(BaseModel):
    """Request body for training plan generation."""

    starting_volume_km: float = 12.0
    weeks_ahead: int = 17
    start_date: Optional[date] = None


@router.post("/schedule/generate-plan", status_code=201)
def generate_plan(
    payload: GeneratePlanRequest, db: Session = Depends(get_db)
) -> dict:
    """Generate a progressive multi-week training plan.

    Creates planned run workouts following the 10% rule with 3 runs/week.

    Args:
        payload: Plan generation parameters.
        db: Database session.

    Returns:
        Plan summary with weekly breakdown.
    """
    return generate_training_plan(
        db=db,
        starting_volume_km=payload.starting_volume_km,
        weeks_ahead=payload.weeks_ahead,
        start_date=payload.start_date,
    )


@router.post("/schedule/adjust-plan", status_code=201)
def adjust_plan(
    weeks_ahead: Optional[int] = None, db: Session = Depends(get_db)
) -> dict:
    """Adjust the training plan based on current week's actual progress.

    Uses completed running volume as the new baseline and regenerates
    future weeks with 10% progression. If weeks_ahead is None, auto-detects
    based on upcoming races.

    Args:
        weeks_ahead: Number of future weeks to regenerate.
        db: Database session.

    Returns:
        Adjusted plan summary.
    """
    return adjust_plan_from_progress(db=db, weeks_ahead=weeks_ahead)

