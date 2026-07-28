"""Google Calendar endpoints: events, availability, conflict-checked booking."""

from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.logger import logger
from deps.auth import AuthUser, get_current_user
from routers.google_auth import google_service
from schemas.meetings import CreateEventV2Request

router = APIRouter(dependencies=[Depends(get_current_user)])

WORKDAY_START_HOUR = 9
WORKDAY_END_HOUR = 18


class CreateEventRequest(BaseModel):
    summary: str
    start_time: str
    end_time: str
    description: str = ""
    attendees: Optional[List[str]] = None
    location: str = ""


def _parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


@router.get("/calendar/events")
async def list_calendar_events(
    max_results: int = 10,
    user: AuthUser = Depends(get_current_user),
):
    """List upcoming Google Calendar events."""
    try:
        events = await google_service.list_events(
            user_id=user.id, max_results=max_results
        )
        return {"status": "success", "events": events}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error listing calendar events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/calendar/availability")
async def get_availability(
    date: str = Query(..., description="YYYY-MM-DD"),
    duration_minutes: int = Query(30, ge=15, le=240),
    timezone_name: str = Query("UTC", alias="timezone", description="IANA tz, e.g. Asia/Kolkata"),
    user: AuthUser = Depends(get_current_user),
):
    """Free slots between 09:00 and 18:00 (in the given timezone) on a date,
    computed against Google Calendar busy times."""
    try:
        day = date_cls.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date, expected YYYY-MM-DD")
    try:
        tz = ZoneInfo(timezone_name)
    except Exception:
        raise HTTPException(status_code=422, detail=f"Unknown timezone: {timezone_name}")

    window_start = datetime(day.year, day.month, day.day, WORKDAY_START_HOUR, tzinfo=tz)
    window_end = datetime(day.year, day.month, day.day, WORKDAY_END_HOUR, tzinfo=tz)

    try:
        busy_raw = await google_service.get_busy_times(
            user_id=user.id,
            start_iso=window_start.isoformat(),
            end_iso=window_end.isoformat(),
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error fetching busy times: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    busy = [(_parse_iso(b["start"]), _parse_iso(b["end"])) for b in busy_raw]

    slots = []
    step = timedelta(minutes=duration_minutes)
    cursor = window_start
    now = datetime.now(tz)
    while cursor + step <= window_end:
        slot_end = cursor + step
        if cursor >= now and not any(
            _overlaps(cursor, slot_end, bs, be) for bs, be in busy
        ):
            slots.append({"start": cursor.isoformat(), "end": slot_end.isoformat()})
        cursor = slot_end

    return {"slots": slots, "timezone": timezone_name, "date": date}


@router.post("/calendar/events")
async def create_calendar_event(
    request: CreateEventV2Request,
    user: AuthUser = Depends(get_current_user),
):
    """Create a Google Calendar event with conflict detection and a
    human-confirmation gate for external attendees."""
    # Human-confirmation gate: booking with external attendees requires an
    # explicit confirmed=true from the caller.
    if request.attendees and not request.confirmed:
        raise HTTPException(
            status_code=422,
            detail=(
                "Confirmation required: this event invites external attendees. "
                "Re-submit with confirmed=true to book."
            ),
        )

    try:
        start_dt = _parse_iso(request.start_time)
        end_dt = _parse_iso(request.end_time)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid start_time/end_time ISO format")
    if end_dt <= start_dt:
        raise HTTPException(status_code=422, detail="end_time must be after start_time")

    try:
        # Conflict detection via freebusy over the requested window.
        try:
            busy = await google_service.get_busy_times(
                user_id=user.id,
                start_iso=start_dt.isoformat(),
                end_iso=end_dt.isoformat(),
            )
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        conflict = next(
            (
                b
                for b in busy
                if _overlaps(start_dt, end_dt, _parse_iso(b["start"]), _parse_iso(b["end"]))
            ),
            None,
        )
        if conflict:
            # Try to name the conflicting event for a friendlier error.
            summary = "an existing event"
            try:
                events = await google_service.list_events(
                    user_id=user.id, max_results=25, time_min=start_dt.isoformat()
                )
                for ev in events:
                    ev_start = _parse_iso(ev["start"])
                    ev_end = _parse_iso(ev["end"])
                    if _overlaps(start_dt, end_dt, ev_start, ev_end):
                        summary = ev.get("summary") or summary
                        break
            except Exception:
                pass
            raise HTTPException(
                status_code=409,
                detail=f"Time conflict: overlaps with '{summary}' ({conflict['start']} – {conflict['end']})",
            )

        event = await google_service.create_event(
            user_id=user.id,
            summary=request.summary,
            start_time=request.start_time,
            end_time=request.end_time,
            description=request.description,
            attendees=request.attendees,
            location=request.location,
        )
        return {"status": "success", "event": event}
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error creating calendar event: {e}")
        raise HTTPException(status_code=500, detail=str(e))
