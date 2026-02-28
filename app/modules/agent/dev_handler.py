"""
Developer Handler: processes messages from authorized team members.
Uses Claude to interpret natural-language commands and execute actions
on projects, units, and leads.
"""

import asyncio
import json
import logging
import re

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.database import get_pool
from app.modules.agent.prompts import DEVELOPER_SYSTEM_PROMPT, DEV_ACTION_PROMPT
from app.modules.project_loader import parse_project_csv, create_project_from_parsed, build_summary
from app.modules.rag.ingestion import find_document_for_sharing
from app.modules.rag.retrieval import get_developer_document_blocks
from app.modules.storage import upload_file
from app.modules.whatsapp.media import download_media, download_media_with_filename
from app.modules.whatsapp.providers.base import IncomingMessage
from app.modules.whatsapp.sender import send_document_message, send_text_message

logger = logging.getLogger(__name__)

DOC_MARKER_RE = re.compile(r"\[ENVIAR_DOC:(\w+):(\w+)(?::([a-zA-Z0-9_-]+))?\]")


_pending_uploads: dict[str, dict] = {}
_pending_csv: dict[str, dict] = {}


async def handle_developer_message(
    auth_number: dict,
    developer: dict,
    message_id: str,
    message_type: str,
    message: IncomingMessage,
) -> None:
    """Process a message from an authorized developer."""
    phone = auth_number["phone"]
    developer_id = developer["developer_id"]
    dev_name = auth_number["name"] or "Developer"

    if message_type == "document":
        await _handle_incoming_document(phone, developer_id, dev_name, message)
        return

    text = message.text if message_type == "text" else None
    if not text:
        reply = _dev_reply(dev_name, "Por ahora proceso texto, PDFs y CSVs. Mandame un texto con lo que necesitás, un PDF para guardarlo, o un CSV de proyecto para cargarlo.")
        await send_text_message(to=phone, text=reply)
        return

    if phone in _pending_csv:
        await _handle_csv_confirmation(phone, developer_id, dev_name, auth_number["id"], developer, text)
        return

    if phone in _pending_uploads:
        await _handle_upload_classification(phone, developer_id, dev_name, auth_number["id"], developer, text)
        return

    context = await _build_developer_context(developer_id)
    history = await _get_dev_conversation_history(auth_number["id"], limit=10)

    await _save_dev_message(auth_number["id"], developer["default_project_id"], "user", text)

    action_response = await _classify_and_respond(
        developer_id=developer_id,
        developer_name=developer["developer_name"],
        dev_name=dev_name,
        context=context,
        history=history,
        user_message=text,
    )

    action = action_response.get("action")
    params = action_response.get("params", {})
    reply = action_response.get("reply", "")

    if action and action != "none":
        result = await _execute_action(action, params, developer_id, author_name=dev_name)
        if result.get("send_template"):
            await _send_csv_template(phone, dev_name)
            return
        elif result.get("error"):
            reply += f"\n\n⚠️ Error: {result['error']}"
        elif result.get("confirmation"):
            reply += f"\n\n✅ {result['confirmation']}"

    if not reply:
        reply = "No entendí qué necesitás. Probá con algo como:\n- \"cómo están las unidades de Manzanares?\"\n- \"marcá la 2B como vendida\"\n- \"resumen de leads\"\n- \"quiero cargar un nuevo proyecto\""

    clean_reply, doc_request = _extract_doc_marker(reply)
    clean_reply = _dev_reply(dev_name, clean_reply)

    await _save_dev_message(auth_number["id"], developer["default_project_id"], "assistant", clean_reply)
    logger.info("Dev reply to %s: %s", phone, clean_reply[:80])
    await send_text_message(to=phone, text=clean_reply)

    if doc_request:
        asyncio.create_task(
            _send_document(developer_id, phone, doc_request)
        )


def _dev_reply(dev_name: str, text: str) -> str:
    return f"🔧 *Modo Admin — {dev_name}*\n\n{text}"


async def handle_activation_code(auth_number: dict, message: IncomingMessage) -> None:
    """Handle activation code from a pending authorized number."""
    text = (message.text or "").strip()
    phone = auth_number["phone"]

    if text == auth_number.get("activation_code"):
        pool = await get_pool()
        await pool.execute(
            "UPDATE authorized_numbers SET status = 'active', activated_at = NOW() WHERE id = $1",
            auth_number["id"],
        )
        await send_text_message(to=phone, text="✅ Acceso activado. Ya podés operar en modo developer.")
    else:
        await send_text_message(to=phone, text="Código incorrecto. Intentá de nuevo.")


# ---------- Document upload (developer sends PDF) ----------

VALID_DOC_TYPES = {
    "brochure": "Brochure",
    "precios": "Lista de precios",
    "plano": "Plano",
    "memoria": "Memoria descriptiva",
    "reglamento": "Reglamento",
    "faq": "FAQ",
    "contrato": "Contrato",
    "cronograma": "Cronograma de obra",
}


async def _handle_incoming_document(phone: str, developer_id: str, dev_name: str, message: IncomingMessage) -> None:
    """Developer sent a file. Detect type (CSV for project load, PDF for document storage)."""
    try:
        file_bytes, real_filename = await download_media_with_filename(media_url=message.media_url)
    except Exception as e:
        logger.error("Failed to download media from developer: %s", e)
        await send_text_message(to=phone, text=_dev_reply(dev_name, "No pude descargar el archivo. Intentá de nuevo."))
        return

    filename = real_filename or message.filename or "documento"
    mime = (message.media_mime_type or "").lower()
    is_csv = "csv" in mime or filename.lower().endswith(".csv") or "spreadsheet" in mime

    logger.info("Document received: filename=%s (real=%s), mime=%s, is_csv=%s, bytes=%d",
                filename, real_filename, mime, is_csv, len(file_bytes))

    if is_csv:
        await _handle_csv_upload(phone, developer_id, dev_name, file_bytes, filename)
        return

    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"

    pool = await get_pool()
    projects = await pool.fetch(
        "SELECT name, slug FROM projects WHERE developer_id = $1 AND status = 'active' ORDER BY name",
        developer_id,
    )

    _pending_uploads[phone] = {
        "file_bytes": file_bytes,
        "filename": filename,
        "developer_id": developer_id,
        "step": "ask_project" if len(projects) > 1 else "ask_type",
        "project_slug": projects[0]["slug"] if len(projects) == 1 else None,
        "project_name": projects[0]["name"] if len(projects) == 1 else None,
    }

    types_list = "\n".join(f"• *{v}*" for v in VALID_DOC_TYPES.values())

    if len(projects) > 1:
        project_list = "\n".join(f"• *{p['name']}*" for p in projects)
        reply = f"Recibí el archivo *{filename}*.\n\n¿De qué proyecto es?\n{project_list}"
    else:
        reply = f"Recibí el archivo *{filename}* para *{projects[0]['name']}*.\n\n¿Qué tipo de documento es?\n{types_list}"

    await send_text_message(to=phone, text=_dev_reply(dev_name, reply))


async def _handle_upload_classification(
    phone: str, developer_id: str, dev_name: str, auth_number_id: str, developer: dict, text: str,
) -> None:
    """Process the developer's reply classifying the pending upload."""
    pending = _pending_uploads[phone]
    text_lower = text.lower().strip()
    pool = await get_pool()

    if pending["step"] == "ask_project":
        projects = await pool.fetch(
            "SELECT name, slug FROM projects WHERE developer_id = $1 AND status = 'active' ORDER BY name",
            developer_id,
        )
        matched = None
        for p in projects:
            if p["slug"] in text_lower or p["name"].lower() in text_lower:
                matched = p
                break
        if not matched:
            for p in projects:
                name_words = p["name"].lower().split()
                if any(w in text_lower for w in name_words if len(w) > 3):
                    matched = p
                    break

        if not matched:
            project_list = "\n".join(f"• *{p['name']}*" for p in projects)
            await send_text_message(to=phone, text=_dev_reply(dev_name, f"No identifiqué el proyecto. ¿Cuál es?\n{project_list}"))
            return

        pending["project_slug"] = matched["slug"]
        pending["project_name"] = matched["name"]
        pending["step"] = "ask_type"

        types_list = "\n".join(f"• *{v}*" for v in VALID_DOC_TYPES.values())
        await send_text_message(to=phone, text=_dev_reply(dev_name, f"Proyecto: *{matched['name']}*. ¿Qué tipo de documento es?\n{types_list}"))
        return

    if pending["step"] == "ask_type":
        matched_type = None
        for key, label in VALID_DOC_TYPES.items():
            if key in text_lower or label.lower() in text_lower:
                matched_type = key
                break

        if not matched_type:
            types_list = "\n".join(f"• *{v}*" for v in VALID_DOC_TYPES.values())
            await send_text_message(to=phone, text=_dev_reply(dev_name, f"No identifiqué el tipo. ¿Cuál es?\n{types_list}"))
            return

        pending["doc_type"] = matched_type

        if matched_type == "plano":
            pending["step"] = "ask_unit"
            units = await pool.fetch(
                """SELECT u.identifier FROM units u JOIN projects p ON p.id = u.project_id
                   WHERE p.slug = $1 AND p.developer_id = $2 ORDER BY u.floor, u.identifier""",
                pending["project_slug"], developer_id,
            )
            unit_list = ", ".join(u["identifier"] for u in units)
            await send_text_message(to=phone, text=_dev_reply(dev_name, f"¿De qué unidad es el plano? ({unit_list}) — o escribí *general* si es del edificio"))
            return

        await _finalize_upload(phone, developer_id, dev_name, auth_number_id, developer)
        return

    if pending["step"] == "ask_unit":
        unit_identifier = text.strip().upper()
        if text_lower in ("general", "edificio", "todos", "ninguna"):
            pending["unit_identifier"] = None
        else:
            pending["unit_identifier"] = unit_identifier

        await _finalize_upload(phone, developer_id, dev_name, auth_number_id, developer)
        return


async def _finalize_upload(
    phone: str, developer_id: str, dev_name: str, auth_number_id: str, developer: dict,
) -> None:
    """Upload the file to storage and register in DB."""
    pending = _pending_uploads.pop(phone)
    pool = await get_pool()

    project = await pool.fetchrow(
        "SELECT id, name FROM projects WHERE slug = $1 AND developer_id = $2",
        pending["project_slug"], developer_id,
    )
    if not project:
        await send_text_message(to=phone, text=_dev_reply(dev_name, "⚠️ No encontré el proyecto."))
        return

    project_id = str(project["id"])
    doc_type = pending["doc_type"]
    unit_identifier = pending.get("unit_identifier")
    filename = pending["filename"]
    file_bytes = pending["file_bytes"]

    try:
        file_url = await upload_file(file_bytes, pending["project_slug"], doc_type, filename)

        if unit_identifier:
            await pool.execute(
                "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier = $3 AND is_active = TRUE",
                project_id, doc_type, unit_identifier,
            )
        else:
            await pool.execute(
                "UPDATE documents SET is_active = FALSE WHERE project_id = $1 AND doc_type = $2 AND unit_identifier IS NULL AND is_active = TRUE",
                project_id, doc_type,
            )

        floor_val = None
        if unit_identifier:
            unit_row = await pool.fetchrow(
                "SELECT floor FROM units WHERE project_id = $1 AND UPPER(identifier) = $2",
                project_id, unit_identifier,
            )
            if unit_row:
                floor_val = unit_row["floor"]

        await pool.execute(
            """INSERT INTO documents (project_id, doc_type, filename, file_url, file_size_bytes, unit_identifier, floor, source, rag_status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'whatsapp', 'ready')""",
            project_id, doc_type, filename, file_url, len(file_bytes),
            unit_identifier, floor_val,
        )

        type_label = VALID_DOC_TYPES.get(doc_type, doc_type)
        unit_info = f" (unidad {unit_identifier})" if unit_identifier else ""
        reply = f"✅ *{type_label}*{unit_info} guardado en *{project['name']}*\n📄 {filename}"

        logger.info("Dev uploaded %s for %s: %s", doc_type, project["name"], filename)
    except Exception as e:
        logger.error("Failed to upload document: %s", e)
        reply = f"⚠️ Error al guardar el archivo: {e}"

    await _save_dev_message(auth_number_id, developer["default_project_id"], "assistant", reply)
    await send_text_message(to=phone, text=_dev_reply(dev_name, reply))


# ---------- CSV template sending ----------

async def _send_csv_template(phone: str, dev_name: str) -> None:
    """Send the CSV template file to the developer via WhatsApp."""
    import os
    from app.modules.storage import upload_file as s3_upload

    template_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "templates", "proyecto_template.csv")
    template_path = os.path.abspath(template_path)

    try:
        with open(template_path, "rb") as f:
            csv_bytes = f.read()

        file_url = await s3_upload(
            project_slug="_templates",
            doc_type="csv",
            filename="proyecto_template.csv",
            file_bytes=csv_bytes,
        )

        await send_document_message(
            to=phone,
            document_url=file_url,
            filename="proyecto_template.csv",
            caption="Template para cargar proyecto — completá lo que puedas y mandalo de vuelta",
        )

        instructions = (
            "📋 *Carga de Nuevo Proyecto*\n\n"
            "Te mando el template CSV. Los pasos son:\n\n"
            "1️⃣ Descargá el archivo y abrilo con Excel o Google Sheets\n"
            "2️⃣ Completá los datos del proyecto en la primera fila\n"
            "3️⃣ Agregá una fila por cada unidad (las columnas del proyecto dejálas vacías)\n"
            "4️⃣ Guardá como CSV y mandámelo por acá\n\n"
            "Los campos que no tengas dejálos vacíos — después los podés completar por WhatsApp.\n\n"
            "*Campos del proyecto:* nombre, dirección, barrio, ciudad, descripción, pisos, "
            "unidades totales, inicio obra, entrega estimada, estado obra, formas de pago, amenities\n\n"
            "*Campos por unidad:* identificador, piso, ambientes, m², precio USD, estado (disponible/reservada/vendida)"
        )
        await send_text_message(to=phone, text=_dev_reply(dev_name, instructions))

    except FileNotFoundError:
        await send_text_message(to=phone, text=_dev_reply(dev_name,
            "⚠️ No encontré el template CSV. Contactá al soporte técnico."))
    except Exception as e:
        logger.error("Error sending CSV template: %s", e)
        await send_text_message(to=phone, text=_dev_reply(dev_name,
            f"⚠️ Error al enviar el template: {e}"))


# ---------- CSV project loading ----------

async def _handle_csv_upload(phone: str, developer_id: str, dev_name: str, file_bytes: bytes, filename: str) -> None:
    """Parse a CSV and show summary for confirmation."""
    try:
        parsed = parse_project_csv(file_bytes)
    except Exception as e:
        logger.error("CSV parse error: %s", e)
        await send_text_message(to=phone, text=_dev_reply(dev_name, f"⚠️ Error al leer el CSV: {e}\n\nRevisá que el formato sea correcto."))
        return

    if not parsed["project"] or not parsed["project"].get("name"):
        errors = "\n".join(f"- {e}" for e in parsed["errors"])
        await send_text_message(to=phone, text=_dev_reply(dev_name, f"⚠️ No pude extraer los datos del proyecto.\n{errors}"))
        return

    _pending_csv[phone] = {
        "parsed": parsed,
        "developer_id": developer_id,
        "filename": filename,
    }

    summary = build_summary(parsed)
    await send_text_message(to=phone, text=_dev_reply(dev_name, summary))


async def _handle_csv_confirmation(
    phone: str, developer_id: str, dev_name: str, auth_number_id: str, developer: dict, text: str,
) -> None:
    """Handle yes/no confirmation for a pending CSV project load."""
    text_lower = text.strip().lower()
    pending = _pending_csv.get(phone)

    if not pending:
        del _pending_csv[phone]
        return

    yes_words = {"si", "sí", "yes", "dale", "confirmo", "ok", "listo", "va"}
    no_words = {"no", "cancelar", "cancel", "nah"}

    if text_lower in no_words:
        del _pending_csv[phone]
        await send_text_message(to=phone, text=_dev_reply(dev_name, "Carga cancelada. Podés mandar el CSV de nuevo cuando quieras."))
        return

    if text_lower not in yes_words:
        await send_text_message(to=phone, text=_dev_reply(dev_name, "Respondé *sí* para confirmar la carga o *no* para cancelar."))
        return

    parsed = pending["parsed"]
    del _pending_csv[phone]

    result = await create_project_from_parsed(developer_id, parsed)

    if result.get("error"):
        await send_text_message(to=phone, text=_dev_reply(dev_name, f"⚠️ {result['error']}"))
        return

    reply = (
        f"✅ *Proyecto creado exitosamente*\n\n"
        f"*{result['project_name']}*\n"
        f"ID: {result['project_id']}\n"
        f"Slug: {result['slug']}\n"
        f"Unidades cargadas: {result['units_created']}\n\n"
        f"Ya podés subir documentos (PDFs) para este proyecto y el agente de ventas ya lo conoce."
    )

    await _save_dev_message(auth_number_id, developer["default_project_id"], "assistant", reply)
    logger.info("Project created from CSV: %s (%d units)", result["project_name"], result["units_created"])
    await send_text_message(to=phone, text=_dev_reply(dev_name, reply))


# ---------- Document sharing ----------

def _extract_doc_marker(text: str) -> tuple[str, dict | None]:
    """Parse and remove [ENVIAR_DOC:type:unit:project] marker from reply."""
    match = DOC_MARKER_RE.search(text)
    if not match:
        return text, None
    clean = DOC_MARKER_RE.sub("", text).rstrip()
    return clean, {
        "doc_type": match.group(1),
        "unit_identifier": match.group(2) if match.group(2) != "NONE" else None,
        "project_slug": match.group(3) if match.group(3) else None,
    }


async def _send_document(developer_id: str, to_phone: str, doc_request: dict) -> None:
    """Find and send a document via WhatsApp."""
    try:
        doc = await find_document_for_sharing(
            developer_id=developer_id,
            doc_type=doc_request["doc_type"],
            unit_identifier=doc_request.get("unit_identifier"),
            project_slug=doc_request.get("project_slug"),
        )
        if not doc:
            logger.warning("Document not found for dev: %s", doc_request)
            return
        document_url = doc["file_url"]
        logger.info("Sending doc to dev %s: type=%s url=%s", to_phone, doc_request["doc_type"], document_url)
        result = await send_document_message(
            to=to_phone, document_url=document_url,
            filename=doc["filename"], caption=doc["filename"],
        )
        logger.info("Twilio response for dev doc send: %s", result)
    except Exception as e:
        logger.error("Failed to send document to dev %s: %s", to_phone, e)


# ---------- Context building ----------

async def _build_developer_context(developer_id: str) -> str:
    """Build a summary of all projects with units and recent leads for the developer."""
    pool = await get_pool()

    projects = await pool.fetch(
        """SELECT id, name, slug, address, neighborhood, status, delivery_status, estimated_delivery
           FROM projects WHERE developer_id = $1 ORDER BY name""",
        developer_id,
    )

    unit_status_labels = {"available": "disponible", "reserved": "reservada", "sold": "vendida"}
    lines = []

    for proj in projects:
        pid = str(proj["id"])
        lines.append(f"## {proj['name']} ({proj['slug']})")
        lines.append(f"Dirección: {proj['address']}, {proj['neighborhood']}")
        lines.append(f"Estado obra: {proj['delivery_status']} | Entrega: {proj['estimated_delivery'] or '?'}")

        units = await pool.fetch(
            "SELECT id, identifier, floor, bedrooms, area_m2, price_usd, status FROM units WHERE project_id = $1 ORDER BY floor, identifier",
            pid,
        )
        if units:
            avail = sum(1 for u in units if u["status"] == "available")
            res = sum(1 for u in units if u["status"] == "reserved")
            sold = sum(1 for u in units if u["status"] == "sold")
            lines.append(f"Unidades: {len(units)} total | {avail} disponibles | {res} reservadas | {sold} vendidas")
            for u in units:
                s = unit_status_labels.get(u["status"], u["status"])
                unit_line = f"  - {u['identifier']} (id:{u['id']}): P{u['floor']}, {u['bedrooms']}amb, {u['area_m2']}m², USD{u['price_usd']:,.0f} [{s}]"

                notes = await pool.fetch(
                    "SELECT author_name, note, created_at FROM unit_notes WHERE unit_id = $1 ORDER BY created_at DESC LIMIT 3",
                    u["id"],
                )
                if notes:
                    for n in notes:
                        ts = n["created_at"].strftime("%d/%m %H:%M")
                        unit_line += f"\n      📝 {n['author_name']} ({ts}): {n['note']}"

                lines.append(unit_line)

        doc_type_labels = {
            "plano": "Plano", "precios": "Lista de precios", "brochure": "Brochure",
            "memoria": "Memoria descriptiva", "reglamento": "Reglamento",
            "faq": "FAQ", "contrato": "Contrato", "cronograma": "Cronograma de obra",
        }
        docs = await pool.fetch(
            "SELECT doc_type, filename, unit_identifier FROM documents WHERE project_id = $1 AND is_active = TRUE ORDER BY doc_type, unit_identifier",
            pid,
        )
        if docs:
            lines.append(f"Documentos ({len(docs)}):")
            for d in docs:
                label = doc_type_labels.get(d["doc_type"], d["doc_type"])
                unit_info = f" - Unidad {d['unit_identifier']}" if d["unit_identifier"] else ""
                lines.append(f"  - {label}{unit_info} ({d['filename']})")

        leads_count = await pool.fetchval(
            "SELECT COUNT(*) FROM leads WHERE project_id = $1", pid,
        )
        hot = await pool.fetchval(
            "SELECT COUNT(*) FROM leads WHERE project_id = $1 AND score = 'hot'", pid,
        )
        warm = await pool.fetchval(
            "SELECT COUNT(*) FROM leads WHERE project_id = $1 AND score = 'warm'", pid,
        )
        lines.append(f"Leads: {leads_count} total | {hot} hot | {warm} warm")

        recent_leads = await pool.fetch(
            """SELECT l.name, l.phone, l.score, l.intent, l.bedrooms, l.budget_usd, l.last_contact
               FROM leads l WHERE l.project_id = $1 ORDER BY l.last_contact DESC NULLS LAST LIMIT 5""",
            pid,
        )
        if recent_leads:
            lines.append("Últimos leads:")
            for rl in recent_leads:
                name = rl["name"] or "Sin nombre"
                score = rl["score"] or "?"
                intent = rl["intent"] or ""
                bed = f"{rl['bedrooms']}amb" if rl["bedrooms"] else ""
                budget = f"USD{rl['budget_usd']:,}" if rl["budget_usd"] else ""
                contact = rl["last_contact"].strftime("%d/%m %H:%M") if rl["last_contact"] else ""
                lines.append(f"  - {name} ({rl['phone'][-4:]}) [{score}] {intent} {bed} {budget} — {contact}")

        lines.append("")

    return "\n".join(lines)


async def _get_dev_conversation_history(auth_number_id: str, limit: int = 10) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT role, content, created_at FROM developer_conversations
           WHERE authorized_number_id = $1 ORDER BY created_at DESC LIMIT $2""",
        auth_number_id, limit,
    )
    return [dict(r) for r in reversed(rows)]


async def _save_dev_message(auth_number_id: str, project_id: str, role: str, content: str) -> None:
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO developer_conversations (authorized_number_id, project_id, role, content) VALUES ($1, $2, $3, $4)",
        auth_number_id, project_id, role, content,
    )


# ---------- Claude interaction ----------

async def _classify_and_respond(
    developer_id: str,
    developer_name: str,
    dev_name: str,
    context: str,
    history: list[dict],
    user_message: str,
) -> dict:
    """Use Claude to interpret the developer's message, decide action, and draft reply."""
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    system = DEVELOPER_SYSTEM_PROMPT.format(
        developer_name=developer_name,
        dev_name=dev_name,
    )
    system += f"\n\nEstado actual de los proyectos:\n{context}"
    system += f"\n\n{DEV_ACTION_PROMPT}"

    doc_blocks = await get_developer_document_blocks(developer_id)

    messages = []

    if doc_blocks:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": "Documentos del proyecto adjuntos para consulta:"},
                *doc_blocks,
            ],
        })
        messages.append({
            "role": "assistant",
            "content": '{"action": "none", "params": {}, "reply": "Tengo los documentos del proyecto disponibles para consultar."}',
        })

    for msg in history:
        role = "user" if msg["role"] == "user" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=600,
        system=system,
        messages=messages,
    )

    raw = response.content[0].text.strip()

    try:
        if raw.startswith("{"):
            return json.loads(raw)
        json_start = raw.find("{")
        json_end = raw.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            return json.loads(raw[json_start:json_end])
    except (json.JSONDecodeError, ValueError):
        pass

    return {"action": "none", "params": {}, "reply": raw}


# ---------- Action execution ----------

async def _execute_action(action: str, params: dict, developer_id: str, author_name: str = "Developer") -> dict:
    """Execute a developer action and return result."""
    pool = await get_pool()

    if action == "update_unit_status":
        return await _action_update_unit(pool, params, developer_id)
    elif action == "update_unit_price":
        return await _action_update_price(pool, params, developer_id)
    elif action == "add_unit_note":
        return await _action_add_note(pool, params, developer_id, author_name)
    elif action == "get_lead_detail":
        return await _action_get_lead_detail(pool, params, developer_id)
    elif action == "create_project_instructions":
        return {"send_template": True}
    elif action == "update_project":
        return await _action_update_project(pool, params, developer_id)
    else:
        return {"error": f"Acción desconocida: {action}"}


async def _action_update_unit(pool, params: dict, developer_id: str) -> dict:
    identifier = params.get("unit_identifier", "").upper()
    project_slug = params.get("project_slug", "")
    new_status = params.get("status", "").lower()

    valid = {"available", "reserved", "sold"}
    if new_status not in valid:
        return {"error": f"Estado inválido '{new_status}'. Opciones: {', '.join(valid)}"}

    row = await pool.fetchrow(
        """UPDATE units u SET status = $1
           FROM projects p
           WHERE u.project_id = p.id AND p.developer_id = $2
             AND UPPER(u.identifier) = $3 AND p.slug = $4
           RETURNING u.identifier, p.name as project_name, u.status""",
        new_status, developer_id, identifier, project_slug,
    )
    if not row:
        return {"error": f"No encontré la unidad {identifier} en {project_slug}"}

    status_labels = {"available": "disponible", "reserved": "reservada", "sold": "vendida"}
    return {"confirmation": f"Unidad {row['identifier']} de {row['project_name']} ahora está {status_labels.get(new_status, new_status)}"}


async def _action_update_price(pool, params: dict, developer_id: str) -> dict:
    identifier = params.get("unit_identifier", "").upper()
    project_slug = params.get("project_slug", "")
    new_price = params.get("price_usd")

    if not new_price or not isinstance(new_price, (int, float)):
        return {"error": "Precio inválido"}

    row = await pool.fetchrow(
        """UPDATE units u SET price_usd = $1
           FROM projects p
           WHERE u.project_id = p.id AND p.developer_id = $2
             AND UPPER(u.identifier) = $3 AND p.slug = $4
           RETURNING u.identifier, p.name as project_name, u.price_usd""",
        new_price, developer_id, identifier, project_slug,
    )
    if not row:
        return {"error": f"No encontré la unidad {identifier} en {project_slug}"}

    return {"confirmation": f"Precio de {row['identifier']} en {row['project_name']} actualizado a USD {int(new_price):,}"}


async def _action_add_note(pool, params: dict, developer_id: str, author_name: str) -> dict:
    identifier = params.get("unit_identifier", "").upper()
    project_slug = params.get("project_slug", "")
    note = params.get("note", "").strip()

    if not note:
        return {"error": "No se recibió texto para la nota"}

    unit = await pool.fetchrow(
        """SELECT u.id, u.identifier, p.name as project_name
           FROM units u JOIN projects p ON p.id = u.project_id
           WHERE p.developer_id = $1 AND UPPER(u.identifier) = $2 AND p.slug = $3""",
        developer_id, identifier, project_slug,
    )
    if not unit:
        return {"error": f"No encontré la unidad {identifier} en {project_slug}"}

    await pool.execute(
        "INSERT INTO unit_notes (unit_id, author_name, note) VALUES ($1, $2, $3)",
        unit["id"], author_name, note,
    )
    return {"confirmation": f"Nota guardada en {unit['identifier']} de {unit['project_name']}"}


async def _action_get_lead_detail(pool, params: dict, developer_id: str) -> dict:
    phone_suffix = params.get("phone_suffix", "")

    row = await pool.fetchrow(
        """SELECT l.*, p.name as project_name FROM leads l
           JOIN projects p ON p.id = l.project_id
           WHERE p.developer_id = $1 AND l.phone LIKE '%' || $2
           ORDER BY l.last_contact DESC NULLS LAST LIMIT 1""",
        developer_id, phone_suffix,
    )
    if not row:
        return {"error": f"No encontré un lead con teléfono ...{phone_suffix}"}

    return {"confirmation": f"Lead: {row['name'] or 'Sin nombre'} | Tel: {row['phone']} | Proyecto: {row['project_name']} | Score: {row['score'] or '?'} | Intent: {row['intent'] or '?'} | Budget: {row['budget_usd'] or '?'} | Ambientes: {row['bedrooms'] or '?'}"}


async def _action_update_project(pool, params: dict, developer_id: str) -> dict:
    project_slug = params.get("project_slug", "")
    updates = params.get("updates", {})

    if not project_slug:
        return {"error": "Falta el slug del proyecto"}
    if not updates:
        return {"error": "No se especificaron campos para actualizar"}

    ALLOWED_FIELDS = {
        "address", "neighborhood", "city", "description",
        "total_floors", "total_units", "payment_info",
        "delivery_status", "estimated_delivery", "amenities",
    }

    proj = await pool.fetchrow(
        "SELECT id, name FROM projects WHERE slug = $1 AND developer_id = $2",
        project_slug, developer_id,
    )
    if not proj:
        return {"error": f"No encontré el proyecto '{project_slug}'"}

    set_clauses = []
    values = []
    idx = 1

    for field, value in updates.items():
        if field not in ALLOWED_FIELDS:
            continue

        if field == "amenities" and isinstance(value, list):
            set_clauses.append(f"amenities = ${idx}::text[]")
            values.append(value)
        elif field in ("total_floors", "total_units"):
            set_clauses.append(f"{field} = ${idx}")
            values.append(int(value) if value else None)
        elif field == "estimated_delivery":
            from datetime import date as date_cls
            if isinstance(value, str) and value:
                try:
                    values.append(date_cls.fromisoformat(value))
                except ValueError:
                    continue
            else:
                values.append(None)
            set_clauses.append(f"{field} = ${idx}")
        else:
            set_clauses.append(f"{field} = ${idx}")
            values.append(value)
        idx += 1

    if not set_clauses:
        return {"error": "Ningún campo válido para actualizar"}

    values.append(str(proj["id"]))
    query = f"UPDATE projects SET {', '.join(set_clauses)} WHERE id = ${idx}"
    await pool.execute(query, *values)

    updated_fields = [f for f in updates.keys() if f in ALLOWED_FIELDS]
    return {"confirmation": f"Proyecto '{proj['name']}' actualizado: {', '.join(updated_fields)}"}
