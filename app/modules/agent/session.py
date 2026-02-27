"""
Session Manager: handles persistent state per phone+project combination.
Creates leads and sessions on first contact.
"""

import json

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

    lead = await pool.fetchrow(
        "INSERT INTO leads (project_id, phone) VALUES ($1, $2) RETURNING id",
        project_id,
        phone,
    )
    lead_id = str(lead["id"])

    session = await pool.fetchrow(
        "INSERT INTO sessions (phone, project_id, lead_id, state) VALUES ($1, $2, $3, $4::jsonb) RETURNING *",
        phone,
        project_id,
        lead_id,
        json.dumps({}),
    )

    return dict(session)


async def update_session_state(phone: str, project_id: str, state: dict) -> None:
    """Update the session state (qualification progress, etc.)."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE sessions SET state = $1::jsonb, updated_at = NOW() WHERE phone = $2 AND project_id = $3",
        json.dumps(state),
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


async def save_conversation_message(
    lead_id: str,
    role: str,
    sender_type: str,
    content: str,
    wa_message_id: str | None = None,
    media_type: str | None = None,
    media_url: str | None = None,
) -> dict:
    """Save a message to the conversations table."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO conversations (lead_id, wa_message_id, role, sender_type, content, media_type, media_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        """,
        lead_id,
        wa_message_id,
        role,
        sender_type,
        content,
        media_type,
        media_url,
    )
    return dict(row)


async def get_lead_qualification(lead_id: str) -> dict:
    """Load current qualification data for a lead."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT name, intent, financing, timeline, score, budget_usd, bedrooms, location_pref FROM leads WHERE id = $1",
        lead_id,
    )
    if not row:
        return {}
    return {k: v for k, v in dict(row).items() if v is not None}


async def update_lead_qualification(lead_id: str, qualification: dict, score: str) -> None:
    """Persist qualification data and score on the leads table."""
    pool = await get_pool()
    await pool.execute(
        """
        UPDATE leads
        SET name = COALESCE($2, name),
            intent = COALESCE($3, intent),
            financing = COALESCE($4, financing),
            timeline = COALESCE($5, timeline),
            budget_usd = COALESCE($6, budget_usd),
            bedrooms = COALESCE($7, bedrooms),
            location_pref = COALESCE($8, location_pref),
            score = $9,
            last_contact = NOW()
        WHERE id = $1
        """,
        lead_id,
        qualification.get("name"),
        qualification.get("intent"),
        qualification.get("financing"),
        qualification.get("timeline"),
        qualification.get("budget_usd"),
        qualification.get("bedrooms"),
        qualification.get("location_pref"),
        score,
    )


async def get_developer_context(developer_id: str) -> str:
    """Load ALL projects for a developer with full details, units, and documents."""
    pool = await get_pool()

    projects = await pool.fetch(
        """SELECT id, name, slug, address, neighborhood, city, description,
                  amenities, total_floors, total_units,
                  construction_start, estimated_delivery, delivery_status,
                  payment_info, status
           FROM projects WHERE developer_id = $1 ORDER BY name""",
        developer_id,
    )

    if not projects:
        return "No se encontraron proyectos para este desarrollador."

    delivery_labels = {
        "en_pozo": "En pozo (preventa)",
        "en_construccion": "En construcción",
        "terminado": "Terminado / entrega inmediata",
    }
    unit_status_labels = {"available": "disponible", "reserved": "reservada", "sold": "vendida"}
    doc_type_labels = {
        "plano": "Plano", "precios": "Lista de precios", "brochure": "Brochure",
        "memoria": "Memoria descriptiva", "reglamento": "Reglamento de copropiedad",
        "faq": "FAQ", "contrato": "Contrato", "cronograma": "Cronograma de obra",
    }

    lines = [f"Proyectos del desarrollador ({len(projects)} en total):\n"]

    for proj in projects:
        proj_id = str(proj["id"])
        lines.append(f"### {proj['name']}")

        if proj["address"]:
            location = proj["address"]
            if proj["neighborhood"]:
                location += f", {proj['neighborhood']}"
            if proj["city"]:
                location += f", {proj['city']}"
            lines.append(f"Ubicación: {location}")

        if proj["description"]:
            lines.append(f"Descripción: {proj['description']}")

        ds = delivery_labels.get(proj["delivery_status"], proj["delivery_status"] or "")
        if ds:
            lines.append(f"Estado de obra: {ds}")
        if proj["estimated_delivery"]:
            lines.append(f"Entrega estimada: {proj['estimated_delivery'].strftime('%B %Y')}")

        if proj["total_floors"]:
            lines.append(f"Edificio: {proj['total_floors']} pisos, {proj['total_units'] or '?'} unidades")

        if proj["amenities"]:
            lines.append(f"Amenities: {', '.join(proj['amenities'])}")

        if proj["payment_info"]:
            lines.append(f"Formas de pago: {proj['payment_info']}")

        units = await pool.fetch(
            "SELECT identifier, floor, bedrooms, area_m2, price_usd, status FROM units WHERE project_id = $1 ORDER BY floor, identifier",
            proj_id,
        )
        if units:
            available = [u for u in units if u["status"] == "available"]
            reserved = [u for u in units if u["status"] == "reserved"]
            sold = [u for u in units if u["status"] == "sold"]
            lines.append(f"\nUnidades ({len(units)} total — {len(available)} disponibles, {len(reserved)} reservadas, {len(sold)} vendidas):")
            for u in units:
                s = unit_status_labels.get(u["status"], u["status"])
                lines.append(
                    f"  - {u['identifier']}: Piso {u['floor']}, "
                    f"{u['bedrooms']} amb, {u['area_m2']}m², "
                    f"USD {u['price_usd']:,.0f} ({s})"
                )

        docs = await pool.fetch(
            "SELECT doc_type, filename, unit_identifier FROM documents WHERE project_id = $1 AND is_active = TRUE ORDER BY doc_type, unit_identifier",
            proj_id,
        )
        if docs:
            lines.append(f"\nDocumentos disponibles ({len(docs)}):")
            for d in docs:
                label = doc_type_labels.get(d["doc_type"], d["doc_type"])
                unit_info = f" - Unidad {d['unit_identifier']}" if d["unit_identifier"] else ""
                lines.append(f"  - {label}{unit_info} ({d['filename']})")

        lines.append("")

    return "\n".join(lines)
