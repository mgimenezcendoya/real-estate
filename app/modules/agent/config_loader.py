"""
Agent config loader: loads per-tenant agent configuration from agent_configs table.
Falls back to defaults if no config exists for the tenant.
"""

import logging
from dataclasses import dataclass
from typing import Optional

from app.database import get_pool

logger = logging.getLogger(__name__)


@dataclass
class AgentConfig:
    organization_id: str
    agent_name: str = "Asistente"
    system_prompt_override: Optional[str] = None
    system_prompt_append: Optional[str] = None
    model: str = "claude-haiku-4-5-20251001"
    max_tokens: int = 800
    temperature: float = 0.7


async def get_agent_config(organization_id: str) -> AgentConfig:
    """
    Load agent config for the given organization from the DB.
    Returns defaults if no config row exists (INSERT ... ON CONFLICT DO NOTHING pattern).
    """
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM agent_configs WHERE organization_id = $1",
        organization_id,
    )
    if not row:
        logger.debug("No agent_config for org %s, using defaults", organization_id)
        return AgentConfig(organization_id=organization_id)

    return AgentConfig(
        organization_id=organization_id,
        agent_name=row["agent_name"] or "Asistente",
        system_prompt_override=row["system_prompt_override"],
        system_prompt_append=row["system_prompt_append"],
        model=row["model"] or "claude-haiku-4-5-20251001",
        max_tokens=row["max_tokens"] or 800,
        temperature=float(row["temperature"] or 0.7),
    )
