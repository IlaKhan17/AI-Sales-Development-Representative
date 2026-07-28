"""Pydantic schemas for ICP profiles and immutable versions."""

from pydantic import BaseModel, Field, field_validator

DEFAULT_WEIGHTS = {
    "role": 30,
    "industry": 20,
    "company_size": 15,
    "geography": 10,
    "buying_signals": 15,
    "technology": 10,
}

WEIGHT_KEYS = set(DEFAULT_WEIGHTS)


class ICPDefinition(BaseModel):
    target_roles: list[str] = Field(default_factory=list)
    seniority: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)
    company_size_min: int | None = Field(default=None, ge=1)
    company_size_max: int | None = Field(default=None, ge=1)
    geography: list[str] = Field(default_factory=list)
    funding_stages: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    positive_signals: list[str] = Field(default_factory=list)
    pain_signals: list[str] = Field(default_factory=list)
    exclusions: list[str] = Field(default_factory=list)


class ICPProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ICPVersionCreateRequest(BaseModel):
    definition: ICPDefinition
    weights: dict[str, int] = Field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    notes: str | None = None

    @field_validator("weights")
    @classmethod
    def _validate_weights(cls, v: dict[str, int]) -> dict[str, int]:
        unknown = set(v) - WEIGHT_KEYS
        if unknown:
            raise ValueError(f"Unknown weight keys: {sorted(unknown)}")
        missing = WEIGHT_KEYS - set(v)
        if missing:
            raise ValueError(f"Missing weight keys: {sorted(missing)}")
        total = sum(v.values())
        if total != 100:
            raise ValueError(f"Weights must sum to 100 (got {total})")
        if any(w < 0 for w in v.values()):
            raise ValueError("Weights must be non-negative")
        return v


class ICPVersionStatusUpdateRequest(BaseModel):
    status: str  # activate: "active" | archive: "archived"

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: str) -> str:
        if v not in ("active", "archived"):
            raise ValueError("status must be 'active' or 'archived'")
        return v
