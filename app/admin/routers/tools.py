# app/admin/routers/tools.py
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.admin.auth import verify_token
from app.admin.deps import _audit, _get_actor, _require_admin, security
from app.database import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/tools/exchange-rates")
async def get_exchange_rates():
    """Return current compra/venta for oficial, blue, and mep. Cached 15 min."""
    from app.modules.tools.exchange_rates import get_current_rates
    try:
        rates = await get_current_rates()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching exchange rates: {e}")
    return rates


@router.get("/tools/exchange-rates/history/{tipo}")
async def get_exchange_rate_history(tipo: str, days: int = 30):
    """Return last N days of history for a given tipo (oficial, blue, mep)."""
    from app.modules.tools.exchange_rates import get_rate_history
    try:
        history = await get_rate_history(tipo, days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error fetching history: {e}")
    return history


@router.post("/jobs/close-stale-handoffs")
async def close_stale_handoffs():
    """Close handoffs where the lead hasn't replied in 2 hours (called by cron every 30 min)."""
    from app.modules.handoff.manager import close_handoff
    pool = await get_pool()
    cutoff = "NOW() - INTERVAL '2 hours'"
    stale = await pool.fetch(
        f"""
        SELECT h.id, h.lead_id FROM handoffs h
        WHERE h.status = 'active'
          AND (
            SELECT MAX(c.created_at) FROM conversations c
            WHERE c.lead_id = h.lead_id AND c.role = 'user'
          ) < {cutoff}
          AND h.started_at < {cutoff}
        """
    )
    closed = 0
    for row in stale:
        try:
            await close_handoff(str(row["id"]), lead_note="timeout_2h_cron", send_goodbye=False)
            closed += 1
        except Exception as e:
            logger.warning("Failed to close stale handoff %s: %s", row["id"], e)
    logger.info("close-stale-handoffs: closed %d handoffs", closed)
    return {"closed": closed}


@router.post("/jobs/update-payment-states")
async def update_payment_states():
    pool = await get_pool()
    # Update obra_payments
    r1 = await pool.execute(
        "UPDATE obra_payments SET estado = 'vencido' WHERE fecha_vencimiento < CURRENT_DATE AND estado = 'pendiente'"
    )
    # Update payment_installments
    r2 = await pool.execute(
        "UPDATE payment_installments SET estado = 'vencido' WHERE fecha_vencimiento < CURRENT_DATE AND estado = 'pendiente'"
    )
    updated_obra = int(r1.split()[-1])
    updated_installments = int(r2.split()[-1])
    return {"updated_obra": updated_obra, "updated_installments": updated_installments}


@router.get("/audit-log")
async def get_audit_log(
    project_id: Optional[str] = None,
    table_name: Optional[str] = None,
    record_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Return audit log entries. Superadmin only."""
    if not credentials:
        raise HTTPException(status_code=401, detail="No autorizado")
    payload = verify_token(credentials.credentials)
    if not payload or payload.get("role") not in ("superadmin", "admin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")

    pool = await get_pool()
    conditions = []
    params: list = []
    i = 1
    if project_id:
        conditions.append(f"project_id = ${i}"); params.append(project_id); i += 1
    if table_name:
        conditions.append(f"table_name = ${i}"); params.append(table_name); i += 1
    if record_id:
        conditions.append(f"record_id = ${i}"); params.append(record_id); i += 1
    if user_id:
        conditions.append(f"user_id = ${i}"); params.append(user_id); i += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await pool.fetch(
        f"""SELECT id, user_id, user_nombre, action, table_name, record_id,
                   project_id, details, created_at
            FROM audit_log
            {where}
            ORDER BY created_at DESC
            LIMIT ${i} OFFSET ${i+1}""",
        *params, limit, offset,
    )
    return [dict(r) for r in rows]
