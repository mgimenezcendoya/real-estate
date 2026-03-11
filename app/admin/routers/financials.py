# app/admin/routers/financials.py
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.auth import verify_token
from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()

OBRA_CATEGORIA = "Pagos de Obra"


class BudgetBody(BaseModel):
    categoria: str
    descripcion: Optional[str] = None
    monto_usd: Optional[float] = None
    etapa_id: Optional[str] = None
    monto_ars: Optional[float] = None


class ExpenseBody(BaseModel):
    proveedor: Optional[str] = None
    descripcion: str
    monto_usd: Optional[float] = None
    monto_ars: Optional[float] = None
    fecha: str   # YYYY-MM-DD
    comprobante_url: Optional[str] = None
    budget_id: Optional[str] = None


class FinancialsConfigBody(BaseModel):
    tipo_cambio_usd_ars: float


class BuyerBody(BaseModel):
    unit_id: str
    name: str
    phone: str
    lead_id: Optional[str] = None
    signed_at: Optional[str] = None


@router.get("/cash-flow/{project_id}")
async def get_cash_flow(
    project_id: str,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Monthly cash flow: ingresos (payment_records) vs egresos (expenses + obra_payments)."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()
    # Cobros reales de cuotas (convertidos a USD si es ARS usando tipo_cambio del proyecto)
    ingresos_rows = await pool.fetch(
        """SELECT
             to_char(pr.fecha_pago, 'YYYY-MM') AS mes,
             SUM(CASE WHEN pr.moneda='USD' THEN pr.monto_pagado
                      ELSE pr.monto_pagado / COALESCE(fc.tipo_cambio_usd_ars,1) END) AS total
           FROM payment_records pr
           JOIN payment_installments pi ON pi.id = pr.installment_id
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           LEFT JOIN project_financials_config fc ON fc.project_id = r.project_id
           WHERE r.project_id = $1 AND pr.deleted_at IS NULL
             AND ($2::text IS NULL OR to_char(pr.fecha_pago, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(pr.fecha_pago, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
    # Gastos (project_expenses)
    gastos_rows = await pool.fetch(
        """SELECT
             to_char(fecha, 'YYYY-MM') AS mes,
             SUM(COALESCE(monto_usd, monto_ars / COALESCE(fc.tipo_cambio_usd_ars,1), 0)) AS total
           FROM project_expenses pe
           LEFT JOIN project_financials_config fc ON fc.project_id = pe.project_id
           WHERE pe.project_id = $1 AND pe.deleted_at IS NULL
             AND ($2::text IS NULL OR to_char(fecha, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(fecha, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
    # Obra payments
    obra_rows = await pool.fetch(
        """SELECT
             to_char(op.fecha_pago, 'YYYY-MM') AS mes,
             SUM(COALESCE(op.monto_usd, op.monto_ars / COALESCE(fc.tipo_cambio_usd_ars,1), 0)) AS total
           FROM obra_payments op
           JOIN obra_etapas oe ON oe.id = op.etapa_id
           LEFT JOIN project_financials_config fc ON fc.project_id = oe.project_id
           WHERE oe.project_id = $1 AND op.fecha_pago IS NOT NULL
             AND ($2::text IS NULL OR to_char(op.fecha_pago, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(op.fecha_pago, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
    # Proyección: cuotas futuras pendientes/vencidas
    proyeccion_rows = await pool.fetch(
        """SELECT
             to_char(pi.fecha_vencimiento, 'YYYY-MM') AS mes,
             SUM(CASE WHEN pi.moneda='USD' THEN pi.monto
                      ELSE pi.monto / COALESCE(fc.tipo_cambio_usd_ars,1) END) AS total
           FROM payment_installments pi
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           LEFT JOIN project_financials_config fc ON fc.project_id = r.project_id
           WHERE r.project_id = $1
             AND pi.estado IN ('pendiente','vencido')
             AND pi.fecha_vencimiento >= CURRENT_DATE
             AND ($2::text IS NULL OR to_char(pi.fecha_vencimiento, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(pi.fecha_vencimiento, 'YYYY-MM') <= $3)
           GROUP BY mes
           ORDER BY mes""",
        project_id, desde, hasta,
    )
    # Merge into unified month buckets
    meses: dict = {}
    for r in ingresos_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["ingresos"] += float(r["total"] or 0)
    for r in gastos_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["egresos"] += float(r["total"] or 0)
    for r in obra_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["egresos"] += float(r["total"] or 0)
    for r in proyeccion_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["proyeccion"] += float(r["total"] or 0)
    # Sort and add saldo/acumulado
    result = sorted(meses.values(), key=lambda x: x["mes"])
    acumulado = 0.0
    for row in result:
        row["saldo"] = round(row["ingresos"] - row["egresos"], 2)
        acumulado += row["saldo"]
        row["acumulado"] = round(acumulado, 2)
        row["ingresos"] = round(row["ingresos"], 2)
        row["egresos"] = round(row["egresos"], 2)
        row["proyeccion"] = round(row["proyeccion"], 2)
    return result


@router.get("/cash-flow-consolidated")
async def get_cash_flow_consolidated(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Consolidated monthly cash flow across all projects for the user's organization."""
    pool = await get_pool()

    # Determine effective org (same pattern as list_projects)
    effective_org_id = None
    if credentials and credentials.scheme == "Bearer":
        payload = verify_token(credentials.credentials)
        if payload and payload.get("role") != "superadmin":
            effective_org_id = payload.get("organization_id")

    if effective_org_id:
        project_rows = await pool.fetch(
            "SELECT id FROM projects WHERE organization_id = $1 AND deleted_at IS NULL", effective_org_id
        )
    else:
        project_rows = await pool.fetch("SELECT id FROM projects WHERE deleted_at IS NULL")

    project_ids = [str(r["id"]) for r in project_rows]
    if not project_ids:
        return []

    ingresos_rows = await pool.fetch(
        """SELECT
             to_char(pr.fecha_pago, 'YYYY-MM') AS mes,
             SUM(CASE WHEN pr.moneda='USD' THEN pr.monto_pagado
                      ELSE pr.monto_pagado / COALESCE(fc.tipo_cambio_usd_ars,1) END) AS total
           FROM payment_records pr
           JOIN payment_installments pi ON pi.id = pr.installment_id
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           LEFT JOIN project_financials_config fc ON fc.project_id = r.project_id
           WHERE r.project_id = ANY($1::uuid[]) AND pr.deleted_at IS NULL
             AND ($2::text IS NULL OR to_char(pr.fecha_pago, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(pr.fecha_pago, 'YYYY-MM') <= $3)
           GROUP BY mes ORDER BY mes""",
        project_ids, desde, hasta,
    )
    gastos_rows = await pool.fetch(
        """SELECT
             to_char(fecha, 'YYYY-MM') AS mes,
             SUM(COALESCE(monto_usd, monto_ars / COALESCE(fc.tipo_cambio_usd_ars,1), 0)) AS total
           FROM project_expenses pe
           LEFT JOIN project_financials_config fc ON fc.project_id = pe.project_id
           WHERE pe.project_id = ANY($1::uuid[]) AND pe.deleted_at IS NULL
             AND ($2::text IS NULL OR to_char(fecha, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(fecha, 'YYYY-MM') <= $3)
           GROUP BY mes ORDER BY mes""",
        project_ids, desde, hasta,
    )
    obra_rows = await pool.fetch(
        """SELECT
             to_char(op.fecha_pago, 'YYYY-MM') AS mes,
             SUM(COALESCE(op.monto_usd, op.monto_ars / COALESCE(fc.tipo_cambio_usd_ars,1), 0)) AS total
           FROM obra_payments op
           JOIN obra_etapas oe ON oe.id = op.etapa_id
           LEFT JOIN project_financials_config fc ON fc.project_id = oe.project_id
           WHERE oe.project_id = ANY($1::uuid[]) AND op.fecha_pago IS NOT NULL
             AND ($2::text IS NULL OR to_char(op.fecha_pago, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(op.fecha_pago, 'YYYY-MM') <= $3)
           GROUP BY mes ORDER BY mes""",
        project_ids, desde, hasta,
    )
    proyeccion_rows = await pool.fetch(
        """SELECT
             to_char(pi.fecha_vencimiento, 'YYYY-MM') AS mes,
             SUM(CASE WHEN pi.moneda='USD' THEN pi.monto
                      ELSE pi.monto / COALESCE(fc.tipo_cambio_usd_ars,1) END) AS total
           FROM payment_installments pi
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           LEFT JOIN project_financials_config fc ON fc.project_id = r.project_id
           WHERE r.project_id = ANY($1::uuid[])
             AND pi.estado IN ('pendiente','vencido')
             AND pi.fecha_vencimiento >= CURRENT_DATE
             AND ($2::text IS NULL OR to_char(pi.fecha_vencimiento, 'YYYY-MM') >= $2)
             AND ($3::text IS NULL OR to_char(pi.fecha_vencimiento, 'YYYY-MM') <= $3)
           GROUP BY mes ORDER BY mes""",
        project_ids, desde, hasta,
    )

    meses: dict = {}
    for r in ingresos_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["ingresos"] += float(r["total"] or 0)
    for r in gastos_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["egresos"] += float(r["total"] or 0)
    for r in obra_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["egresos"] += float(r["total"] or 0)
    for r in proyeccion_rows:
        mes = r["mes"]
        meses.setdefault(mes, {"mes": mes, "ingresos": 0.0, "egresos": 0.0, "proyeccion": 0.0})
        meses[mes]["proyeccion"] += float(r["total"] or 0)

    result = sorted(meses.values(), key=lambda x: x["mes"])
    acumulado = 0.0
    for row in result:
        row["saldo"] = round(row["ingresos"] - row["egresos"], 2)
        acumulado += row["saldo"]
        row["acumulado"] = round(acumulado, 2)
        row["ingresos"] = round(row["ingresos"], 2)
        row["egresos"] = round(row["egresos"], 2)
        row["proyeccion"] = round(row["proyeccion"], 2)
    return result


@router.get("/cobranza")
async def get_cobranza(
    proyecto: Optional[str] = None,
    estado: Optional[str] = None,  # "vencida" | "proxima" | "todas"
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Cross-project pending/overdue installments for collections follow-up."""
    pool = await get_pool()

    # Reject unauthenticated requests
    if not credentials or credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="No autenticado")

    # Org scoping (same pattern as list_projects)
    effective_org_id = None
    payload = verify_token(credentials.credentials)
    if payload and payload.get("role") != "superadmin":
        effective_org_id = payload.get("organization_id")

    if effective_org_id:
        project_rows = await pool.fetch(
            "SELECT id FROM projects WHERE organization_id = $1 AND deleted_at IS NULL", effective_org_id
        )
    else:
        project_rows = await pool.fetch("SELECT id FROM projects WHERE deleted_at IS NULL")

    project_ids = [str(r["id"]) for r in project_rows]
    if not project_ids:
        return []

    # Optional single-project filter — return empty if proyecto is outside caller's scope
    if proyecto:
        if proyecto in project_ids:
            project_ids = [proyecto]
        else:
            return []

    rows = await pool.fetch(
        """SELECT
             pi.id AS installment_id,
             COALESCE(l.name, l.phone) AS buyer_name,
             l.phone AS buyer_phone,
             p.name AS project_name,
             p.id::text AS project_id,
             r.id::text AS reservation_id,
             pi.numero_cuota,
             pi.monto,
             pi.moneda,
             CASE WHEN pi.moneda = 'USD' THEN pi.monto
                  ELSE pi.monto / COALESCE(fc.tipo_cambio_usd_ars, 1) END AS monto_usd,
             pi.fecha_vencimiento,
             pi.estado,
             (CURRENT_DATE - pi.fecha_vencimiento::date)::int AS dias
           FROM payment_installments pi
           JOIN payment_plans pp ON pp.id = pi.plan_id
           JOIN reservations r ON r.id = pp.reservation_id
           JOIN leads l ON l.id = r.lead_id
           JOIN projects p ON p.id = r.project_id
           LEFT JOIN project_financials_config fc ON fc.project_id = p.id
           WHERE pi.estado IN ('pendiente', 'vencido')
             AND p.id = ANY($1::uuid[])
           ORDER BY pi.fecha_vencimiento ASC""",
        project_ids,
    )

    result = []
    for r in rows:
        dias = int(r["dias"])
        # Apply estado filter
        if estado == "vencida" and dias < 0:
            continue
        if estado == "proxima" and dias >= 0:
            continue
        result.append({
            "installment_id": str(r["installment_id"]),
            "buyer_name": r["buyer_name"],
            "buyer_phone": r["buyer_phone"],
            "project_name": r["project_name"],
            "project_id": r["project_id"],
            "reservation_id": r["reservation_id"],
            "numero_cuota": r["numero_cuota"],
            "monto": float(r["monto"]),
            "moneda": r["moneda"],
            "monto_usd": round(float(r["monto_usd"] or 0), 2),
            "fecha_vencimiento": r["fecha_vencimiento"].isoformat(),
            "estado": r["estado"],
            "dias": dias,
        })
    return result


@router.get("/buyers/{project_id}")
async def list_buyers(
    project_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """List active buyers for a project with their unit details."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT b.id, b.lead_id, b.unit_id, b.phone, b.name, b.signed_at, b.status,
                  u.identifier as unit_identifier, u.floor as unit_floor,
                  u.bedrooms, u.area_m2, u.price_usd
           FROM buyers b
           JOIN units u ON b.unit_id = u.id
           WHERE b.project_id = $1 AND b.status = 'active'
           ORDER BY b.signed_at DESC NULLS LAST""",
        project_id,
    )
    return [dict(r) for r in rows]


@router.post("/buyers/{project_id}")
async def create_buyer(project_id: str, body: BuyerBody):
    """Register a buyer for a sold unit."""
    pool = await get_pool()

    unit = await pool.fetchrow(
        "SELECT id, identifier FROM units WHERE id = $1 AND project_id = $2",
        body.unit_id, project_id,
    )
    if not unit:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")

    existing = await pool.fetchval(
        "SELECT id FROM buyers WHERE unit_id = $1 AND status = 'active'", body.unit_id
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Ya existe un comprador activo para la unidad {unit['identifier']}")

    signed_at = datetime.now(timezone.utc)
    if body.signed_at:
        try:
            signed_at = datetime.fromisoformat(body.signed_at)
        except ValueError:
            pass

    row = await pool.fetchrow(
        """INSERT INTO buyers (project_id, unit_id, lead_id, name, phone, signed_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, phone""",
        project_id, body.unit_id, body.lead_id or None,
        body.name, body.phone, signed_at,
    )

    logger.info("Buyer registered: %s for unit %s (project %s)", body.name, unit["identifier"], project_id)
    return dict(row)


@router.get("/financials/{project_id}/summary")
async def get_financials_summary(
    project_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()

    config_row = await pool.fetchrow(
        "SELECT tipo_cambio_usd_ars FROM project_financials_config WHERE project_id = $1",
        project_id,
    )
    tipo_cambio = float(config_row["tipo_cambio_usd_ars"]) if config_row else 1000.0

    budget_rows = await pool.fetch(
        "SELECT id, categoria, monto_usd FROM project_budget WHERE project_id = $1",
        project_id,
    )
    presupuesto_total = sum(float(r["monto_usd"] or 0) for r in budget_rows)

    expenses_rows = await pool.fetch(
        """SELECT e.monto_usd, b.categoria
           FROM project_expenses e
           LEFT JOIN project_budget b ON b.id = e.budget_id
           WHERE e.project_id = $1 AND e.deleted_at IS NULL""",
        project_id,
    )

    obra_payments_rows = await pool.fetch(
        """SELECT COALESCE(op.monto_usd, op.monto_ars / NULLIF($2, 0), 0) AS monto_usd,
                  pb.categoria
           FROM obra_payments op
           LEFT JOIN project_budget pb ON pb.etapa_id = op.etapa_id AND pb.project_id = $1
           WHERE op.project_id = $1""",
        project_id, tipo_cambio,
    )

    ejecutado_expenses = sum(float(r["monto_usd"] or 0) for r in expenses_rows)
    ejecutado_obra = sum(float(r["monto_usd"] or 0) for r in obra_payments_rows)
    ejecutado_total = ejecutado_expenses + ejecutado_obra

    revenue_row = await pool.fetchrow(
        "SELECT COALESCE(SUM(price_usd), 0) as revenue FROM units WHERE project_id = $1",
        project_id,
    )
    revenue = float(revenue_row["revenue"]) if revenue_row else 0.0

    desvio = ejecutado_total - presupuesto_total
    desvio_pct = (desvio / presupuesto_total * 100) if presupuesto_total else 0.0
    margen_pct = ((revenue - presupuesto_total) / revenue * 100) if revenue else 0.0

    # By category
    cat_exec: dict = {}
    for r in expenses_rows:
        cat = r["categoria"] or "Sin categoría"
        cat_exec[cat] = cat_exec.get(cat, 0.0) + float(r["monto_usd"] or 0)
    for r in obra_payments_rows:
        cat = r["categoria"] or "Pagos de Obra"
        cat_exec[cat] = cat_exec.get(cat, 0.0) + float(r["monto_usd"] or 0)

    por_categoria = []
    for b in budget_rows:
        cat = b["categoria"]
        bud = float(b["monto_usd"] or 0)
        exe = cat_exec.get(cat, 0.0)
        dev_pct = ((exe - bud) / bud * 100) if bud else 0.0
        por_categoria.append({
            "categoria": cat,
            "presupuesto_usd": bud,
            "ejecutado_usd": exe,
            "desvio_pct": round(dev_pct, 1),
        })

    return {
        "presupuesto_total_usd": presupuesto_total,
        "ejecutado_usd": ejecutado_total,
        "desvio_usd": desvio,
        "desvio_pct": round(desvio_pct, 1),
        "revenue_esperado_usd": revenue,
        "margen_esperado_pct": round(margen_pct, 1),
        "tipo_cambio": tipo_cambio,
        "por_categoria": por_categoria,
    }


@router.get("/financials/{project_id}/expenses")
async def list_expenses(
    project_id: str,
    categoria: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
):
    pool = await get_pool()
    fecha_desde_date = datetime.strptime(fecha_desde, "%Y-%m-%d").date() if fecha_desde else None
    fecha_hasta_date = datetime.strptime(fecha_hasta, "%Y-%m-%d").date() if fecha_hasta else None

    # --- project_expenses ---
    conditions = ["e.project_id = $1", "e.deleted_at IS NULL"]
    params: list = [project_id]
    if categoria and categoria != OBRA_CATEGORIA:
        params.append(categoria)
        conditions.append(f"b.categoria = ${len(params)}")
    elif categoria == OBRA_CATEGORIA:
        conditions.append("1=0")  # exclude regular expenses when filtering by obra
    if fecha_desde_date:
        params.append(fecha_desde_date)
        conditions.append(f"e.fecha >= ${len(params)}")
    if fecha_hasta_date:
        params.append(fecha_hasta_date)
        conditions.append(f"e.fecha <= ${len(params)}")

    rows = await pool.fetch(
        f"""SELECT e.id::text, e.budget_id, e.proveedor, e.descripcion,
                   e.monto_usd, e.monto_ars, e.fecha, e.comprobante_url, e.created_at,
                   b.categoria, 'expense' AS source, NULL::text AS etapa_nombre
            FROM project_expenses e
            LEFT JOIN project_budget b ON b.id = e.budget_id
            WHERE {" AND ".join(conditions)}
            ORDER BY e.fecha DESC, e.created_at DESC""",
        *params,
    )

    # --- obra_payments (only if not filtering by a different category) ---
    obra_rows = []
    if not categoria or categoria == OBRA_CATEGORIA:
        obra_conds = ["op.project_id = $1"]
        obra_params: list = [project_id]
        if fecha_desde_date:
            obra_params.append(fecha_desde_date)
            obra_conds.append(f"COALESCE(op.fecha_pago, op.fecha_vencimiento) >= ${len(obra_params)}")
        if fecha_hasta_date:
            obra_params.append(fecha_hasta_date)
            obra_conds.append(f"COALESCE(op.fecha_pago, op.fecha_vencimiento) <= ${len(obra_params)}")

        obra_rows = await pool.fetch(
            f"""SELECT op.id::text, NULL::uuid AS budget_id, s.nombre AS proveedor, op.descripcion,
                       op.monto_usd, op.monto_ars,
                       COALESCE(op.fecha_pago, op.fecha_vencimiento) AS fecha,
                       op.comprobante_url, op.created_at,
                       COALESCE(pb.categoria, '{OBRA_CATEGORIA}') AS categoria, 'obra' AS source,
                       oe.nombre AS etapa_nombre
                FROM obra_payments op
                LEFT JOIN suppliers s ON s.id = op.supplier_id
                LEFT JOIN obra_etapas oe ON oe.id = op.etapa_id
                LEFT JOIN project_budget pb ON pb.etapa_id = op.etapa_id AND pb.project_id = op.project_id
                WHERE {" AND ".join(obra_conds)}""",
            *obra_params,
        )

    result = []
    for r in list(rows) + list(obra_rows):
        d = dict(r)
        if d.get("monto_usd") is not None:
            d["monto_usd"] = float(d["monto_usd"])
        if d.get("monto_ars") is not None:
            d["monto_ars"] = float(d["monto_ars"])
        result.append(d)

    result.sort(key=lambda x: (str(x.get("fecha") or ""), str(x.get("created_at") or "")), reverse=True)
    return result


@router.post("/financials/{project_id}/expenses")
async def create_expense(
    project_id: str,
    body: ExpenseBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    fecha = datetime.strptime(body.fecha, "%Y-%m-%d").date()
    row = await pool.fetchrow(
        """INSERT INTO project_expenses
               (project_id, budget_id, proveedor, descripcion, monto_usd, monto_ars, fecha, comprobante_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, budget_id, proveedor, descripcion, monto_usd, monto_ars, fecha, comprobante_url, created_at""",
        project_id, body.budget_id or None, body.proveedor, body.descripcion,
        body.monto_usd, body.monto_ars, fecha, body.comprobante_url,
    )
    d = dict(row)
    if d.get("monto_usd") is not None:
        d["monto_usd"] = float(d["monto_usd"])
    if d.get("monto_ars") is not None:
        d["monto_ars"] = float(d["monto_ars"])
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="INSERT",
                 table_name="project_expenses", record_id=str(row["id"]), project_id=project_id,
                 details={"descripcion": body.descripcion, "proveedor": body.proveedor,
                          "monto_usd": body.monto_usd, "monto_ars": body.monto_ars})
    return d


@router.patch("/financials/{project_id}/expenses/{expense_id}")
async def patch_expense(
    project_id: str,
    expense_id: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    body = await request.json()
    ALLOWED = {"proveedor", "descripcion", "monto_usd", "monto_ars", "fecha", "comprobante_url", "budget_id"}
    fields = {k: v for k, v in body.items() if k in ALLOWED}
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields")
    if "fecha" in fields:
        fields["fecha"] = datetime.strptime(fields["fecha"], "%Y-%m-%d").date()

    set_clauses = []
    params: list = [expense_id, project_id]
    for i, (k, v) in enumerate(fields.items(), start=3):
        set_clauses.append(f"{k} = ${i}")
        params.append(v)

    row = await pool.fetchrow(
        f"UPDATE project_expenses SET {', '.join(set_clauses)} WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL RETURNING id",
        *params,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="UPDATE",
                 table_name="project_expenses", record_id=expense_id, project_id=project_id,
                 details={k: str(v) for k, v in fields.items()})
    return {"updated": True, "id": str(row["id"])}


@router.delete("/financials/{project_id}/expenses/{expense_id}")
async def delete_expense(
    project_id: str,
    expense_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    result = await pool.execute(
        "UPDATE project_expenses SET deleted_at = NOW() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL",
        expense_id, project_id,
    )
    deleted = result.split()[-1] != "0"
    if deleted:
        await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="DELETE",
                     table_name="project_expenses", record_id=expense_id, project_id=project_id)
    return {"deleted": deleted}


@router.get("/financials/{project_id}/budget")
async def get_budget(project_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT pb.id, pb.categoria, pb.descripcion, pb.monto_usd, pb.monto_ars, pb.etapa_id,
                  oe.nombre as etapa_nombre, pb.created_at
           FROM project_budget pb
           LEFT JOIN obra_etapas oe ON oe.id = pb.etapa_id
           WHERE pb.project_id = $1 ORDER BY pb.categoria""",
        project_id,
    )
    result = []
    for r in rows:
        d = dict(r)
        if d.get("monto_usd") is not None:
            d["monto_usd"] = float(d["monto_usd"])
        if d.get("monto_ars") is not None:
            d["monto_ars"] = float(d["monto_ars"])
        result.append(d)
    return result


@router.post("/financials/{project_id}/budget")
async def upsert_budget(project_id: str, body: BudgetBody):
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO project_budget (project_id, categoria, descripcion, monto_usd, monto_ars, etapa_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING
           RETURNING id, categoria, monto_usd, etapa_id""",
        project_id, body.categoria, body.descripcion, body.monto_usd, body.monto_ars,
        body.etapa_id or None,
    )
    if not row:
        row = await pool.fetchrow(
            """UPDATE project_budget SET descripcion = $3, monto_usd = $4, monto_ars = $5, etapa_id = $6
               WHERE project_id = $1 AND categoria = $2
               RETURNING id, categoria, monto_usd, etapa_id""",
            project_id, body.categoria, body.descripcion, body.monto_usd, body.monto_ars,
            body.etapa_id or None,
        )
    d = dict(row)
    if d.get("monto_usd") is not None:
        d["monto_usd"] = float(d["monto_usd"])
    return d


@router.patch("/financials/{project_id}/budget/{budget_id}")
async def patch_budget(project_id: str, budget_id: str, body: BudgetBody, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    pool = await get_pool()
    row = await pool.fetchrow(
        """UPDATE project_budget
           SET categoria = $3, descripcion = $4, monto_usd = $5, monto_ars = $6, etapa_id = $7
           WHERE id = $1 AND project_id = $2
           RETURNING id, categoria, monto_usd, etapa_id""",
        budget_id, project_id, body.categoria, body.descripcion,
        body.monto_usd, body.monto_ars, body.etapa_id or None,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Budget item not found")
    d = dict(row)
    if d.get("monto_usd") is not None:
        d["monto_usd"] = float(d["monto_usd"])
    return d


@router.delete("/financials/{project_id}/budget/{budget_id}", status_code=204)
async def delete_budget(project_id: str, budget_id: str, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    pool = await get_pool()
    await pool.execute(
        "DELETE FROM project_budget WHERE id = $1 AND project_id = $2",
        budget_id, project_id,
    )


@router.patch("/financials/{project_id}/config")
async def patch_financials_config(project_id: str, body: FinancialsConfigBody):
    pool = await get_pool()
    await pool.execute(
        """INSERT INTO project_financials_config (project_id, tipo_cambio_usd_ars, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (project_id) DO UPDATE SET tipo_cambio_usd_ars = $2, updated_at = NOW()""",
        project_id, body.tipo_cambio_usd_ars,
    )
    return {"tipo_cambio": body.tipo_cambio_usd_ars}
