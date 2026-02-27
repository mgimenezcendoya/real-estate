"""
Obra Updates: CRUD operations for construction progress updates.
"""

from datetime import date

from app.database import get_pool


async def create_obra_update(
    project_id: str,
    fecha: date,
    etapa: str,
    porcentaje_avance: int,
    nota_publica: str | None = None,
    nota_interna: str | None = None,
    fotos_urls: list[str] | None = None,
    source: str = "whatsapp",
    created_by: str | None = None,
) -> dict:
    """Create a new construction progress update."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO obra_updates (project_id, fecha, etapa, porcentaje_avance, nota_publica, nota_interna, fotos_urls, source, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        """,
        project_id, fecha, etapa, porcentaje_avance,
        nota_publica, nota_interna, fotos_urls,
        source, created_by,
    )
    return dict(row)


async def get_latest_update(project_id: str) -> dict | None:
    """Get the most recent obra update for a project."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM obra_updates WHERE project_id = $1 ORDER BY fecha DESC LIMIT 1",
        project_id,
    )
    return dict(row) if row else None
