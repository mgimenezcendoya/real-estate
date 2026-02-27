"""
Project Loader: parses CSV files to create projects with units.
Supports both WhatsApp upload and API endpoint flows.
"""

import csv
import io
import logging
from datetime import date

from app.database import get_pool

logger = logging.getLogger(__name__)

STATUS_MAP = {
    "disponible": "available",
    "reservada": "reserved",
    "reservado": "reserved",
    "vendida": "sold",
    "vendido": "sold",
    "available": "available",
    "reserved": "reserved",
    "sold": "sold",
}

DELIVERY_STATUS_MAP = {
    "en_pozo": "en_pozo",
    "en pozo": "en_pozo",
    "preventa": "en_pozo",
    "en_construccion": "en_construccion",
    "en construccion": "en_construccion",
    "en construcción": "en_construccion",
    "terminado": "terminado",
    "entrega_inmediata": "terminado",
}


def parse_project_csv(csv_bytes: bytes) -> dict:
    """Parse a project CSV file and return structured data.

    Returns: {
        "project": { ... project fields ... },
        "units": [ { ... unit fields ... }, ... ],
        "errors": [ ... validation errors ... ],
    }
    """
    text = csv_bytes.decode("utf-8-sig").strip()

    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("##"):
            lines.append(stripped)

    if len(lines) < 2:
        return {"project": None, "units": [], "errors": ["CSV vacío o sin datos"]}

    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    rows = list(reader)

    if not rows:
        return {"project": None, "units": [], "errors": ["No se encontraron filas de datos"]}

    errors = []

    first = rows[0]
    project = {}

    name = (first.get("proyecto_nombre") or "").strip()
    if not name:
        errors.append("Falta el nombre del proyecto (columna proyecto_nombre)")
    project["name"] = name
    project["slug"] = name.lower().replace(" ", "-").replace(".", "")
    project["address"] = (first.get("proyecto_direccion") or "").strip() or None
    project["neighborhood"] = (first.get("proyecto_barrio") or "").strip() or None
    project["city"] = (first.get("proyecto_ciudad") or "").strip() or "CABA"
    project["description"] = (first.get("proyecto_descripcion") or "").strip() or None

    project["total_floors"] = _parse_int(first.get("proyecto_pisos_total"))
    project["total_units"] = _parse_int(first.get("proyecto_unidades_total"))

    project["construction_start"] = _parse_date(first.get("proyecto_inicio_obra"))
    project["estimated_delivery"] = _parse_date(first.get("proyecto_entrega_estimada"))

    raw_delivery = (first.get("proyecto_estado_obra") or "").strip().lower()
    project["delivery_status"] = DELIVERY_STATUS_MAP.get(raw_delivery, "en_pozo")

    project["payment_info"] = (first.get("proyecto_formas_pago") or "").strip() or None

    raw_amenities = (first.get("proyecto_amenities") or "").strip()
    if raw_amenities:
        project["amenities"] = [a.strip() for a in raw_amenities.split("|") if a.strip()]
    else:
        project["amenities"] = None

    units = []
    for i, row in enumerate(rows):
        identifier = (row.get("unidad") or "").strip()
        if not identifier:
            continue

        unit = {"identifier": identifier.upper()}
        unit["floor"] = _parse_int(row.get("piso"))
        unit["bedrooms"] = _parse_int(row.get("ambientes"))
        unit["area_m2"] = _parse_decimal(row.get("m2"))
        unit["price_usd"] = _parse_decimal(row.get("precio_usd"))

        raw_status = (row.get("estado") or "disponible").strip().lower()
        unit["status"] = STATUS_MAP.get(raw_status, "available")

        if not unit["floor"] and not unit["price_usd"]:
            errors.append(f"Fila {i+2}: unidad '{identifier}' sin piso ni precio")
        else:
            units.append(unit)

    if not units:
        errors.append("No se encontraron unidades válidas en el CSV")

    if not project.get("total_units"):
        project["total_units"] = len(units)

    return {"project": project, "units": units, "errors": errors}


async def create_project_from_parsed(developer_id: str, parsed: dict) -> dict:
    """Insert a parsed project + units into the database.

    Returns: {"project_id": str, "units_created": int} or {"error": str}
    """
    pool = await get_pool()
    project = parsed["project"]
    units = parsed["units"]

    existing = await pool.fetchrow(
        "SELECT id FROM projects WHERE slug = $1",
        project["slug"],
    )
    if existing:
        return {"error": f"Ya existe un proyecto con el slug '{project['slug']}'. Cambiá el nombre."}

    proj = await pool.fetchrow(
        """INSERT INTO projects (developer_id, name, slug, address, neighborhood, city,
                description, amenities, total_floors, total_units,
                construction_start, estimated_delivery, delivery_status, payment_info, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'active')
           RETURNING id, name""",
        developer_id,
        project["name"],
        project["slug"],
        project["address"],
        project["neighborhood"],
        project["city"],
        project["description"],
        project["amenities"],
        project["total_floors"],
        project["total_units"],
        project["construction_start"],
        project["estimated_delivery"],
        project["delivery_status"],
        project["payment_info"],
    )

    project_id = str(proj["id"])
    units_created = 0

    for unit in units:
        await pool.execute(
            """INSERT INTO units (project_id, identifier, floor, bedrooms, area_m2, price_usd, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            project_id,
            unit["identifier"],
            unit["floor"],
            unit["bedrooms"],
            unit["area_m2"],
            unit["price_usd"],
            unit["status"],
        )
        units_created += 1

    logger.info("Created project '%s' with %d units", proj["name"], units_created)

    return {
        "project_id": project_id,
        "project_name": proj["name"],
        "slug": project["slug"],
        "units_created": units_created,
    }


def build_summary(parsed: dict) -> str:
    """Build a human-readable summary for confirmation."""
    project = parsed["project"]
    units = parsed["units"]

    lines = [f"📋 *Resumen del proyecto*\n"]
    lines.append(f"*Nombre:* {project['name']}")
    if project["address"]:
        loc = project["address"]
        if project["neighborhood"]:
            loc += f", {project['neighborhood']}"
        lines.append(f"*Ubicación:* {loc}")
    if project["description"]:
        lines.append(f"*Descripción:* {project['description'][:100]}...")
    if project["delivery_status"]:
        labels = {"en_pozo": "En pozo", "en_construccion": "En construcción", "terminado": "Terminado"}
        lines.append(f"*Estado obra:* {labels.get(project['delivery_status'], project['delivery_status'])}")
    if project["estimated_delivery"]:
        lines.append(f"*Entrega:* {project['estimated_delivery']}")
    if project["amenities"]:
        lines.append(f"*Amenities:* {', '.join(project['amenities'][:5])}{'...' if len(project['amenities']) > 5 else ''}")
    if project["payment_info"]:
        lines.append(f"*Pago:* {project['payment_info'][:80]}...")

    lines.append(f"\n*Unidades:* {len(units)}")

    if units:
        prices = [u["price_usd"] for u in units if u["price_usd"]]
        if prices:
            lines.append(f"*Rango precios:* USD {min(prices):,.0f} — USD {max(prices):,.0f}")

        avail = sum(1 for u in units if u["status"] == "available")
        res = sum(1 for u in units if u["status"] == "reserved")
        sold = sum(1 for u in units if u["status"] == "sold")
        lines.append(f"*Estado:* {avail} disponibles, {res} reservadas, {sold} vendidas")

        lines.append("\n*Detalle:*")
        for u in units:
            s = {"available": "✅", "reserved": "🟡", "sold": "🔴"}.get(u["status"], "?")
            parts = [s, u["identifier"] + ":"]
            if u["floor"] is not None:
                parts.append(f"P{u['floor']},")
            if u["bedrooms"] is not None:
                parts.append(f"{u['bedrooms']}amb,")
            if u["area_m2"] is not None:
                parts.append(f"{u['area_m2']}m²,")
            if u["price_usd"] is not None:
                parts.append(f"USD {u['price_usd']:,.0f}")
            else:
                parts.append("precio s/d")
            lines.append("  " + " ".join(parts))

    if parsed["errors"]:
        lines.append(f"\n⚠️ *Advertencias:*")
        for e in parsed["errors"]:
            lines.append(f"  - {e}")

    lines.append("\n¿Confirmo la carga? Respondé *sí* o *no*.")

    return "\n".join(lines)


# ---------- Helpers ----------

def _parse_int(val) -> int | None:
    if not val:
        return None
    try:
        return int(str(val).strip().replace(".", "").replace(",", ""))
    except (ValueError, TypeError):
        return None


def _parse_decimal(val) -> float | None:
    if not val:
        return None
    try:
        return float(str(val).strip().replace(",", "."))
    except (ValueError, TypeError):
        return None


def _parse_date(val) -> date | None:
    if not val:
        return None
    val = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return date.fromisoformat(val) if fmt == "%Y-%m-%d" else None
        except ValueError:
            pass
    try:
        from datetime import datetime
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%m/%Y"):
            try:
                return datetime.strptime(val, fmt).date()
            except ValueError:
                continue
    except Exception:
        pass
    return None
