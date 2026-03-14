# REALIA — Guía de Usuario

## Índice

1. [Proyectos](#1-proyectos)
2. [Dashboard](#2-dashboard)
3. [Leads](#3-leads)
4. [Unidades](#4-unidades)
5. [Reservas](#5-reservas)
6. [Obra](#6-obra)
7. [Financiero](#7-financiero)
8. [Inversores](#8-inversores)
9. [Inbox](#9-inbox)
10. [Tools](#10-tools)
11. [Usuarios](#11-usuarios)
12. [Tabla de Roles y Permisos](#tabla-de-roles-y-permisos)
13. [Glosario](#glosario)

---

## 1. Proyectos

### ¿Qué es?
El punto de entrada de REALIA. Cada proyecto representa un desarrollo inmobiliario con sus unidades, leads, obra y finanzas.

### Casos de uso
- Ver todos los proyectos activos de la organización
- Crear un nuevo proyecto subiendo el CSV de unidades
- Acceder rápidamente al dashboard de un proyecto
- Identificar el estado general de ventas de cada desarrollo

### Paso a paso
1. **Accedé a /proyectos** — Verás las cards de todos los proyectos con sus KPIs principales.
2. **Creá un nuevo proyecto** — Hacé clic en "Nuevo Proyecto", completá el nombre y subí el CSV de unidades. El sistema parsea pisos, tipos y precios automáticamente.
3. **Seleccioná un proyecto** — Clic en la card para entrar al dashboard del proyecto.
4. **Navegá entre módulos** — Usá las tabs internas (Leads, Unidades, Reservas, Obra, Financiero, Inversores) para acceder a cada sección.

### Permisos requeridos
Todos los roles con acceso al sistema pueden ver proyectos. Solo admins y gerentes pueden crear proyectos nuevos.

### Tips
- El CSV de unidades debe tener columnas: piso, unidad, tipo, superficie, precio.
- Podés actualizar las unidades re-subiendo el CSV desde la configuración del proyecto.

---

## 2. Dashboard

### ¿Qué es?
Vista ejecutiva del proyecto con métricas de ventas, absorción y performance de leads en tiempo real.

### Casos de uso
- Ver el estado de ventas consolidado (vendidas, reservadas, disponibles)
- Monitorear la tasa de absorción mensual
- Seguir el embudo de leads por etapa
- Comparar ingresos proyectados vs realizados

### Paso a paso
1. **Entrá al proyecto** — Desde /proyectos, clic en el proyecto deseado. Aterrizás en el dashboard.
2. **Revisá los KPIs superiores** — Las cards muestran unidades vendidas, en reserva, disponibles, y monto total comercializado.
3. **Analizá los gráficos** — El gráfico de barras muestra la absorción mensual. El embudo muestra conversión de leads.
4. **Filtrá por período** — Usá el selector de fechas para ver métricas de un rango específico.

### Permisos requeridos
Acceso de lectura para todos los roles del proyecto.

### Tips
- Los datos del dashboard se actualizan en tiempo real. Si acabás de registrar una venta, recargá la página para ver los números actualizados.

---

## 3. Leads

### ¿Qué es?
Kanban de prospectos organizado por temperatura de interés. Gestioná el pipeline de ventas desde el primer contacto hasta la reserva.

### Casos de uso
- Registrar nuevos prospectos y su interés en unidades
- Mover leads entre etapas (Hot / Warm / Cold)
- Ver el historial de conversaciones de cada lead
- Convertir un lead caliente en reserva directamente

### Paso a paso
1. **Abrí el Kanban** — Desde el proyecto, hacé clic en la tab "Leads". Verás tres columnas: Hot, Warm, Cold.
2. **Creá un lead** — Clic en "+ Nuevo Lead", completá nombre, teléfono, email y la unidad de interés.
3. **Gestioná el pipeline** — Arrastrá los leads entre columnas o usá el menú de opciones para cambiar la temperatura.
4. **Reservá desde el lead** — Abrí el detalle del lead (clic en la card) y usá el botón "Reservar unidad" para iniciar el wizard de reserva.

### Permisos requeridos
- Vendedores: solo ven leads asignados a ellos.
- Gerentes y admins: ven todos los leads del proyecto.

### Tips
- Los leads con actividad reciente en el Inbox aparecen con un indicador visual.
- Usá el filtro de búsqueda para encontrar un lead por nombre o teléfono rápidamente.

---

## 4. Unidades

### ¿Qué es?
Grilla visual de todas las unidades por piso. Estado en tiempo real: disponible, reservada o vendida.

### Casos de uso
- Ver el plano de disponibilidad por piso
- Reservar una unidad directamente desde la grilla
- Registrar una venta directa (sin reserva previa)
- Liberar una unidad reservada que no avanzó

### Paso a paso
1. **Accedé a Unidades** — Tab "Unidades" dentro del proyecto. Las unidades se muestran agrupadas por piso.
2. **Identificá el estado** — Verde = disponible, amarillo = reservada, rojo = vendida. Clic en cualquier unidad para ver su detalle.
3. **Reservá una unidad** — Clic en una unidad disponible → "Reservar". Se abre el wizard de reserva con datos del comprador y plan de pagos.
4. **Registrá venta directa** — Clic en una unidad disponible → "Venta directa". Útil para operaciones que ya están cerradas.

### Permisos requeridos
Lectura disponible para todos. Acciones de reserva y venta requieren rol vendedor o superior.

### Tips
- Podés filtrar por tipo de unidad (1 amb, 2 amb, etc.) usando los chips en la parte superior.
- El mapa de calor muestra qué pisos tienen más disponibilidad.

---

## 5. Reservas

### ¿Qué es?
Centro de operaciones comerciales. Gestioná reservas activas, planes de pago, cuotas y facturas vinculadas.

### Casos de uso
- Ver todas las operaciones del proyecto (activas, convertidas, canceladas)
- Editar el plan de pagos de una reserva
- Registrar el cobro de una cuota
- Convertir una reserva en venta o cancelarla
- Imprimir el comprobante de reserva

### Paso a paso
1. **Abrí Reservas** — Tab "Reservas" del proyecto. Usá los chips de estado para filtrar: Activas, Convertidas, Canceladas.
2. **Entrá al detalle** — Clic en una reserva → abre la página de detalle con tabs "Detalle" y "Plan de Pagos".
3. **Gestioná las cuotas** — En "Plan de Pagos" podés ver todas las cuotas, registrar pagos (con fecha y monto real) y editar los montos.
4. **Convertí o cancelá** — Desde el detalle, usá "Convertir a venta" cuando se escriture, o "Cancelar reserva" si la operación no avanza.
5. **Imprimí el comprobante** — Botón "Imprimir" genera una página PDF limpia con todos los datos de la reserva.

### Permisos requeridos
Vendedores pueden gestionar sus propias reservas. Gerentes y admins tienen acceso completo.

### Tips
- Al registrar un pago en el plan de cuotas, podés vincularlo a una factura de ingreso existente. Esto centraliza la trazabilidad financiera.
- Las cuotas vencidas aparecen destacadas en rojo. El sistema actualiza automáticamente los estados de pago cada noche.

---

## 6. Obra

### ¿Qué es?
Seguimiento del avance de construcción por etapas ponderadas y gestión de pagos a proveedores.

### Casos de uso
- Registrar el progreso porcentual de cada etapa de obra
- Ver el avance global ponderado del proyecto
- Cargar pagos a proveedores y subcontratistas
- Asociar gastos de obra a etapas específicas

### Paso a paso
1. **Accedé a Obra** — Tab "Obra" del proyecto. Verás las etapas listadas con su peso relativo y progreso actual.
2. **Actualizá el avance** — Hacé clic en el porcentaje de una etapa para editarlo. El avance global se recalcula automáticamente.
3. **Registrá pagos** — Cambiá a la tab "Pagos" dentro de Obra. Clic en "+ Nuevo Pago" para registrar un pago a proveedor.
4. **Completá los datos del pago** — Ingresá proveedor, monto, fecha, etapa de obra asociada y adjuntá la factura si corresponde.

### Permisos requeridos
Solo admins y gerentes pueden modificar el progreso de etapas. Vendedores tienen acceso de solo lectura.

### Tips
- Las etapas de obra tienen pesos asignados (ej: "Estructura" 30%, "Terminaciones" 15%). El avance global es el promedio ponderado de todas las etapas.

---

## 7. Financiero

### ¿Qué es?
Dashboard financiero integral: resumen de KPIs, gestión de facturas y flujo de caja proyectado vs real.

### Casos de uso
- Ver el P&L del proyecto en tiempo real
- Cargar facturas de ingresos y egresos
- Vincular facturas de ingreso a cuotas cobradas
- Analizar el flujo de caja mes a mes
- Subir PDF de facturas al repositorio documental

### Paso a paso
1. **Abrí Financiero** — Tab "Financiero" del proyecto. La vista por defecto es "Resumen" con los KPIs principales.
2. **Revisá el resumen** — Verás: presupuesto total, costo proyectado, ingresos reales, margen estimado.
3. **Cargá una factura** — Tab "Facturas" → "+ Nueva Factura". Completá tipo (ingreso/egreso), monto, fecha, categoría y proveedor/cliente.
4. **Vinculá facturas de ingreso** — Al crear una factura de ingreso, podés vincularla al pago de una cuota específica.
5. **Analizá el flujo de caja** — Tab "Flujo de Caja" muestra el gráfico de barras mes a mes con ingresos, egresos y saldo neto.

### Permisos requeridos
Visible solo para roles admin, superadmin y gerente. Vendedores y lectores no tienen acceso.

### Tips
- En el Resumen podés crear presupuestos por rubro. Cada presupuesto puede asociarse a una etapa de obra (ej: Estructura, Terminaciones) o a una etapa no constructiva (ej: Comercialización, Honorarios, Marketing). Para etapas de obra, la ejecución se toma de los pagos del módulo Obra. Para etapas no constructivas, la ejecución se toma de los gastos cargados en Facturas.
- El flujo de caja combina datos reales (pagos registrados, facturas) con proyecciones (cuotas pendientes).
- Podés subir el PDF de una factura directamente en el modal para trazabilidad y auditoría.

---

## 8. Inversores

### ¿Qué es?
Portal de comunicación con inversores del proyecto. Generá reportes de estado y enviálos por WhatsApp con un clic.

### Casos de uso
- Ver el listado de inversores del proyecto
- Generar un reporte de avance para un inversor
- Enviar el reporte por WhatsApp directamente desde REALIA
- Consultar el historial de reportes enviados

### Paso a paso
1. **Accedé a Inversores** — Tab "Inversores" del proyecto. Verás las cards de cada inversor con su participación.
2. **Seleccioná un inversor** — Clic en la card del inversor para ver su detalle y generar un reporte.
3. **Generá el reporte** — Clic en "Generar Reporte". REALIA compila automáticamente el estado de obra, ventas y financiero.
4. **Previsualizá y enviá** — Verás el HTML del reporte antes de enviar. Confirmá y el reporte se envía por WhatsApp al número del inversor.
5. **Consultá el historial** — El historial de reportes enviados queda registrado con fecha y estado de envío.

### Permisos requeridos
Solo admins y gerentes pueden enviar reportes. La sección es de solo lectura para otros roles.

### Tips
- Asegurate de tener el avance de obra y las ventas actualizadas antes de enviar el reporte.

---

## 9. Inbox

### ¿Qué es?
Centro de mensajes unificado. Conversaciones entrantes de WhatsApp con respuesta asistida por IA.

### Casos de uso
- Ver y responder mensajes de leads en tiempo real
- Consultar el historial de conversaciones de un prospecto
- Dejar que la IA proponga respuestas automáticas
- Etiquetar conversaciones y asignarlas a vendedores

### Paso a paso
1. **Abrí el Inbox** — Desde el menú lateral, clic en "Inbox". Verás la lista de conversaciones activas.
2. **Seleccioná una conversación** — Clic en cualquier conversación para abrir el hilo de mensajes.
3. **Revisá la sugerencia de IA** — El campo de respuesta muestra una sugerencia generada por Claude. Podés editarla antes de enviar.
4. **Enviá la respuesta** — Presioná Enter o el botón de envío. El mensaje se entrega por WhatsApp al lead.
5. **Gestioná el lead** — Desde el panel derecho podés ver el perfil del lead, cambiar su temperatura y vincular la conversación a un proyecto.

### Permisos requeridos
Todos los roles tienen acceso al Inbox. Los vendedores solo ven conversaciones de sus leads asignados.

### Tips
- El Inbox actualiza automáticamente cada 1.5 segundos.
- Las conversaciones con mensajes sin leer aparecen resaltadas. El badge en el menú lateral muestra el total de no leídos.

---

## 10. Tools

### ¿Qué es?
Herramientas financieras para el mercado inmobiliario argentino: tipos de cambio ARS/USD y simulador de conversión.

### Casos de uso
- Consultar la cotización del dólar oficial, MEP y blue
- Simular conversiones entre ARS y USD
- Comparar resultados entre tipos de cambio

### Paso a paso
1. **Accedé a Tools** — Clic en "Tools" en el menú lateral. Las cotizaciones se cargan automáticamente.
2. **Consultá los tipos de cambio** — Verás las cards de Oficial, MEP y Blue con precios de compra, venta y spread.
3. **Usá el simulador** — Seleccioná la dirección (comprar USD / vender USD), el tipo de cambio y el monto.
4. **Compará entre tipos** — La tabla comparativa muestra el resultado con cada tipo de cambio simultáneamente.

### Permisos requeridos
Disponible para todos los roles.

### Tips
- Las cotizaciones se actualizan cada 5 minutos. Los datos tienen un lag de 1 día hábil — es normal.

---

## 11. Usuarios

### ¿Qué es?
Gestión de usuarios de la plataforma. Creá cuentas, asigná roles y controlá los permisos de acceso. *Solo visible para admin y superadmin.*

### Casos de uso
- Crear nuevos usuarios (vendedores, gerentes, lectores)
- Asignar y cambiar roles a usuarios existentes
- Desactivar cuentas de usuarios que ya no operan

### Paso a paso
1. **Accedé a Usuarios** — Clic en "Usuarios" en la sección inferior del menú lateral.
2. **Creá un usuario** — Clic en "+ Nuevo Usuario". Completá nombre, email, contraseña inicial y rol.
3. **Asigná el rol correcto** — Seleccioná: superadmin, admin, gerente, vendedor o lector.
4. **El usuario inicia sesión** — El nuevo usuario puede ingresar con las credenciales creadas y cambiar su contraseña desde el menú inferior.

### Permisos requeridos
Exclusivo para roles admin y superadmin.

### Tips
- Los superadmins tienen acceso a todas las organizaciones. Los admins gestionan su propia organización. Los gerentes acceden a todos los proyectos pero no pueden gestionar usuarios.

---

## Tabla de Roles y Permisos

| Rol | Proyectos | Ventas | Financiero | Inversores | Usuarios |
|-----|-----------|--------|------------|------------|----------|
| Superadmin | ✓ Todos | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ Org | ✓ | ✓ | ✓ | ✓ |
| Gerente | ✓ Todos | ✓ | ✓ | ✓ Ver | — |
| Vendedor | ✓ Ver | ✓ Propios | — | — | — |
| Lector | ✓ Ver | ✓ Ver | — | — | — |

---

## Glosario

| Término | Definición |
|---------|------------|
| **Lead** | Prospecto interesado en una o más unidades del proyecto. |
| **Cuota** | Pago pactado en el plan de pagos de una reserva, con fecha y monto definidos. |
| **Factura vinculada** | Factura de ingreso asociada al registro de pago de una cuota específica. |
| **Etapa de obra** | Fase del proceso constructivo con un peso porcentual en el avance total. |
| **Reserva** | Operación comercial que bloquea una unidad para un comprador con un plan de pagos. |
| **Plan de pagos** | Conjunto de cuotas acordadas para completar el pago de una unidad reservada. |
