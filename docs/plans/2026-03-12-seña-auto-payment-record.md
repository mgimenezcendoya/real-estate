# Señal Auto Payment Record — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a reservation is created with a señal amount, automatically create a payment_plan + payment_installment (Cuota #0 "Señal") + payment_record so the cash flow reflects it immediately — without any manual steps.

**Architecture:** Extract a helper `_auto_create_seña(conn, reservation_id, amount_usd, payment_method, signed_at)` and call it inside the existing DB transaction in both `create_reservation` and `create_direct_sale`. If `amount_usd` is None or 0, the helper is a no-op. Idempotent: skips if a plan already exists for the reservation.

**Tech Stack:** FastAPI, asyncpg, PostgreSQL. No schema changes needed — all tables already exist (`payment_plans`, `payment_installments`, `payment_records`).

---

### Task 1: Extract helper `_auto_create_seña`

**Files:**
- Modify: `app/admin/routers/reservations.py`

**Step 1: Add helper function** after the imports block (before any `@router` decorator), around line 16:

```python
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
           VALUES ($1, 0, 'Señal', $2, 'USD', $3, 'pagado')
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
```

**Step 2: Verify the file has no syntax errors**

Run:
```bash
cd /Users/mcendoya/repos/real-estate && source venv/bin/activate && python3 -c "import app.admin.routers.reservations; print('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add app/admin/routers/reservations.py
git commit -m "feat: add _auto_create_seña helper for atomic señal payment record"
```

---

### Task 2: Call helper in `create_reservation`

**Files:**
- Modify: `app/admin/routers/reservations.py` — `create_reservation` function (around line 150)

**Step 1: Add the helper call** inside the `async with conn.transaction()` block, right after the `INSERT INTO reservations` fetchrow (around line 176). The call goes **inside** the transaction so it rolls back atomically if anything fails:

```python
            # Auto-create señal payment record if amount provided
            await _auto_create_seña(
                conn,
                str(row["id"]),
                body.amount_usd,
                body.payment_method,
                signed_at_val,
            )
```

Place it immediately after:
```python
            )   # <-- end of fetchrow INSERT INTO reservations

            # Auto-create señal payment record if amount provided
            await _auto_create_seña(
                conn,
                str(row["id"]),
                body.amount_usd,
                body.payment_method,
                signed_at_val,
            )

    u = await pool.fetchrow(   # <-- this line comes after
```

**Step 2: Verify syntax**

```bash
python3 -c "import app.admin.routers.reservations; print('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add app/admin/routers/reservations.py
git commit -m "feat: auto-create señal payment record on create_reservation"
```

---

### Task 3: Call helper in `create_direct_sale`

**Files:**
- Modify: `app/admin/routers/reservations.py` — `create_direct_sale` function (around line 94)

**Step 1: Add the helper call** inside the `async with conn.transaction()` block, right after the `INSERT INTO reservations` fetchrow (around line 110), before the `INSERT INTO buyers`:

```python
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
```

**Step 2: Verify syntax**

```bash
python3 -c "import app.admin.routers.reservations; print('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add app/admin/routers/reservations.py
git commit -m "feat: auto-create señal payment record on create_direct_sale"
```

---

### Task 4: Smoke test against the real DB

**Step 1: Test via curl** — create a new reservation with amount_usd and verify payment records are created automatically.

```bash
cd /Users/mcendoya/repos/real-estate && source venv/bin/activate && python3 -c "
import asyncio, os
from dotenv import load_dotenv
load_dotenv()

async def main():
    import asyncpg
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))

    # Check existing reservations that have amount_usd but no payment plan
    rows = await conn.fetch('''
        SELECT r.id, r.buyer_name, r.amount_usd,
               (SELECT COUNT(*) FROM payment_plans pp WHERE pp.reservation_id = r.id) as has_plan,
               (SELECT COUNT(*) FROM payment_plans pp
                JOIN payment_installments pi ON pi.plan_id = pp.id
                WHERE pp.reservation_id = r.id AND pi.concepto = 'Señal') as has_seña
        FROM reservations r
        WHERE r.amount_usd > 0
        ORDER BY r.created_at DESC
        LIMIT 10
    ''')
    print('Reservations with amount_usd:')
    for r in rows:
        print(f'  {r[\"buyer_name\"]}: amount={r[\"amount_usd\"]}, has_plan={r[\"has_plan\"]}, has_seña={r[\"has_seña\"]}')
    await conn.close()

asyncio.run(main())
"
```

This shows the current state. After the code change, any **new** reservation created via the API will have `has_plan=1, has_seña=1`.

**Step 2: Hit the local API** to create a test reservation and verify the records are created:

```bash
# Get auth token first
TOKEN=$(curl -s -X POST http://localhost:8000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Tincho123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")

# Check cash flow endpoint shows the señal as ingreso
curl -s "http://localhost:8000/admin/financials/938504c7-422b-4899-9e0e-bba7713df638/cash-flow" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40
```

**Step 3: Commit**

No code changes in this task. If the smoke test passes, the feature is complete.

---

### Task 5: Backfill existing reservations (data migration)

Existing reservations with `amount_usd > 0` and no payment plan won't benefit from the new code automatically. Run a targeted backfill.

**Step 1: Run backfill script**

```bash
cd /Users/mcendoya/repos/real-estate && source venv/bin/activate && python3 -c "
import asyncio, os
from datetime import date
from dotenv import load_dotenv
load_dotenv()

async def main():
    import asyncpg
    conn = await asyncpg.connect(os.getenv('DATABASE_URL'))

    # Find reservations with amount_usd but no payment plan
    rows = await conn.fetch('''
        SELECT r.id, r.amount_usd, r.payment_method, r.signed_at
        FROM reservations r
        WHERE r.amount_usd > 0
          AND NOT EXISTS (
            SELECT 1 FROM payment_plans pp WHERE pp.reservation_id = r.id
          )
    ''')
    print(f'Reservations to backfill: {len(rows)}')

    for r in rows:
        reservation_id = str(r['id'])
        amount_usd = float(r['amount_usd'])
        metodo = r['payment_method'] or 'transferencia'
        fecha = r['signed_at'] if r['signed_at'] else date.today()

        async with conn.transaction():
            plan = await conn.fetchrow(
                \"\"\"INSERT INTO payment_plans
                   (reservation_id, descripcion, moneda_base, monto_total, tipo_ajuste)
                   VALUES (\$1, 'Seña', 'USD', \$2, 'ninguno')
                   RETURNING id\"\"\",
                reservation_id, amount_usd,
            )
            plan_id = str(plan['id'])

            inst = await conn.fetchrow(
                \"\"\"INSERT INTO payment_installments
                   (plan_id, numero_cuota, concepto, monto, moneda, fecha_vencimiento, estado)
                   VALUES (\$1, 0, 'Señal', \$2, 'USD', \$3, 'pagado')
                   RETURNING id\"\"\",
                plan_id, amount_usd, fecha,
            )
            installment_id = str(inst['id'])

            await conn.execute(
                \"\"\"INSERT INTO payment_records
                   (installment_id, fecha_pago, monto_pagado, moneda, metodo_pago)
                   VALUES (\$1, \$2, \$3, 'USD', \$4)\"\"\",
                installment_id, fecha, amount_usd, metodo,
            )
        print(f'  Backfilled reservation {reservation_id}: amount={amount_usd}')

    print('Done.')
    await conn.close()

asyncio.run(main())
"
```

Expected: prints each backfilled reservation and ends with `Done.`

**Step 2: Verify cash flow now shows ingresos from señas**

Open the browser at `/proyectos/[id]/financiero` → tab "Flujo de Caja" and confirm the señas appear as ingresos in the months they were paid.

**Step 3: Commit backfill script** (save it for reference)

```bash
git add docs/plans/2026-03-12-seña-auto-payment-record.md
git commit -m "docs: add backfill script for seña payment records in plan"
```
