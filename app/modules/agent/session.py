"""
Session Manager: handles persistent state per phone+project combination.
Creates leads and sessions on first contact.
"""

from app.database import get_pool


async def get_or_create_session(phone: str, project_id: str) -> dict:
    """Get existing session or create a new one (+ lead record)."""
    pool = await get_pool()

    row = await pool.fetchrow(
        "SELECT phone, project_id, lead_id, state, updated_at FROM sessions WHERE phone = $1 AND project_id = $2",
        phone,
        project_id,
    )

    if row:
        return dict(row)

    # Create new lead
    lead = await pool.fetchrow(
        "INSERT INTO leads (project_id, phone) VALUES ($1, $2) RETURNING id",
        project_id,
        phone,
    )
    lead_id = str(lead["id"])

    # Create session
    session = await pool.fetchrow(
        "INSERT INTO sessions (phone, project_id, lead_id, state) VALUES ($1, $2, $3, $4) RETURNING *",
        phone,
        project_id,
        lead_id,
        "{}",
    )

    return dict(session)


async def update_session_state(phone: str, project_id: str, state: dict) -> None:
    """Update the session state (qualification progress, etc.)."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE sessions SET state = $1, updated_at = NOW() WHERE phone = $2 AND project_id = $3",
        state,
        phone,
        project_id,
    )


async def get_conversation_history(lead_id: str, limit: int = 20) -> list[dict]:
    """Fetch recent conversation history for a lead."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT role, content, sender_type, created_at
        FROM conversations
        WHERE lead_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        lead_id,
        limit,
    )
    return [dict(r) for r in reversed(rows)]
