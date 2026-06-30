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
