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
    WeeklySchedule,
)
from app.services.garmin_service import sync_garmin_activities

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
def trigger_garmin_sync(db: Session = Depends(get_db)) -> dict:
    """Manually trigger a Garmin activity sync.

    Pulls recent activities from Garmin Connect and upserts them into
    the actual_workouts table.

    Args:
        db: Database session.

    Returns:
        Dict with sync result summary.
    """
    result = sync_garmin_activities(db)
    return result


@router.get("/garmin/sync/status")
def get_sync_status(db: Session = Depends(get_db)) -> dict:
    """Return the last Garmin sync timestamp."""
    sync_state = db.get(GarminSyncStateORM, 1)
    return {"last_sync": sync_state.last_sync_at if sync_state else None}

