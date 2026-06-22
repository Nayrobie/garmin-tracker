"""Garmin service for API integration."""


class GarminService:
    """Service for Garmin Connect API interactions."""

    def __init__(self, email: str, password: str):
        """
        Initialize Garmin service.

        Args:
            email: Garmin Connect email.
            password: Garmin Connect password.
        """
        self.email = email
        self.password = password
        # TODO: Initialize Garmin API client

    def get_recent_activities(self, limit: int = 10):
        """
        Fetch recent activities from Garmin.

        Args:
            limit: Number of activities to retrieve.

        Returns:
            List of activity dictionaries.
        """
        # TODO: Implement Garmin API call
        return []

    def get_activity_details(self, activity_id: str):
        """
        Fetch detailed information for a specific activity.

        Args:
            activity_id: Garmin activity identifier.

        Returns:
            Activity details dictionary.
        """
        # TODO: Implement Garmin API call
        return {}
