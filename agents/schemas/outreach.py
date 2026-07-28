"""Pydantic schemas for approvals, sequences, replies, suppression."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from services.email_checks import EMAIL_RE


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    edited_subject: str | None = Field(default=None, max_length=200)
    edited_body: str | None = Field(default=None, max_length=10000)


class SequenceStepIn(BaseModel):
    step_number: int = Field(ge=1, le=10)
    objective: str | None = None
    delay_days: int = Field(default=3, ge=0, le=60)


class SequenceCreateRequest(BaseModel):
    campaign_id: str
    name: str = Field(min_length=1, max_length=200)
    steps: list[SequenceStepIn] = Field(min_length=1, max_length=10)


class EnrollRequest(BaseModel):
    prospect_ids: list[str] = Field(min_length=1, max_length=20)


class ReplyActionRequest(BaseModel):
    action: Literal["draft_followup"]


class SuppressionCreateRequest(BaseModel):
    email: str
    reason: Literal["manual", "unsubscribe", "bounce", "complaint"] = "manual"

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v
