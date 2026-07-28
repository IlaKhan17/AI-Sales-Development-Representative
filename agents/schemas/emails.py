"""Request models for email endpoints."""

from typing import Optional

from pydantic import BaseModel


class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    html: bool = False
    prospect_id: Optional[str] = None
