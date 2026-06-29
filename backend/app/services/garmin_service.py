"""Garmin Connect sync service.

Fetches recent activities from Garmin Connect via the garminconnect library
and upserts them into the local actual_workouts table.

When GARMIN_EMAIL / GARMIN_PASSWORD are not set the sync is a no-op and
returns a descriptive message — this lets the app start without credentials.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.config import GARMIN_EMAIL, GARMIN_PASSWORD
from app.models.workout import ActualWorkoutORM, GarminSyncStateORM, PlannedWorkoutORM, WorkoutType

logger = logging.getLogger(__name__)

# Activity type keys that should never be imported into the calendar
_BLACKLISTED_TYPES: frozenset[str] = frozenset({
    "stop_watch",
    "other",
})

_GARMIN_TYPE_MAP: dict[str, WorkoutType] = {
    # Running
    "running": WorkoutType.run,
    "trail_running": WorkoutType.run,
    "treadmill_running": WorkoutType.run,
    "track_running": WorkoutType.run,
    "virtual_run": WorkoutType.run,
    "ultra_run": WorkoutType.run,
    # Cycling
    "cycling": WorkoutType.cycle,
    "road_biking": WorkoutType.cycle,
    "indoor_cycling": WorkoutType.cycle,
    "mountain_biking": WorkoutType.cycle,
    "mountain_biking_trail": WorkoutType.cycle,
    "gravel_cycling": WorkoutType.cycle,
    "virtual_ride": WorkoutType.cycle,
    # Strength / cardio
    "strength_training": WorkoutType.strength,
    "cardio_training": WorkoutType.strength,
    "hiit": WorkoutType.strength,
    # Yoga / flexibility
    "yoga": WorkoutType.yoga,
    "pilates": WorkoutType.pilates,
    "flexibility": WorkoutType.yoga,
    "breathwork": WorkoutType.yoga,
    "meditation": WorkoutType.yoga,
    # Hiking/walking → run bucket (outdoor endurance)
    "hiking": WorkoutType.run,
    "walking": WorkoutType.run,
    "indoor_walking": WorkoutType.run,
}

# Compatible type groups for auto-matching actual → planned workouts.
# If an actual workout's type is in the same group as a planned workout's type,
# they can be matched together (same day).
_COMPATIBLE_TYPES: list[set[WorkoutType]] = [
    {WorkoutType.run},
    {WorkoutType.cycle},
    {WorkoutType.strength},  # hiit, cardio, strength all map to strength
    {WorkoutType.yoga, WorkoutType.pilates},  # yoga and pilates are interchangeable
]


def _types_compatible(actual_type: WorkoutType, planned_type: WorkoutType) -> bool:
    """Check if an actual workout type is compatible with a planned type.

    Args:
        actual_type: Type from Garmin sync.
        planned_type: Type from planned workout.

    Returns:
        True if the types belong to the same compatibility group.
    """
    if actual_type == planned_type:
        return True
    for group in _COMPATIBLE_TYPES:
        if actual_type in group and planned_type in group:
            return True
    return False


def _map_activity_type(garmin_type: str) -> WorkoutType:
    """Map a Garmin activity type string to a WorkoutType enum value.

    Args:
        garmin_type: Raw activity type string from Garmin API.

    Returns:
        Matching WorkoutType; falls back to WorkoutType.other.
    """
    return _GARMIN_TYPE_MAP.get(garmin_type.lower(), WorkoutType.other)


def _format_pace(avg_speed_mps: float | None) -> str | None:
    """Convert average speed (m/s) to a MM:SS/km pace string.

    Args:
        avg_speed_mps: Average speed in metres per second; None if unavailable.

    Returns:
        Pace string like "5:30", or None if speed is zero or None.
    """
    if not avg_speed_mps:
        return None
    secs_per_km = 1000 / avg_speed_mps
    minutes, seconds = divmod(int(secs_per_km), 60)
    return f"{minutes}:{seconds:02d}"


def _upsert_activity(db: Session, activity: dict[str, Any]) -> bool:
    """Insert or update a single Garmin activity in the DB.

    Args:
        db: Active database session.
        activity: Raw activity dict from garminconnect.

    Returns:
        True if a new row was inserted, False if an existing row was updated.
    """
    garmin_id = str(activity.get("activityId", ""))
    if not garmin_id:
        return False

    # Skip blacklisted activity types
    garmin_type: str = (
        activity.get("activityType", {}).get("typeKey", "")
        if isinstance(activity.get("activityType"), dict)
        else str(activity.get("activityType", ""))
    )
    if garmin_type.lower() in _BLACKLISTED_TYPES:
        return False

    existing = (
        db.query(ActualWorkoutORM)
        .filter(ActualWorkoutORM.garmin_activity_id == garmin_id)
        .first()
    )

    start_time_str: str = activity.get("startTimeLocal", "")
    try:
        activity_date = datetime.fromisoformat(start_time_str).date()
    except (ValueError, TypeError):
        activity_date = date.today()

    duration_s: float = activity.get("duration", 0) or 0
    distance_m: float = activity.get("distance", 0) or 0
    avg_hr: int | None = activity.get("averageHR")
    avg_speed: float | None = activity.get("averageSpeed")
    calories: int | None = activity.get("calories")
    activity_name: str | None = activity.get("activityName")
    # garmin_type already extracted above for blacklist check

    fields = {
        "date": activity_date,
        "type": _map_activity_type(garmin_type),
        "name": activity_name,
        "duration_min": round(duration_s / 60, 1) if duration_s else None,
        "distance_km": round(distance_m / 1000, 3) if distance_m else None,
        "avg_hr": int(avg_hr) if avg_hr else None,
        "avg_pace_per_km": _format_pace(avg_speed),
        "calories": int(calories) if calories else None,
        "synced_at": datetime.utcnow(),
    }

    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
        return False
    else:
        row = ActualWorkoutORM(garmin_activity_id=garmin_id, **fields)
        db.add(row)
        return True


def sync_garmin_activities(
    db: Session, *, all_time: bool = False, days_back: int | None = None
) -> dict:
    """Pull activities from Garmin Connect and upsert into the DB.

    Sync range logic:
    - ``all_time=True``: fetch from 2015-01-01 to today (full history).
    - ``days_back`` specified: fetch that many days back.
    - Otherwise (default): fetch from last sync date to today (incremental).
      Falls back to 30 days if no previous sync exists.

    Args:
        db: Active database session.
        all_time: If True, pull all historical activities.
        days_back: Explicit number of days to look back (overrides incremental).

    Returns:
        Dict summarising the sync result:
        ``{"synced": int, "updated": int, "error": str | None}``.
    """
    if not GARMIN_EMAIL or not GARMIN_PASSWORD:
        logger.warning("Garmin credentials not configured — skipping sync.")
        return {
            "synced": 0,
            "updated": 0,
            "error": "Garmin credentials not configured. Set GARMIN_EMAIL and GARMIN_PASSWORD.",
        }

    try:
        from garminconnect import Garmin  # type: ignore[import]
    except ImportError:
        return {
            "synced": 0,
            "updated": 0,
            "error": "garminconnect package not installed. Run: pip install garminconnect",
        }

    # Determine date range
    end_date = date.today()
    if all_time:
        start_date = date(2015, 1, 1)
    elif days_back is not None:
        start_date = end_date - timedelta(days=days_back)
    else:
        # Incremental: from last sync date (with 1-day overlap for safety)
        sync_state = db.get(GarminSyncStateORM, 1)
        if sync_state and sync_state.last_sync_at:
            start_date = sync_state.last_sync_at.date() - timedelta(days=1)
        else:
            start_date = end_date - timedelta(days=30)

    try:
        client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login()

        activities: list[dict] = client.get_activities_by_date(
            start_date.isoformat(), end_date.isoformat()
        )
    except Exception as exc:
        err_msg = str(exc)
        if "429" in err_msg or "rate" in err_msg.lower():
            logger.warning("Garmin rate-limited: %s", err_msg)
            return {
                "synced": 0,
                "updated": 0,
                "error": "Garmin rate-limited — wait a few minutes and try again.",
            }
        logger.exception("Garmin sync failed during login/fetch")
        return {"synced": 0, "updated": 0, "error": f"Sync failed: {exc}"}

    inserted = 0
    updated = 0
    for activity in activities:
        is_new = _upsert_activity(db, activity)
        if is_new:
            inserted += 1
        else:
            updated += 1

    # Update singleton sync-state row
    sync_state = db.get(GarminSyncStateORM, 1)
    if sync_state is None:
        sync_state = GarminSyncStateORM(id=1, last_sync_at=datetime.utcnow())
        db.add(sync_state)
    else:
        sync_state.last_sync_at = datetime.utcnow()

    db.commit()

    # Auto-match unlinked actual workouts to planned workouts
    _auto_match_workouts(db)

    logger.info("Garmin sync complete: %d inserted, %d updated.", inserted, updated)
    return {"synced": inserted, "updated": updated, "error": None}


def _auto_match_workouts(db: Session) -> None:
    """Link unmatched actual workouts to planned workouts on the same day.

    Uses type compatibility groups so that e.g. a Garmin HIIT activity
    (mapped to 'strength') matches a planned 'strength' workout, and a
    Garmin 'pilates' activity matches a planned 'yoga' or 'pilates' workout.

    Only matches if there's exactly one compatible planned workout on that day
    that isn't already matched to another actual workout.

    Args:
        db: Database session.
    """
    unmatched = (
        db.query(ActualWorkoutORM)
        .filter(ActualWorkoutORM.planned_workout_id.is_(None))
        .all()
    )

    if not unmatched:
        return

    for actual in unmatched:
        # Find planned workouts on the same day
        planned_on_day = (
            db.query(PlannedWorkoutORM)
            .filter(PlannedWorkoutORM.date == actual.date)
            .all()
        )

        # Filter to compatible types
        compatible = [
            p for p in planned_on_day
            if _types_compatible(actual.type, WorkoutType(p.type.value))
        ]

        if len(compatible) != 1:
            continue

        planned = compatible[0]

        # Check this planned workout isn't already claimed by another actual
        already_matched = (
            db.query(ActualWorkoutORM)
            .filter(
                ActualWorkoutORM.planned_workout_id == planned.id,
                ActualWorkoutORM.id != actual.id,
            )
            .first()
        )
        if already_matched:
            continue

        actual.planned_workout_id = planned.id

    db.commit()
