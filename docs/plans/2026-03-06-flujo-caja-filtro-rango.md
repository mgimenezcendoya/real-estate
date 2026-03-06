# Flujo de Caja — Filtro de Rango de Fechas

**Fecha:** 2026-03-06

## Objetivo

Permitir al usuario filtrar el flujo de caja por rango de meses (desde/hasta) para analizar períodos específicos.

## Diseño

### Backend

Endpoint: `GET /admin/cash-flow/{project_id}`

Agregar dos query params opcionales:
- `desde: str | None` — formato `YYYY-MM`
- `hasta: str | None` — formato `YYYY-MM`

Aplicar en las 4 queries SQL como condición adicional sobre el campo de mes calculado:
- ingresos: `AND to_char(pr.fecha_pago, 'YYYY-MM') BETWEEN $2 AND $3`
- gastos: `AND to_char(fecha, 'YYYY-MM') BETWEEN $2 AND $3`
- obra: `AND to_char(op.fecha_pago, 'YYYY-MM') BETWEEN $2 AND $3`
- proyeccion: `AND to_char(pi.fecha_vencimiento, 'YYYY-MM') BETWEEN $2 AND $3`

Sin parámetros → comportamiento actual (sin filtro).

### Frontend

- Dos inputs `type="month"` en la cabecera del tab "Flujo de Caja"
- Default al montar: `desde` = mes actual - 2 meses, `hasta` = mes actual + 12 meses
- Al cambiar cualquier input → `loadCashFlow()` automático
- Botón "Limpiar" que resetea a defaults y recarga
- Los valores se pasan como query params a `api.getCashFlow(id, desde, hasta)`
- Actualizar `CashFlowRow` en `api.ts` si hace falta y agregar params a `getCashFlow`

## Archivos a modificar

1. `app/admin/api.py` — endpoint `get_cash_flow`
2. `frontend/src/lib/api.ts` — función `getCashFlow`
3. `frontend/src/app/proyectos/[id]/financiero/page.tsx` — tab Flujo de Caja

## Notas

- Sin parámetros el endpoint sigue funcionando igual (backwards compatible)
- Los pagos de obra sin fecha (`fecha_pago IS NOT NULL`) ya están filtrados por el fix anterior
