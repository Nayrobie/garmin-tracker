"""Body composition data service.

Reads the Feelfit CSV export and returns cleaned, structured records.
This is a one-time legacy import; later data will come from the Garmin API.
"""
import csv
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

_DATA_PATH = Path(__file__).resolve().parents[3] / "data" / "feelfit" / "body_composition.csv"

# Columns with all-zero values (segment-level data not yet populated by the device)
_ZERO_ONLY_COLUMNS = {
    "Sinew trunk ratio(%)",
    "Trunk body fat mass(kg)",
    "Left arm muscle ratio(%)",
    "Right Arm Muscle Rate(%)",
    "left arm body fat mass(kg)",
    "Body fat mass in right arm(kg)",
    "Left leg muscle ratio(%)",
    "Right lower limb muscle ratio(%)",
    "Left leg body fat mass(kg)",
    "body fat mass in right leg(kg)",
    "Sinew trunk mass(kg)",
    "Trunk fat ratio(%)",
    "Left arm muscle mass(kg)",
    "Right arm muscle mass(kg)",
    "Fat ratio of left upper limb(%)",
    "Body fat rate of right upper limb(%)",
    "left leg muscle mass(kg)",
    "Right leg muscle mass(kg)",
    "Body fat rate of left lower limb(%)",
    "Body fat rate of right lower limb(%)",
    "Device MAC Address",
}


class BodyCompositionRecord(BaseModel):
    """A single body composition measurement entry."""

    measured_at: datetime
    weight_kg: float
    body_fat_pct: Optional[float]
    bmi: Optional[float]
    skeletal_muscle_pct: Optional[float]
    muscle_mass_kg: Optional[float]
    protein_pct: Optional[float]
    bmr_kcal: Optional[float]
    fat_free_weight_kg: Optional[float]
    subcutaneous_fat_pct: Optional[float]
    visceral_fat: Optional[float]
    body_water_pct: Optional[float]
    bone_mass_kg: Optional[float]
    health_score: Optional[float]
    metabolic_age: Optional[float]


def _to_optional_float(value: str) -> Optional[float]:
    """Parse a CSV string to float, returning None for zero or empty values.

    Args:
        value: Raw string value from CSV.

    Returns:
        Parsed float or None if blank or zero.
    """
    stripped = value.strip()
    if not stripped:
        return None
    try:
        parsed = float(stripped)
        return parsed if parsed != 0.0 else None
    except ValueError:
        return None


def load_body_composition() -> List[BodyCompositionRecord]:
    """Read and return all body composition records from the Feelfit CSV.

    Records are sorted ascending by measurement date and deduplicated: when
    two rows share the same minute (device double-tap), only the first is kept.

    Returns:
        List of BodyCompositionRecord sorted oldest → newest.

    Raises:
        FileNotFoundError: If the CSV file is missing from data/feelfit/.
    """
    if not _DATA_PATH.exists():
        raise FileNotFoundError(f"Body composition data not found at {_DATA_PATH}")

    seen_minutes: set[str] = set()
    records: List[BodyCompositionRecord] = []

    with open(_DATA_PATH, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            raw_dt = row["Measure Time"].strip()
            try:
                measured_at = datetime.strptime(raw_dt, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                continue

            # Deduplicate entries within the same minute
            minute_key = measured_at.strftime("%Y-%m-%d %H:%M")
            if minute_key in seen_minutes:
                continue
            seen_minutes.add(minute_key)

            weight = _to_optional_float(row.get("Weight(kg)", ""))
            if weight is None:
                continue  # weight is required

            records.append(
                BodyCompositionRecord(
                    measured_at=measured_at,
                    weight_kg=weight,
                    body_fat_pct=_to_optional_float(row.get("Body Fat(%)", "")),
                    bmi=_to_optional_float(row.get("BMI", "")),
                    skeletal_muscle_pct=_to_optional_float(row.get("Skeletal Muscle(%)", "")),
                    muscle_mass_kg=_to_optional_float(row.get("Muscle Mass(kg)", "")),
                    protein_pct=_to_optional_float(row.get("Protein(%)", "")),
                    bmr_kcal=_to_optional_float(row.get("BMR(kcal)", "")),
                    fat_free_weight_kg=_to_optional_float(row.get("Fat-free Body Weight(kg)", "")),
                    subcutaneous_fat_pct=_to_optional_float(row.get("Subcutaneous Fat Percentage(%)", "")),
                    visceral_fat=_to_optional_float(row.get("Visceral Fat", "")),
                    body_water_pct=_to_optional_float(row.get("Body Water(%)", "")),
                    bone_mass_kg=_to_optional_float(row.get("Bone Mass(kg)", "")),
                    health_score=_to_optional_float(row.get("Health Score", "")),
                    metabolic_age=_to_optional_float(row.get("Metabolic Age", "")),
                )
            )

    records.sort(key=lambda r: r.measured_at)
    return records
