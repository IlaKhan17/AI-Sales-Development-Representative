"""Campaign run orchestration: discovery → evidence → signals → deterministic
scoring → email enrichment. Called by the arq worker task (or inline in dev).

Robustness contract: one bad candidate must never kill the run — every
per-prospect stage is wrapped in try/except and recorded. Pause is checked
between prospects by polling campaigns.status.
"""

from datetime import datetime, timezone

from core import run_recorder
from core.db import get_supabase_admin
from core.errors import classify_exception
from core.logger import logger
from services.email_discovery_service import EmailDiscoveryService
from services.prospect_discovery_service import ProspectDiscoveryService
from services.scoring_service import score_prospect
from services.signal_extraction_service import SignalExtractionService

# Source-based prior confidence for raw discovery evidence (0.5–0.8)
SOURCE_CONFIDENCE = {
    "linkedin": 0.8,
    "github": 0.75,
    "product hunt": 0.7,
    "g2": 0.7,
    "crunchbase": 0.7,
    "yc directory": 0.7,
    "wellfound": 0.65,
    "angellist": 0.65,
    "hacker news": 0.6,
    "reddit": 0.55,
}
DEFAULT_SOURCE_CONFIDENCE = 0.5


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _source_confidence(source: str) -> float:
    s = (source or "").strip().lower()
    for key, conf in SOURCE_CONFIDENCE.items():
        if key in s:
            return conf
    return DEFAULT_SOURCE_CONFIDENCE


def _normalize_candidate(raw: dict) -> dict:
    """Turn a raw search/scraper result into a candidate prospect dict."""
    name = (raw.get("_name") or "").strip()
    role = (raw.get("_role") or "").strip()
    company = (raw.get("_company") or "").strip()
    title = raw.get("title") or ""

    if not name and title:
        # Common patterns: "Name — Role at Company", "Name - Role - Company | LinkedIn"
        head = title.split("|")[0]
        for sep in ("—", " - ", " – "):
            if sep in head:
                parts = [p.strip() for p in head.split(sep) if p.strip()]
                if parts:
                    name = parts[0]
                    if len(parts) > 1 and not role:
                        role = parts[1]
                    if len(parts) > 2 and not company:
                        company = parts[2]
                break
        if not name:
            name = head.strip()
        if not company and " at " in role:
            role, _, company = role.partition(" at ")
            role, company = role.strip(), company.strip()

    url = raw.get("url") or ""
    return {
        "full_name": name or "Unknown",
        "role_title": role or None,
        "company": company or None,
        "source": raw.get("source") or "Web",
        "source_url": url or None,
        "linkedin_url": url if "linkedin.com/in" in url else None,
        "snippet": raw.get("snippet") or "",
        "title": title,
        "email": raw.get("_email"),
    }


def _dedupe(candidates: list[dict]) -> list[dict]:
    seen: set = set()
    out = []
    for c in candidates:
        name = (c.get("full_name") or "").strip().lower()
        company = (c.get("company") or "").strip().lower()
        key = (name, company) if name and name != "unknown" else ("url", c.get("source_url"))
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def _campaign_status(db, campaign_id: str) -> str | None:
    try:
        rows = db.table("campaigns").select("status").eq("id", campaign_id).limit(1).execute().data
        return rows[0]["status"] if rows else None
    except Exception as e:
        logger.warning("campaign_status_poll_failed", error=str(e))
        return None


def _get_or_create_company(db, org_id: str, ws_id: str, name: str | None, industry: str | None = None) -> str | None:
    if not name:
        return None
    try:
        rows = (
            db.table("companies")
            .select("id")
            .eq("workspace_id", ws_id)
            .ilike("name", name)
            .limit(1)
            .execute()
        ).data
        if rows:
            return rows[0]["id"]
        created = (
            db.table("companies")
            .insert(
                {
                    "organization_id": org_id,
                    "workspace_id": ws_id,
                    "name": name,
                    "industry": industry,
                }
            )
            .execute()
        ).data
        return created[0]["id"] if created else None
    except Exception as e:
        logger.warning("company_upsert_failed", company=name, error=str(e))
        return None


async def run_campaign_pipeline(
    run_id: str,
    campaign_id: str,
    workspace_id: str,
    user_id: str | None,
) -> dict:
    """Execute a full campaign discovery run. Returns summary counts."""
    db = get_supabase_admin()

    # ── (a) load campaign + icp version (+ optional product profile) ────────
    rows = (
        db.table("campaigns").select("*").eq("id", campaign_id)
        .eq("workspace_id", workspace_id).limit(1).execute()
    ).data
    if not rows:
        raise ValueError(f"Campaign {campaign_id} not found in workspace {workspace_id}")
    campaign = rows[0]
    org_id = campaign["organization_id"]

    icp_rows = (
        db.table("icp_versions").select("*").eq("id", campaign["icp_version_id"]).limit(1).execute()
    ).data
    if not icp_rows:
        raise ValueError(f"ICP version {campaign['icp_version_id']} not found")
    icp = icp_rows[0]
    definition = icp.get("definition") or {}
    weights = icp.get("weights") or {}

    product_profile = None
    if campaign.get("product_profile_id"):
        pp = (
            db.table("product_profiles").select("*")
            .eq("id", campaign["product_profile_id"]).limit(1).execute()
        ).data
        product_profile = pp[0] if pp else None

    run_recorder.record_step(
        run_id, "load_context", status="completed",
        output_summary={"icp_version": icp.get("version"), "has_product_profile": bool(product_profile)},
    )

    # ── (b) discovery: reuse pipeline, raw candidates only (no legacy LLM score)
    company_description = ""
    if product_profile:
        company_description = (
            product_profile.get("description")
            or product_profile.get("value_proposition")
            or product_profile.get("company_name")
            or ""
        )
    goal = campaign.get("objective") or campaign["name"]
    if campaign.get("region"):
        goal = f"{goal} (region: {campaign['region']})"
    target_roles = definition.get("target_roles") or []
    allowed = [s.lower() for s in (campaign.get("allowed_sources") or [])]
    enable_playwright = not allowed or any(s not in ("google", "reddit") for s in allowed)

    discovery = ProspectDiscoveryService()
    raw = await discovery.gather_raw_candidates(
        company_description=company_description,
        goal=goal,
        job_titles=target_roles,
        enable_playwright=enable_playwright,
    )

    # ── (c) normalize + dedupe, cap at target * 3 ───────────────────────────
    cap = max(1, int(campaign.get("target_prospect_count") or 25)) * 3
    candidates = _dedupe([_normalize_candidate(r) for r in raw])[:cap]
    run_recorder.record_step(
        run_id, "discovery", status="completed",
        output_summary={"raw_results": len(raw), "candidates": len(candidates)},
    )

    # ── (d) per-candidate: evidence → signals → deterministic score ─────────
    extractor = SignalExtractionService()
    email_service = EmailDiscoveryService()
    counts = {"processed": 0, "qualified": 0, "failed": 0, "paused": False}

    for candidate in candidates:
        # Pause check between prospects — abort gracefully.
        if _campaign_status(db, campaign_id) == "paused":
            logger.info("campaign_paused_aborting", campaign_id=campaign_id)
            counts["paused"] = True
            break
        try:
            await _process_candidate(
                db, extractor, email_service,
                candidate=candidate, campaign=campaign, org_id=org_id,
                workspace_id=workspace_id, run_id=run_id, user_id=user_id,
                definition=definition, weights=weights, counts=counts,
            )
            counts["processed"] += 1
        except Exception as e:
            counts["failed"] += 1
            logger.error(
                "campaign_candidate_failed",
                candidate=candidate.get("full_name"), error=str(e),
                error_class=classify_exception(e).value,
            )

    run_recorder.record_step(
        run_id, "score_prospects", status="completed", output_summary=dict(counts),
    )

    # ── (f) finalize campaign status ────────────────────────────────────────
    if not counts["paused"]:
        db.table("campaigns").update({"status": "completed"}).eq("id", campaign_id).execute()
    return counts


async def _process_candidate(
    db, extractor: SignalExtractionService, email_service: EmailDiscoveryService,
    *, candidate: dict, campaign: dict, org_id: str, workspace_id: str,
    run_id: str, user_id: str | None, definition: dict, weights: dict, counts: dict,
) -> None:
    # 1. prospects_v2 row (discovered)
    company_id = _get_or_create_company(db, org_id, workspace_id, candidate.get("company"))
    prospect = (
        db.table("prospects_v2")
        .insert(
            {
                "organization_id": org_id,
                "workspace_id": workspace_id,
                "campaign_id": campaign["id"],
                "company_id": company_id,
                "full_name": candidate["full_name"],
                "role_title": candidate.get("role_title"),
                "linkedin_url": candidate.get("linkedin_url"),
                "source": candidate.get("source"),
                "source_url": candidate.get("source_url"),
                "status": "discovered",
                "email": candidate.get("email"),
                "run_id": run_id,
                "created_by": user_id,
            }
        )
        .execute()
    ).data[0]
    prospect_id = prospect["id"]

    # 2. evidence rows from discovery output
    evidence_rows = []
    if candidate.get("snippet") or candidate.get("source_url"):
        evidence_rows.append(
            {
                "organization_id": org_id,
                "workspace_id": workspace_id,
                "prospect_id": prospect_id,
                "claim": f"Appears in {candidate.get('source', 'web')} search result: {candidate.get('title', '')}"[:500],
                "source_url": candidate.get("source_url"),
                "source_title": candidate.get("title"),
                "evidence_snippet": candidate.get("snippet"),
                "observed_at": _now(),
                "confidence": _source_confidence(candidate.get("source", "")),
                "run_id": run_id,
            }
        )
    evidence = []
    if evidence_rows:
        evidence = db.table("prospect_evidence").insert(evidence_rows).execute().data or []

    # 3. signal extraction (status: researching)
    db.table("prospects_v2").update({"status": "researching"}).eq("id", prospect_id).execute()
    signals = await extractor.extract_signals(
        prospect={
            "full_name": candidate["full_name"],
            "role_title": candidate.get("role_title"),
            "company": candidate.get("company"),
            "source": candidate.get("source"),
        },
        evidence=evidence,
    )

    # 4. persist prospect_signals
    signal_rows = []

    def add_signal(signal_type: str, sig: dict) -> None:
        signal_rows.append(
            {
                "organization_id": org_id,
                "workspace_id": workspace_id,
                "prospect_id": prospect_id,
                "signal_type": signal_type,
                "value": {"value": sig.get("value"), "type": sig.get("type")},
                "confidence": sig.get("confidence"),
                "evidence_ids": sig.get("evidence_ids") or [],
                "run_id": run_id,
                "prompt_version": str(extractor.prompt_version),
                "model": None,
            }
        )

    for key in ("role_match", "industry", "company_size", "geography"):
        sig = signals.get(key) or {}
        if sig.get("evidence_ids"):
            add_signal(key, sig)
    for key, stype in (("technologies", "technology"), ("buying_signals", "buying_signal"), ("pain_signals", "pain_signal")):
        for sig in signals.get(key) or []:
            add_signal(stype, sig)
    if signal_rows:
        db.table("prospect_signals").insert(signal_rows).execute()

    # 5. deterministic scoring
    result = score_prospect(signals, definition, weights)
    db.table("prospect_scores").insert(
        {
            "organization_id": org_id,
            "workspace_id": workspace_id,
            "prospect_id": prospect_id,
            "icp_version_id": campaign["icp_version_id"],
            "component_scores": result.component_scores,
            "total": result.total,
            "status": result.status,
            "disqualification_reason": result.disqualification_reason,
            "run_id": run_id,
        }
    ).execute()
    db.table("prospects_v2").update({"status": result.status}).eq("id", prospect_id).execute()

    # 6. email enrichment — qualified only, needs a company domain
    if result.status == "qualified":
        counts["qualified"] += 1
        if not prospect.get("email"):
            await _enrich_email(db, email_service, prospect_id, candidate)


async def _enrich_email(db, email_service: EmailDiscoveryService, prospect_id: str, candidate: dict) -> None:
    try:
        domain = _guess_domain(candidate)
        if not domain:
            return
        name_parts = (candidate.get("full_name") or "").split()
        if len(name_parts) < 2:
            return
        candidates = await email_service.find_best_email(
            first_name=name_parts[0],
            last_name=name_parts[-1],
            company_domain=domain,
            max_candidates=5,
        )
        best = next((c for c in candidates if c.get("confidence") in ("verified", "likely")), None)
        if best:
            db.table("prospects_v2").update(
                {"email": best["address"], "email_confidence": best["confidence"]}
            ).eq("id", prospect_id).execute()
    except Exception as e:
        logger.warning("email_enrichment_failed", prospect_id=prospect_id, error=str(e))


def _guess_domain(candidate: dict) -> str | None:
    """Only use a domain we actually observed (company website URL); never guess."""
    url = candidate.get("source_url") or ""
    if not url:
        return None
    from urllib.parse import urlparse

    host = urlparse(url).netloc.lower().removeprefix("www.")
    # Skip aggregator/social domains — not the prospect's company domain.
    blocked = (
        "linkedin.com", "reddit.com", "github.com", "producthunt.com", "g2.com",
        "crunchbase.com", "wellfound.com", "angel.co", "ycombinator.com",
        "news.ycombinator.com", "twitter.com", "x.com", "google.com",
    )
    if not host or any(host == b or host.endswith("." + b) for b in blocked):
        return None
    return host
