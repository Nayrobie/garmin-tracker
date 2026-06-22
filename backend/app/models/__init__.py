"""Data models for workouts and training data."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Workout:
    """Represents a single workout session."""

    id: str
    """Unique identifier from Garmin."""

    date: datetime
    """Workout date and time."""

    activity_type: str
    """Type of activity (e.g., 'running', 'cycling')."""

    duration_minutes: float
    """Workout duration in minutes."""

    distance_km: float
    """Distance covered in kilometers."""

    avg_heart_rate: int
    """Average heart rate during workout (bpm)."""

    max_heart_rate: int
    """Maximum heart rate during workout (bpm)."""

    avg_pace_min_per_km: Optional[str] = None
    """Average pace in min:sec per km (for running)."""

    elevation_gain_m: Optional[float] = None
    """Elevation gain in meters."""

    power_avg_watts: Optional[int] = None
    """Average power in watts (for cycling)."""

    rpe: Optional[int] = None
    """Rate of Perceived Exertion (1-10), added post-workout."""

    notes: Optional[str] = None
    """User notes about the workout."""

    def volume_percent_of_vma(self, vma_kmh: float) -> float:
        """
        Calculate the percentage of VMA (Vitesse Maximale Aérobie) for this workout.

        Args:
            vma_kmh: Maximum aerobic velocity in km/h.

        Returns:
            Percentage of VMA (e.g., 60% for easy runs, 100% for threshold).
        """
        if self.avg_pace_min_per_km:
            # Convert pace to km/h
            pace_parts = self.avg_pace_min_per_km.split(":")
            pace_minutes = float(pace_parts[0])
            pace_seconds = float(pace_parts[1]) if len(pace_parts) > 1 else 0
            pace_decimal_minutes = pace_minutes + pace_seconds / 60
            actual_kmh = 60 / pace_decimal_minutes

            return (actual_kmh / vma_kmh) * 100

        return 0


@dataclass
class WeeklyVolume:
    """Aggregated weekly training metrics."""

    week_start: datetime
    """Start date of the week."""

    total_distance_km: float
    """Total distance for the week."""

    total_duration_minutes: float
    """Total workout duration for the week."""

    run_count: int
    """Number of running sessions."""

    avg_heart_rate: int
    """Average heart rate across all workouts."""

    long_run_distance_km: Optional[float] = None
    """Distance of the longest run in the week."""

    intensity_distribution: Optional[dict] = None
    """Distribution of workouts by zone (easy, tempo, high-intensity)."""
