"""Deterministic prospect scoring — pure Python, no LLM, no IO.

Takes the structured signals produced by ``signal_extraction_service`` plus an
ICP version's ``definition`` and ``weights`` and returns a fully explainable
score. Every point awarded traces back to evidence-backed signals; signals
without ``evidence_ids`` contribute nothing.

Order of operations:
  1. Deal-breakers (exclusions match, company-size hard-out) → Disqualified.
  2. Component scores (role / industry / company_size / geography /
     buying_signals / technology) weighted per the ICP weights (sum 100).
  3. Evidence gate: confidence-weighted coverage of evidence-backed signals
     decides between insufficient_evidence / needs_review / qualified.
"""

from dataclasses import dataclass, field
from typing import Any

# Coverage thresholds for the evidence gate
INSUFFICIENT_COVERAGE = 0.4
REVIEW_COVERAGE = 0.6
QUALIFY_TOTAL = 50.0
# Company-size soft window (half points) and hard-out multipliers
SIZE_SOFT_MARGIN = 0.25
SIZE_HARD_MAX_FACTOR = 2.0
SIZE_HARD_MIN_FACTOR = 0.5

STATUS_QUALIFIED = "qualified"
STATUS_NEEDS_REVIEW = "needs_review"
STATUS_INSUFFICIENT = "insufficient_evidence"
STATUS_DISQUALIFIED = "disqualified"


@dataclass
class ScoreResult:
    status: str
    total: float
    component_scores: dict[str, dict[str, Any]] = field(default_factory=dict)
    disqualification_reason: str | None = None

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "total": self.total,
            "component_scores": self.component_scores,
            "disqualification_reason": self.disqualification_reason,
        }


# ── helpers ──────────────────────────────────────────────────────────────────

def _norm(s: Any) -> str:
    return str(s or "").strip().lower()


def _has_evidence(sig: dict | None) -> bool:
    return bool(sig) and bool(sig.get("evidence_ids"))


def _valued(sig: dict | None) -> bool:
    """Signal is usable: has a non-empty value AND at least one evidence id."""
    return _has_evidence(sig) and sig.get("value") not in (None, "", [])


def _confidence(sig: dict | None) -> float:
    try:
        return max(0.0, min(1.0, float(sig.get("confidence", 0.0))))
    except (TypeError, ValueError):
        return 0.0


def _text_match(value: str, candidates: list) -> tuple[bool, bool]:
    """Return (exact, fuzzy) match of value against a candidate list.

    Fuzzy = one string contains the other (case-insensitive).
    """
    v = _norm(value)
    if not v:
        return False, False
    exact = fuzzy = False
    for c in candidates or []:
        cn = _norm(c)
        if not cn:
            continue
        if v == cn:
            exact = True
        elif cn in v or v in cn:
            fuzzy = True
    return exact, fuzzy


def _list_signals(signals: dict, key: str) -> list[dict]:
    items = signals.get(key) or []
    return [s for s in items if isinstance(s, dict)]


# ── deal-breakers ────────────────────────────────────────────────────────────

def _check_exclusions(signals: dict, exclusions: list) -> str | None:
    """Return a reason string if any exclusion term matches any evidenced
    signal value (role / industry / geography / technologies / buying / pain)."""
    if not exclusions:
        return None

    texts: list[str] = []
    for key in ("role_match", "industry", "geography"):
        sig = signals.get(key)
        if _valued(sig):
            texts.append(_norm(sig["value"]))
    for key in ("technologies", "buying_signals", "pain_signals"):
        for sig in _list_signals(signals, key):
            if _has_evidence(sig):
                texts.append(_norm(sig.get("value") or sig.get("type")))

    for exclusion in exclusions:
        ex = _norm(exclusion)
        if not ex:
            continue
        for t in texts:
            if t and (ex in t or t in ex):
                return f"Exclusion '{exclusion}' matched signal '{t}'"
    return None


def _check_size_hard_out(signals: dict, definition: dict) -> str | None:
    sig = signals.get("company_size")
    if not _valued(sig):
        return None
    try:
        size = int(sig["value"])
    except (TypeError, ValueError):
        return None
    size_min = definition.get("company_size_min")
    size_max = definition.get("company_size_max")
    if size_max and size > size_max * SIZE_HARD_MAX_FACTOR:
        return f"Company size {size} exceeds 2x ICP max ({size_max})"
    if size_min and size < size_min * SIZE_HARD_MIN_FACTOR:
        return f"Company size {size} below 0.5x ICP min ({size_min})"
    return None


# ── component scorers (each returns (points, max, reason)) ───────────────────

def _score_role(signals: dict, definition: dict, max_pts: float):
    targets = definition.get("target_roles") or []
    if not targets:
        return max_pts, "No target roles defined in ICP (not applicable)"
    sig = signals.get("role_match")
    if not _valued(sig):
        return 0.0, "No evidence-backed role signal"
    exact, fuzzy = _text_match(sig["value"], targets)
    if exact:
        return max_pts, f"Role '{sig['value']}' exactly matches target roles"
    if fuzzy:
        return round(max_pts * 0.6, 2), f"Role '{sig['value']}' partially matches target roles"
    return 0.0, f"Role '{sig['value']}' does not match target roles"


def _score_industry(signals: dict, definition: dict, max_pts: float):
    industries = definition.get("industries") or []
    if not industries:
        return max_pts, "No industries defined in ICP (not applicable)"
    sig = signals.get("industry")
    if not _valued(sig):
        return 0.0, "No evidence-backed industry signal"
    exact, fuzzy = _text_match(sig["value"], industries)
    if exact or fuzzy:
        return max_pts, f"Industry '{sig['value']}' matches ICP industries"
    return 0.0, f"Industry '{sig['value']}' not in ICP industries"


def _score_company_size(signals: dict, definition: dict, max_pts: float):
    size_min = definition.get("company_size_min")
    size_max = definition.get("company_size_max")
    if not size_min and not size_max:
        return max_pts, "No company size range defined in ICP (not applicable)"
    sig = signals.get("company_size")
    if not _valued(sig):
        return 0.0, "No evidence-backed company size signal"
    try:
        size = int(sig["value"])
    except (TypeError, ValueError):
        return 0.0, f"Company size value '{sig['value']}' is not numeric"

    lo = size_min or 0
    hi = size_max or float("inf")
    if lo <= size <= hi:
        return max_pts, f"Company size {size} within ICP range [{size_min}, {size_max}]"
    soft_lo = lo * (1 - SIZE_SOFT_MARGIN)
    soft_hi = hi * (1 + SIZE_SOFT_MARGIN) if size_max else float("inf")
    if soft_lo <= size <= soft_hi:
        return round(max_pts * 0.5, 2), f"Company size {size} within 25% of ICP range"
    return 0.0, f"Company size {size} outside ICP range [{size_min}, {size_max}]"


def _score_geography(signals: dict, definition: dict, max_pts: float):
    geos = definition.get("geography") or []
    if not geos:
        return max_pts, "No geography defined in ICP (not applicable)"
    sig = signals.get("geography")
    if not _valued(sig):
        return 0.0, "No evidence-backed geography signal"
    exact, fuzzy = _text_match(sig["value"], geos)
    if exact or fuzzy:
        return max_pts, f"Geography '{sig['value']}' matches ICP geography"
    return 0.0, f"Geography '{sig['value']}' not in ICP geography"


def _score_buying_signals(signals: dict, definition: dict, max_pts: float):
    wanted = definition.get("positive_signals") or []
    if not wanted:
        return max_pts, "No positive signals defined in ICP (not applicable)"
    observed = [
        _norm(s.get("type") or s.get("value"))
        for s in _list_signals(signals, "buying_signals")
        if _has_evidence(s)
    ]
    matched = []
    for w in wanted:
        wn = _norm(w)
        if any(wn and o and (wn in o or o in wn) for o in observed):
            matched.append(w)
    fraction = len(matched) / len(wanted)
    return round(max_pts * fraction, 2), (
        f"Matched {len(matched)}/{len(wanted)} positive signals: {matched}"
        if matched
        else "No evidence-backed buying signals matched ICP positive signals"
    )


def _score_technology(signals: dict, definition: dict, max_pts: float):
    wanted = definition.get("technologies") or []
    if not wanted:
        return max_pts, "No technologies defined in ICP (not applicable)"
    observed = [
        _norm(s.get("value"))
        for s in _list_signals(signals, "technologies")
        if _has_evidence(s)
    ]
    matched = []
    for w in wanted:
        wn = _norm(w)
        if any(wn and o and (wn in o or o in wn) for o in observed):
            matched.append(w)
    fraction = len(matched) / len(wanted)
    return round(max_pts * fraction, 2), (
        f"Matched {len(matched)}/{len(wanted)} ICP technologies: {matched}"
        if matched
        else "No evidence-backed technology overlap with ICP"
    )


# ── evidence coverage ────────────────────────────────────────────────────────

def _evidence_coverage(signals: dict) -> float:
    """Confidence-weighted coverage across the six signal categories.

    Each scalar category (role, industry, size, geography) contributes its own
    confidence if evidence-backed, else 0. Each list category (technologies,
    buying_signals) contributes the max confidence among its evidence-backed
    items. Coverage = mean over the six categories.
    """
    parts: list[float] = []
    for key in ("role_match", "industry", "company_size", "geography"):
        sig = signals.get(key)
        parts.append(_confidence(sig) if _valued(sig) else 0.0)
    for key in ("technologies", "buying_signals"):
        confs = [_confidence(s) for s in _list_signals(signals, key) if _has_evidence(s)]
        parts.append(max(confs) if confs else 0.0)
    return sum(parts) / len(parts)


# ── entrypoint ───────────────────────────────────────────────────────────────

def score_prospect(signals: dict, icp_definition: dict, weights: dict) -> ScoreResult:
    """Score a prospect's extracted signals against an ICP version.

    ``signals`` is the signal_extraction_service output. ``weights`` maps
    {role, industry, company_size, geography, buying_signals, technology} to
    point maxima summing to 100.
    """
    signals = signals or {}
    icp_definition = icp_definition or {}
    weights = weights or {}

    # 1. Deal-breakers first — they override everything.
    reason = _check_exclusions(signals, icp_definition.get("exclusions") or [])
    if not reason:
        reason = _check_size_hard_out(signals, icp_definition)
    if reason:
        return ScoreResult(
            status=STATUS_DISQUALIFIED,
            total=0.0,
            component_scores={},
            disqualification_reason=reason,
        )

    # 2. Component scores.
    scorers = {
        "role": _score_role,
        "industry": _score_industry,
        "company_size": _score_company_size,
        "geography": _score_geography,
        "buying_signals": _score_buying_signals,
        "technology": _score_technology,
    }
    components: dict[str, dict[str, Any]] = {}
    total = 0.0
    for name, fn in scorers.items():
        max_pts = float(weights.get(name, 0))
        points, why = fn(signals, icp_definition, max_pts)
        components[name] = {"points": points, "max": max_pts, "reason": why}
        total += points
    total = round(total, 2)

    # 3. Evidence gate.
    coverage = _evidence_coverage(signals)
    if coverage < INSUFFICIENT_COVERAGE:
        status = STATUS_INSUFFICIENT
    elif coverage < REVIEW_COVERAGE:
        status = STATUS_NEEDS_REVIEW
    else:
        status = STATUS_QUALIFIED if total >= QUALIFY_TOTAL else STATUS_NEEDS_REVIEW

    components["_evidence_coverage"] = {
        "points": round(coverage, 3),
        "max": 1.0,
        "reason": "Confidence-weighted evidence coverage across signal categories",
    }
    return ScoreResult(status=status, total=total, component_scores=components)
