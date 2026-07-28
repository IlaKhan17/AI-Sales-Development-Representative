"""Unit tests for the deterministic scoring service (pure, no IO)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.scoring_service import (  # noqa: E402
    STATUS_DISQUALIFIED,
    STATUS_INSUFFICIENT,
    STATUS_NEEDS_REVIEW,
    STATUS_QUALIFIED,
    score_prospect,
)

WEIGHTS = {
    "role": 30,
    "industry": 20,
    "company_size": 15,
    "geography": 10,
    "buying_signals": 15,
    "technology": 10,
}

ICP = {
    "target_roles": ["VP of Engineering", "CTO"],
    "seniority": ["VP", "C-level"],
    "industries": ["SaaS", "FinTech"],
    "company_size_min": 50,
    "company_size_max": 500,
    "geography": ["United States", "Canada"],
    "funding_stages": ["Series A", "Series B"],
    "technologies": ["Python", "AWS"],
    "positive_signals": ["hiring engineers", "raised funding"],
    "pain_signals": ["scaling issues"],
    "exclusions": ["consulting", "government"],
}


def sig(value, conf=0.9, ev=("e1",)):
    return {"value": value, "confidence": conf, "evidence_ids": list(ev)}


def full_signals():
    return {
        "role_match": sig("CTO"),
        "industry": sig("SaaS"),
        "company_size": sig(120),
        "geography": sig("United States"),
        "technologies": [sig("Python"), sig("AWS")],
        "buying_signals": [
            {"type": "hiring engineers", "confidence": 0.8, "evidence_ids": ["e2"]},
            {"type": "raised funding", "confidence": 0.7, "evidence_ids": ["e3"]},
        ],
        "pain_signals": [],
    }


def test_perfect_match_qualifies_with_full_score():
    result = score_prospect(full_signals(), ICP, WEIGHTS)
    assert result.status == STATUS_QUALIFIED
    assert result.total == 100.0
    assert result.disqualification_reason is None
    assert result.component_scores["role"]["points"] == 30


def test_exclusion_deal_breaker_overrides_everything():
    signals = full_signals()
    signals["industry"] = sig("Government consulting")
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.status == STATUS_DISQUALIFIED
    assert result.total == 0.0
    assert "consulting" in result.disqualification_reason.lower() or "government" in result.disqualification_reason.lower()


def test_size_hard_out_above_2x_max():
    signals = full_signals()
    signals["company_size"] = sig(1001)  # > 2 * 500
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.status == STATUS_DISQUALIFIED
    assert "size" in result.disqualification_reason.lower()


def test_size_hard_out_below_half_min():
    signals = full_signals()
    signals["company_size"] = sig(24)  # < 0.5 * 50
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.status == STATUS_DISQUALIFIED


def test_size_boundary_exactly_2x_max_not_disqualified():
    signals = full_signals()
    signals["company_size"] = sig(1000)  # == 2 * 500, not a hard-out
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.status != STATUS_DISQUALIFIED
    assert result.component_scores["company_size"]["points"] == 0.0  # outside 25% window


def test_size_within_25_percent_gets_half_points():
    signals = full_signals()
    signals["company_size"] = sig(600)  # 500 < 600 <= 625
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.component_scores["company_size"]["points"] == 7.5


def test_fuzzy_role_match_gets_partial_points():
    signals = full_signals()
    signals["role_match"] = sig("VP of Engineering and Platform")
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.component_scores["role"]["points"] == 18.0  # 0.6 * 30


def test_signal_without_evidence_contributes_zero():
    signals = full_signals()
    signals["role_match"] = {"value": "CTO", "confidence": 0.95, "evidence_ids": []}
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.component_scores["role"]["points"] == 0.0
    assert result.total == 70.0


def test_thin_evidence_yields_insufficient_evidence():
    signals = {
        "role_match": sig("CTO", conf=0.9),
        "industry": {"value": "SaaS", "confidence": 0.9, "evidence_ids": []},
        "company_size": {"value": None, "confidence": 0, "evidence_ids": []},
        "geography": {"value": "", "confidence": 0, "evidence_ids": []},
        "technologies": [],
        "buying_signals": [],
    }
    # coverage = 0.9/6 = 0.15 < 0.4
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.status == STATUS_INSUFFICIENT


def test_moderate_coverage_yields_needs_review():
    signals = {
        "role_match": sig("CTO", conf=0.9),
        "industry": sig("SaaS", conf=0.9),
        "company_size": sig(120, conf=0.9),
        "geography": {"value": "", "confidence": 0, "evidence_ids": []},
        "technologies": [],
        "buying_signals": [],
    }
    # coverage = 2.7/6 = 0.45 → needs_review despite decent total
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.status == STATUS_NEEDS_REVIEW


def test_good_coverage_but_low_total_needs_review():
    signals = full_signals()
    signals["role_match"] = sig("Marketing Intern")   # 0 role points
    signals["industry"] = sig("Retail")               # 0 industry points
    signals["technologies"] = [sig("PHP")]            # 0 tech points
    signals["buying_signals"] = [
        {"type": "downsizing", "confidence": 0.8, "evidence_ids": ["e2"]}
    ]
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.total < 50
    assert result.status == STATUS_NEEDS_REVIEW


def test_empty_icp_criteria_are_not_penalized():
    icp = {**ICP, "technologies": [], "positive_signals": []}
    signals = full_signals()
    signals["technologies"] = []
    signals["buying_signals"] = []
    result = score_prospect(signals, icp, WEIGHTS)
    assert result.component_scores["technology"]["points"] == 10
    assert result.component_scores["buying_signals"]["points"] == 15


def test_partial_buying_signal_fraction():
    signals = full_signals()
    signals["buying_signals"] = [
        {"type": "hiring engineers", "confidence": 0.8, "evidence_ids": ["e2"]}
    ]
    result = score_prospect(signals, ICP, WEIGHTS)
    assert result.component_scores["buying_signals"]["points"] == 7.5  # 1/2 * 15
