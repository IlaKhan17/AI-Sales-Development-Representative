"""Manual test script: add a MeetingBaaS bot to a meeting.

Usage: BOT_API_KEY=... python join_meeting.py <meeting_url>
"""

import os
import sys

import requests

url = "https://api.meetingbaas.com/bots"

api_key = os.environ["BOT_API_KEY"]
meeting_url = sys.argv[1] if len(sys.argv) > 1 else "https://meet.google.com/example"

headers = {
    "Content-Type": "application/json",
    "x-meeting-baas-api-key": api_key,
}

config = {
    "meeting_url": meeting_url,
    "bot_name": "AI Notetaker",
    "recording_mode": "speaker_view",
    "entry_message": "Hi, I'm Davis — an AI notetaker for this meeting.",
    "reserved": False,
    "speech_to_text": {
        "provider": "Default"
    },
    "automatic_leave": {
        "waiting_room_timeout": 600  # 10 minutes in seconds
    }
}
response = requests.post(url, json=config, headers=headers)
print(response.json())
