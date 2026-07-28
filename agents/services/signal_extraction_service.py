"""LLM signal extraction with strict evidence grounding.

Given a prospect's raw data and its evidence rows, ask the LLM to extract
structured signals — each citing evidence ids. Post-validation strips any
hallucinated evidence ids and drops signals left without valid citations, so
downstream deterministic scoring only ever sees evidence-backed signals.
"""

import json

from core.logger import logger
from core.prompts import load_prompt, render
from services.llm_service import LLMService

SCALAR_KEYS = ("role_match", "industry", "company_size", "geography")
LIST_KEYS = ("technologies", "buying_signals", "pain_signals")

_EMPTY_SCALAR = {"value": None, "confidence": 0.0, "evidence_ids": []}

JSON_STRUCTURE = {
    "role_match": {"value": "string|null", "confidence": 0.0, "evidence_ids": ["uuid"]},
    "industry": {"value": "string|null", "confidence": 0.0, "evidence_ids": ["uuid"]},
    "company_size": {"value": "int|null", "confidence": 0.0, "evidence_ids": ["uuid"]},
    "geography": {"value": "string|null", "confidence": 0.0, "evidence_ids": ["uuid"]},
    "technologies": [{"value": "string", "confidence": 0.0, "evidence_ids": ["uuid"]}],
    "buying_signals": [{"type": "string", "confidence": 0.0, "evidence_ids": ["uuid"]}],
    "pain_signals": [{"type": "string", "confidence": 0.0, "evidence_ids": ["uuid"]}],
}


class SignalExtractionService:
    prompt_id = "signal_extraction"

    def __init__(self, llm_service: LLMService | None = None):
        self.llm = llm_service or LLMService()
        self.prompt_version = load_prompt(self.prompt_id).version

    async def extract_signals(self, prospect: dict, evidence: list[dict]) -> dict:
        """Extract evidence-grounded signals for one prospect.

        ``evidence`` items: {id, claim, evidence_snippet, source_url}.
        Returns the validated signals dict (see JSON_STRUCTURE).
        """
        evidence_payload = [
            {
                "id": str(e.get("id")),
                "claim": e.get("claim"),
                "snippet": e.get("evidence_snippet"),
                "source_url": e.get("source_url"),
            }
            for e in evidence
        ]
        rp = render(
            self.prompt_id,
            prospect_json=json.dumps(prospect, indent=2, default=str),
            evidence_json=json.dumps(evidence_payload, indent=2),
        )
        raw = await self.llm.get_json_response(
            system_prompt=rp.system,
            user_prompt=rp.user,
            json_structure=JSON_STRUCTURE,
        )
        valid_ids = {str(e.get("id")) for e in evidence}
        return self._validate(raw if isinstance(raw, dict) else {}, valid_ids)

    def _validate(self, raw: dict, valid_ids: set[str]) -> dict:
        """Strip hallucinated evidence ids; drop signals left without any."""
        out: dict = {}

        def clean_ids(sig: dict) -> list[str]:
            ids = sig.get("evidence_ids") or []
            if not isinstance(ids, list):
                return []
            kept = [str(i) for i in ids if str(i) in valid_ids]
            dropped = len(ids) - len(kept)
            if dropped:
                logger.warning(
                    "signal_extraction_invalid_evidence_ids",
                    dropped=dropped,
                    signal=sig,
                )
            return kept

        for key in SCALAR_KEYS:
            sig = raw.get(key)
            if not isinstance(sig, dict):
                out[key] = dict(_EMPTY_SCALAR)
                continue
            ids = clean_ids(sig)
            if not ids or sig.get("value") in (None, "", []):
                if sig.get("value") not in (None, "", []) and not ids:
                    logger.info("signal_extraction_dropped_unevidenced", signal_type=key)
                out[key] = dict(_EMPTY_SCALAR)
                continue
            out[key] = {
                "value": sig.get("value"),
                "confidence": _clamp(sig.get("confidence")),
                "evidence_ids": ids,
            }

        for key in LIST_KEYS:
            items = raw.get(key) or []
            kept_items = []
            if isinstance(items, list):
                for sig in items:
                    if not isinstance(sig, dict):
                        continue
                    ids = clean_ids(sig)
                    if not ids:
                        logger.info("signal_extraction_dropped_unevidenced", signal_type=key)
                        continue
                    kept_items.append(
                        {
                            "value": sig.get("value") or sig.get("type"),
                            "type": sig.get("type") or sig.get("value"),
                            "confidence": _clamp(sig.get("confidence")),
                            "evidence_ids": ids,
                        }
                    )
            out[key] = kept_items

        return out


def _clamp(v) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.0
