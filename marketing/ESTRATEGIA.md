# Estrategia de Captación de Clientes — Realia

> Última actualización: 2026-03-11
> Estado: v1 — Plan inicial, pre-tracción

---

## Índice

1. [Contexto y Posicionamiento](#1-contexto-y-posicionamiento)
2. [ICP — Cliente Ideal](#2-icp--cliente-ideal)
3. [Canales de Captación](#3-canales-de-captación)
4. [Plan de 90 Días](#4-plan-de-90-días)
5. [Mensajes y Scripts](#5-mensajes-y-scripts)
6. [Táctica de Demo](#6-táctica-de-demo)
7. [Alianzas y Referidos](#7-alianzas-y-referidos)
8. [Contenido LinkedIn](#8-contenido-linkedin)
9. [Métricas](#9-métricas)
10. [Lo que NO hacer todavía](#10-lo-que-no-hacer-todavía)
11. [Issues del Landing a Corregir](#11-issues-del-landing-a-corregir)
12. [Notas y Aprendizajes](#12-notas-y-aprendizajes)

---

## 1. Contexto y Posicionamiento

### El mercado

| Dimensión | Dato |
|-----------|------|
| Mercado objetivo | Desarrolladoras inmobiliarias "en pozo" en Argentina |
| Tamaño estimado | ~500-1,000 desarrolladoras activas (AMBA + Córdoba + Rosario + Mendoza) |
| Valor promedio por unidad | USD 60,000–100,000 |
| Fuentes de leads del mercado | WhatsApp, Instagram, Zonaprop, Argenprop, Mercado Libre Inmuebles |
| Competencia directa | Leadnamics (CRM genérico para agencias) |
| Competencia indirecta | CRMs genéricos (HubSpot, Clientify), chatbots genéricos |

### El problema que resolvemos

Los desarrolladores pierden **30-60% de los leads** porque:

- El equipo comercial no responde fuera de horario (el 40% de las consultas llegan en ese momento)
- No hay seguimiento sistemático — los leads se enfrían
- La información del proyecto no está disponible 24/7
- Los compradores preguntan cada semana por avance de obra y nadie responde rápido

**Costo de no resolver esto:** Cada unidad no vendida = ~USD 80K de inventario parado.

### Nuestro posicionamiento

> **"El copiloto de IA para desarrolladoras inmobiliarias"**

No somos un chatbot genérico. No somos un CRM. Somos la plataforma que:

1. Responde leads 24/7 con información real del proyecto (RAG sobre documentos)
2. Califica automáticamente y hace handoff al vendedor en el momento justo
3. Mantiene informados a compradores e inversores sobre avance de obra
4. Centraliza reservas, pagos y financiero

### Diferenciadores clave

| Nosotros | La alternativa |
|----------|----------------|
| Nicho ultra-específico: solo "en pozo" | Genérico para cualquier inmobiliaria |
| Respuestas basadas en documentos reales (memoria, planos, precios) | Chatbot con respuestas predefinidas |
| WhatsApp nativo (donde están los leads) | Web-first, WhatsApp como add-on |
| Obra + inversores incluido | Solo CRM de leads |
| Setup en 48hs, sin contrato anual | Implementación de semanas, contratos anuales |

### Pricing actual

| Plan | USD/mes | Anual (-15%) | Proyectos |
|------|---------|--------------|-----------|
| Base | 349 | 297 | 1 |
| Pro | 599 | 509 | 2–5 |
| Studio | 1,100 | 935 | 6–15 |

**Add-ons:** Setup USD 400/proyecto (one-time), Plan Postventa USD 199/mes/proyecto.

**Value anchor:** Un coordinador + administrativo cuesta USD 1,200–2,000/mes. Realia arranca en USD 349.

---

## 2. ICP — Cliente Ideal

### Perfil primario

- **Tipo:** Desarrolladora inmobiliaria que vende unidades "en pozo"
- **Tamaño:** 1–5 proyectos activos simultáneos
- **Equipo comercial:** 2–5 vendedores
- **Unidades por proyecto:** 20–200
- **Geografía:** AMBA, Córdoba, Rosario (expandir después)
- **Facturación estimada:** USD 2M–20M/año en ventas

### Señales de que es buen fit

- [ ] Alto volumen de WhatsApp (>20 consultas/día)
- [ ] Equipo no puede responder fuera de horario
- [ ] Compradores preguntan por avance de obra semanalmente
- [ ] Gestionan reservas y pagos en Excel o grupos de WhatsApp
- [ ] Tienen inversores que esperan reportes periódicos

### Señales de que NO es buen fit

- Inmobiliarias de reventa sin desarrollos propios
- Desarrolladores con solo 1-2 unidades (ticket muy bajo)
- Empresas que ya tienen CRM enterprise implementado (Salesforce, etc.)

### Decisor

- **Cargo:** Dueño, socio gerente, o gerente comercial
- **Dónde encontrarlo:** LinkedIn, eventos inmobiliarios, Zonaprop (buscar quién publica)
- **Motivación:** No perder ventas, profesionalizar el proceso, diferenciarse

---

## 3. Canales de Captación

### Prioridad de canales (ordenados por ROI con bajo budget)

| # | Canal | Costo | Esfuerzo | Impacto esperado | Prioridad |
|---|-------|-------|----------|-------------------|-----------|
| 1 | **Outbound LinkedIn + WhatsApp** | $0 | Alto (10hs/sem) | Alto | 🔴 Crítico |
| 2 | **Contenido LinkedIn** | $0 | Medio (3hs/sem) | Medio-Alto | 🔴 Crítico |
| 3 | **Alianzas y referidos** | $0-100/ref | Bajo (2hs/sem) | Medio | 🟡 Importante |
| 4 | **Referidos de clientes** | $0 | Bajo | Alto (a partir mes 2) | 🟡 Importante |
| 5 | **Comunidades / grupos** | $0 | Bajo (1h/sem) | Bajo-Medio | 🟢 Nice to have |

### Canal 1: Outbound directo (LinkedIn + WhatsApp)

**Por qué es el #1:** El mercado es chico (~500-1000 empresas) y los decisores son accesibles. No necesitás que te encuentren — andá a buscarlos.

**Proceso:**

```
Lista de desarrolladoras
        ↓
Encontrar decisor en LinkedIn
        ↓
Connection request personalizado
        ↓
Mensaje de apertura (día +2)
        ↓
Follow-up WhatsApp con audio (día +5)
        ↓
Demo personalizada
        ↓
Prueba piloto gratuita (7 días)
        ↓
Cierre
```

**Lista de prospección: [`marketing/prospecting/prospecting_list.csv`](./prospecting/prospecting_list.csv)**
**Playbook de acciones: [`marketing/prospecting/PLAYBOOK.md`](./prospecting/PLAYBOOK.md)**

La lista tiene **102 desarrolladoras reales** investigadas desde Zonaprop, Argenprop, Google, Instagram, Mercado Libre y rankings del sector. Se clasifica en 3 segmentos:

| Segmento | Descripción | Cantidad | Acción |
|----------|-------------|----------|--------|
| **A - ICP ideal** | Múltiples proyectos en pozo, volumen alto, medianas | 11 | Contactar primero |
| **B - ICP probable** | 1-2 proyectos o segmento a validar | 85 | Contactar en semana 3-6 |
| **C - Enterprise** | Mega-desarrolladoras (cotizan en bolsa, operación multinacional) | 6 | Guardar para después |

**Cobertura geográfica:**

| Zona | Cantidad |
|------|----------|
| CABA | ~45 |
| GBA Norte | ~12 |
| GBA Sur | ~6 |
| GBA Oeste | ~5 |
| Rosario | ~6 |
| Córdoba | ~3 |
| Tucumán | ~3 |
| Mar del Plata | ~5 |
| Neuquén / Vaca Muerta | ~5 |
| Mendoza | ~3 |
| La Plata | ~5 |
| Otros | ~4 |

**Top 12 para contactar primero (Segmento A):**

1. **Lepore Propiedades** — CABA — 8+ emprendimientos en pozo simultáneos — Ideal Plan Studio
2. **Ocampo Propiedades** — CABA — 7+ emprendimientos, divisiones especializadas — Ideal Plan Studio
3. **Grupo Portland** — CABA/GBA — 3 proyectos grandes (117+96+355 dptos) — Ideal Plan Pro/Studio
4. **Spazios** — CABA/GBA — Se posiciona como "#1 de Buenos Aires". Financiación 30 años — Alto volumen
5. **Grupo Dinal** — Multi-ciudad — 30 años, 1350 unidades, 75 desarrollos — Multi-proyecto
6. **Grupo Edisur** — Córdoba — 20+ años, lanza 1 proyecto cada 30 días — Mega oportunidad interior
7. **Daimar Developers** — CABA — 500+ dptos entregados, 13 edificios, servicio integral
8. **ÁVITA Desarrollos** — Tucumán — 4 emprendimientos, foco ahorristas — Sin competencia tech
9. **Houser** — Rosario — 4+ proyectos, especializada en pozo — Mercado virgen
10. **STD Desarrollos** — GBA Norte — 110 dptos en Vicente López — Proyecto grande
11. **Gomez de Montanari** — CABA/GBA — 30+ años, múltiples proyectos, 120 cuotas
12. **Brody Friedman** — CABA — 200K m2 construidos, Quo Swim 89 dptos — Alta gama corredor norte

**Fuentes para seguir expandiendo la lista:**

1. **Zonaprop** → Filtrar "Emprendimientos" → Cada publicación muestra la desarrolladora
2. **Argenprop** → Misma búsqueda, filtrar "En Pozo"
3. **Mercado Libre Inmuebles** → Filtrar "A estrenar" / "En pozo"
4. **Google** → "desarrolladora inmobiliaria [zona] en pozo"
5. **Instagram** → Hashtags: #enpozo #emprendimientoinmobiliario #departamentosenpozo
6. **Registro IERIC** → ieric.org.ar — Base de constructoras registradas (Paseo Colón 823 PB, tel 4363-3800)
7. **Ranking ARQ (Clarín)** → Lista anual de mejores constructoras y desarrolladoras

**Campos del CSV:**

| Campo | Descripción |
|-------|-------------|
| `id` | Número secuencial |
| `desarrolladora` | Nombre de la empresa |
| `proyecto_activo` | Proyectos en pozo o construcción identificados |
| `zona` | Barrio o zona |
| `ciudad` | Ciudad |
| `provincia` | Provincia |
| `website` | Sitio web |
| `instagram` | Cuenta de Instagram |
| `fuente` | Dónde se encontró (Argenprop, Zonaprop, Google, Instagram, Ranking) |
| `segmento` | A (ICP ideal), B (probable), C (enterprise) |
| `estado` | Sin contactar / Contactado / Demo agendada / Demo hecha / Propuesta / Cliente / Descartado |
| `decisor` | Nombre del decisor (completar con LinkedIn) |
| `cargo` | Cargo del decisor |
| `linkedin` | URL del perfil de LinkedIn |
| `whatsapp` | Número de WhatsApp |
| `email` | Email de contacto |
| `notas` | Observaciones, contexto, señales de interés |

**Volumen semanal objetivo:**

- 50 connection requests en LinkedIn
- 20 mensajes de apertura
- 10 follow-ups por WhatsApp
- 4 demos agendadas

### Canal 2: Contenido LinkedIn

Ver [sección 8](#8-contenido-linkedin) para detalle de posts.

### Canal 3: Alianzas

Ver [sección 7](#7-alianzas-y-referidos) para detalle.

---

## 4. Plan de 90 Días

### Fase 1: Setup (Semanas 1-2)

**Stack de herramientas:** ver [`HERRAMIENTAS.md`](./HERRAMIENTAS.md) para el setup detallado de cada herramienta.
**Estructura de carpetas:** toda la organización de assets en [`HERRAMIENTAS.md` §6](./HERRAMIENTAS.md#6-estructura-de-carpetas).

- [x] Armar lista inicial de 35 desarrolladoras reales → `marketing/prospecting/prospecting_list.csv`
- [x] Expandir lista a 100+ → **102 desarrolladoras** de Zonaprop, Argenprop, Google, Instagram, Rankings ARQ
- [ ] Configurar stack de marketing (Cal.com, Loom, Canva, Plausible) → ver [`HERRAMIENTAS.md` §3](./HERRAMIENTAS.md#3-cuentas-a-crear--checklist-de-setup)
- [ ] Optimizar perfil personal de LinkedIn → ver [`linkedin/profile/README.md`](./linkedin/profile/README.md)
- [ ] Crear página de empresa en LinkedIn → ver [`linkedin/company-page/README.md`](./linkedin/company-page/README.md)
- [ ] Grabar video demo de 3 minutos (Loom) → ver [`videos/README.md`](./videos/README.md)
- [x] Preparar 1-pager PDF descargable → [`one-pager.html`](./one-pager.html) (imprimir como PDF)
- [ ] Corregir issues del landing (WhatsApp placeholder, form script)
- [ ] Configurar calendario de agendamiento (Cal.com) → ver [`HERRAMIENTAS.md` §2](./HERRAMIENTAS.md#calcom--agenda-de-demos)
- [ ] Preparar entorno de demo con proyecto de ejemplo cargado
  - **Script:** `python -m scripts.seed_demo_completo` (re-run con `--reset` para limpiar y re-crear)
  - **Proyecto ficticio:** "Edificio Maipú 1240" — 48 dptos, CABA, en pozo, entrega estimada Q4 2026
  - **Organization demo:** crear developer `Demo Desarrollos S.A.` (o usar el ya existente si hay uno de testing)
  - [ ] **Proyecto base**
    - [ ] Crear proyecto con nombre, descripción, dirección, foto de portada y fecha de entrega
    - [ ] Subir memoria descriptiva (PDF) — inventar o adaptar una real de ~5 páginas con ubicación, materiales, amenities
    - [ ] Subir lista de precios actualizada (PDF o CSV) — 48 unidades, 3 tipologías (1/2/3 ambientes), valores en USD
    - [ ] Subir planos de planta (PDF) — al menos planta tipo y planta baja
  - [ ] **Unidades**
    - [ ] Cargar las 48 unidades con planta, número, tipología, m², precio y orientación
    - [ ] Distribuir en 8 pisos (6 unidades/piso) para que la vista de grilla quede bien
    - [ ] Mezclar estados: ~30 disponibles, ~10 reservadas, ~5 vendidas, ~3 en negociación
  - [ ] **Leads (CRM)**
    - [ ] Cargar 15–20 leads con nombre, apellido, WhatsApp, email y estado (hot/warm/cold)
    - [ ] Asignar al menos 3 leads como "hot" con conversaciones activas en inbox
    - [ ] Incluir un lead con reserva ya hecha (para mostrar el flujo completo)
  - [ ] **Inbox / Conversaciones**
    - [ ] Crear al menos 3 conversaciones de WhatsApp simuladas con preguntas típicas:
      - "¿Cuánto sale un 2 ambientes?" → bot responde con precio del PDF
      - "¿Cuándo entregan?" → bot responde con fecha del proyecto
      - "¿Aceptan cuotas en pesos?" → bot responde con condiciones de financiación
    - [ ] Una conversación que haya sido escalada a vendedor (para mostrar el handoff)
  - [ ] **Reservas**
    - [ ] Crear 3–4 reservas en distintos estados (activa, convertida, cancelada)
    - [ ] Una reserva con plan de pagos completo: seña + X cuotas en USD + saldo al boleto
    - [ ] Registrar al menos 2 pagos realizados en el plan de pagos (para mostrar el historial)
    - [ ] Asociar factura a uno de los pagos (para mostrar el módulo de facturas)
  - [ ] **Obra**
    - [ ] Cargar 5–6 etapas de construcción (excavación, estructura, mampostería, etc.) con pesos y % avance
    - [ ] Dejar avance total en ~40% (proyecto "en marcha" creíble)
    - [ ] Registrar 2–3 pagos de obra a proveedores (módulo Pagos dentro de Obra)
  - [ ] **Financiero**
    - [ ] Cargar presupuesto total del proyecto
    - [ ] Ingresar 3–4 gastos reales (honorarios arquitecto, materiales, marketing)
    - [ ] Cargar 2–3 facturas (una de ingreso vinculada a pago de reserva, una de egreso)
    - [ ] Verificar que el flujo de caja muestre datos coherentes (ingresos vs egresos)
  - [ ] **Inversores**
    - [ ] Crear 2–3 inversores con nombre, email y % de participación
    - [ ] Generar un reporte de avance (aunque sea borrador) para mostrar el módulo
  - [ ] **Alertas**
    - [ ] Disparar al menos 1 alerta visible (ej: unidad sin actividad, lead sin seguimiento)
    - [ ] Verificar que el badge de alertas en el sidebar muestre número > 0
  - [ ] **Validación final**
    - [ ] Recorrer todos los módulos del proyecto y confirmar que no hay errores o pantallas vacías
    - [ ] Testear el bot de WhatsApp con 3 preguntas sobre el proyecto — verificar que responde con datos reales del PDF
    - [ ] Hacer el recorrido completo de la demo (sección 6) de principio a fin, cronometrar que dura ≤15 min
    - [ ] Tomar screenshots de cada módulo para el banco de imágenes de LinkedIn

### Fase 2: Outbound + Contenido (Semanas 3-6)

- [ ] Iniciar outbound: 50 connection requests/semana
- [ ] Publicar 3 posts/semana en LinkedIn
- [ ] Agendar 4+ demos/semana
- [ ] Cerrar 3 clientes piloto (plan Base o Pro)
- [ ] Documentar objeciones y respuestas

**Tracking semanal:**

| Semana | Requests | Conexiones | Demos | Propuestas | Cierres |
|--------|----------|------------|-------|------------|---------|
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |

### Fase 3: Case Studies + Alianzas (Semanas 7-10)

- [ ] Documentar resultados de los primeros clientes (métricas reales)
- [ ] Crear 1 case study publicable con nombre y datos del cliente
- [ ] Contactar 10 potenciales aliados (estudios de arq, brokers, escribanías)
- [ ] Ofrecer programa de referidos
- [ ] Usar case study en outbound para aumentar conversión

### Fase 4: Escalar (Semanas 11-12)

- [ ] Pedir referidos activamente a clientes satisfechos
- [ ] Evaluar si abrir canal de Instagram (orgánico)
- [ ] Publicar case study en LinkedIn como post largo
- [ ] Analizar unit economics y decidir si invertir en ads

**Targets acumulados:**

| Mes | Clientes | MRR (USD) |
|-----|----------|-----------|
| 1 | 3 | 1,050–1,800 |
| 2 | 6 | 2,100–3,600 |
| 3 | 10 | 3,500–6,000 |

---

## 5. Mensajes y Scripts

### LinkedIn — Connection Request

> Hola [Nombre], vi que están con [Nombre del proyecto] en [zona]. Trabajo con desarrolladoras en pozo ayudándolas a no perder leads fuera de horario. ¿Puedo compartirte algo?

### LinkedIn — Mensaje de apertura (día +2 post-conexión)

> Gracias por conectar, [Nombre]. Una pregunta rápida: ¿qué porcentaje de consultas de WhatsApp les llegan fuera de horario laboral?
>
> En los desarrolladores con los que trabajamos, es alrededor del 40%. Y la mayoría se pierden.
>
> Te muestro cómo lo resolvemos en 2 minutos si te interesa. ¿Te sirve un audio rápido por WhatsApp o preferís que te mande un video?

### WhatsApp — Follow-up con audio (día +5)

**Guión para audio de 40 segundos:**

> "Hola [Nombre], soy [tu nombre] de Realia. Vi que están con [proyecto] en [zona] y quería mostrarte algo rápido. Trabajamos con desarrolladoras que tenían el mismo problema: muchos leads entrando por WhatsApp, pero el equipo no llegaba a responder a todos, especialmente fuera de horario. Lo que hacemos es poner un agente de IA que responde 24/7 con la información real del proyecto — la memoria, los planos, los precios — y califica al lead antes de pasarlo al vendedor. Si querés, te armo una demo con TU proyecto en 20 minutos. ¿Te copa?"

### Manejo de objeciones

| Objeción | Respuesta |
|----------|-----------|
| "Ya tenemos un CRM" | "Perfecto, Realia no reemplaza tu CRM. Es la capa de atención 24/7 que le falta. Los leads llegan calificados al vendedor." |
| "No confío en que un bot hable con mis clientes" | "El bot solo responde con información de TUS documentos, nunca inventa. Y en cuanto el lead está caliente, lo pasa al vendedor. ¿Querés verlo en acción con tu proyecto?" |
| "Es caro" | "Un coordinador + administrativo te sale USD 1,200-2,000/mes. Realia arranca en 349 y no se enferma, no toma vacaciones, y responde a las 3AM." |
| "Quiero pensarlo" | "Entiendo. ¿Qué te parece si lo dejamos activo una semana con tu proyecto de prueba, sin compromiso? Si no ves valor, lo apagamos." |
| "No tenemos tanto volumen de leads" | "Justamente por eso es más crítico no perder ninguno. Si te entran 10 leads por semana y se te escapan 3, son 12 al mes. A USD 80K la unidad, es casi 1 millón de USD en pipeline." |

---

## 6. Táctica de Demo

### La demo irresistible (15 minutos)

El objetivo de la demo **no es mostrar el producto.** Es que el prospecto vea su propio proyecto funcionando con IA.

**Pre-demo (lo hacés antes de la call):**

1. Pedirle al prospecto el PDF del proyecto (memoria descriptiva, lista de precios, planos)
2. Cargarlo en Realia en el entorno de demo
3. Testear que el bot responda correctamente sobre su proyecto

**Durante la demo:**

| Minuto | Acción |
|--------|--------|
| 0-2 | "Contame: ¿cómo manejan hoy las consultas de WhatsApp?" (escuchar) |
| 2-5 | "Mirá, cargué tu proyecto ayer. Te voy a mandar un WhatsApp ahora como si fuera un lead." → Mandar mensaje al bot EN VIVO simulando un lead |
| 5-8 | Mostrar cómo el bot responde con info del proyecto, califica, y ofrece documentos |
| 8-10 | Mostrar la notificación al vendedor en Telegram + el panel de leads |
| 10-12 | Mostrar obra y notificaciones a compradores (si aplica) |
| 12-15 | "Esto estuvo listo en 20 minutos. ¿Querés que lo dejemos activo esta semana como prueba?" |

**Post-demo:**

- Mandar resumen por WhatsApp con link al calendario para siguiente paso
- Si dijo "sí" → activar piloto gratuito de 7 días
- Si dijo "lo pienso" → follow-up en 3 días con un dato relevante

---

## 7. Alianzas y Referidos

### Aliados estratégicos

Los desarrolladores confían en su ecosistema. Llegamos a través de quienes ya les venden:

| Tipo de aliado | Por qué funciona | Cantidad objetivo |
|----------------|------------------|-------------------|
| **Estudios de arquitectura** | Diseñan los edificios, conocen a todos los desarrolladores | 3-5 |
| **Brokers de portales** (Zonaprop, Argenprop) | Relación directa con área comercial | 2-3 |
| **Escribanías inmobiliarias** | Hacen reservas y boletos | 2-3 |
| **Martilleros públicos** | Muchos trabajan exclusivamente con desarrolladoras | 2-3 |
| **Contadores especializados en real estate** | Manejan el financiero de las desarrolladoras | 1-2 |

### Propuesta para aliados

> "Por cada desarrolladora que nos refieras y se convierta en cliente, te damos:
> - **El primer mes gratis** para el cliente (les facilita la decisión)
> - **USD 100** por cada referido que cierre
> - **Acceso a nuestro panel** para que veas el estado de tus referidos"

### Programa de referidos para clientes

A partir del mes 2, cuando haya clientes satisfechos:

> "Si nos referís a otra desarrolladora y se suma, te damos **un mes gratis** de tu plan."

---

## 8. Contenido LinkedIn

### Estrategia: 3 posts/semana

| Día | Tipo de post | Objetivo |
|-----|-------------|----------|
| **Lunes** | Storytelling / Problema | Generar awareness del dolor |
| **Miércoles** | Dato + Insight | Posicionar como experto |
| **Viernes** | Demo / Screenshot / Caso | Mostrar el producto en acción |

### Banco de ideas para posts

#### Storytelling / Problema

1. "Ayer un desarrollador me contó que perdió un lead de USD 95K porque nadie respondió el WhatsApp un sábado a las 11AM. No es raro — es lo normal."
2. "El lead que consultó a las 22:00: historia de cómo un comprador calificado terminó comprando en otro desarrollo porque nadie le respondió."
3. "Le pregunté a 10 desarrolladores: '¿Cuánto tardás en responder un WhatsApp nuevo?' La respuesta promedio fue 4 horas. El lead ya habló con 3 competidores."
4. "Tu mejor vendedor se fue de vacaciones 2 semanas. ¿Quién responde los leads?"
5. "Un grupo de WhatsApp con 40 compradores preguntando '¿Cuándo terminan el piso 5?' todos los lunes. Sound familiar?"

#### Dato + Insight

6. "El 40% de las consultas inmobiliarias llegan fuera de horario. ¿Qué pasa con esos leads en tu desarrollo?"
7. "Un estudio de Harvard dice que si respondés en los primeros 5 minutos, tenés 21x más chances de calificar el lead. En real estate, el promedio es 4 horas."
8. "Precio promedio de una unidad en pozo en CABA: USD 80K. Si perdés 2 leads al mes, son USD 160K/mes en pipeline perdido."
9. "El 70% de los compradores en pozo elige al desarrollador que responde primero, no al que tiene el mejor proyecto."
10. "¿Cuánto le cuesta a tu desarrollo un lead perdido? Si vendés a USD 80K y tu margen es 25%, cada lead perdido son USD 20K de ganancia evaporada."

#### Demo / Screenshot / Caso

11. Screenshot de una conversación del bot respondiendo a las 2AM con info precisa del proyecto.
12. Video de 30 segundos: "Así responde Realia a un lead a las 3 de la mañana."
13. Antes vs después: captura de grupo de WhatsApp caótico vs panel de Realia organizado.
14. "Un cliente pasó de responder en 4 horas promedio a 30 segundos. En 2 semanas vendió 3 unidades más."
15. Carousel: "5 cosas que tu equipo comercial no debería hacer manualmente en 2026."

### Formato técnico

- **Texto + imagen o carousel** (nunca poner links en el post — LinkedIn los penaliza)
- **Link en el primer comentario** si querés dirigir al landing
- **Usar emojis con moderación** (máximo 2-3 por post)
- **Cerrar siempre con pregunta** para generar engagement
- **Tagear personas** cuando sea relevante (aliados, clientes)

---

## 9. Métricas

### KPIs semanales

| Métrica | Target Sem 3-6 | Target Sem 7-12 |
|---------|-----------------|-----------------|
| Connection requests enviados | 50 | 30 |
| Conexiones aceptadas | 15-20 | 10-15 |
| Conversaciones iniciadas | 20 | 15 |
| Demos agendadas | 4 | 3 |
| Demos realizadas | 3 | 3 |
| Propuestas enviadas | 2 | 2 |
| Cierres | 1 | 1 |

### KPIs mensuales

| Métrica | Mes 1 | Mes 2 | Mes 3 |
|---------|-------|-------|-------|
| Clientes nuevos | 3 | 3 | 4 |
| Clientes acumulados | 3 | 6 | 10 |
| MRR (USD) | 1,050–1,800 | 2,100–3,600 | 3,500–6,000 |
| Churn | 0 | 0 | ≤1 |
| NPS / satisfacción | Medir | >8 | >8 |

### Funnel de conversión esperado

```
Impresiones LinkedIn (orgánico)     ~2,000/semana
        ↓ (~3%)
Visitas al perfil                   ~60/semana
        ↓
Connection requests aceptados       15-20/semana
        ↓ (~20%)
Conversaciones reales               4-5/semana
        ↓ (~75%)
Demos                               3-4/semana
        ↓ (~25-33%)
Cierres                             1/semana
```

---

## 10. Lo que NO hacer todavía

| Canal / Táctica | Por qué no ahora | Cuándo sí |
|-----------------|-------------------|-----------|
| **Google Ads** | CPC alto, mercado chico, outbound directo es más eficiente | Cuando tengas 15+ clientes y quieras leads inbound |
| **Instagram/Facebook Ads** | Tu buyer no busca software en IG | Cuando tengas contenido visual fuerte y case studies |
| **SEO / Blog** | Tarda 6+ meses en dar resultados, mercado es <1,000 empresas | Cuando quieras posicionarte como thought leader |
| **Eventos / Ferias** | Caros (stand + viáticos), bajo ROI sin brand recognition | Con 10+ clientes y case studies para mostrar |
| **Revenue share model** | Complica el pricing, el cliente no tiene incentivo a derivar leads si "le cobran por venta" | Solo para enterprise o clientes que no quieren pagar mensual |
| **Expansión geográfica** | Foco en Argentina hasta tener product-market fit claro | Con 20+ clientes en Argentina, evaluar Chile/Uruguay/Colombia |
| **Hiring vendedor** | No hay volumen para justificarlo | Con MRR > USD 5,000 y proceso de venta documentado |

---

## 11. Issues del Landing a Corregir

- [ ] **WhatsApp CTA roto:** El número es placeholder (`5491100000000`). Reemplazar con número real
- [ ] **Form de demo roto:** Google Apps Script tiene `YOUR_SCRIPT_ID`. Configurar endpoint real
- [ ] **OG Image:** Verificar que `https://www.realia.lat/og-image.svg` existe y se ve bien al compartir
- [ ] **Facebook domain verification:** Verificar que el meta tag está configurado correctamente
- [ ] **Analytics:** Agregar Google Analytics o Plausible para medir tráfico y conversiones
- [ ] **Pixel de conversión:** Configurar evento en el form de demo para medir costo por lead (futuro)

---

## 12. Notas y Aprendizajes

> Esta sección se va llenando con aprendizajes del campo.

### Template para registro semanal

```
### Semana [X] — [Fecha]

**Outbound:**
- Requests enviados:
- Conexiones:
- Demos:
- Cierres:

**Contenido:**
- Posts publicados:
- Mejor post (impresiones):
- Engagement promedio:

**Aprendizajes:**
-
-

**Objeciones nuevas:**
-

**Ajustes para próxima semana:**
-
```

---

*Este documento es un work in progress. Se actualiza semanalmente con datos reales del campo.*
