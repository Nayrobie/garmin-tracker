"""API routes."""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["workouts"])


@router.get("/workouts")
async def get_workouts(limit: int = 10):
    """
    Retrieve recent workouts from Garmin.

    Args:
        limit: Maximum number of workouts to return (default: 10).

    Returns:
        List of workout summaries.
    """
    # TODO: Implement Garmin API integration
    return {"workouts": [], "message": "Garmin integration coming soon"}


@router.get("/stats/weekly")
async def get_weekly_stats(weeks: int = 1):
    """
    Get weekly training volume and metrics.

    Args:
        weeks: Number of weeks to analyze (default: 1).

    Returns:
        Weekly volume, run count, and heart rate trends.
    """
    # TODO: Implement analytics
    return {"volume_km": 0, "runs": 0, "avg_hr": 0}
