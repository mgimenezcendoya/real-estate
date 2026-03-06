# Reporte del Comprador — Design Doc

**Fecha:** 2026-03-06

## Resumen

Página de reporte imprimible por reserva, accesible desde el detalle de cada reserva. El admin genera el reporte con un click y lo abre en nueva pestaña para imprimir o guardar como PDF. No requiere nuevos endpoints de backend.

## Ruta

```
/proyectos/[id]/reservas/[reservationId]/reporte
```

## Acceso

Botón "Generar reporte" en `/proyectos/[id]/reservas/[reservationId]` (tab "Detalle").
Abre la ruta en nueva pestaña via `window.open(...)`.

## Datos (endpoints existentes, fetch en paralelo al montar)

| Dato | Endpoint |
|---|---|
| Reserva + unidad | `GET /admin/reservation/{reservationId}` |
| Plan de pagos + cuotas | `GET /admin/payment-plans/{reservationId}` |
| Obra (avance + etapas) | `GET /admin/obra/{projectId}` |

## Secciones del reporte

1. **Header** — logo REALIA, nombre del proyecto, fecha de generación
2. **Datos de la operación** — nombre del comprador, unidad (identificador, piso, m², ambientes), precio total, fecha de reserva
3. **Avance de obra** — barra de progreso general (`ObraData.progress`) + listado de etapas activas con `nombre` y `porcentaje_completado` (sin `peso_pct`)
4. **Plan de pagos** — tabla: concepto · fecha de vencimiento · monto · estado (pagado / vencido / pendiente)
5. **Resumen financiero** — total del plan · total pagado · saldo pendiente

## Layout

- Sin sidebar, sin nav de proyecto — página limpia (igual patrón que `/print`)
- Estilos optimizados para impresión (`@media print`)
- Colores: blanco/gris, badges de estado en verde/rojo/amarillo

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `frontend/src/app/proyectos/[id]/reservas/[reservationId]/reporte/page.tsx` | Crear — página del reporte |
| `frontend/src/app/proyectos/[id]/reservas/[reservationId]/page.tsx` | Modificar — agregar botón "Generar reporte" |
