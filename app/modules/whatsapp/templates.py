"""Structured message templates for common WhatsApp responses."""


def hot_lead_alert(lead_name: str, phone: str, project_name: str, score: str, summary: str) -> str:
    return (
        f"Nuevo lead hot en {project_name}\n\n"
        f"Nombre: {lead_name}\n"
        f"Tel: {phone}\n"
        f"Score: {score}\n"
        f"Resumen: {summary}"
    )


def handoff_request(lead_name: str, phone: str, project_name: str, score: str, message_count: int, context: str) -> str:
    return (
        f"{lead_name} ({phone}) pidio hablar con una persona.\n"
        f"Proyecto: {project_name}\n"
        f"Score: {score} | {message_count} mensajes\n"
        f"Contexto: {context}"
    )


def obra_update_confirmation(etapa: str, floor: int | None, porcentaje: int) -> str:
    floor_text = f" - Piso {floor}" if floor else ""
    return f"Registre: {etapa}{floor_text} - {porcentaje}% avance. Confirmo este update?"


def buyer_obra_notification(
    buyer_name: str,
    unit: str,
    etapa: str,
    porcentaje: int,
    nota: str,
    project_name: str = "",
    avance_general: int = 0,
) -> str:
    lines = [f"Hola {buyer_name} 👋"]
    if project_name:
        lines.append(f"Te contamos el último avance de {project_name}.\n")
    if etapa:
        lines.append(f"📍 Etapa actual: {etapa}")
    if avance_general:
        lines.append(f"📊 Avance general: {avance_general}%")
    if nota:
        lines.append(f"\n{nota}")
    lines.append("\nAnte cualquier consulta, respondé este mensaje.")
    return "\n".join(lines)
