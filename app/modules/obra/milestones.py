"""
Obra Milestones: discrete construction events that can trigger buyer notifications.
"""

from app.database import get_pool


async def create_milestone(
    project_id: str,
    name: str,
    etapa: str | None = None,
    floor: int | None = None,
    notify_buyers: bool = False,
    created_by: str | None = None,
) -> dict:
    """Register a new construction milestone."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO obra_milestones (project_id, name, etapa, floor, notify_buyers, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        """,
        project_id, name, etapa, floor, notify_buyers, created_by,
    )
    return dict(row)


async def get_pending_notifications(project_id: str) -> list[dict]:
    """Get milestones that need buyer notifications sent."""
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM obra_milestones WHERE project_id = $1 AND notify_buyers = TRUE AND notified = FALSE",
        project_id,
    )
    return [dict(r) for r in rows]
