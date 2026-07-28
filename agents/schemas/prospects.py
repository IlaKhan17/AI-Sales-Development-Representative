"""Request/response models for prospect endpoints."""

from typing import List, Optional

from pydantic import BaseModel


class Prospect(BaseModel):
    author: Optional[str] = None
    role: Optional[str] = "Unknown"
    company: Optional[str] = None
    isProspect: Optional[bool] = False
    alignment_score: Optional[float] = 0.0
    industry: Optional[str] = None
    pain_points: Optional[List[str]] = []
    solution_fit: Optional[str] = None
    insights: Optional[str] = None

    class Config:
        extra = "allow"


class ICPConfig(BaseModel):
    """Structured Ideal Customer Profile definition for more precise lead scoring."""

    target_industries: Optional[List[str]] = []
    company_size: Optional[str] = ""        # e.g. "50-500 employees", "Series A-C startups"
    funding_stage: Optional[str] = ""       # e.g. "Seed", "Series A", "Series B-C"
    tech_stack_signals: Optional[List[str]] = []  # Keywords indicating right tech stack
    pain_points_to_target: Optional[List[str]] = []  # Specific pain points to look for
    geography: Optional[List[str]] = []
    deal_breakers: Optional[List[str]] = []  # Auto-disqualify if any match
    value_proposition: Optional[str] = ""   # Your product's key value prop


class ProspectDiscoveryRequest(BaseModel):
    company_description: str
    goal: str
    job_titles: List[str]
    icp: Optional[ICPConfig] = None
    enable_playwright: Optional[bool] = True
    enable_email_discovery: Optional[bool] = True
    keyword_hint: Optional[str] = ""


class EmailDiscoveryRequest(BaseModel):
    first_name: str
    last_name: str
    company_domain: str
    max_candidates: Optional[int] = 5


class ScrapeSourceRequest(BaseModel):
    source: str  # "product_hunt" | "g2" | "hacker_news" | "github" | "crunchbase" | "wellfound" | "yc_directory" | "angellist"
    keyword: Optional[str] = ""
    role: Optional[str] = ""
    org_name: Optional[str] = ""
    competitor_slug: Optional[str] = ""
    market: Optional[str] = ""
    batch: Optional[str] = ""
    limit: Optional[int] = 10


class AutoFillRequest(BaseModel):
    job_description: str
