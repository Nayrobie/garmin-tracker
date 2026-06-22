# Garmin API Integration Skill

## When to use this skill

Use this skill when:
- Deciding which Garmin API approach to use (community SDK vs. official Health API)
- Implementing the `GarminService` class for real API calls
- Choosing authentication method (OAuth, API key, direct login)
- Handling Garmin data models and field mapping

## Overview

The project needs to pull workout data from Garmin Connect. 
Approache: use the community SDK (garmin-api)

## Data Fields to Map

Key Garmin activity fields to extract:
- `activityId` → `Workout.id`
- `startTimeInSeconds` + `durationInSeconds` → `Workout.date`, `Workout.duration_minutes`
- `distance` → `Workout.distance_km` (convert from meters)
- `activityType` → `Workout.activity_type`
- `avgHeartRate` → `Workout.avg_heart_rate`
- `maxHeartRate` → `Workout.max_heart_rate`
- `avgPace` → `Workout.avg_pace_min_per_km` (convert if needed)
- `elevationGain` → `Workout.elevation_gain_m`
- `avgPower` → `Workout.power_avg_watts`

## Notes

- Store credentials securely in `.env`
- Consider token refresh/expiration for OAuth
- Add retry logic for API timeouts
- Log API calls for debugging