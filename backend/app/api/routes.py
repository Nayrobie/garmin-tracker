"""API route handlers."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.workout import RaceORM, RaceCreate, RaceRead, RaceUpdate

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
# Workouts (stubs — implemented in Phase 1)
# ---------------------------------------------------------------------------


@router.get("/workouts")
def get_workouts(limit: int = 10):
    """Return recent workouts. TODO: implement in Phase 1."""
    return {"workouts": [], "message": "Garmin integration coming in Phase 1"}


@router.get("/stats/weekly")
def get_weekly_stats(weeks: int = 1):
    """Return weekly training stats. TODO: implement in Phase 1."""
    return {"volume_km": 0, "runs": 0, "avg_hr": 0}

