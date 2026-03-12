# Movimientos Tab — Design Document

**Date:** 2026-03-12

## Goal

Replace the "Facturas" tab in Financiero with a unified "Movimientos" tab that consolidates all financial movements (cobros + egresos) into a single auditable source of truth.

## Problem

Today payment_records (cobros de cuotas/anticipos) are only visible inside each individual reservation. There is no project-level view of income. Facturas only shows invoices/expenses. The Flujo de Caja aggregates both but doesn't allow auditing individual records.

## Design

### Data Sources

- **Cobros** — `payment_records` joined to `payment_installments → payment_plans → reservations → units`
- **Egresos** — `facturas WHERE categoria = 'egreso'`
- **Facturas de ingreso** — shown as `comprobante` metadata on a cobro row (via `facturas.payment_record_id`), NOT as separate rows (avoids double-counting)

### Unified Table

| Tipo | Fecha | Contraparte | Concepto | Monto | Estado | Comprobante |
|------|-------|-------------|----------|-------|--------|-------------|
| Cobro | 12/03 | bombay 1 · 2F | Anticipo | +USD 15.000 | Pagado | — Sin comprobante |
| Cobro | 25/01 | Valentina Roch · 1B | Anticipo | +USD 5.000 | Pagado | REC-2026-0001 |
| Egreso | 12/03 | Hormigonera Del Plata | Fact. OTRO | −USD 85.000 | Pagada | — |

### Backend

New endpoint: `GET /admin/movimientos/{project_id}`

Returns unified list sorted by fecha DESC:
```json
[
  {
    "tipo": "cobro",
    "id": "...",
    "fecha": "2026-03-12",
    "contraparte": "bombay 1",
    "unidad": "2F · Piso 2",
    "concepto": "Anticipo",
    "numero_cuota": 1,
    "monto": 15000,
    "moneda": "USD",
    "metodo_pago": "transferencia",
    "comprobante_id": null,
    "comprobante_numero": null,
    "installment_id": "...",
    "reservation_id": "..."
  },
  {
    "tipo": "egreso",
    "id": "...",
    "fecha": "2026-03-12",
    "contraparte": "Hormigonera Del Plata",
    "unidad": null,
    "concepto": "Fact. OTRO",
    "numero_cuota": null,
    "monto": 85000,
    "moneda": "USD",
    "metodo_pago": null,
    "comprobante_id": "...",
    "comprobante_numero": null,
    "factura_estado": "cargada"
  }
]
```

Query: `UNION ALL` between payment_records (with LEFT JOIN to facturas on `payment_record_id`) and facturas egreso.

Optional query params: `?desde=`, `?hasta=`, `?tipo=cobro|egreso`, `?sin_comprobante=true`

### Frontend

- Replace "Facturas" tab with "Movimientos" in `/proyectos/[id]/financiero/page.tsx`
- New component `MovimientosTab.tsx` in `frontend/src/app/proyectos/[id]/financiero/`
- Reuse existing `FacturaModal` for egreso creation/edit
- New `Cobro` edit modal (inline or small modal): fecha, monto, método de pago
- "+ Comprobante" button on cobro rows without factura → opens FacturaModal pre-filled as ingreso + `payment_record_id` set

### Actions per row

**Cobro:**
- Edit (fecha_pago, monto_pagado, metodo_pago)
- Delete
- "+ Comprobante" (if no factura linked) → FacturaModal pre-filled

**Egreso:**
- Edit → FacturaModal
- Delete

### Header

- Filters: fecha desde/hasta, tipo (Todos / Cobros / Egresos), toggle "Solo sin comprobante"
- Buttons: "+ Registrar cobro" · "+ Agregar egreso"

## Out of Scope

- Facturas de ingreso orphans (no payment_record) — edge case, handle in future iteration
- Bulk actions
- Export to CSV
