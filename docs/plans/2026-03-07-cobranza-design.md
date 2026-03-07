# Diseño: Módulo de Cobranza

**Fecha:** 2026-03-07
**Estado:** Aprobado

## Objetivo

Vista transversal a todos los proyectos que permite al equipo hacer seguimiento de cuotas pendientes y vencidas de compradores, ordenadas por proximidad de vencimiento, para prevenir morosidad.

## Ubicación en el producto

Nueva página `/cobranza` con ítem propio en el sidebar (ícono `CreditCard`), entre Proyectos e Inbox. Es un flujo operativo de alta frecuencia (revisión diaria/semanal) — merece ser de primer nivel.

---

## Backend

### Endpoint nuevo

`GET /admin/cobranza`

Devuelve todas las cuotas con `estado IN ('pendiente', 'vencido')` del org del usuario, ordenadas por `fecha_vencimiento ASC`.

**Query params opcionales:**
- `?proyecto=<project_id>` — filtrar por proyecto
- `?estado=vencida|proxima|todas` — default: `todas`

**Joins necesarios:**
```
payment_installments
  → payment_plans → reservations → leads (buyer_name, buyer_phone)
  → reservations → projects (project_name, project_id)
  → project_financials_config (tipo_cambio_usd_ars para conversión)
```

**Campos por cuota:**
- `installment_id`
- `buyer_name`, `buyer_phone`
- `project_name`, `project_id`, `reservation_id`
- `numero_cuota`
- `monto`, `moneda`, `monto_usd` (convertido si ARS)
- `fecha_vencimiento`
- `estado` (pendiente / vencido)
- `dias` (negativo = vencida hace N días, positivo = vence en N días)

### Acción: marcar como pagada

Reusar endpoint existente: `PATCH /admin/payment-installments/{id}` con `{ "estado": "pagado" }`.
No se registra monto — cambio de estado únicamente.

---

## Frontend

### Estructura de la página

**Header:**
- Título "Cobranza" con badge del org
- Contador de cuotas vencidas (badge rojo)

**KPI bar (3 chips):**
1. Total vencido en USD
2. Cuotas que vencen esta semana
3. Compradores con al menos 1 cuota vencida

**Filtros:**
- Dropdown de proyecto (todos los proyectos del org)
- Toggle chips de estado: Todas / Vencidas / Próximas

**Tabla**, columnas:
| Comprador | Teléfono | Proyecto | Cuota # | Monto | Vence | Mora | Estado | Acción |
- **Mora**: badge rojo "hace X días" si vencida, badge amber "en X días" si próxima
- **Estado**: badge `Vencida` (rojo) / `Pendiente` (amber)
- **Acción**: botón "Marcar pagada" — update optimista, la fila desaparece de la lista
- Ordenada por `fecha_vencimiento` ASC (más urgente arriba)

### Sidebar

Nuevo ítem con ícono `CreditCard` entre Proyectos e Inbox.

---

## Decisiones de diseño

- **Sin registro de monto al marcar como pagada:** simplicidad > trazabilidad financiera en este flujo. El pago detallado ya existe en `/reservas/[id]/plan-de-pagos`.
- **Lista plana sobre agrupado por comprador:** la urgencia está en la fecha, no en la persona. Más útil para operación diaria.
- **Scoped al org del usuario:** misma lógica que `list_projects` — superadmin ve todo, el resto ve solo su org.
