"""Google Tasks integration for pushing workout reminders.

Handles OAuth2 flow, token persistence, and CRUD operations on Google Tasks.
Tasks are created in a dedicated 'Workouts' task list.
"""
import json
import logging
from datetime import date
from pathlib import Path
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_CLIENT_SECRETS_DICT,
    GOOGLE_REDIRECT_URI,
    BASE_DIR,
)

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/tasks"]
TOKEN_PATH = BASE_DIR / "google_token.json"
TASK_LIST_TITLE = "Workouts"


def _get_client_config() -> dict:
    """Build OAuth2 client config dict from environment variables.

    Returns:
        Dict suitable for google_auth_oauthlib Flow.from_client_config.
    """
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }


def get_auth_url() -> Optional[str]:
    """Generate the Google OAuth2 authorization URL.

    Builds the URL manually (no PKCE) since the token exchange is also manual.

    Returns:
        Authorization URL string, or None if client ID is not configured.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return None
    from urllib.parse import urlencode

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"https://accounts.google.com/o/oauth2/auth?{urlencode(params)}"


def handle_callback(code: str) -> str | None:
    """Exchange authorization code for tokens and persist them.

    Uses requests directly to avoid state-mismatch issues with the Flow
    helper (the auth URL and callback are served by different process turns,
    so no shared Flow instance exists).

    Args:
        code: Authorization code from Google OAuth callback.

    Returns:
        None on success, or an error message string on failure.
    """
    import requests as http_requests

    try:
        token_response = http_requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code != 200:
            error_detail = token_response.text
            logger.error(
                "Google token exchange failed (%d): %s",
                token_response.status_code,
                error_detail,
            )
            return f"Token exchange failed ({token_response.status_code}): {error_detail}"

        token_data = token_response.json()
        creds = Credentials(
            token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            scopes=SCOPES,
        )
        TOKEN_PATH.write_text(creds.to_json())
        logger.info("Google OAuth tokens saved to %s", TOKEN_PATH)
        return None
    except Exception as exc:
        logger.exception("Failed to exchange Google OAuth code: %s", exc)
        return f"Exception: {exc}"


def _get_credentials() -> Optional[Credentials]:
    """Load and refresh stored Google credentials.

    Loads from GOOGLE_CLIENT_SECRETS_DICT env var first, falls back to
    token file on disk.

    Returns:
        Valid Credentials object, or None if not available.
    """
    creds = None

    # Try loading from env var first
    if GOOGLE_CLIENT_SECRETS_DICT:
        try:
            token_data = json.loads(GOOGLE_CLIENT_SECRETS_DICT)
            creds = Credentials.from_authorized_user_info(token_data, SCOPES)
        except Exception:
            logger.exception("Failed to load credentials from GOOGLE_CLIENT_SECRETS_DICT")

    # Fall back to token file on disk
    if creds is None and TOKEN_PATH.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
        except Exception:
            logger.exception("Failed to load credentials from token file")

    if creds is None:
        return None

    try:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Persist refreshed token to file for next use
            TOKEN_PATH.write_text(creds.to_json())
        if not creds.valid:
            return None
        return creds
    except Exception:
        logger.exception("Failed to refresh Google credentials")
        return None


def is_connected() -> bool:
    """Check if Google Tasks is connected (valid credentials exist).

    Returns:
        True if we have valid credentials.
    """
    return _get_credentials() is not None


def disconnect() -> None:
    """Remove stored Google credentials."""
    if TOKEN_PATH.exists():
        TOKEN_PATH.unlink()
        logger.info("Google OAuth token removed")


def _get_service():
    """Build the Google Tasks API service client.

    Returns:
        Tasks API service resource, or None if not connected.
    """
    creds = _get_credentials()
    if creds is None:
        return None
    return build("tasks", "v1", credentials=creds)


def _ensure_task_list(service) -> Optional[str]:
    """Find or create the 'Workouts' task list.

    Args:
        service: Google Tasks API service resource.

    Returns:
        Task list ID, or None on error.
    """
    try:
        results = service.tasklists().list(maxResults=100).execute()
        for tl in results.get("items", []):
            if tl["title"] == TASK_LIST_TITLE:
                return tl["id"]
        # Create it
        new_list = service.tasklists().insert(body={"title": TASK_LIST_TITLE}).execute()
        return new_list["id"]
    except Exception:
        logger.exception("Failed to ensure Google Task list")
        return None


def _build_task_title(planned) -> str:
    """Build a concise task title from a planned workout.

    Args:
        planned: PlannedWorkoutORM instance.

    Returns:
        Title string like 'Run' or 'Strength'.
    """
    workout_type = planned.type.value if hasattr(planned.type, "value") else str(planned.type)
    return workout_type.replace("_", " ").title()


def _build_task_notes(planned) -> str:
    """Build task notes/description from planned workout details.

    Args:
        planned: PlannedWorkoutORM instance.

    Returns:
        Multi-line description string.
    """
    lines = []
    if planned.goal_duration_min:
        lines.append(f"Duration: {planned.goal_duration_min} min")
    if planned.goal_pace_per_km:
        lines.append(f"Pace: {planned.goal_pace_per_km} /km")
    if planned.notes:
        lines.append("")
        lines.append(planned.notes)
    return "\n".join(lines)


def create_workout_task(planned) -> Optional[str]:
    """Create a Google Task for a planned workout.

    Skips silently if Google is not connected or if the workout already has a
    google_task_id (prevents duplicates).

    Args:
        planned: PlannedWorkoutORM instance (must have id, date, type, notes, etc.).

    Returns:
        The Google Task ID if created, None otherwise.
    """
    if planned.google_task_id:
        return planned.google_task_id

    service = _get_service()
    if service is None:
        return None

    task_list_id = _ensure_task_list(service)
    if task_list_id is None:
        return None

    title = _build_task_title(planned)
    notes = _build_task_notes(planned)

    # Google Tasks due date format: RFC 3339 date (time portion = 00:00:00Z)
    due = f"{planned.date.isoformat()}T00:00:00.000Z"

    body = {
        "title": title,
        "notes": notes,
        "due": due,
    }

    try:
        result = service.tasks().insert(tasklist=task_list_id, body=body).execute()
        task_id = result["id"]
        logger.info("Created Google Task '%s' (id=%s) for planned_id=%d", title, task_id, planned.id)
        return task_id
    except Exception:
        logger.exception("Failed to create Google Task for planned_id=%d", planned.id)
        return None


def delete_workout_task(planned) -> bool:
    """Delete a Google Task for a planned workout.

    Args:
        planned: PlannedWorkoutORM instance with google_task_id set.

    Returns:
        True if deleted (or no task to delete), False on error.
    """
    if not planned.google_task_id:
        return True

    service = _get_service()
    if service is None:
        return True  # Can't delete if not connected, don't block

    task_list_id = _ensure_task_list(service)
    if task_list_id is None:
        return False

    try:
        service.tasks().delete(tasklist=task_list_id, task=planned.google_task_id).execute()
        logger.info("Deleted Google Task %s for planned_id=%d", planned.google_task_id, planned.id)
        return True
    except Exception:
        logger.warning("Failed to delete Google Task %s", planned.google_task_id, exc_info=True)
        return False
