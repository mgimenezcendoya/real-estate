# Guía de Onboarding REALIA — Design Doc

## Objetivo
Manual interactivo completo para suscriptores de REALIA. Cubre toda la plataforma sin asumir conocimiento previo. Único manual para todos los roles.

## Arquitectura
- **Ruta:** `/guia` dentro del mismo Next.js (pública, sin login)
- **Layout:** sidebar izquierdo fijo con capítulos colapsables + panel derecho scrollable
- **Mobile:** sidebar colapsa en menú hamburguesa
- **Screenshots:** tomados con Playwright contra producción, guardados en `/public/guia/`
- **Anotaciones:** SVG superpuesto (flechas, círculos numerados, tooltips al hover)
- **PDF:** `GET /admin/guia/pdf` → Puppeteer renderiza `/guia?print=1` → devuelve A4

## Capítulos
1. Primeros pasos — login, cambio de contraseña, roles
2. Proyectos — crear, configurar, dashboard KPIs
3. Unidades — grilla por piso, estados, venta directa
4. Leads — kanban, scoring, notas de equipo
5. Reservas — crear, convertir, cancelar, comprobante
6. Plan de pagos — cuotas, registrar pagos
7. Portal del comprador — generar acceso, vista del comprador
8. Obra — etapas, avance, pagos
9. Financiero — presupuesto, facturas, flujo de caja
10. Inbox & Agente IA — conversaciones, HITL, handoff
11. Configuración — WhatsApp, usuarios, roles
12. Herramientas — tipos de cambio, simulador

## Estilo de contenido
- Segunda persona con voseo ("hacé click en…")
- Pasos numerados + screenshot anotado + tip/nota
- Sin tecnicismos

## PDF
- Sin auth requerido
- Todos los capítulos en secuencia, break-after: page entre capítulos
- Header: logo + nombre capítulo | Footer: número de página
- Tamaño A4, márgenes 20mm
