"""Seed demo sleep and cycle data for development (90 days, realistic values)."""
import random
from datetime import date, timedelta

from app.database import SessionLocal, init_db
from app.models.workout import MenstrualCycleORM, SleepRecordORM

random.seed(42)
init_db()
db = SessionLocal()

# --- sleep records: last 90 days ---
today = date.today()
start = today - timedelta(days=89)

existing_dates = {r.date for r in db.query(SleepRecordORM).all()}
added = 0

for i in range(90):
    d = start + timedelta(days=i)
    if d in existing_dates:
        continue
    if random.random() < 0.10:   # ~10% nights skipped (no tracker / travel)
        continue

    total_min = max(300, int(random.gauss(430, 30)))
    deep_min  = max(40,  int(random.gauss(80, 12)))
    rem_min   = max(40,  int(random.gauss(100, 15)))
    light_min = max(60,  total_min - deep_min - rem_min)
    awake_min = max(5,   int(random.gauss(18, 6)))
    score     = min(100, max(30, int(random.gauss(75, 7))))
    rhr       = max(42,  int(random.gauss(51, 3)))
    hrv       = max(25,  int(random.gauss(50, 8)))

    db.add(SleepRecordORM(
        date=d,
        total_sleep_min=total_min,
        deep_sleep_min=deep_min,
        light_sleep_min=light_min,
        rem_sleep_min=rem_min,
        awake_min=awake_min,
        sleep_score=score,
        resting_hr=rhr,
        hrv_overnight=hrv,
        start_time="23:15",
        end_time="07:10",
    ))
    added += 1

# --- menstrual cycles: 3 cycles starting April ---
cycle_seeds = [
    {"start_date": date(2026, 4, 1),  "cycle_length": 28, "period_length": 5,
     "fertile_window_start_day": 12, "fertile_window_length": 6},
    {"start_date": date(2026, 4, 29), "cycle_length": 27, "period_length": 4,
     "fertile_window_start_day": 11, "fertile_window_length": 5},
    {"start_date": date(2026, 5, 26), "cycle_length": 28, "period_length": 5,
     "fertile_window_start_day": 12, "fertile_window_length": 6},
]

existing_starts = {r.start_date for r in db.query(MenstrualCycleORM).all()}
cycles_added = 0
for c in cycle_seeds:
    if c["start_date"] not in existing_starts:
        db.add(MenstrualCycleORM(**c))
        cycles_added += 1

db.commit()
db.close()
print(f"Seeded {added} sleep records, {cycles_added} cycle records")
