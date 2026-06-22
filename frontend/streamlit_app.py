"""Garmin Workout Tracker - Streamlit Frontend."""
import os
import streamlit as st
import requests
from datetime import datetime, timedelta

# Configuration
st.set_page_config(
    page_title="Garmin Workout Tracker",
    page_icon="🏃",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Backend URL
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

# Sidebar Navigation
st.sidebar.title("🏃 Garmin Tracker")
page = st.sidebar.radio(
    "Navigation",
    ["Dashboard", "Workouts", "Weekly Stats", "Training Plan", "Settings"],
)

# Main content
if page == "Dashboard":
    st.title("Dashboard")
    st.markdown("""
    Welcome to your personal Garmin Workout Tracker!
    
    This app helps you:
    - 📊 Track your running and cycling workouts
    - 📈 Monitor training volume progression (max 10% per week)
    - ❤️ Analyze heart rate trends and aerobic development
    - 💪 Log injury prevention and strength sessions
    - 📝 Add post-workout notes and RPE ratings
    """)

    # TODO: Display recent workouts, weekly stats, alerts
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("This Week Volume", "0 km", "↑ 0 km")
    with col2:
        st.metric("Runs This Week", "0", "↑ 0")
    with col3:
        st.metric("Avg Heart Rate", "0 bpm", "↓ 0 bpm")

elif page == "Workouts":
    st.title("Recent Workouts")
    st.markdown("Pull and manage your Garmin workouts here.")

    # TODO: Fetch from backend
    st.info("Workouts will appear here once Garmin API is integrated.")

elif page == "Weekly Stats":
    st.title("Weekly Training Analysis")
    st.markdown("""
    View your weekly training volume, intensity distribution, and progression.
    
    Remember: **Max 10% volume increase per week** to avoid overtraining.
    """)

    # TODO: Display weekly charts and analytics
    st.warning("Analytics coming soon!")

elif page == "Training Plan":
    st.title("Training Plan")
    st.markdown("""
    Your semi-marathon preparation plan.
    
    **Target Event**: October 25 semi-marathon  
    **Training Frequency**: 2–3 runs per week  
    **Base Schedule**: 5k (short) + 4k (mid) + 8k (long) = 17 km/week
    """)

    # TODO: Display structured training plan
    st.info("Training plan builder coming soon!")

elif page == "Settings":
    st.title("Settings")
    st.markdown("Configure your Garmin credentials and preferences.")

    st.subheader("Garmin Connect")
    email = st.text_input("Garmin Email")
    password = st.text_input("Garmin Password", type="password")

    if st.button("Save Settings"):
        st.success("Settings saved! (Note: Will be persisted in .env)")

# Footer
st.divider()
st.caption(
    "Garmin Workout Tracker v0.1.0 | [GitHub](https://github.com/yonah/garmin-tracking-app)"
)
