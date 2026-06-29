"""Training plan generation service.

Generates progressive multi-week training plans following the 10% rule
and the user's 3-run-per-week structure (easy, short/intervals, long),
plus complementary workouts (strength, plyometrics, mobility).

Race-aware: includes taper weeks before race dates and caps long run at 15km.
"""
from __future__ import annotations

import math
import uuid
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import TRAINING_RULES
from app.models.workout import ActualWorkoutORM, PlannedWorkoutORM, RaceORM, WorkoutType


# Pace targets (min/km) from user VMA profile
PACE_EASY = "7:20"       # 75% VMA - basic endurance
PACE_INTERVALS = "5:30"  # 100% VMA
PACE_LONG = "6:30"       # 85% VMA - 10k pace

# Run distribution within weekly volume
# Based on: mid(5k) + short(4k) + long(8k) = 17km -> 29%, 24%, 47%
DIST_EASY = 0.29
DIST_SHORT = 0.24
DIST_LONG = 0.47

# Max long run distance (user preference: no more than 15km)
MAX_LONG_RUN_KM = 15.0

# Training epoch: Monday of the week of the first ever run (Jan 20, 2026)
TRAINING_EPOCH = date(2026, 1, 19)

# Default weekday assignments (0=Mon)
DAY_EASY = 1       # Tuesday
DAY_INTERVALS = 3  # Thursday
DAY_LONG = 5       # Saturday

# Complementary workout schedule
DAY_STRENGTH = 0   # Monday
DAY_MOBILITY_1 = 2  # Wednesday
DAY_PILATES = 4     # Friday

# Alternating strength focus areas (Monday, 30min)
STRENGTH_WORKOUTS = [
    {
        "notes": (
            "LOWER BODY PLYOMETRICS (30min)\n"
            "Warm-up: 3min jump rope + leg swings\n"
            "Circuit x3 (45s work / 15s rest):\n"
            "• Squat jumps — 12 reps\n"
            "• Split lunge jumps — 10 each leg\n"
            "• Box jumps (or step-ups) — 10 reps\n"
            "• Broad jumps — 8 reps\n"
            "• Tuck jumps — 8 reps\n"
            "Rest 90s between circuits\n"
            "Cooldown: calf raises 2x15, quad stretch 30s each"
        ),
        "duration": 30,
    },
    {
        "notes": (
            "HIP & KNEE REINFORCEMENT (30min)\n"
            "Warm-up: 3min glute activation (monster walks with band)\n"
            "Circuit x3:\n"
            "• Clamshells with band — 15 each side\n"
            "• Side-lying leg raises — 12 each side\n"
            "• Single-leg Romanian deadlift — 10 each leg\n"
            "• Bulgarian split squats — 10 each leg\n"
            "• Single-leg glute bridge — 12 each side\n"
            "• Copenhagen plank — 20s each side\n"
            "Rest 60s between circuits\n"
            "Cooldown: pigeon pose 45s each, IT band foam roll 30s each"
        ),
        "duration": 30,
    },
    {
        "notes": (
            "ANTI-SHIN-SPLINT & ANKLE STABILITY (30min)\n"
            "Warm-up: 2min ankle circles + 1min heel walks\n"
            "Circuit x3:\n"
            "• Toe raises (seated, weight on knees) — 20 reps\n"
            "• Heel walks — 30s\n"
            "• Resistance band dorsiflexion — 15 each foot\n"
            "• Single-leg balance on unstable surface — 30s each\n"
            "• Eccentric calf drops (off step) — 12 each leg\n"
            "• Towel scrunches — 30s each foot\n"
            "Rest 60s between circuits\n"
            "Cooldown: calf stretch 45s each, tibialis anterior stretch 30s each"
        ),
        "duration": 30,
    },
]

# Yoga flows with upper back mobility (Wednesday, 15min)
YOGA_WORKOUTS = [
    {
        "notes": (
            "YOGA FLOW + UPPER BACK MOBILITY (15min)\n"
            "• Sun salutation A x3 (5min)\n"
            "• Cat-cow — 10 slow breaths\n"
            "• Thread the needle (quatre pattes, main sous le ventre "
            "qui monte vers le ciel) — 8 each side\n"
            "• Bird dog holds — 20s each side x3"
        ),
        "duration": 15,
    },
    {
        "notes": (
            "YOGA FLOW + UPPER BACK MOBILITY (15min)\n"
            "• Sun salutation B x2 (5min)\n"
            "• Puppy pose (melting heart) — hold 45s\n"
            "• Puppy pose variation: child pose on elbows, "
            "hands behind head, press chest down — hold 45s\n"
            "• Shoulder on mat (quatre pattes, 1 épaule au tapis, "
            "bras tendu) — 30s each side"
        ),
        "duration": 15,
    },
    {
        "notes": (
            "YOGA FLOW + UPPER BACK MOBILITY (15min)\n"
            "• Sun salutation A x2 + warrior flow (5min)\n"
            "• All fours: protract/retract scapulae (rapprocher "
            "puis éloigner les omoplates du sol) — 12 slow reps\n"
            "• Elastic band pull-aparts — 15 reps\n"
            "• Elastic band face pulls — 12 reps\n"
            "• Cat-cow — 8 breaths to finish"
        ),
        "duration": 15,
    },
    {
        "notes": (
            "YOGA FLOW + UPPER BACK MOBILITY (15min)\n"
            "• Sun salutation A x3 (5min)\n"
            "• Quatre pattes éloignées: press chest toward floor, "
            "squeeze shoulder blades — 10 reps\n"
            "• Bird dog with rotation (elbow to knee) — 8 each side\n"
            "• Thread the needle — 6 each side\n"
            "• Child's pose with arms extended — 30s"
        ),
        "duration": 15,
    },
]

# Pilates for mobility & stretching (Friday, 15min)
PILATES_WORKOUTS = [
    {
        "notes": (
            "PILATES — HIP & HAMSTRING MOBILITY (15min)\n"
            "• Pelvic tilts — 10 reps\n"
            "• Single-leg circles — 8 each direction, each leg\n"
            "• Spine stretch forward — 8 reps\n"
            "• Hip flexor lunge stretch — 45s each side\n"
            "• Hamstring stretch (supine, strap) — 45s each leg\n"
            "• Figure-4 stretch (piriformis) — 45s each side"
        ),
        "duration": 15,
    },
    {
        "notes": (
            "PILATES — SPINE & SHOULDER MOBILITY (15min)\n"
            "• Roll-downs (standing) — 6 slow reps\n"
            "• Saw (seated twist + reach) — 8 each side\n"
            "• Swimming (prone, alternating arms/legs) — 30s x2\n"
            "• Side-lying thoracic rotation — 8 each side\n"
            "• Shoulder CARs (controlled articular rotations) — 5 each\n"
            "• Mermaid stretch — 30s each side"
        ),
        "duration": 15,
    },
    {
        "notes": (
            "PILATES — LOWER LEG & CALF RELEASE (15min)\n"
            "• Foot circles & point/flex — 10 each direction\n"
            "• Calf stretch (wall, straight + bent knee) — 40s each\n"
            "• Quad stretch (side-lying) — 45s each\n"
            "• IT band foam roll — 30s each side\n"
            "• Adductor stretch (wide-leg forward fold) — 45s\n"
            "• Pigeon pose — 45s each side"
        ),
        "duration": 15,
    },
    {
        "notes": (
            "PILATES — FULL BODY FLOW (15min)\n"
            "• The hundred (modified) — 50 beats\n"
            "• Roll-up — 6 reps\n"
            "• Single-leg stretch — 8 each side\n"
            "• Spine twist (seated) — 6 each side\n"
            "• Swan dive prep — 6 reps\n"
            "• Side kick series — 8 each movement, each side\n"
            "• Rest position (child's pose) — 30s"
        ),
        "duration": 15,
    },
]

# Detailed interval run descriptions (rotating structures)
INTERVAL_RUNS = [
    (
        "INTERVALS — SHORT REPEATS\n"
        "Warm-up: 10min easy jog + 4 strides\n"
        "Main: 8x 1min at VMA (5:30/km) / 1min recovery jog\n"
        "Cooldown: 5min easy jog"
    ),
    (
        "INTERVALS — PYRAMID\n"
        "Warm-up: 10min easy jog + dynamic stretches\n"
        "Main: 1'-2'-3'-3'-2'-1' at VMA (5:30/km)\n"
        "Recovery: equal time easy jog between each\n"
        "Cooldown: 5min easy jog"
    ),
    (
        "INTERVALS — LONG REPEATS\n"
        "Warm-up: 10min easy jog + 4 strides\n"
        "Main: 4x 3min at VMA (5:30/km) / 2min recovery jog\n"
        "Cooldown: 5min easy jog"
    ),
    (
        "INTERVALS — FARTLEK\n"
        "Warm-up: 10min easy jog\n"
        "Main: 20min alternating 30s fast (5:00/km) / "
        "30s easy + 2min at 10k pace (6:30/km) / 1min easy. Repeat.\n"
        "Cooldown: 5min easy jog"
    ),
]

# Taper week: reduce volume to ~60% and keep intensity low
TAPER_VOLUME_FACTOR = 0.6


def _round_half(value: float) -> float:
    """Round to nearest 0.5 km."""
    return round(value * 2) / 2


def _km_to_duration(distance_km: float, pace_str: str) -> int:
    """Estimate duration in minutes from distance and pace.

    Args:
        distance_km: Distance in km.
        pace_str: Pace as "MM:SS" per km.

    Returns:
        Duration in minutes (rounded up).
    """
    parts = pace_str.split(":")
    pace_min = int(parts[0]) + int(parts[1]) / 60
    return math.ceil(distance_km * pace_min)


def _get_race_weeks(db: Session, start_date: date, end_date: date) -> set[date]:
    """Get Mondays of weeks containing a race (for taper scheduling).

    Args:
        db: Database session.
        start_date: Plan start date.
        end_date: Plan end date.

    Returns:
        Set of Monday dates for weeks that contain a race.
    """
    races = (
        db.query(RaceORM)
        .filter(RaceORM.date >= start_date, RaceORM.date <= end_date)
        .all()
    )
    race_weeks = set()
    for race in races:
        race_monday = race.date - timedelta(days=race.date.weekday())
        race_weeks.add(race_monday)
    return race_weeks


def generate_training_plan(
    db: Session,
    starting_volume_km: float = 12.0,
    weeks_ahead: int = 17,
    start_date: Optional[date] = None,
) -> dict:
    """Generate a progressive multi-week training plan and save to DB.

    Creates planned workouts following:
    - 3 runs per week (easy, intervals, long) with 10% progression
    - Complementary workouts: 1x strength + 2x mobility/yoga per week
    - Taper weeks before races (60% volume, easy pace only)
    - Long run capped at 15km

    Existing plan-generated workouts (future, with group_id starting with 'plan-')
    are cleared before generating new ones.

    Args:
        db: Database session.
        starting_volume_km: Total running km for the first week.
        weeks_ahead: Number of weeks to plan.
        start_date: Monday of the first week. Defaults to this week's Monday.

    Returns:
        Dict with plan summary: weeks generated, total workouts, weekly breakdown.
    """
    if start_date is None:
        today = date.today()
        start_date = today - timedelta(days=today.weekday())  # Monday

    max_increase_pct = TRAINING_RULES["max_weekly_volume_increase_percent"]
    plan_group_id = f"plan-{uuid.uuid4()}"

    # Clear existing future plan workouts
    _clear_future_plan_workouts(db, start_date)

    # Find race weeks for taper scheduling
    end_date = start_date + timedelta(weeks=weeks_ahead)
    race_weeks = _get_race_weeks(db, start_date, end_date)
    # Taper = week before race week
    taper_weeks = {rw - timedelta(weeks=1) for rw in race_weeks}

    weeks_summary: List[dict] = []
    workouts_to_add: List[PlannedWorkoutORM] = []
    current_volume = starting_volume_km

    for week_idx in range(weeks_ahead):
        week_monday = start_date + timedelta(weeks=week_idx)
        is_taper = week_monday in taper_weeks
        is_race_week = week_monday in race_weeks

        # Determine effective volume for this week
        if is_taper:
            effective_volume = current_volume * TAPER_VOLUME_FACTOR
            week_label = "taper"
        elif is_race_week:
            effective_volume = current_volume * TAPER_VOLUME_FACTOR
            week_label = "race"
        else:
            effective_volume = current_volume
            week_label = "normal"

        # Calculate run distances
        easy_km = _round_half(effective_volume * DIST_EASY)
        short_km = _round_half(effective_volume * DIST_SHORT)
        long_km = _round_half(effective_volume * DIST_LONG)

        # Cap long run at max
        if long_km > MAX_LONG_RUN_KM:
            long_km = MAX_LONG_RUN_KM

        # Ensure total adds up (adjust long for rounding)
        target_total = _round_half(effective_volume)
        actual_total = easy_km + short_km + long_km
        if actual_total != target_total:
            long_km = _round_half(target_total - easy_km - short_km)
            if long_km > MAX_LONG_RUN_KM:
                long_km = MAX_LONG_RUN_KM

        # Alternate short run type: intervals on even weeks, easy on odd
        # (taper/race weeks are always easy)
        is_interval_week = (week_idx % 2 == 0) and not is_taper and not is_race_week
        short_pace = PACE_INTERVALS if is_interval_week else PACE_EASY

        if is_interval_week:
            interval_idx = (week_idx // 2) % len(INTERVAL_RUNS)
            short_notes = f"{INTERVAL_RUNS[interval_idx]}\nTotal: ~{short_km}km"
        elif is_taper:
            short_notes = (
                f"EASY SHAKEOUT (taper week)\n"
                f"Easy jog at {PACE_EASY}/km — {short_km}km\n"
                f"Keep effort very light, legs fresh for race"
            )
        elif is_race_week:
            short_notes = (
                f"PRE-RACE SHAKEOUT\n"
                f"Easy jog at {PACE_EASY}/km — {short_km}km\n"
                f"4-6 short strides at the end to activate legs"
            )
        else:
            short_notes = (
                f"EASY RUN\n"
                f"Steady pace at {PACE_EASY}/km — {short_km}km\n"
                f"Zone 2 heart rate, conversational effort"
            )

        # --- Run workouts ---
        easy_notes = (
            f"EASY ENDURANCE RUN — {easy_km}km\n"
            f"Pace: {PACE_EASY}/km (zone 2)\n"
            f"Effort: conversational, nose-breathing"
        )
        if is_taper:
            easy_notes += "\n(Taper week — keep it light)"
        elif is_race_week:
            easy_notes += "\n(Race week — just loosen the legs)"

        easy_workout = PlannedWorkoutORM(
            date=week_monday + timedelta(days=DAY_EASY),
            type=WorkoutType.run,
            goal_duration_min=_km_to_duration(easy_km, PACE_EASY),
            goal_pace_per_km=PACE_EASY,
            notes=easy_notes,
            recurrence="none",
            recurrence_group_id=plan_group_id,
        )
        short_workout = PlannedWorkoutORM(
            date=week_monday + timedelta(days=DAY_INTERVALS),
            type=WorkoutType.run,
            goal_duration_min=_km_to_duration(short_km, short_pace),
            goal_pace_per_km=short_pace,
            notes=short_notes,
            recurrence="none",
            recurrence_group_id=plan_group_id,
        )

        # No long run on race week (the race IS the long run)
        if not is_race_week:
            long_notes = (
                f"LONG RUN — {long_km}km\n"
                f"Pace: {PACE_LONG if not is_taper else PACE_EASY}/km\n"
                f"Build distance steadily, negative split if feeling good"
            )
            if is_taper:
                long_notes = (
                    f"LONG RUN (taper) — {long_km}km\n"
                    f"Pace: {PACE_EASY}/km (easy)\n"
                    f"Shorter than usual — stay fresh for race day"
                )
            long_workout = PlannedWorkoutORM(
                date=week_monday + timedelta(days=DAY_LONG),
                type=WorkoutType.run,
                goal_duration_min=_km_to_duration(long_km, PACE_LONG if not is_taper else PACE_EASY),
                goal_pace_per_km=PACE_LONG if not is_taper else PACE_EASY,
                notes=long_notes,
                recurrence="none",
                recurrence_group_id=plan_group_id,
            )
            workouts_to_add.extend([easy_workout, short_workout, long_workout])
        else:
            workouts_to_add.extend([easy_workout, short_workout])

        # --- Complementary workouts ---
        strength_idx = week_idx % len(STRENGTH_WORKOUTS)
        strength_info = STRENGTH_WORKOUTS[strength_idx]
        strength_workout = PlannedWorkoutORM(
            date=week_monday + timedelta(days=DAY_STRENGTH),
            type=WorkoutType.strength,
            goal_duration_min=strength_info["duration"],
            notes=strength_info["notes"],
            recurrence="none",
            recurrence_group_id=plan_group_id,
        )
        workouts_to_add.append(strength_workout)

        yoga_idx = week_idx % len(YOGA_WORKOUTS)
        yoga_info = YOGA_WORKOUTS[yoga_idx]
        yoga_workout = PlannedWorkoutORM(
            date=week_monday + timedelta(days=DAY_MOBILITY_1),
            type=WorkoutType.yoga,
            goal_duration_min=yoga_info["duration"],
            notes=yoga_info["notes"],
            recurrence="none",
            recurrence_group_id=plan_group_id,
        )
        workouts_to_add.append(yoga_workout)

        pilates_idx = week_idx % len(PILATES_WORKOUTS)
        pilates_info = PILATES_WORKOUTS[pilates_idx]
        pilates_workout = PlannedWorkoutORM(
            date=week_monday + timedelta(days=DAY_PILATES),
            type=WorkoutType.pilates,
            goal_duration_min=pilates_info["duration"],
            notes=pilates_info["notes"],
            recurrence="none",
            recurrence_group_id=plan_group_id,
        )
        workouts_to_add.append(pilates_workout)

        run_total = round(easy_km + short_km + (long_km if not is_race_week else 0), 1)
        # Week number relative to training start (Jan 19, 2026 = W1)
        abs_week_num = ((week_monday - TRAINING_EPOCH).days // 7) + 1
        weeks_summary.append({
            "week": abs_week_num,
            "week_start": week_monday.isoformat(),
            "total_km": run_total,
            "easy_km": easy_km,
            "short_km": short_km,
            "long_km": long_km if not is_race_week else 0,
            "is_interval_week": is_interval_week,
            "week_type": week_label,
            "cross_training": [
                {"type": "strength", "duration_min": strength_info["duration"]},
                {"type": "yoga", "duration_min": yoga_info["duration"]},
                {"type": "pilates", "duration_min": pilates_info["duration"]},
            ],
        })

        # Only increase volume on normal training weeks
        if not is_taper and not is_race_week:
            current_volume = current_volume * (1 + max_increase_pct / 100)

    db.add_all(workouts_to_add)
    db.commit()

    return {
        "plan_group_id": plan_group_id,
        "weeks_generated": weeks_ahead,
        "total_workouts": len(workouts_to_add),
        "starting_volume_km": starting_volume_km,
        "weeks": weeks_summary,
    }


def adjust_plan_from_progress(
    db: Session,
    weeks_ahead: Optional[int] = None,
) -> dict:
    """Regenerate the training plan based on actual volume completed this week.

    Looks at the current week's actual running distance and uses it as the
    new baseline for regenerating future weeks through all upcoming races.

    Args:
        db: Database session.
        weeks_ahead: Number of future weeks to plan. Defaults to auto (through last race).

    Returns:
        Dict with adjusted plan summary.
    """
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # Get actual running volume for this week
    actual_rows = (
        db.query(ActualWorkoutORM)
        .filter(
            ActualWorkoutORM.date >= week_start,
            ActualWorkoutORM.date <= week_end,
            ActualWorkoutORM.type == WorkoutType.run,
        )
        .all()
    )

    actual_volume = sum(a.distance_km for a in actual_rows if a.distance_km)

    # If no data yet this week, look at last week
    if actual_volume == 0:
        prev_start = week_start - timedelta(days=7)
        prev_end = week_start - timedelta(days=1)
        prev_rows = (
            db.query(ActualWorkoutORM)
            .filter(
                ActualWorkoutORM.date >= prev_start,
                ActualWorkoutORM.date <= prev_end,
                ActualWorkoutORM.type == WorkoutType.run,
            )
            .all()
        )
        actual_volume = sum(a.distance_km for a in prev_rows if a.distance_km)

    # Fallback to 12km if no data at all
    base_volume = round(actual_volume, 1) if actual_volume > 0 else 12.0

    # Auto-calculate weeks if not specified (through last upcoming race + 1 week)
    if weeks_ahead is None:
        last_race = (
            db.query(RaceORM)
            .filter(RaceORM.date >= today)
            .order_by(RaceORM.date.desc())
            .first()
        )
        if last_race:
            weeks_ahead = max(
                ((last_race.date - week_start).days // 7) + 1, 8
            )
        else:
            weeks_ahead = 8

    # Generate from next week onwards
    next_week_start = week_start + timedelta(days=7)
    return generate_training_plan(
        db=db,
        starting_volume_km=base_volume,
        weeks_ahead=weeks_ahead,
        start_date=next_week_start,
    )


def _clear_future_plan_workouts(db: Session, from_date: date) -> None:
    """Delete plan-generated workouts from from_date onwards.

    Only deletes workouts whose recurrence_group_id starts with 'plan-'.

    Args:
        db: Database session.
        from_date: Delete workouts on or after this date.
    """
    db.query(PlannedWorkoutORM).filter(
        PlannedWorkoutORM.date >= from_date,
        PlannedWorkoutORM.recurrence_group_id.like("plan-%"),
    ).delete(synchronize_session="fetch")
