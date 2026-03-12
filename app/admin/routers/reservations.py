# app/admin/routers/reservations.py
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel

from app.admin.auth import verify_token
from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


class ReservationBody(BaseModel):
    unit_id: str
    lead_id: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_phone: str
    buyer_email: Optional[str] = None
    amount_usd: Optional[float] = None
    payment_method: Optional[str] = None   # efectivo|transferencia|cheque|financiacion
    notes: Optional[str] = None
    signed_at: Optional[str] = None        # YYYY-MM-DD


class ReservationPatchBody(BaseModel):
    status: str   # cancelled | converted


class InstallmentBody(BaseModel):
    numero_cuota: int
    concepto: str = "cuota"
    monto: float
    moneda: str = "USD"
    fecha_vencimiento: str  # ISO date
    notas: Optional[str] = None


class PaymentPlanBody(BaseModel):
    descripcion: Optional[str] = None
    moneda_base: str = "USD"
    monto_total: float
    tipo_ajuste: str = "ninguno"
    porcentaje_ajuste: Optional[float] = None
    installments: list[InstallmentBody]


class PaymentRecordBody(BaseModel):
    installment_id: str
    fecha_pago: str  # ISO date
    monto_pagado: float
    moneda: str = "USD"
    metodo_pago: str = "transferencia"
    referencia: Optional[str] = None
    notas: Optional[str] = None


class UpdatePaymentRecordBody(BaseModel):
    fecha_pago: Optional[str] = None
    monto_pagado: Optional[float] = None
    moneda: Optional[str] = None
    metodo_pago: Optional[str] = None
    referencia: Optional[str] = None
    notas: Optional[str] = None


async def _auto_create_seña(
    conn,
    reservation_id: str,
    amount_usd: float,
    payment_method: Optional[str],
    signed_at,  # date or None
) -> None:
    """Atomically creates plan + señal installment + payment_record.
    Must be called inside an existing asyncpg transaction.
    No-op if amount_usd is falsy or a plan already exists.
    """
    if not amount_usd:
        return

    # Idempotency: skip if plan already exists
    existing = await conn.fetchval(
        "SELECT id FROM payment_plans WHERE reservation_id = $1",
        reservation_id,
    )
    if existing:
        return

    from datetime import date as _date
    fecha = signed_at if signed_at else _date.today()
    metodo = payment_method or "transferencia"

    # 1. Create payment plan
    plan = await conn.fetchrow(
        """INSERT INTO payment_plans
           (reservation_id, descripcion, moneda_base, monto_total, tipo_ajuste)
           VALUES ($1, 'Seña', 'USD', $2, 'ninguno')
           RETURNING id""",
        reservation_id, amount_usd,
    )
    plan_id = str(plan["id"])

    # 2. Create installment #0 — Señal (already paid)
    inst = await conn.fetchrow(
        """INSERT INTO payment_installments
           (plan_id, numero_cuota, concepto, monto, moneda, fecha_vencimiento, estado)
           VALUES ($1, 0, 'anticipo', $2, 'USD', $3, 'pagado')
           RETURNING id""",
        plan_id, amount_usd, fecha,
    )
    installment_id = str(inst["id"])

    # 3. Create payment_record for the señal
    await conn.execute(
        """INSERT INTO payment_records
           (installment_id, fecha_pago, monto_pagado, moneda, metodo_pago)
           VALUES ($1, $2, $3, 'USD', $4)""",
        installment_id, fecha, amount_usd, metodo,
    )


@router.post("/reservations/{project_id}/direct-sale")
async def create_direct_sale(project_id: str, body: ReservationBody):
    """Create a reservation already converted (direct sale). Atomic: unit → sold + reservation → converted + buyer created."""
    pool = await get_pool()

    unit = await pool.fetchrow(
        "SELECT id, identifier, status FROM units WHERE id = $1 AND project_id = $2",
        body.unit_id, project_id,
    )
    if not unit:
        raise HTTPException(status_code=404, detail="Unidad no encontrada en este proyecto")
    if unit["status"] == "sold":
        raise HTTPException(status_code=409, detail="La unidad ya está vendida")

    existing_active = await pool.fetchval(
        "SELECT id FROM reservations WHERE unit_id = $1 AND status = 'active'",
        body.unit_id,
    )
    if existing_active:
        raise HTTPException(status_code=409, detail=f"La unidad {unit['identifier']} ya tiene una reserva activa. Cancelala o convertila antes de registrar una venta directa.")

    signed = datetime.strptime(body.signed_at, "%Y-%m-%d").date() if body.signed_at else None

    async with pool.acquire() as conn:
        async with conn.transaction():
            # 1. Mark unit as sold
            await conn.execute("UPDATE units SET status = 'sold' WHERE id = $1", str(unit["id"]))

            # 2. Create reservation already converted
            res = await conn.fetchrow(
                """INSERT INTO reservations
                   (project_id, unit_id, lead_id, buyer_name, buyer_phone, buyer_email,
                    amount_usd, payment_method, notes, signed_at, status)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'converted')
                   RETURNING id""",
                project_id, str(unit["id"]), body.lead_id,
                body.buyer_name, body.buyer_phone, body.buyer_email,
                body.amount_usd, body.payment_method, body.notes, signed,
            )
            reservation_id = str(res["id"])

            # Auto-create señal payment record if amount provided
            await _auto_create_seña(
                conn,
                reservation_id,
                body.amount_usd,
                body.payment_method,
                signed,
            )

            # 3. Create buyer record
            await conn.execute(
                """INSERT INTO buyers (project_id, unit_id, lead_id, name, phone, signed_at)
                   VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING""",
                project_id, str(unit["id"]), body.lead_id,
                body.buyer_name or "", body.buyer_phone or "", signed,
            )

    return {"reservation_id": reservation_id, "status": "converted"}


@router.post("/reservations/{project_id}")
async def create_reservation(
    project_id: str,
    body: ReservationBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Create a reservation for a unit. Also marks the unit as 'reserved' if it was 'available'."""
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)

    unit = await pool.fetchrow(
        "SELECT id, identifier, status FROM units WHERE id = $1 AND project_id = $2",
        body.unit_id, project_id,
    )
    if not unit:
        raise HTTPException(status_code=404, detail="Unidad no encontrada en este proyecto")

    if unit["status"] == "sold":
        raise HTTPException(status_code=409, detail=f"La unidad {unit['identifier']} ya está vendida")

    existing = await pool.fetchval(
        "SELECT id FROM reservations WHERE unit_id = $1 AND status = 'active'",
        body.unit_id,
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"La unidad {unit['identifier']} ya tiene una reserva activa")

    async with pool.acquire() as conn:
        async with conn.transaction():
            if unit["status"] == "available":
                await conn.execute(
                    "UPDATE units SET status = 'reserved' WHERE id = $1",
                    body.unit_id,
                )

            signed_at_val = (
                datetime.strptime(body.signed_at, "%Y-%m-%d").date()
                if body.signed_at else None
            )
            row = await conn.fetchrow(
                """
                INSERT INTO reservations
                    (project_id, unit_id, lead_id, buyer_name, buyer_phone, buyer_email,
                     amount_usd, payment_method, notes, signed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, project_id, unit_id, lead_id, buyer_name, buyer_phone,
                          buyer_email, amount_usd, payment_method, notes, signed_at,
                          status, created_at
                """,
                project_id, body.unit_id, body.lead_id or None,
                body.buyer_name, body.buyer_phone, body.buyer_email,
                body.amount_usd, body.payment_method, body.notes,
                signed_at_val,
            )

            # Auto-create señal payment record if amount provided
            await _auto_create_seña(
                conn,
                str(row["id"]),
                body.amount_usd,
                body.payment_method,
                signed_at_val,
            )

    u = await pool.fetchrow(
        "SELECT identifier, floor, bedrooms, area_m2, price_usd FROM units WHERE id = $1",
        body.unit_id,
    )

    result = dict(row)
    result["unit_identifier"] = u["identifier"]
    result["unit_floor"] = u["floor"]
    result["unit_bedrooms"] = u["bedrooms"]
    result["unit_area_m2"] = float(u["area_m2"]) if u["area_m2"] is not None else None
    result["unit_price_usd"] = float(u["price_usd"]) if u["price_usd"] is not None else None
    if result.get("amount_usd") is not None:
        result["amount_usd"] = float(result["amount_usd"])

    logger.info("Reservation created for unit %s (project %s)", u["identifier"], project_id)
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="INSERT",
                 table_name="reservations", record_id=str(row["id"]), project_id=project_id,
                 details={"buyer_name": body.buyer_name, "unit_id": body.unit_id,
                          "amount_usd": body.amount_usd})
    return result


@router.get("/reservations/{project_id}")
async def list_reservations(
    project_id: str,
    status: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """List reservations for a project, optionally filtered by status."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    verify_token(credentials.credentials)
    pool = await get_pool()

    conditions = ["r.project_id = $1"]
    params = [project_id]
    if status:
        conditions.append(f"r.status = ${len(params) + 1}")
        params.append(status)

    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"""
        SELECT r.id, r.project_id, r.unit_id, r.lead_id, r.buyer_name, r.buyer_phone,
               r.buyer_email, r.amount_usd, r.payment_method, r.notes, r.signed_at,
               r.status, r.created_at,
               u.identifier as unit_identifier, u.floor as unit_floor,
               u.bedrooms as unit_bedrooms, u.area_m2 as unit_area_m2, u.price_usd as unit_price_usd,
               p.name as project_name
        FROM reservations r
        JOIN units u ON u.id = r.unit_id
        JOIN projects p ON p.id = r.project_id
        WHERE {where}
        ORDER BY r.created_at DESC
        """,
        *params,
    )

    result = []
    for r in rows:
        d = dict(r)
        if d.get("amount_usd") is not None:
            d["amount_usd"] = float(d["amount_usd"])
        if d.get("unit_area_m2") is not None:
            d["unit_area_m2"] = float(d["unit_area_m2"])
        if d.get("unit_price_usd") is not None:
            d["unit_price_usd"] = float(d["unit_price_usd"])
        result.append(d)
    return result


@router.get("/reservation/{reservation_id}")
async def get_reservation(reservation_id: str):
    """Get a single reservation with unit and project details."""
    pool = await get_pool()

    row = await pool.fetchrow(
        """
        SELECT r.id, r.project_id, r.unit_id, r.lead_id, r.buyer_name, r.buyer_phone,
               r.buyer_email, r.amount_usd, r.payment_method, r.notes, r.signed_at,
               r.status, r.created_at,
               u.identifier as unit_identifier, u.floor as unit_floor,
               u.bedrooms as unit_bedrooms, u.area_m2 as unit_area_m2, u.price_usd as unit_price_usd,
               p.name as project_name, p.address as project_address
        FROM reservations r
        JOIN units u ON u.id = r.unit_id
        JOIN projects p ON p.id = r.project_id
        WHERE r.id = $1
        """,
        reservation_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    d = dict(row)
    if d.get("amount_usd") is not None:
        d["amount_usd"] = float(d["amount_usd"])
    if d.get("unit_area_m2") is not None:
        d["unit_area_m2"] = float(d["unit_area_m2"])
    if d.get("unit_price_usd") is not None:
        d["unit_price_usd"] = float(d["unit_price_usd"])
    return d


@router.patch("/reservations/{reservation_id}")
async def patch_reservation(
    reservation_id: str,
    body: ReservationPatchBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Change reservation status: cancelled or converted."""
    if body.status not in ("cancelled", "converted"):
        raise HTTPException(status_code=400, detail="Estado debe ser 'cancelled' o 'converted'")

    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)

    reservation = await pool.fetchrow(
        "SELECT id, unit_id, status FROM reservations WHERE id = $1",
        reservation_id,
    )
    if not reservation:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    if reservation["status"] not in ("active", "converted"):
        raise HTTPException(status_code=409, detail=f"La reserva ya está en estado '{reservation['status']}'")

    if reservation["status"] == "converted" and body.status != "cancelled":
        raise HTTPException(status_code=409, detail="Una venta ya convertida solo puede cancelarse")

    unit_id = reservation["unit_id"]

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE reservations SET status = $1, updated_at = NOW() WHERE id = $2",
                body.status, reservation_id,
            )

            if body.status == "cancelled":
                await conn.execute(
                    "UPDATE units SET status = 'available' WHERE id = $1",
                    unit_id,
                )
            elif body.status == "converted":
                await conn.execute(
                    "UPDATE units SET status = 'sold' WHERE id = $1",
                    unit_id,
                )
                # Register buyer using reservation data
                res_data = await conn.fetchrow(
                    "SELECT project_id, lead_id, buyer_name, buyer_phone, signed_at FROM reservations WHERE id = $1",
                    reservation_id,
                )
                if res_data:
                    await conn.execute(
                        """
                        INSERT INTO buyers (project_id, unit_id, lead_id, name, phone, signed_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT DO NOTHING
                        """,
                        res_data["project_id"], unit_id, res_data["lead_id"],
                        res_data["buyer_name"], res_data["buyer_phone"], res_data["signed_at"],
                    )

    logger.info("Reservation %s status changed to %s", reservation_id, body.status)
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="UPDATE",
                 table_name="reservations", record_id=reservation_id,
                 details={"status": body.status})
    return {"reservation_id": reservation_id, "status": body.status}


@router.get("/payment-plans/{reservation_id}")
async def get_payment_plan(reservation_id: str):
    """Get payment plan and installments for a reservation."""
    pool = await get_pool()
    plan = await pool.fetchrow(
        "SELECT * FROM payment_plans WHERE reservation_id = $1", reservation_id
    )
    if not plan:
        return None
    installments = await pool.fetch(
        """SELECT i.*, COALESCE(
               json_agg(r ORDER BY r.created_at) FILTER (WHERE r.id IS NOT NULL), '[]'
           ) AS records
           FROM payment_installments i
           LEFT JOIN payment_records r ON r.installment_id = i.id AND r.deleted_at IS NULL
           WHERE i.plan_id = $1
           GROUP BY i.id
           ORDER BY i.numero_cuota""",
        str(plan["id"]),
    )
    import json as _json
    result = dict(plan)
    result["installments"] = []
    for row in installments:
        inst = dict(row)
        inst["records"] = _json.loads(inst["records"]) if isinstance(inst["records"], str) else inst["records"]
        result["installments"].append(inst)
    return result


@router.post("/payment-plans/{reservation_id}")
async def create_payment_plan(reservation_id: str, body: PaymentPlanBody):
    """Create a payment plan with installments for a reservation."""
    pool = await get_pool()

    # Check reservation exists
    res = await pool.fetchrow("SELECT id FROM reservations WHERE id = $1", reservation_id)
    if not res:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Snapshot paid installments before deleting — keyed by (concepto, monto)
            paid_records = await conn.fetch(
                """SELECT pi.concepto, pi.monto, pr.fecha_pago, pr.monto_pagado,
                          pr.moneda, pr.metodo_pago, pr.referencia, pr.notas
                   FROM payment_plans pp
                   JOIN payment_installments pi ON pi.plan_id = pp.id
                   JOIN payment_records pr ON pr.installment_id = pi.id AND pr.deleted_at IS NULL
                   WHERE pp.reservation_id = $1 AND pi.estado = 'pagado'""",
                reservation_id,
            )
            paid_map: dict[tuple, list] = {}
            for r in paid_records:
                key = (r["concepto"], float(r["monto"]))
                paid_map.setdefault(key, []).append(r)

            # Delete existing plan (cascades to installments + records)
            await conn.execute(
                "DELETE FROM payment_plans WHERE reservation_id = $1", reservation_id
            )

            plan = await conn.fetchrow(
                """INSERT INTO payment_plans
                   (reservation_id, descripcion, moneda_base, monto_total, tipo_ajuste, porcentaje_ajuste)
                   VALUES ($1,$2,$3,$4,$5,$6) RETURNING id""",
                reservation_id, body.descripcion, body.moneda_base,
                body.monto_total, body.tipo_ajuste, body.porcentaje_ajuste,
            )
            plan_id = str(plan["id"])
            for inst in body.installments:
                inst_row = await conn.fetchrow(
                    """INSERT INTO payment_installments
                       (plan_id, numero_cuota, concepto, monto, moneda, fecha_vencimiento, notas)
                       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id""",
                    plan_id, inst.numero_cuota, inst.concepto, inst.monto,
                    inst.moneda, datetime.strptime(inst.fecha_vencimiento, "%Y-%m-%d").date(), inst.notas,
                )
                inst_id = str(inst_row["id"])
                # Re-attach payment_records from matching paid installment
                key = (inst.concepto, float(inst.monto))
                if key in paid_map and paid_map[key]:
                    prev = paid_map[key].pop(0)
                    await conn.execute(
                        """INSERT INTO payment_records
                           (installment_id, fecha_pago, monto_pagado, moneda, metodo_pago, referencia, notas)
                           VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                        inst_id, prev["fecha_pago"], prev["monto_pagado"],
                        prev["moneda"], prev["metodo_pago"], prev["referencia"], prev["notas"],
                    )
                    await conn.execute(
                        "UPDATE payment_installments SET estado = 'pagado' WHERE id = $1", inst_id
                    )

    return {"plan_id": plan_id, "installments_created": len(body.installments)}


@router.patch("/payment-installments/{installment_id}")
async def patch_installment(installment_id: str, request: Request):
    """Update installment estado, notas, monto or fecha_vencimiento."""
    pool = await get_pool()
    data = await request.json()
    allowed = {"estado", "notas", "monto", "fecha_vencimiento"}
    updates: dict = {}
    for k, v in data.items():
        if k not in allowed:
            continue
        if k == "fecha_vencimiento" and v:
            updates[k] = datetime.strptime(v, "%Y-%m-%d").date()
        else:
            updates[k] = v
    if not updates:
        raise HTTPException(status_code=400, detail="Sin campos válidos")
    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    row = await pool.fetchrow(
        f"UPDATE payment_installments SET {set_clause} WHERE id = $1 RETURNING id, estado, monto, fecha_vencimiento",
        installment_id, *updates.values(),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Cuota no encontrada")
    return dict(row)


@router.post("/payment-records")
async def create_payment_record(
    body: PaymentRecordBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Register a payment against an installment."""
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    row = await pool.fetchrow(
        """INSERT INTO payment_records
           (installment_id, fecha_pago, monto_pagado, moneda, metodo_pago, referencia, notas)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id""",
        body.installment_id, datetime.strptime(body.fecha_pago, "%Y-%m-%d").date(),
        body.monto_pagado, body.moneda, body.metodo_pago, body.referencia, body.notas,
    )
    # Auto-update installment estado
    await pool.execute(
        "UPDATE payment_installments SET estado = 'pagado' WHERE id = $1",
        body.installment_id,
    )
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="INSERT",
                 table_name="payment_records", record_id=str(row["id"]),
                 details={"installment_id": body.installment_id, "fecha_pago": body.fecha_pago,
                          "monto_pagado": body.monto_pagado, "moneda": body.moneda})
    return {"record_id": str(row["id"])}


@router.patch("/payment-records/{record_id}")
async def update_payment_record(
    record_id: str,
    body: UpdatePaymentRecordBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Update a payment record field."""
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    row = await pool.fetchrow(
        "SELECT installment_id FROM payment_records WHERE id = $1 AND deleted_at IS NULL", record_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Payment record not found")
    installment_id = row["installment_id"]
    # Build SET clause dynamically
    updates = {}
    if body.fecha_pago is not None:
        updates["fecha_pago"] = datetime.strptime(body.fecha_pago, "%Y-%m-%d").date()
    if body.monto_pagado is not None:
        updates["monto_pagado"] = body.monto_pagado
    if body.moneda is not None:
        updates["moneda"] = body.moneda
    if body.metodo_pago is not None:
        updates["metodo_pago"] = body.metodo_pago
    if body.referencia is not None:
        updates["referencia"] = body.referencia
    if body.notas is not None:
        updates["notas"] = body.notas
    if updates:
        set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates.keys()))
        values = [record_id] + list(updates.values())
        await pool.execute(
            f"UPDATE payment_records SET {set_clause} WHERE id = $1", *values
        )
    # Recalculate installment estado
    total_paid = await pool.fetchval(
        "SELECT COALESCE(SUM(monto_pagado),0) FROM payment_records WHERE installment_id = $1 AND deleted_at IS NULL",
        installment_id,
    )
    inst_monto = await pool.fetchval(
        "SELECT monto FROM payment_installments WHERE id = $1", installment_id
    )
    if total_paid >= inst_monto:
        new_estado = "pagado"
    elif total_paid > 0:
        new_estado = "parcial"
    else:
        new_estado = "pendiente"
    await pool.execute(
        "UPDATE payment_installments SET estado = $1 WHERE id = $2",
        new_estado, installment_id,
    )
    if updates:
        await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="UPDATE",
                     table_name="payment_records", record_id=record_id,
                     details={k: str(v) for k, v in updates.items()})
    return {"ok": True}


@router.delete("/payment-records/{record_id}")
async def delete_payment_record(
    record_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Soft-delete a payment record and recalculate installment estado."""
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)
    row = await pool.fetchrow(
        "SELECT installment_id FROM payment_records WHERE id = $1 AND deleted_at IS NULL", record_id
    )
    if not row:
        raise HTTPException(status_code=404, detail="Payment record not found")
    installment_id = row["installment_id"]
    await pool.execute("UPDATE payment_records SET deleted_at = NOW() WHERE id = $1", record_id)
    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="DELETE",
                 table_name="payment_records", record_id=record_id)
    # Recalculate estado
    total_paid = await pool.fetchval(
        "SELECT COALESCE(SUM(monto_pagado),0) FROM payment_records WHERE installment_id = $1 AND deleted_at IS NULL",
        installment_id,
    )
    inst_monto = await pool.fetchval(
        "SELECT monto FROM payment_installments WHERE id = $1", installment_id
    )
    if total_paid >= inst_monto:
        new_estado = "pagado"
    elif total_paid > 0:
        new_estado = "parcial"
    else:
        new_estado = "pendiente"
    await pool.execute(
        "UPDATE payment_installments SET estado = $1 WHERE id = $2",
        new_estado, installment_id,
    )
    return {"ok": True}
