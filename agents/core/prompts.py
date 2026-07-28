"""Prompt registry: YAML-backed versioned prompts.

Each prompt lives in ``agents/prompts/<id>.yaml`` with schema:
    id, version, model (optional override), temperature, system, user_template

Templates are rendered with str.format — literal braces in JSON examples are
escaped as ``{{`` / ``}}`` in the YAML files.
"""

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

from core.logger import logger

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@dataclass(frozen=True)
class Prompt:
    id: str
    version: int
    system: str
    user_template: str
    temperature: float = 0.0
    model: str | None = None
    content_hash: str = ""

    def render(self, **kwargs) -> "RenderedPrompt":
        return RenderedPrompt(
            id=self.id,
            version=self.version,
            model=self.model,
            temperature=self.temperature,
            system=self.system.format(**kwargs) if "{" in self.system else self.system,
            user=self.user_template.format(**kwargs),
        )


@dataclass(frozen=True)
class RenderedPrompt:
    id: str
    version: int
    system: str
    user: str
    temperature: float = 0.0
    model: str | None = None


def content_hash(data: dict) -> str:
    """Stable sha256 over the prompt content."""
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _load_yaml(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Invalid prompt file (not a mapping): {path}")
    return data


@lru_cache(maxsize=None)
def load_prompt(prompt_id: str) -> Prompt:
    """Load a prompt by id from the registry (cached)."""
    path = PROMPTS_DIR / f"{prompt_id}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Unknown prompt id '{prompt_id}' ({path} missing)")
    data = _load_yaml(path)
    return Prompt(
        id=data["id"],
        version=int(data["version"]),
        system=data["system"],
        user_template=data["user_template"],
        temperature=float(data.get("temperature", 0.0)),
        model=data.get("model"),
        content_hash=content_hash(data),
    )


def render(prompt_id: str, **kwargs) -> RenderedPrompt:
    """Render a prompt's system + user messages with str.format kwargs."""
    return load_prompt(prompt_id).render(**kwargs)


def list_prompt_ids() -> list[str]:
    return sorted(p.stem for p in PROMPTS_DIR.glob("*.yaml"))


def sync_prompt_versions() -> None:
    """Upsert all registry prompts into the ``prompt_versions`` table.

    Best-effort: failures (e.g. table not migrated yet) are logged, never raised.
    """
    try:
        from core.db import get_supabase_admin

        client = get_supabase_admin()
        rows = []
        for pid in list_prompt_ids():
            data = _load_yaml(PROMPTS_DIR / f"{pid}.yaml")
            rows.append(
                {
                    "id": data["id"],
                    "version": int(data["version"]),
                    "content_hash": content_hash(data),
                    "content": data,
                }
            )
        if rows:
            client.table("prompt_versions").upsert(rows, on_conflict="id,version").execute()
            logger.info("prompt_versions_synced", count=len(rows))
    except Exception as e:
        logger.warning("prompt_versions_sync_failed", error=str(e))
