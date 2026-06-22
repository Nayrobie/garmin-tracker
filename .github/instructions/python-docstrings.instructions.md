# Python Docstrings & Type Hints

Follow PEP 8 and these conventions for all Python files in this project.

## Docstrings

### Module Docstrings

Every `.py` file must start with a module-level docstring:

```python
"""Module name and brief description.

Longer description if needed. Explain key classes or functions.
"""
```

### Function/Method Docstrings

Use Google-style docstrings:

```python
def calculate_volume_increase(prev_volume_km: float, current_volume_km: float) -> float:
    """
    Calculate the percentage increase in weekly training volume.

    This is used to enforce the 10% rule for safe progression.

    Args:
        prev_volume_km: Previous week's total distance in km.
        current_volume_km: Current week's total distance in km.

    Returns:
        Percentage increase as a float (e.g., 8.5 for 8.5% increase).

    Raises:
        ValueError: If volumes are negative.
    """
    if prev_volume_km < 0 or current_volume_km < 0:
        raise ValueError("Volumes must be non-negative")
    
    if prev_volume_km == 0:
        return 0.0
    
    return ((current_volume_km - prev_volume_km) / prev_volume_km) * 100
```

### Class Docstrings

```python
class Workout:
    """Represents a single workout session.

    Stores Garmin data plus user-added metadata (RPE, notes).

    Attributes:
        id: Unique identifier from Garmin.
        date: Workout timestamp.
        activity_type: e.g., 'running', 'cycling'.
        distance_km: Total distance.
        duration_minutes: Total time.
        avg_heart_rate: Average BPM.
    """
```

## Type Hints

### Always use type hints

```python
from typing import Optional, List

def get_workouts(limit: int = 10, activity_type: Optional[str] = None) -> List[dict]:
    """Fetch recent workouts."""
```

### For complex types, use typing module

```python
from typing import Dict, Tuple

def analyze_week(workouts: List[Workout]) -> Dict[str, float]:
    """Return dict with keys like 'total_volume_km', 'avg_hr'."""
```

### Use Optional for nullable values

```python
def get_workout_notes(workout_id: str) -> Optional[str]:
    """Return notes if available, else None."""
```

## Format Standards

- **Line length**: Max 100 characters (PEP 8)
- **Indentation**: 4 spaces
- **Blank lines**: 2 between top-level definitions, 1 between methods
- **Imports**: Group in order (stdlib, third-party, local)

```python
import os
from datetime import datetime
from typing import List, Optional

import requests
from fastapi import FastAPI

from app.config import USER_PROFILE
from app.models import Workout
```

## Example

```python
"""Utility functions for workout analysis."""
from typing import List

from app.models import Workout


def calculate_average_pace(distance_km: float, duration_minutes: float) -> str:
    """
    Calculate average pace from distance and duration.

    Args:
        distance_km: Distance in kilometers.
        duration_minutes: Duration in minutes.

    Returns:
        Pace as a string in format "MM:SS" (min:sec per km).

    Raises:
        ValueError: If distance or duration is zero or negative.
    """
    if distance_km <= 0 or duration_minutes <= 0:
        raise ValueError("Distance and duration must be positive")

    min_per_km = duration_minutes / distance_km
    minutes = int(min_per_km)
    seconds = int((min_per_km - minutes) * 60)

    return f"{minutes}:{seconds:02d}"


def filter_by_pace_zone(
    workouts: List[Workout], vma: float, zone: str
) -> List[Workout]:
    """
    Filter workouts by training zone based on VMA.

    Args:
        workouts: List of workout records.
        vma: Maximum aerobic velocity in km/h.
        zone: One of 'easy', 'tempo', 'threshold', 'high_intensity'.

    Returns:
        Filtered list of workouts in the specified zone.
    """
    zone_ranges = {
        "easy": (0.5, 0.7),        # 50–70% VMA
        "tempo": (0.8, 0.95),      # 80–95% VMA
        "threshold": (0.95, 1.05), # 95–105% VMA
        "high_intensity": (1.05, 2.0),  # 105%+ VMA
    }

    if zone not in zone_ranges:
        raise ValueError(f"Unknown zone: {zone}")

    min_pct, max_pct = zone_ranges[zone]

    return [
        w for w in workouts
        if w.volume_percent_of_vma(vma) and
           min_pct * 100 <= w.volume_percent_of_vma(vma) <= max_pct * 100
    ]
```
