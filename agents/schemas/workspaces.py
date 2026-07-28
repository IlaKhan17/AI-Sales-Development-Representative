"""Pydantic schemas for workspace/tenancy endpoints."""

import re

from pydantic import BaseModel, Field, field_validator

ROLES = ("owner", "admin", "member", "reviewer")


class ProductProfileFields(BaseModel):
    company_name: str | None = None
    product_description: str | None = None
    website: str | None = None
    target_market: str | None = None
    value_proposition: str | None = None
    positioning: str | None = None
    approved_stories: list[str] = Field(default_factory=list)
    disallowed_claims: list[str] = Field(default_factory=list)
    tone: str | None = None
    sender_name: str | None = None
    sender_title: str | None = None
    meeting_duration_minutes: int | None = Field(default=None, ge=5, le=240)
    territory: str | None = None
    daily_send_limit: int | None = Field(default=None, ge=1, le=1000)


class WorkspaceCreateRequest(ProductProfileFields):
    name: str = Field(min_length=1, max_length=200)
    organization_name: str | None = None  # defaults to company_name or name


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    product_profile: ProductProfileFields | None = None


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class InviteCreateRequest(BaseModel):
    email: str
    role: str = "member"

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v


class MemberRoleUpdateRequest(BaseModel):
    role: str
