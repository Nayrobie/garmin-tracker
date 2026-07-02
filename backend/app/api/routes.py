"""API route handlers."""
import uuid
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
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
    UserSettingsORM,
    UserSettingsRead,
    UserSettingsUpdate,
    WeeklySchedule,
    WeeklyStats,
    RunningPeriodStats,
    RunningStats,
    PersonalRecord,
    WorkoutType,
    SleepRecordORM,
    SleepRecordRead,
    MenstrualCycleORM,
    MenstrualCycleRead,
)
from app.services.body_composition_service import BodyCompositionRecord, load_body_composition
from app.services.garmin_service import (
    flush_garmin_workouts_for_range,
    push_planned_workout,
    push_week_to_garmin,
    sync_garmin_activities,
    sync_garmin_sleep,
    sync_hrv_and_cycle_day,
    sync_menstrual_cycles,
)

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
# User Settings
# ---------------------------------------------------------------------------


def _get_settings(db: Session) -> UserSettingsORM:
    """Return the singleton settings row, creating it with defaults if missing.

    Args:
        db: Database session.

    Returns:
        The UserSettingsORM instance (id=1).
    """
    settings = db.get(UserSettingsORM, 1)
    if settings is None:
        settings = UserSettingsORM(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/settings", response_model=UserSettingsRead)
def get_settings(db: Session = Depends(get_db)) -> UserSettingsORM:
    """Return the current user settings."""
    return _get_settings(db)


@router.put("/settings", response_model=UserSettingsRead)
def update_settings(
    payload: UserSettingsUpdate, db: Session = Depends(get_db)
) -> UserSettingsORM:
    """Partially update user settings (only supplied fields are changed).

    Args:
        payload: Fields to update.
        db: Database session.

    Returns:
        Updated settings.
    """
    settings = _get_settings(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings


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
    last_pushed = sync_state.last_pushed_at if sync_state else None

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

    return WeeklySchedule(week_start=week_start, days=days, last_sync=last_sync, last_pushed=last_pushed)


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


@router.post("/schedule/generate-plan")
def generate_training_plan_route(
    starting_volume_km: float = 12.0,
    weeks_ahead: int = 17,
    start_date: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Generate a progressive multi-week training plan and save to DB.

    Args:
        starting_volume_km: Total running km for week 1.
        weeks_ahead: Number of weeks to plan.
        start_date: ISO date of week 1 Monday (defaults to this Monday).
        db: Database session.

    Returns:
        Plan summary with weekly breakdown.
    """
    from app.services.training_plan_service import generate_training_plan

    parsed_start = date.fromisoformat(start_date) if start_date else None
    return generate_training_plan(
        db,
        starting_volume_km=starting_volume_km,
        weeks_ahead=weeks_ahead,
        start_date=parsed_start,
    )


@router.post("/schedule/adjust-plan")
def adjust_training_plan_route(
    weeks_ahead: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Regenerate the training plan based on actual progress this week.

    Args:
        weeks_ahead: Weeks to plan ahead. Defaults to auto (through last race).
        db: Database session.

    Returns:
        Adjusted plan summary.
    """
    from app.services.training_plan_service import adjust_plan_from_progress

    return adjust_plan_from_progress(db, weeks_ahead=weeks_ahead)


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
    """Return the last Garmin sync and push timestamps."""
    sync_state = db.get(GarminSyncStateORM, 1)
    return {
        "last_sync": sync_state.last_sync_at if sync_state else None,
        "last_pushed": sync_state.last_pushed_at if sync_state else None,
    }


@router.post("/workouts/planned/{planned_id}/push-to-garmin")
def push_single_workout_to_garmin(
    planned_id: int, db: Session = Depends(get_db)
) -> dict:
    """Upload a single planned workout to Garmin Connect and schedule it.

    Idempotent: if the workout was already pushed, returns the existing ID.

    Args:
        planned_id: Primary key of the planned workout.
        db: Database session.

    Returns:
        Dict with ``garmin_workout_id`` and ``status``.

    Raises:
        HTTPException: 404 if workout not found.
    """
    planned = db.get(PlannedWorkoutORM, planned_id)
    if planned is None:
        raise HTTPException(status_code=404, detail="Planned workout not found")
    result = push_planned_workout(planned_id, db)
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Planned workout not found")
    return result


@router.post("/garmin/push-week")
def push_week(
    week_start: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Upload all planned workouts for a given week to Garmin Connect.

    Always flushes the target week first (idempotent re-push). The
    previous-week flush is controlled by the ``flush_garmin_on_push``
    user setting (see Settings page).

    Args:
        week_start: ISO date (YYYY-MM-DD) of the Monday of the target week.
            Defaults to the current week's Monday.
        db: Database session.

    Returns:
        Dict with ``pushed``, ``skipped``, ``flushed``, and ``errors`` counts.
    """
    if week_start:
        ws = date.fromisoformat(week_start)
    else:
        today = date.today()
        ws = today - timedelta(days=today.weekday())  # current week's Monday
    return push_week_to_garmin(ws, db)


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
    saturday = week_start + timedelta(days=5)
    distances = [a.distance_km for a in actual_rows if a.distance_km]
    total_volume_km = round(sum(distances), 2)
    run_distances = [a.distance_km for a in actual_rows if a.distance_km and a.type.value == "run"]
    # Long run = Saturday run specifically (not the week's max run)
    saturday_run = next(
        (a for a in actual_rows if a.date == saturday and a.type.value == "run"), None
    )
    long_run_km = round(saturday_run.distance_km, 2) if saturday_run and saturday_run.distance_km else 0.0
    run_count = len(run_distances)
    total_duration_min = round(
        sum(a.duration_min for a in actual_rows if a.duration_min), 1
    )

    hr_values = [a.avg_hr for a in actual_rows if a.avg_hr]
    avg_hr = round(sum(hr_values) / len(hr_values)) if hr_values else None

    workouts_by_type: dict[str, int] = {}
    for a in actual_rows:
        workouts_by_type[a.type.value] = workouts_by_type.get(a.type.value, 0) + 1

    # Planned run metrics
    planned_runs = [p for p in planned_rows if p.type.value == "run"]
    planned_run_count = len(planned_runs)

    def _planned_km(p: PlannedWorkoutORM) -> float:
        if p.goal_duration_min and p.goal_pace_per_km:
            try:
                parts = p.goal_pace_per_km.split(":")
                pace_secs = int(parts[0]) * 60 + int(parts[1])
                if pace_secs > 0:
                    return round((p.goal_duration_min * 60) / pace_secs, 2)
            except (ValueError, IndexError):
                pass
        return 0.0

    planned_run_kms = [_planned_km(p) for p in planned_runs]
    planned_volume_km = round(sum(planned_run_kms), 2)
    # Planned long run = Saturday planned run specifically
    saturday_planned_run = next(
        (p for p in planned_rows if p.date == saturday and p.type.value == "run"), None
    )
    planned_long_run_km = _planned_km(saturday_planned_run) if saturday_planned_run else 0.0

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
        settings = db.get(UserSettingsORM, 1)
        max_increase = settings.max_weekly_volume_increase_pct if settings else 10
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
        planned_run_count=planned_run_count,
        planned_volume_km=planned_volume_km,
        planned_long_run_km=planned_long_run_km,
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

    # Filter out hikes mapped as runs (pace above threshold = hiking)
    settings = db.get(UserSettingsORM, 1)
    hiking_threshold = settings.hiking_pace_threshold_sec if settings else 720
    actual_runs = [
        r for r in runs
        if r.avg_pace_per_km and _pace_to_seconds(r.avg_pace_per_km) < hiking_threshold
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

    if granularity == "monthly":
        # Span from the earliest run's month to the current month (inclusive)
        today = date.today()
        if actual_runs:
            first = actual_runs[0].date
            start_year, start_month = first.year, first.month
        else:
            start_year, start_month = today.year, today.month
        monthly_keys: list[str] = []
        y, m = start_year, start_month
        while (y, m) <= (today.year, today.month):
            monthly_keys.append(f"{y:04d}-{m:02d}")
            m += 1
            if m > 12:
                m = 1
                y += 1

        for period_key in monthly_keys:
            group = period_data.get(period_key, [])
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
    else:
        # Yearly: all years with data
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
# Sleep
# ---------------------------------------------------------------------------


@router.get("/sleep", response_model=List[SleepRecordRead])
def get_sleep_records(
    start: str, end: str, db: Session = Depends(get_db)
) -> list[SleepRecordORM]:
    """Return sleep records for a date range.

    Args:
        start: ISO date string (inclusive).
        end: ISO date string (inclusive).
        db: Database session.

    Returns:
        List of sleep records ordered by date.
    """
    return (
        db.query(SleepRecordORM)
        .filter(SleepRecordORM.date >= start, SleepRecordORM.date <= end)
        .order_by(SleepRecordORM.date)
        .all()
    )


@router.post("/sleep/sync")
def sync_sleep(
    days_back: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Trigger a Garmin sleep data sync.

    Args:
        days_back: Number of days to sync back. If omitted, uses incremental
            logic (from the oldest missing day). Pass a large value (e.g. 1825)
            to do a full historical sync.
        db: Database session.

    Returns:
        Dict with synced count and optional error.
    """
    if days_back is not None:
        # Explicit override — caller knows exactly how far back they want
        pass
    else:
        # Incremental: pull from the day after the latest record to today.
        # For the very first sync (no records), go back 2 years to capture full history.
        today = date.today()
        latest = (
            db.query(SleepRecordORM)
            .order_by(SleepRecordORM.date.desc())
            .first()
        )
        if latest:
            days_back = (today - latest.date).days + 1
        else:
            days_back = 730  # first sync: 2 years
    result = sync_garmin_sleep(db, days_back=days_back)
    # Also enrich with HRV + cycle data after syncing sleep
    enrich_result = sync_hrv_and_cycle_day(db, days_back=days_back)
    return {
        "synced": result.get("synced", 0),
        "enriched": enrich_result.get("enriched", 0),
        "error": result.get("error") or enrich_result.get("error"),
    }


@router.post("/sleep/enrich")
def enrich_sleep(
    days_back: Optional[int] = None, db: Session = Depends(get_db)
) -> dict:
    """Enrich sleep records with HRV and cycle day/phase.

    Args:
        days_back: Number of days to enrich. Defaults to user setting.
        db: Database session.

    Returns:
        Dict with enriched count and optional error.
    """
    if days_back is None:
        days_back = 30  # default for manual enrich calls
    return sync_hrv_and_cycle_day(db, days_back=days_back)


# ---------------------------------------------------------------------------
# Menstrual Cycles
# ---------------------------------------------------------------------------


@router.get("/cycles", response_model=List[MenstrualCycleRead])
def get_cycles(db: Session = Depends(get_db)) -> list[MenstrualCycleORM]:
    """Return all menstrual cycles ordered by start date.

    Args:
        db: Database session.

    Returns:
        List of menstrual cycles.
    """
    return (
        db.query(MenstrualCycleORM)
        .order_by(MenstrualCycleORM.start_date)
        .all()
    )


@router.post("/cycles/sync")
def sync_cycles(
    days_back: Optional[int] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Trigger a Garmin menstrual cycle sync.

    Args:
        days_back: Number of days to sync back. If omitted, syncs from the
            oldest existing cycle to today so no gaps are created.
            Pass a large value (e.g. 1825) for a full historical backfill.
        db: Database session.

    Returns:
        Dict with synced count and optional error.
    """
    if days_back is not None:
        pass
    else:
        # Cover the full span from the oldest known cycle to today so that
        # any gaps inside the known range are filled on every sync.
        today = date.today()
        oldest_cycle = (
            db.query(MenstrualCycleORM)
            .order_by(MenstrualCycleORM.start_date.asc())
            .first()
        )
        if oldest_cycle:
            oldest_date = date.fromisoformat(str(oldest_cycle.start_date))
            days_back = (today - oldest_date).days + 1
        else:
            days_back = 730  # first sync: 2 years
    return sync_menstrual_cycles(db, days_back=days_back)


# ---------------------------------------------------------------------------
# Google Tasks OAuth
# ---------------------------------------------------------------------------


@router.get("/google/auth-url")
def google_auth_url() -> dict:
    """Get Google OAuth2 authorization URL for Tasks API.

    Returns:
        Dict with ``url`` key (or error if not configured).
    """
    from app.services.google_tasks_service import get_auth_url

    url = get_auth_url()
    if url is None:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    return {"url": url}


@router.get("/google/callback")
def google_callback(code: str) -> dict:
    """Handle Google OAuth2 callback and store tokens.

    Args:
        code: Authorization code from Google.

    Returns:
        Dict with ``status`` key.
    """
    from app.services.google_tasks_service import handle_callback

    error = handle_callback(code)
    if error:
        raise HTTPException(status_code=500, detail=error)
    # Return an HTML page that closes itself / redirects to settings
    from fastapi.responses import HTMLResponse

    return HTMLResponse(
        "<html><body><script>window.close(); window.opener && window.opener.location.reload();</script>"
        "<p>Connected! You can close this tab.</p></body></html>"
    )


@router.get("/google/status")
def google_status() -> dict:
    """Check if Google Tasks is connected.

    Returns:
        Dict with ``connected`` boolean.
    """
    from app.services.google_tasks_service import is_connected

    return {"connected": is_connected()}


@router.post("/google/disconnect")
def google_disconnect() -> dict:
    """Disconnect Google Tasks (remove stored tokens).

    Returns:
        Dict with ``status`` key.
    """
    from app.services.google_tasks_service import disconnect

    disconnect()
    return {"status": "disconnected"}


@router.post("/google/push-week-tasks")
def push_week_tasks(
    week_start: Optional[str] = None,
    db: Session = Depends(get_db),
) -> dict:
    """Push Google Tasks for all planned workouts in a given week.

    Creates a task for each planned workout that doesn't already have one.

    Args:
        week_start: ISO date (YYYY-MM-DD) of the Monday. Defaults to current Monday.
        db: Database session.

    Returns:
        Dict with ``created`` and ``skipped`` counts.
    """
    from app.services.google_tasks_service import create_workout_task, is_connected

    if not is_connected():
        raise HTTPException(status_code=400, detail="Google Tasks not connected")

    if week_start:
        ws = date.fromisoformat(week_start)
    else:
        today = date.today()
        ws = today - timedelta(days=today.weekday())

    week_end = ws + timedelta(days=6)
    planned_workouts = (
        db.query(PlannedWorkoutORM)
        .filter(PlannedWorkoutORM.date >= ws, PlannedWorkoutORM.date <= week_end)
        .all()
    )

    created = 0
    skipped = 0
    for pw in planned_workouts:
        task_id = create_workout_task(pw)
        if task_id and task_id != pw.google_task_id:
            pw.google_task_id = task_id
            created += 1
        else:
            skipped += 1

    db.commit()
    return {"created": created, "skipped": skipped}


