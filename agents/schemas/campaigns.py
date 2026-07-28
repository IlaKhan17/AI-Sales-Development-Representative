"""Pydantic schemas for campaigns and v2 prospects."""

from typing import Literal

from pydantic import BaseModel, Field

VALID_PROSPECT_STATUSES = (
    "discovered",
    "researching",
    "scored",
    "needs_review",
    "insufficient_evidence",
    "disqualified",
    "qualified",
)


class CampaignCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    icp_version_id: str
    product_profile_id: str | None = None
    objective: str | None = None
    region: str | None = None
    target_prospect_count: int = Field(default=25, ge=1, le=500)
    allowed_sources: list[str] = Field(default_factory=list)
    sequence_length: int = Field(default=3, ge=1, le=10)
    daily_cap: int | None = Field(default=None, ge=1)
    approval_policy: Literal["manual", "auto"] = "manual"


class ProspectStatusUpdateRequest(BaseModel):
    status: Literal[
        "discovered",
        "researching",
        "scored",
        "needs_review",
        "insufficient_evidence",
        "disqualified",
        "qualified",
    ]
