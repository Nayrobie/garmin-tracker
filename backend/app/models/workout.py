"""SQLAlchemy ORM models and Pydantic schemas."""
from __future__ import annotations

import enum
from datetime import date as DateType
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import Date, Enum, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ---------------------------------------------------------------------------
# Enum
# ---------------------------------------------------------------------------


class RaceType(str, enum.Enum):
    trail = "trail"
    semi = "semi"
    ten_k = "10k"
    marathon = "marathon"
    other = "other"


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

