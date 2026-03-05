"""Alerts service: evaluates conditions and creates project_alerts rows."""
import json
import logging
from typing import Optional

from app.database import get_pool

logger = logging.getLogger(__name__)


async def evaluate_alerts(project_id: Optional[str] = None) -> int:
    """Evaluate all alert conditions and insert new alerts. Returns count of alerts created."""
    pool = await get_pool()
    created = 0

    async def _insert_if_new(pid: str, tipo: str, titulo: str, descripcion: str, severidad: str, metadata: dict):
        nonlocal created
        resource_id = metadata.get("resource_id", "")
        existing = await pool.fetchval(
            """SELECT id FROM project_alerts
               WHERE project_id = $1
                 AND tipo = $2
                 AND metadata->>'resource_id' = $3
                 AND created_at > NOW() - INTERVAL '24 hours'""",
            pid, tipo, resource_id,
        )
        if existing:
            return
        await pool.execute(
            """INSERT INTO project_alerts (project_id, tipo, titulo, descripcion, severidad, metadata)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            pid, tipo, titulo, descripcion, severidad, json.dumps(metadata),
        )
        created += 1

    # 1. LEAD_SIN_ACTIVIDAD: hot/warm leads with no contact in 48h
    lead_conditions = "score IN ('hot', 'warm') AND last_contact < NOW() - INTERVAL '48 hours'"
    if project_id:
        leads = await pool.fetch(
            f"SELECT id, name, project_id, score FROM leads WHERE project_id = $1 AND {lead_conditions}",
            project_id,
        )
    else:
        leads = await pool.fetch(
            f"SELECT id, name, project_id, score FROM leads WHERE {lead_conditions}"
        )
    for lead in leads:
        await _insert_if_new(
            pid=str(lead["project_id"]),
            tipo="LEAD_SIN_ACTIVIDAD",
            titulo=f"Lead {lead['name'] or lead['id']} sin actividad 48h",
            descripcion=f"Lead {lead['score']} sin contacto en más de 48 horas",
            severidad="warning",
            metadata={"resource_id": str(lead["id"]), "lead_name": lead["name"] or ""},
        )

    # 2. UNIDAD_RESERVADA_SIN_CONVERTIR: active reservations older than 30 days
    res_conditions = "status = 'active' AND created_at < NOW() - INTERVAL '30 days'"
    if project_id:
        reservations = await pool.fetch(
            f"SELECT id, project_id, buyer_name FROM reservations WHERE project_id = $1 AND {res_conditions}",
            project_id,
        )
    else:
        reservations = await pool.fetch(
            f"SELECT id, project_id, buyer_name FROM reservations WHERE {res_conditions}"
        )
    for res in reservations:
        await _insert_if_new(
            pid=str(res["project_id"]),
            tipo="UNIDAD_RESERVADA_SIN_CONVERTIR",
            titulo="Reserva activa sin convertir hace 30+ días",
            descripcion=f"Reserva de {res['buyer_name'] or 'comprador desconocido'} lleva más de 30 días sin convertirse",
            severidad="warning",
            metadata={"resource_id": str(res["id"])},
        )

    # 3. DESVIO_PRESUPUESTO: category spend > 110% of budget
    try:
        budget_conditions = "" if not project_id else f"AND b.project_id = '{project_id}'"
        desvios = await pool.fetch(
            f"""SELECT b.id, b.project_id, b.categoria, b.monto_usd,
                       COALESCE(SUM(e.monto_usd), 0) as ejecutado
                FROM project_budget b
                LEFT JOIN project_expenses e ON e.budget_id = b.id
                WHERE b.monto_usd > 0 {budget_conditions}
                GROUP BY b.id, b.project_id, b.categoria, b.monto_usd
                HAVING COALESCE(SUM(e.monto_usd), 0) > b.monto_usd * 1.1"""
        )
        for d in desvios:
            pct = round(float(d["ejecutado"]) / float(d["monto_usd"]) * 100 - 100, 1)
            await _insert_if_new(
                pid=str(d["project_id"]),
                tipo="DESVIO_PRESUPUESTO",
                titulo=f"Desvío presupuesto: {d['categoria']}",
                descripcion=f"Categoría {d['categoria']} superó el presupuesto en {pct}%",
                severidad="critical",
                metadata={"resource_id": str(d["id"]), "categoria": d["categoria"], "desvio_pct": pct},
            )
    except Exception as e:
        logger.debug("Desvio presupuesto check skipped (tables may not exist): %s", e)

    # 4. OBRA_ETAPA_ATRASADA: active stages < 30% complete but project > 30% of planned time
    try:
        etapa_conditions = "" if not project_id else f"AND e.project_id = '{project_id}'"
        atrasadas = await pool.fetch(
            f"""SELECT e.id, e.project_id, e.nombre, e.porcentaje_completado,
                       p.construction_start, p.estimated_delivery
                FROM obra_etapas e
                JOIN projects p ON p.id = e.project_id
                WHERE e.activa = TRUE
                  AND e.porcentaje_completado < 30
                  AND p.construction_start IS NOT NULL
                  AND p.estimated_delivery IS NOT NULL
                  AND (NOW()::date - p.construction_start) >
                      (p.estimated_delivery - p.construction_start) * 0.3
                {etapa_conditions}"""
        )
        for et in atrasadas:
            await _insert_if_new(
                pid=str(et["project_id"]),
                tipo="OBRA_ETAPA_ATRASADA",
                titulo=f"Etapa atrasada: {et['nombre']}",
                descripcion=f"Etapa '{et['nombre']}' tiene solo {et['porcentaje_completado']}% pero el proyecto ya superó el 30% del tiempo planificado",
                severidad="warning",
                metadata={"resource_id": str(et["id"]), "etapa_nombre": et["nombre"]},
            )
    except Exception as e:
        logger.debug("Etapa atrasada check skipped: %s", e)

    # 5. CUOTA_VENCIDA: installments overdue (fecha_vencimiento < today, estado = vencido)
    try:
        cuota_conditions = "" if not project_id else f"AND r.project_id = '{project_id}'"
        vencidas = await pool.fetch(
            f"""SELECT pi.id, pi.numero_cuota, pi.monto, pi.moneda, pi.fecha_vencimiento,
                       r.project_id, r.id AS reservation_id, r.buyer_name
                FROM payment_installments pi
                JOIN payment_plans pp ON pp.id = pi.plan_id
                JOIN reservations r ON r.id = pp.reservation_id
                WHERE pi.estado = 'vencido'
                  AND pi.fecha_vencimiento < CURRENT_DATE
                {cuota_conditions}"""
        )
        for cv in vencidas:
            await _insert_if_new(
                pid=str(cv["project_id"]),
                tipo="CUOTA_VENCIDA",
                titulo=f"Cuota vencida — {cv['buyer_name'] or 'Comprador'}",
                descripcion=f"Cuota #{cv['numero_cuota']} de {cv['buyer_name'] or 'comprador'} venció el {cv['fecha_vencimiento'].strftime('%d/%m/%Y')} ({cv['moneda']} {float(cv['monto']):,.0f})",
                severidad="critical",
                metadata={"resource_id": str(cv["id"]), "reservation_id": str(cv["reservation_id"]), "buyer_name": cv["buyer_name"] or ""},
            )
    except Exception as e:
        logger.debug("Cuota vencida check skipped: %s", e)

    # 6. CUOTA_PROXIMA: installments due within 3 days
    try:
        proxima_conditions = "" if not project_id else f"AND r.project_id = '{project_id}'"
        proximas = await pool.fetch(
            f"""SELECT pi.id, pi.numero_cuota, pi.monto, pi.moneda, pi.fecha_vencimiento,
                       r.project_id, r.id AS reservation_id, r.buyer_name
                FROM payment_installments pi
                JOIN payment_plans pp ON pp.id = pi.plan_id
                JOIN reservations r ON r.id = pp.reservation_id
                WHERE pi.estado IN ('pendiente', 'parcial')
                  AND pi.fecha_vencimiento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
                {proxima_conditions}"""
        )
        for cp in proximas:
            dias = (cp["fecha_vencimiento"] - __import__("datetime").date.today()).days
            label = "hoy" if dias == 0 else f"en {dias} día{'s' if dias > 1 else ''}"
            await _insert_if_new(
                pid=str(cp["project_id"]),
                tipo="CUOTA_PROXIMA",
                titulo=f"Cuota por vencer — {cp['buyer_name'] or 'Comprador'}",
                descripcion=f"Cuota #{cp['numero_cuota']} de {cp['buyer_name'] or 'comprador'} vence {label} ({cp['moneda']} {float(cp['monto']):,.0f})",
                severidad="warning",
                metadata={"resource_id": str(cp["id"]), "reservation_id": str(cp["reservation_id"]), "buyer_name": cp["buyer_name"] or ""},
            )
    except Exception as e:
        logger.debug("Cuota proxima check skipped: %s", e)

    # 7. INVERSOR_SIN_REPORTE: projects with investors but no report sent in 30 days
    try:
        investor_conditions = "" if not project_id else f"AND i.project_id = '{project_id}'"
        sin_reporte = await pool.fetch(
            f"""SELECT DISTINCT i.project_id
                FROM investors i
                WHERE NOT EXISTS (
                    SELECT 1 FROM investor_reports r
                    WHERE r.project_id = i.project_id
                      AND r.enviado_at > NOW() - INTERVAL '30 days'
                )
                {investor_conditions}"""
        )
        for sr in sin_reporte:
            pid_val = str(sr["project_id"])
            await _insert_if_new(
                pid=pid_val,
                tipo="INVERSOR_SIN_REPORTE",
                titulo="Inversores sin reporte en 30 días",
                descripcion="Este proyecto tiene inversores pero no se envió ningún reporte en los últimos 30 días",
                severidad="info",
                metadata={"resource_id": pid_val},
            )
    except Exception as e:
        logger.debug("Inversor sin reporte check skipped (tables may not exist): %s", e)

    logger.info("Alerts evaluated: %d new alerts created", created)
    return created
