"""Pydantic schemas for meetings v2 and calendar."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class AddBotV2Request(BaseModel):
    meeting_url: str = Field(min_length=1, max_length=2000)
    title: str = Field(min_length=1, max_length=300)
    prospect_id: Optional[str] = None
    campaign_id: Optional[str] = None


class ActionItemStatusRequest(BaseModel):
    status: Literal["open", "done"]


class CreateEventV2Request(BaseModel):
    summary: str
    start_time: str
    end_time: str
    description: str = ""
    attendees: Optional[List[str]] = None
    location: str = ""
    confirmed: bool = False
