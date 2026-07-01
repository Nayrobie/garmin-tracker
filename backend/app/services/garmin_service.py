"""Garmin Connect sync service.

Fetches recent activities from Garmin Connect via the garminconnect library
and upserts them into the local actual_workouts table.

When GARMIN_EMAIL / GARMIN_PASSWORD are not set the sync is a no-op and
returns a descriptive message — this lets the app start without credentials.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.config import GARMIN_EMAIL, GARMIN_PASSWORD
from app.models.workout import (
    ActualWorkoutORM,
    GarminSyncStateORM,
    PlannedWorkoutORM,
    SleepRecordORM,
    WorkoutType,
)

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
            start_date = end_date - timedelta(days=365)  # first-ever sync: pull 1 year of history

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


def sync_garmin_sleep(
    db: Session, *, days_back: int = 30
) -> dict:
    """Pull sleep data from Garmin Connect and upsert into the DB.

    Args:
        db: Active database session.
        days_back: Number of days of sleep data to fetch.

    Returns:
        Dict summarising the sync result.
    """
    if not GARMIN_EMAIL or not GARMIN_PASSWORD:
        return {
            "synced": 0,
            "error": "Garmin credentials not configured.",
        }

    try:
        from garminconnect import Garmin  # type: ignore[import]
    except ImportError:
        return {
            "synced": 0,
            "error": "garminconnect package not installed.",
        }

    try:
        client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login()
    except Exception as exc:
        logger.exception("Garmin sleep sync login failed")
        return {"synced": 0, "error": f"Login failed: {exc}"}

    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)
    inserted = 0

    current = start_date
    while current <= end_date:
        try:
            sleep_data = client.get_sleep_data(current.isoformat())
        except Exception:
            current += timedelta(days=1)
            continue

        if not sleep_data:
            current += timedelta(days=1)
            continue

        # Extract sleep summary
        daily_summary = sleep_data.get("dailySleepDTO", {})
        if not daily_summary:
            current += timedelta(days=1)
            continue

        sleep_date_str = daily_summary.get("calendarDate")
        if not sleep_date_str:
            current += timedelta(days=1)
            continue

        try:
            sleep_date = date.fromisoformat(sleep_date_str)
        except (ValueError, TypeError):
            sleep_date = current

        total_sec = daily_summary.get("sleepTimeSeconds") or 0
        deep_sec = daily_summary.get("deepSleepSeconds") or 0
        light_sec = daily_summary.get("lightSleepSeconds") or 0
        rem_sec = daily_summary.get("remSleepSeconds") or 0
        awake_sec = daily_summary.get("awakeSleepSeconds") or 0

        # Sleep score from dailySleepDTO.sleepScores.overall.value
        sleep_scores = daily_summary.get("sleepScores", {})
        overall = sleep_scores.get("overall", {}) if sleep_scores else {}
        score = overall.get("value") if overall else None

        # Start/end times
        start_ts = daily_summary.get("sleepStartTimestampLocal")
        end_ts = daily_summary.get("sleepEndTimestampLocal")
        start_time_str = None
        end_time_str = None
        if start_ts:
            try:
                start_time_str = datetime.fromtimestamp(start_ts / 1000).strftime("%H:%M")
            except (ValueError, OSError):
                pass
        if end_ts:
            try:
                end_time_str = datetime.fromtimestamp(end_ts / 1000).strftime("%H:%M")
            except (ValueError, OSError):
                pass

        # Upsert
        existing = (
            db.query(SleepRecordORM)
            .filter(SleepRecordORM.date == sleep_date)
            .first()
        )

        fields = {
            "total_sleep_min": total_sec // 60 if total_sec else None,
            "deep_sleep_min": deep_sec // 60 if deep_sec else None,
            "light_sleep_min": light_sec // 60 if light_sec else None,
            "rem_sleep_min": rem_sec // 60 if rem_sec else None,
            "awake_min": awake_sec // 60 if awake_sec else None,
            "sleep_score": score,
            "start_time": start_time_str,
            "end_time": end_time_str,
            "synced_at": datetime.utcnow(),
        }

        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
        else:
            row = SleepRecordORM(date=sleep_date, **fields)
            db.add(row)
            inserted += 1

        current += timedelta(days=1)

    db.commit()
    logger.info("Sleep sync complete: %d new records.", inserted)
    return {"synced": inserted, "error": None}


# ---------------------------------------------------------------------------
# Menstrual Cycle Sync
# ---------------------------------------------------------------------------

CYCLE_PHASES = {1: "menstruation", 2: "follicular", 3: "ovulation", 4: "luteal"}


def sync_menstrual_cycles(
    db: Session, *, days_back: int = 365
) -> dict:
    """Pull menstrual cycle data from Garmin Connect and upsert into the DB.

    Args:
        db: Active database session.
        days_back: How far back to fetch cycle data.

    Returns:
        Dict summarising the sync result.
    """
    from app.models.workout import MenstrualCycleORM

    if not GARMIN_EMAIL or not GARMIN_PASSWORD:
        return {"synced": 0, "error": "Garmin credentials not configured."}

    try:
        from garminconnect import Garmin  # type: ignore[import]
    except ImportError:
        return {"synced": 0, "error": "garminconnect package not installed."}

    try:
        client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login()
    except Exception as exc:
        logger.exception("Garmin menstrual sync login failed")
        return {"synced": 0, "error": f"Login failed: {exc}"}

    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)
    inserted = 0

    # Garmin limits to 92-day windows, so chunk the requests
    current_start = start_date
    all_summaries: list[dict] = []
    while current_start < end_date:
        chunk_end = min(current_start + timedelta(days=91), end_date)
        try:
            data = client.get_menstrual_calendar_data(
                current_start.isoformat(), chunk_end.isoformat()
            )
            summaries = data.get("cycleSummaries", [])
            all_summaries.extend(summaries)
        except Exception:
            pass
        current_start = chunk_end + timedelta(days=1)

    for summary in all_summaries:
        start_str = summary.get("startDate")
        if not start_str:
            continue
        try:
            cycle_start = date.fromisoformat(start_str)
        except (ValueError, TypeError):
            continue

        existing = (
            db.query(MenstrualCycleORM)
            .filter(MenstrualCycleORM.start_date == cycle_start)
            .first()
        )

        fields = {
            "period_length": summary.get("periodLength"),
            "fertile_window_start_day": summary.get("fertileWindowStart"),
            "fertile_window_length": summary.get("lengthOfFertileWindow"),
            "is_predicted": summary.get("predictedCycle", False),
            "synced_at": datetime.utcnow(),
        }

        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
        else:
            row = MenstrualCycleORM(start_date=cycle_start, **fields)
            db.add(row)
            inserted += 1

    db.commit()
    logger.info("Menstrual cycle sync complete: %d new cycles.", inserted)
    return {"synced": inserted, "error": None}


# ---------------------------------------------------------------------------
# HRV + Cycle Day Enrichment for Sleep Records
# ---------------------------------------------------------------------------


def sync_hrv_and_cycle_day(
    db: Session, *, days_back: int = 365
) -> dict:
    """Enrich sleep records with HRV data and menstrual cycle day/phase.

    Fetches HRV + resting HR from Garmin for each sleep record that doesn't
    already have HRV data, then computes cycle day/phase from stored cycles.

    Args:
        db: Active database session.
        days_back: How many days back to enrich.

    Returns:
        Dict summarising the enrichment result.
    """
    import time

    from app.models.workout import MenstrualCycleORM, SleepRecordORM

    if not GARMIN_EMAIL or not GARMIN_PASSWORD:
        return {"enriched": 0, "error": "Garmin credentials not configured."}

    try:
        from garminconnect import Garmin  # type: ignore[import]
    except ImportError:
        return {"enriched": 0, "error": "garminconnect package not installed."}

    try:
        client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login()
    except Exception as exc:
        logger.exception("Garmin HRV sync login failed")
        return {"enriched": 0, "error": f"Login failed: {exc}"}

    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)

    # Fetch all cycles for phase calculation
    cycles = (
        db.query(MenstrualCycleORM)
        .order_by(MenstrualCycleORM.start_date.asc())
        .all()
    )

    # Get sleep records that still need HRV enrichment
    records = (
        db.query(SleepRecordORM)
        .filter(
            SleepRecordORM.date >= start_date,
            SleepRecordORM.date <= end_date,
            SleepRecordORM.hrv_overnight.is_(None),
        )
        .order_by(SleepRecordORM.date.asc())
        .all()
    )

    if not records:
        # Still update cycle day/phase for any records missing it
        phase_only = (
            db.query(SleepRecordORM)
            .filter(
                SleepRecordORM.date >= start_date,
                SleepRecordORM.date <= end_date,
                SleepRecordORM.cycle_phase.is_(None),
            )
            .all()
        )
        for rec in phase_only:
            cycle_day, phase = _calc_cycle_day(rec.date, cycles)
            rec.cycle_day = cycle_day
            rec.cycle_phase = phase
        db.commit()
        return {"enriched": len(phase_only), "error": None}

    enriched = 0
    errors = 0

    for record in records:
        # Fetch HRV
        try:
            hrv_data = client.get_hrv_data(record.date.isoformat())
            summary = hrv_data.get("hrvSummary", {}) if isinstance(hrv_data, dict) else {}
            record.hrv_overnight = summary.get("lastNightAvg")
            record.hrv_status = summary.get("status")
        except Exception as exc:
            errors += 1
            if "429" in str(exc) or "Too Many" in str(exc):
                logger.warning("Rate limited at %s, committing progress.", record.date)
                db.commit()
                return {
                    "enriched": enriched,
                    "error": f"Rate limited after {enriched} records. Run again later for remaining.",
                }
            logger.debug("HRV fetch failed for %s: %s", record.date, exc)

        # Fetch resting HR from sleep data
        try:
            sleep_data = client.get_sleep_data(record.date.isoformat())
            record.resting_hr = sleep_data.get("restingHeartRate")
        except Exception as exc:
            if "429" in str(exc) or "Too Many" in str(exc):
                db.commit()
                return {
                    "enriched": enriched,
                    "error": f"Rate limited after {enriched} records. Run again later for remaining.",
                }

        # Calculate cycle day and phase
        cycle_day, phase = _calc_cycle_day(record.date, cycles)
        record.cycle_day = cycle_day
        record.cycle_phase = phase

        enriched += 1

        # Commit every 10 records and throttle to avoid rate limits
        if enriched % 10 == 0:
            db.commit()
            time.sleep(1)
        else:
            time.sleep(0.3)

    db.commit()
    logger.info("HRV/cycle enrichment complete: %d records enriched, %d errors.", enriched, errors)
    return {"enriched": enriched, "error": None}


def _calc_cycle_day(
    target_date: date, cycles: list
) -> tuple[int | None, str | None]:
    """Calculate the cycle day and phase for a given date.

    Args:
        target_date: The date to check.
        cycles: List of MenstrualCycleORM objects ordered by start_date.

    Returns:
        Tuple of (cycle_day, phase_name) or (None, None).
    """
    for i, cycle in enumerate(cycles):
        cycle_start = cycle.start_date
        # Determine cycle end (next cycle start or estimated)
        if i + 1 < len(cycles):
            cycle_end = cycles[i + 1].start_date - timedelta(days=1)
        else:
            # Current cycle — use predicted length or 28 days
            est_length = cycle.cycle_length or 63  # from Garmin predicted
            cycle_end = cycle_start + timedelta(days=est_length - 1)

        if cycle_start <= target_date <= cycle_end:
            day = (target_date - cycle_start).days + 1
            # If the gap to next cycle is much longer than a normal cycle,
            # wrap days using estimated cycle length to avoid a single giant luteal block.
            est_cycle = cycle.cycle_length or 28
            if day > est_cycle:
                day = ((day - 1) % est_cycle) + 1
            phase = _day_to_phase(day, cycle.period_length or 5)
            return day, phase

    return None, None


def _day_to_phase(day: int, period_length: int) -> str:
    """Map cycle day to phase name.

    Args:
        day: Day in cycle (1-based).
        period_length: Length of menstruation in days.

    Returns:
        Phase name string.
    """
    if day <= period_length:
        return "menstruation"
    if day <= 13:
        return "follicular"
    if day <= 16:
        return "ovulation"
    return "luteal"


# ---------------------------------------------------------------------------
# Garmin Workout Upload (planned → Garmin Connect)
# ---------------------------------------------------------------------------

# WorkoutTypes that can be pushed to Garmin (others silently skipped)
_PUSHABLE_TYPES: frozenset[str] = frozenset({"run", "cycle", "strength", "yoga", "pilates"})

# Sport type dicts for the workout-creation API
# (IDs confirmed by round-trip testing — differ from activity type IDs)
_SPORT_TYPES: dict[str, dict] = {
    "run":      {"sportTypeId": 1, "sportTypeKey": "running"},
    "cycle":    {"sportTypeId": 2, "sportTypeKey": "cycling"},
    "strength": {"sportTypeId": 5, "sportTypeKey": "strength_training"},
    "yoga":     {"sportTypeId": 7, "sportTypeKey": "yoga"},
    "pilates":  {"sportTypeId": 8, "sportTypeKey": "pilates"},
}

_COND_TIME: dict = {
    "conditionTypeId": 2,
    "conditionTypeKey": "time",
    "displayOrder": 2,
    "displayable": True,
}

_NO_TARGET: dict = {
    "targetType": {
        "workoutTargetTypeId": 1,
        "workoutTargetTypeKey": "no.target",
        "displayOrder": 1,
    },
    "targetValueOne": None,
    "targetValueTwo": None,
}


def _speed_target(pace_str: str, tol_mps: float = 0.08) -> dict:
    """Build a pace target displayed as MM:SS/km by Garmin.

    Uses pace.zone target type with m/s values — Garmin converts to min/km
    for display.

    Args:
        pace_str: Target pace in "MM:SS" per km format.
        tol_mps: Tolerance band in m/s (±).

    Returns:
        Target dict ready to be merged into a step dict.
    """
    try:
        parts = pace_str.strip().split(":")
        secs_per_km = int(parts[0]) * 60 + int(parts[1])
        mps = 1000 / secs_per_km
        return {
            "targetType": {
                "workoutTargetTypeId": 6,
                "workoutTargetTypeKey": "pace.zone",
                "displayOrder": 6,
            },
            "targetValueOne": round(mps - tol_mps, 4),
            "targetValueTwo": round(mps + tol_mps, 4),
        }
    except (IndexError, ValueError, ZeroDivisionError):
        return _NO_TARGET


def _make_step(
    step_type_id: int,
    step_type_key: str,
    duration_secs: int,
    target: dict | None = None,
    order: int = 1,
) -> dict:
    """Build a raw ExecutableStepDTO dict.

    Args:
        step_type_id: Garmin step type integer (1=warmup, 2=cooldown, 3=interval, 4=recovery).
        step_type_key: Matching key string.
        duration_secs: Step duration in seconds.
        target: Target dict from ``_pace_target()`` or ``_NO_TARGET``.
        order: Step order within the segment or repeat group.

    Returns:
        Raw step dict compatible with Garmin's workout API.
    """
    step: dict = {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": {
            "stepTypeId": step_type_id,
            "stepTypeKey": step_type_key,
            "displayOrder": step_type_id,
        },
        "endCondition": _COND_TIME,
        "endConditionValue": float(duration_secs),
    }
    step.update(target or _NO_TARGET)
    return step


def _repeat_group(iterations: int, steps: list[dict], order: int) -> dict:
    """Build a raw RepeatGroupDTO dict.

    Args:
        iterations: Number of repetitions.
        steps: Inner steps (their stepOrder is overwritten to 1-based).
        order: Position of this group within the outer segment.

    Returns:
        Raw repeat group dict compatible with Garmin's workout API.
    """
    return {
        "type": "RepeatGroupDTO",
        "stepOrder": order,
        "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
        "numberOfIterations": iterations,
        "workoutSteps": [
            dict(s, **{"stepOrder": i + 1}) for i, s in enumerate(steps)
        ],
        "endCondition": {
            "conditionTypeId": 7,
            "conditionTypeKey": "iterations",
            "displayOrder": 7,
            "displayable": False,
        },
        "endConditionValue": float(iterations),
        "smartRepeat": False,
    }


def _build_garmin_workout(planned: "PlannedWorkoutORM") -> dict | None:
    """Build a raw workout payload dict for ``client.upload_workout()``.

    Run workouts get structured steps (warmup + main, or warmup + repeat
    group + cooldown for intervals) with pace.zone targets displayed as
    min/km in Garmin Connect.  Strength, yoga, and pilates get a single
    timed step with no target.

    Args:
        planned: Planned workout ORM row.

    Returns:
        Raw dict ready for ``client.upload_workout()``, or ``None`` if the
        type is not pushable or the duration is missing.
    """
    workout_type = planned.type.value if hasattr(planned.type, "value") else str(planned.type)
    if workout_type not in _PUSHABLE_TYPES:
        return None

    duration_secs = int((planned.goal_duration_min or 0) * 60)
    if duration_secs <= 0:
        return None

    sport = _SPORT_TYPES[workout_type]

    notes = (planned.notes or "").strip()
    name = notes.splitlines()[0][:80] if notes else f"{workout_type.title()} {planned.goal_duration_min}min"

    if workout_type in ("strength", "yoga", "pilates", "cycle"):
        # Single timed step — no specific exercises or targets
        steps: list[dict] = [_make_step(3, "interval", duration_secs, _NO_TARGET, order=1)]
        estimated_secs = duration_secs

    else:  # run
        notes_upper = notes.upper()
        is_interval = "VMA" in notes_upper or "INTERVAL" in notes_upper
        is_long = duration_secs >= 45 * 60 or "LONG RUN" in notes_upper
        pace = planned.goal_pace_per_km or ("5:30" if is_interval else "7:20")
        warmup_secs = 10 * 60

        if is_interval:
            # 10min warmup + 8×(1min @ VMA + 1min recovery) + 5min cooldown
            interval_secs, recovery_secs, cooldown_secs, iterations = 60, 60, 5 * 60, 8
            steps = [
                _make_step(1, "warmup",   warmup_secs,    _speed_target("7:00"), order=1),
                _repeat_group(iterations, [
                    _make_step(3, "interval", interval_secs, _speed_target("5:30"), order=1),
                    _make_step(4, "recovery", recovery_secs, _speed_target("7:20"), order=2),
                ], order=2),
                _make_step(2, "cooldown", cooldown_secs,  _speed_target("7:00"), order=3),
            ]
            estimated_secs = warmup_secs + iterations * (interval_secs + recovery_secs) + cooldown_secs
        else:
            main_secs = max(duration_secs - warmup_secs, 60)
            warmup_pace = "7:00" if is_long else "7:30"
            steps = [
                _make_step(1, "warmup",   warmup_secs, _speed_target(warmup_pace), order=1),
                _make_step(3, "interval", main_secs,   _speed_target(pace),        order=2),
            ]
            estimated_secs = duration_secs

    return {
        "workoutName": name,
        "sportType": sport,
        "estimatedDurationInSecs": estimated_secs,
        "workoutSegments": [
            {"segmentOrder": 1, "sportType": sport, "workoutSteps": steps}
        ],
    }


def push_planned_workout(planned_id: int, db: Session) -> dict:
    """Upload a single planned workout to Garmin Connect and schedule it.

    Skips the upload if the workout already has a garmin_workout_id (idempotent).
    Updates the planned workout row with the returned garmin_workout_id.

    Args:
        planned_id: Primary key of the PlannedWorkoutORM row.
        db: Active database session.

    Returns:
        Dict with ``garmin_workout_id`` and ``status`` keys.
    """
    from app.models.workout import PlannedWorkoutORM

    planned = db.get(PlannedWorkoutORM, planned_id)
    if planned is None:
        return {"garmin_workout_id": None, "status": "not_found"}

    if planned.garmin_workout_id:
        return {"garmin_workout_id": planned.garmin_workout_id, "status": "already_pushed"}

    workout_type = planned.type.value if hasattr(planned.type, "value") else str(planned.type)
    if workout_type not in _PUSHABLE_TYPES:
        return {"garmin_workout_id": None, "status": f"skipped:{workout_type}"}

    if not GARMIN_EMAIL or not GARMIN_PASSWORD:
        return {"garmin_workout_id": None, "status": "error:no_credentials"}

    try:
        from garminconnect import Garmin  # type: ignore[import]
    except ImportError:
        return {"garmin_workout_id": None, "status": "error:garminconnect_not_installed"}

    payload = _build_garmin_workout(planned)
    if payload is None:
        return {"garmin_workout_id": None, "status": "error:could_not_build_workout"}

    try:
        token_store = str(Path.home() / ".garminconnect")
        client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login(token_store)
    except Exception as exc:
        logger.exception("Garmin login failed during workout push")
        return {"garmin_workout_id": None, "status": f"error:login_failed:{exc}"}

    try:
        result = client.upload_workout(payload)
        garmin_id = str(
            result.get("workoutId") or result.get("workout", {}).get("workoutId", "")
        )
        if not garmin_id:
            return {"garmin_workout_id": None, "status": "error:no_workout_id_in_response"}

        client.schedule_workout(garmin_id, planned.date.isoformat())

        planned.garmin_workout_id = garmin_id
        db.commit()

        logger.info("Pushed planned workout %d → Garmin workoutId %s", planned_id, garmin_id)
        return {"garmin_workout_id": garmin_id, "status": "pushed"}

    except Exception as exc:
        logger.exception("Garmin workout upload failed for planned_id=%d", planned_id)
        return {"garmin_workout_id": None, "status": f"error:{exc}"}


def push_week_to_garmin(week_start: date, db: Session) -> dict:
    """Upload all planned workouts for a given week to Garmin Connect.

    Always flushes the target week first for idempotency (push twice = no
    duplicates). Optionally flushes the previous week based on the
    ``flush_garmin_on_push`` user setting (default True).

    Args:
        week_start: Monday of the target week.
        db: Active database session.

    Returns:
        Dict with ``pushed``, ``skipped``, ``flushed``, and ``errors`` counts.
    """
    from app.models.workout import PlannedWorkoutORM, UserSettingsORM

    flushed = 0
    flush_errors = 0

    # Read flush_previous preference from persisted settings
    settings = db.get(UserSettingsORM, 1)
    flush_previous = settings.flush_garmin_on_push if settings is not None else True

    if flush_previous:
        prev_week_start = week_start - timedelta(days=7)
        prev_week_end = week_start - timedelta(days=1)
        flush_result = flush_garmin_workouts_for_range(prev_week_start, prev_week_end, db)
        flushed += flush_result["flushed"]
        flush_errors += flush_result.get("errors", 0)

    # Always flush the target week first (idempotency)
    week_end = week_start + timedelta(days=6)
    cur_flush = flush_garmin_workouts_for_range(week_start, week_end, db)
    flushed += cur_flush["flushed"]
    flush_errors += cur_flush.get("errors", 0)

    # Only push from today onwards — don't re-push past days
    push_from = max(week_start, date.today())
    planned_rows = (
        db.query(PlannedWorkoutORM)
        .filter(
            PlannedWorkoutORM.date >= push_from,
            PlannedWorkoutORM.date <= week_end,
        )
        .order_by(PlannedWorkoutORM.date)
        .all()
    )

    pushed = skipped = errors = 0
    for row in planned_rows:
        result = push_planned_workout(row.id, db)
        s = result["status"]
        if s == "pushed":
            pushed += 1
        elif s.startswith("error"):
            errors += 1
            logger.warning("Push failed for planned_id=%d: %s", row.id, s)
        else:
            skipped += 1

    # Record last_pushed_at on the singleton sync-state row
    sync_state = db.get(GarminSyncStateORM, 1)
    if sync_state is None:
        sync_state = GarminSyncStateORM(id=1, last_pushed_at=datetime.utcnow())
        db.add(sync_state)
    else:
        sync_state.last_pushed_at = datetime.utcnow()
    db.commit()

    return {
        "pushed": pushed,
        "skipped": skipped,
        "flushed": flushed,
        "flush_errors": flush_errors,
        "errors": errors,
    }


def flush_garmin_workouts_for_range(
    start: date, end: date, db: Session
) -> dict:
    """Delete all previously-pushed Garmin workouts for a date range.

    Removes the workout from Garmin Connect's workout library (which also
    removes it from the calendar) and clears the garmin_workout_id on the
    local planned workout row.

    Args:
        start: Inclusive start date.
        end: Inclusive end date.
        db: Active database session.

    Returns:
        Dict with ``flushed`` and ``errors`` counts.
    """
    from app.models.workout import PlannedWorkoutORM

    rows = (
        db.query(PlannedWorkoutORM)
        .filter(
            PlannedWorkoutORM.date >= start,
            PlannedWorkoutORM.date <= end,
            PlannedWorkoutORM.garmin_workout_id.isnot(None),
        )
        .all()
    )

    if not rows:
        return {"flushed": 0, "errors": 0}

    if not GARMIN_EMAIL or not GARMIN_PASSWORD:
        return {"flushed": 0, "errors": len(rows), "detail": "no_credentials"}

    try:
        from garminconnect import Garmin  # type: ignore[import]
    except ImportError:
        return {"flushed": 0, "errors": len(rows), "detail": "garminconnect_not_installed"}

    try:
        token_store = str(Path.home() / ".garminconnect")
        client = Garmin(GARMIN_EMAIL, GARMIN_PASSWORD)
        client.login(token_store)
    except Exception as exc:
        return {"flushed": 0, "errors": len(rows), "detail": f"login_failed:{exc}"}

    flushed = errors = 0
    for row in rows:
        try:
            client.delete_workout(row.garmin_workout_id)
            row.garmin_workout_id = None
            flushed += 1
        except Exception as exc:
            logger.warning(
                "Failed to delete Garmin workout %s: %s", row.garmin_workout_id, exc
            )
            row.garmin_workout_id = None  # Clear locally even if remote delete failed
            errors += 1

    db.commit()
    logger.info("Flush complete: %d deleted, %d errors.", flushed, errors)
    return {"flushed": flushed, "errors": errors}
