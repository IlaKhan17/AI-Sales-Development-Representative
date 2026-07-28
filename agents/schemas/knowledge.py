"""Pydantic schemas for knowledge ingestion, claims and search."""

from pydantic import BaseModel, Field, HttpUrl, field_validator


class IngestWebsiteRequest(BaseModel):
    url: HttpUrl


class DocumentUploadRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1)


class ClaimCreateRequest(BaseModel):
    claim: str = Field(min_length=1)
    source_url: str | None = None
    source_title: str | None = None
    evidence_snippet: str | None = None
    observed_at: str | None = None  # ISO timestamp
    confidence: float | None = Field(default=None, ge=0, le=1)
    product_profile_id: str | None = None


class ClaimReviewRequest(BaseModel):
    review_status: str  # approved | pending | rejected | retired

    @field_validator("review_status")
    @classmethod
    def _validate_status(cls, v: str) -> str:
        allowed = ("approved", "pending", "rejected", "retired")
        if v not in allowed:
            raise ValueError(f"review_status must be one of {allowed}")
        return v


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=25)
