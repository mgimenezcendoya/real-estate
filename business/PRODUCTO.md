# Realia — Contexto del Proyecto

## 1. Qué es Realia

Plataforma de inteligencia artificial para **desarrolladoras inmobiliarias de Argentina** que venden proyectos "en pozo" (pre-construcción). Automatiza captación, calificación y seguimiento de leads vía WhatsApp, responde preguntas sobre documentos del proyecto usando RAG, y mantiene a compradores informados sobre avance de obra.

### Problema

Las desarrolladoras pierden entre el 30-60% de sus leads porque:
- El equipo de ventas no responde fuera del horario laboral
- No hay seguimiento sistemático
- No tienen información instantánea del proyecto disponible 24/7

Cada unidad no vendida representa **$60.000–$100.000 USD** de inventario inmovilizado.

### Modelo de negocio

**Revenue share:** 1.5% sobre el precio de venta de cada unidad vendida que haya tenido contacto con el agente. Sin costo fijo para la desarrolladora.

### Competidor principal

**Leadnamics** (Argentina) — apunta a inmobiliarias genéricas con modelo SaaS. Realia se diferencia por verticalización en pozo, revenue share, y RAG profundo sobre documentación del proyecto.

---

## 2. Contexto de Mercado

| Atributo | Valor |
|---|---|
| País | Argentina |
| Nicho | Desarrolladoras que venden unidades en pozo |
| Cliente típico | 1-3 proyectos activos, 50-200 unidades/proyecto, 2-5 vendedores |
| Ticket promedio | $60.000–$100.000 USD |
| Canales de leads | WhatsApp, Instagram, Zonaprop, Argenprop |
| Dolor principal | Pérdida de leads por respuesta lenta fuera del horario laboral |

---

## 3. Stack Técnico

> Detalle completo de costos, planes y análisis de migración en [INFRAESTRUCTURA.md](./INFRAESTRUCTURA.md)

| Capa | Tecnología | Dev (actual) | Producción (objetivo) |
|---|---|---|---|
| Backend | Python + FastAPI | Render free → migrar a Railway | Railway Hobby/Pro |
| Panel admin | Next.js 16 + shadcn/ui v3 | Render free → migrar a Railway | Railway (o Vercel Pro si necesita CDN) |
| Landing page | HTML estático | Vercel free | Vercel (CDN global, se mantiene) |
| Base de datos | PostgreSQL + pgvector | Neon free → migrar a Railway | Railway (plugin con pgvector) |
| File storage | S3-compatible (Supabase Storage) | Supabase free tier | Supabase / Cloudflare R2 |
| AI / LLM | Claude Haiku 4.5 (Anthropic) | API pay-per-use | API pay-per-use |
| Audio transcription | OpenAI Whisper API | API pay-per-use | API pay-per-use |
| WhatsApp | Twilio Sandbox (dev) / Meta Cloud API (prod) | Twilio sandbox | Meta Cloud API |
| Notificaciones handoff | Telegram Bot API | Free | Free |
| Background jobs | Cron → endpoints internos | Render cron → Railway cron | Railway cron |

### Estrategia de deploy

La app se configura 100% por variables de entorno (`DATABASE_URL`, API keys, etc.). No tiene dependencias en la plataforma de hosting. **Migrar = cambiar env vars + redeploy.**

**Entorno de desarrollo actual (gratis):**
- **Render free** para backend FastAPI + panel admin Next.js (spin-down a los 15min, cold start ~60s)
- **Neon free** para PostgreSQL + pgvector (0.5GB, auto-suspend a los 5min)
- **Vercel free** para landing page (HTML estático, CDN global)
- **ngrok** + FastAPI local para desarrollo rápido (iteración sin deploys)
- **Twilio WhatsApp Sandbox** para mensajería
- **Supabase Storage** para S3 — 1GB gratis

**Entorno objetivo (Railway + Vercel, $5/mes):**
- **Railway Hobby** para backend + panel admin + PostgreSQL con pgvector — always-on, sin cold starts, networking interno
- **Vercel free** se mantiene para landing page (no hay razón para moverla)
- Migración: `pg_dump` desde Neon → `pg_restore` en Railway, redeploy back + panel admin

**Entorno de producción (cuando hay cliente validado):**
- **Railway Hobby/Pro** para back, panel admin, DB, workers
- **Vercel** para landing page
- **Meta Cloud API** para WhatsApp producción

---

## 4. Arquitectura General

### Arquitectura de aplicacion

```mermaid
flowchart TD
    WA["WhatsApp Cloud API"] -->|webhook| WH["Webhook Handler\n(FastAPI)"]

    WH --> RR{"Role Router"}
    DB_AUTH[("authorized_numbers")] -.->|lookup| RR

    RR -->|no autorizado| LM["LEAD MODE"]
    RR -->|autorizado + activo| DM["DEVELOPER MODE"]

    DM --> DM_AUDIO["Audio - Whisper\nstructured update"]
    DM --> DM_PDF["PDF - clasificacion\nconversacional - S3 - RAG"]
    DM --> DM_TEXT["Texto - obra\nconfig / query"]

    LM --> HO{"Handoff activo?"}
    HO -->|Si| CW_FWD["Reenviar a Chatwoot\nvia API"]
    HO -->|No| SM["Session Manager"]

    PG[("PostgreSQL\nRealia")] -.-> SM
    S3[("S3 Bucket\nCloudflare R2")] -.-> RAG
    SM --> IC["Intent Classifier\n(Claude)"]

    IC --> RAG["RAG Engine\n(pgvector)"]
    IC --> LF["Lead Flow\n(calificacion)"]
    IC --> DOC_REQ["Pedido de documento"]

    RAG --> CLAUDE["Claude 3.5 Sonnet\n(genera respuesta)"]
    LF --> CLAUDE
    DOC_REQ --> SEND_DOC["Busca doc en DB\nenvia PDF via WA API"]

    CLAUDE --> RESP["Respuesta texto\nal lead via WA API"]
    CLAUDE --> HT["Handoff trigger"]

    HT --> CW_API["Crea conversacion\nen Chatwoot via API"]

    CW_FWD --> CW
    CW_API --> CW

    subgraph chatwoot_box ["Chatwoot (self-hosted)"]
        CW["Inbox ventas"]
        CW_PG[("PostgreSQL\nChatwoot")]
    end

    CW -->|webhook cierre/msgs| WH

    subgraph nocodb_box ["NocoDB (self-hosted)"]
        NOCO["Panel de gestion"]
    end
    NOCO -.->|lee/escribe directo| PG
    NOCO -.->|attachments| S3
    NOCO -->|webhook on change| WH
```

### Infraestructura — Desarrollo (gratis, Fases 0-3)

```mermaid
flowchart LR
    subgraph render ["Render (free tier)"]
        SVC_REALIA["Realia\n(FastAPI)"]
    end

    subgraph neon ["Neon (free tier)"]
        PG_REALIA[("PostgreSQL\n+ pgvector")]
    end

    subgraph external ["Servicios externos"]
        S3["Cloudflare R2\n(free tier)"]
        WA["WhatsApp\nCloud API"]
        ANTHROPIC["Anthropic\n(Claude)"]
        OPENAI["OpenAI\n(Whisper + embeddings)"]
    end

    SVC_REALIA --> PG_REALIA
    SVC_REALIA --> S3
    SVC_REALIA --> WA
    SVC_REALIA --> ANTHROPIC
    SVC_REALIA --> OPENAI
```

### Infraestructura — Producción (Railway, Fases 4+)

```mermaid
flowchart LR
    subgraph railway ["Railway"]
        PG_REALIA[("PostgreSQL\nRealia + NocoDB")]
        PG_CW[("PostgreSQL\nChatwoot")]
        SVC_REALIA["Realia\n(FastAPI)"]
        SVC_NOCO["NocoDB"]
        SVC_CW["Chatwoot"]
    end

    subgraph external ["Servicios externos"]
        S3["Cloudflare R2\n(S3 storage)"]
        WA["WhatsApp\nCloud API"]
        ANTHROPIC["Anthropic\n(Claude)"]
        OPENAI["OpenAI\n(Whisper + embeddings)"]
    end

    SVC_REALIA --> PG_REALIA
    SVC_NOCO --> PG_REALIA
    SVC_CW --> PG_CW

    SVC_REALIA --> S3
    SVC_NOCO --> S3
    SVC_REALIA --> WA
    SVC_CW --> WA
    SVC_REALIA --> ANTHROPIC
    SVC_REALIA --> OPENAI

    SVC_REALIA <-->|API + webhooks| SVC_CW
    SVC_NOCO -->|webhooks| SVC_REALIA
```

**Migración dev → prod:** `pg_dump` desde Neon → `pg_restore` en Railway. Cambiar `DATABASE_URL` y demás env vars. Redeploy. La app no cambia.

**Nota sobre las bases de datos (producción):** Realia y NocoDB comparten la misma instancia de PostgreSQL porque NocoDB se conecta como cliente a nuestra base existente. Chatwoot tiene su propia instancia porque maneja 80+ tablas internas. Comunicación entre Realia y Chatwoot es por API y webhooks, no por DB compartida.

### Webhook endpoints en Realia (FastAPI)

| Endpoint | Origen | Eventos |
|---|---|---|
| `POST /whatsapp/webhook` | WhatsApp Cloud API | Mensajes entrantes de leads y developers |
| `GET /whatsapp/webhook` | WhatsApp Cloud API | Verificacion del webhook (hub.challenge) |
| `POST /chatwoot/webhook` | Chatwoot | `message_created` (vendedor responde → forward a WA), `conversation_resolved` (cierra handoff) |
| `POST /nocodb/webhook` | NocoDB | Record insert/update (nuevo doc → ingesta RAG, cambio config → invalidar cache) |

---

## 5. Módulos del Producto (V1)

### Flujo completo del mensaje (vista simplificada)

```mermaid
flowchart LR
    MSG["Mensaje entrante\n(WhatsApp)"] --> RR{"Role Router"}

    RR -->|Lead| HO{"Handoff\nactivo?"}
    HO -->|Si| CW["Chatwoot\nrelay a vendedor"]
    HO -->|No| AI["Agente IA\nRAG + calificacion"]
    AI -->|Respuesta| WA_OUT["WhatsApp\nrespuesta al lead"]
    AI -->|Trigger handoff| CW

    RR -->|Developer| AUTH{"Status\nactive?"}
    AUTH -->|No| PENDING["Flujo activacion\ncodigo 6 digitos"]
    AUTH -->|Si| PERM{"Permisos\npor rol"}
    PERM --> DEV_ACTION["Procesar accion\naudio/PDF/texto/hito"]
    DEV_ACTION -->|Confirmacion| WA_DEV["WhatsApp\nrespuesta al developer"]
```

### Modulo 1: Gestion de documentos y RAG

#### Storage compartido (S3)

Todos los archivos (PDFs, fotos, planos) se guardan en un bucket S3-compatible (Cloudflare R2 o AWS S3) que es accesible por todas las herramientas:
- **Realia** lee y escribe archivos (ingesta desde WhatsApp, envio a leads)
- **NocoDB** muestra los archivos con preview (configurado para usar el mismo S3)
- **RAG pipeline** descarga de S3 para extraer texto y generar embeddings

Da igual por donde entra un archivo: termina en S3, aparece en NocoDB, y queda disponible para el agente.

#### Canales de ingesta de documentos

Los documentos pueden entrar por dos caminos:

**Canal 1 — Developer envia por WhatsApp (campo):**

El developer manda un PDF o foto al numero del proyecto. El agente necesita saber donde guardarlo, asi que inicia un flujo de clasificacion conversacional:

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant WA as WhatsApp
    participant Agent as Agente Realia
    participant S3 as S3 Storage
    participant DB as PostgreSQL
    participant RAG as RAG Pipeline

    Dev->>WA: Envia PDF
    WA->>Agent: Webhook con media_id
    Agent->>Dev: A que proyecto corresponde este documento?
    Dev->>Agent: Torres del Parque
    Agent->>Dev: Que tipo de documento es?<br>1. Plano<br>2. Lista de precios<br>3. Memoria descriptiva<br>4. Reglamento<br>5. Contrato<br>6. Cronograma<br>7. FAQ<br>8. Otro
    Dev->>Agent: 1
    Agent->>Dev: Es un plano general o de una unidad especifica?
    Dev->>Agent: Unidad 4B piso 4
    Agent->>Dev: Confirmo: Plano de unidad 4B piso 4<br>Proyecto Torres del Parque. Correcto?
    Dev->>Agent: Si
    Agent->>WA: Descarga archivo via Media API
    Agent->>S3: Sube archivo a s3://docs/torres-del-parque/planos/4B_piso4_v2.pdf
    Agent->>DB: INSERT en documents + metadata (project, type, unit, floor)
    Agent->>RAG: Extrae texto, chunkea, genera embeddings
    Agent->>Dev: Documento guardado. El agente ya puede responder preguntas sobre este plano.
```

**Canal 2 — Admin sube desde NocoDB (oficina):**

El admin abre NocoDB, va a la tabla `documents`, crea un registro nuevo:
- Selecciona el proyecto (dropdown con relacion a `projects`)
- Selecciona el tipo de documento (dropdown)
- Completa metadata: unidad, piso (si aplica)
- Sube el archivo en el campo Attachment
- NocoDB guarda en S3 y dispara webhook a Realia API
- Realia ejecuta el pipeline RAG automaticamente

La tabla `documents` en NocoDB funciona como un file manager organizado por proyecto:

```
Torres del Parque/
  planos/
    4B_piso4_v2.pdf (activo)
    4B_piso4_v1.pdf (inactivo - version anterior)
    2A_piso2_v1.pdf (activo)
  precios/
    lista_precios_feb2026.pdf (activo)
    lista_precios_ene2026.pdf (inactivo)
  memoria/
    memoria_descriptiva_v3.pdf (activo)
  reglamento/
    reglamento_copropiedad.pdf (activo)
```

Esta organizacion no son carpetas fisicas en S3 sino la vista filtrada en NocoDB por `project_id` + `doc_type`. El admin lo ve ordenado y puede buscar, filtrar, y navegar facilmente.

#### Flujo de envio de documentos al lead

Cuando un lead pide un documento, el agente no solo responde con informacion del RAG sino que puede enviar el archivo directamente:

```mermaid
sequenceDiagram
    participant Lead
    participant Agent as Agente Realia
    participant DB as PostgreSQL
    participant S3 as S3 Storage
    participant WA as WhatsApp API

    Lead->>Agent: Me podes mandar los planos del 4B?
    Agent->>DB: SELECT * FROM documents WHERE project_id=X AND doc_type='plano' AND metadata->>'unit'='4B' AND is_active=TRUE
    DB->>Agent: plano_4B_piso4_v2.pdf, file_url=s3://...
    Agent->>S3: Genera URL pre-firmada (o descarga)
    Agent->>WA: Envia documento via WhatsApp Media API
    WA->>Lead: Recibe el PDF en el chat
    Agent->>Lead: Ahi te mande el plano de la unidad 4B piso 4. Tene en cuenta que es la version vigente. Queres que te explique algo del plano?
```

Cuando la consulta es ambigua, el agente guia al lead:

```
Lead: "Me podes mandar los planos?"
Agente: "Tenemos planos de varias unidades. Cual te interesa?
         - 2A (piso 2, 2 amb)
         - 4B (piso 4, 3 amb)
         - 7D (piso 7, 2 amb)
         O si preferis te puedo mandar el plano general del edificio."
Lead: "El 4B"
Agente: [envia PDF]
```

Si el lead pregunta por un proyecto distinto al que esta asociado en su sesion:
```
Lead: "Tenes planos de Manzanares 2088?"
Agente: "Estamos chateando sobre Torres del Parque. Queres que te pase
         con alguien del equipo de Manzanares 2088?"
```

#### Documentos que ingesta

- Memoria descriptiva (PDF)
- Planos por unidad (PDF con metadata de unidad, piso, metraje)
- Plano general del edificio
- Reglamento de copropiedad
- Contrato de fideicomiso tipo
- Cronograma de obra
- Lista de precios (actualizable)
- FAQs internas del equipo de ventas
- Fotos de avance de obra

#### Comportamiento del RAG

- Chunkeo semantico por tipo de documento
- Embeddings almacenados en pgvector con metadata: `project_id`, `doc_type`, `version`, `is_active`, `unit`, `floor`
- Filtrado por `project_id` antes de busqueda vectorial
- Versionado: nueva version del mismo doc_type+unit -> anterior queda `is_active = false`
- Archivos originales en S3 con URL en tabla `documents` para envio directo via WhatsApp

### Módulo 2: Agente WhatsApp — Modo Lead (externo)

El agente mantiene un **tono profesional**: cordial pero sin chistes, "jaja" ni juego con el usuario; respuestas concisas para ahorrar tokens y mantener credibilidad. Si el lead hace un comentario gracioso o provocador, se redirige con cortesía al tema (proyecto, visita, datos a recopilar). El prompt en `app/modules/agent/prompts.py` (LEAD_SYSTEM_PROMPT) define estas reglas.

**Flujo de un lead nuevo:**
1. Lead escribe al WhatsApp de la desarrolladora
2. Webhook recibe → identifica usuario por teléfono
3. Role Router: número NO está en `authorized_numbers` → Modo Lead
4. Nuevo → crea sesión + registro en `leads`
5. Clasifica intención (consulta proyecto, precio, financiamiento, visita, etc.)
6. Consulta RAG si la pregunta lo requiere
7. Claude genera respuesta con contexto RAG + historial
8. Envía por WhatsApp Cloud API
9. Calificación progresiva:
   - ¿Inversión o vivienda propia?
   - ¿Timeline de compra?
   - ¿Financiamiento propio o necesita plan de pagos?
10. Scoring → `hot`, `warm`, `cold`
11. `hot` → alerta WhatsApp al vendedor asignado + resumen del lead
12. `warm`/`cold` → nurturing automático (cada 7 días)

### Módulo 3: Agente WhatsApp — Modo Developer (interno)

El equipo de la desarrolladora (obra, ventas, dirección) interactúa con el agente vía WhatsApp para administrar el proyecto sin necesidad de dashboard. El developer usa su número personal de WhatsApp para enviar mensajes al número del proyecto (que es el número de la API).

#### Autenticación y seguridad

El sistema usa 3 capas de seguridad para validar que quien habla en Modo Developer es quien dice ser:

**Capa 1 — Número pre-registrado (gate principal):**
La tabla `authorized_numbers` es la fuente de verdad. Si el número del remitente no está en esa tabla con `status = 'active'`, el mensaje se rutea a Modo Lead. Los números de WhatsApp son difíciles de spoofear porque están atados a la SIM y verificados por Meta.

**Capa 2 — Código de activación one-time (onboarding):**
Cuando un admin agrega un nuevo número autorizado, el sistema genera un código de 6 dígitos y lo envía por WhatsApp al número invitado. La persona debe responder con el código para activar su acceso. Esto previene que un admin registre un número equivocado y alguien reciba acceso sin querer.

Flujo de onboarding:

```mermaid
sequenceDiagram
    participant Admin
    participant Realia
    participant DB as PostgreSQL
    participant WA as WhatsApp API
    participant Juan

    Admin->>Realia: Agrega a Juan +54 11 2222-2222 como obra
    Realia->>DB: INSERT authorized_numbers status=pending code=847291
    Realia->>WA: Enviar mensaje a +54 11 2222-2222
    WA->>Juan: Invitacion como encargado de obra. Codigo 847291
    Realia->>Admin: Invitacion enviada a Juan

    Juan->>WA: 847291
    WA->>Realia: Webhook mensaje de Juan
    Realia->>DB: UPDATE status=active
    Realia->>WA: Enviar confirmacion
    WA->>Juan: Acceso activado. Ya podes operar como encargado de obra.
```

**Capa 3 — Permisos por rol:**
No todos los números autorizados pueden hacer todo. Cada rol tiene un scope de operaciones permitidas.

| Rol | Puede hacer | No puede hacer |
|---|---|---|
| `admin` | Todo: docs, precios, obra, hitos, leads, config, invitar usuarios | — |
| `obra` | Updates de obra, hitos, fotos de avance | Tocar precios, docs comerciales, config |
| `ventas` | Ver resumen de leads, marcar leads como contactados, consultar info del proyecto | Modificar obra, docs, precios |

Si alguien con rol `obra` intenta subir una lista de precios, el agente responde: *"No tenés permisos para actualizar precios. Pedile al admin del proyecto que lo haga."*

#### Capacidades

| Accion | Input del developer | Procesamiento | Roles |
|---|---|---|---|
| Update de obra | Audio: "Terminamos la losa del piso 6, avance al 45%" | Whisper transcribe - Claude extrae etapa, porcentaje, nota - crea `obra_update` - pide confirmacion | admin, obra |
| Subir documento | Envia PDF por WhatsApp | Flujo de clasificacion conversacional (ver abajo) - sube a S3 - ingesta RAG - confirma | admin |
| Actualizar precios | Envia PDF/imagen con lista nueva | Clasifica como "precios" - versiona anterior - ingesta nueva - confirma | admin |
| Consultar leads | "Cuantos leads hot tengo esta semana?" | Query a DB - responde con resumen | admin, ventas |
| Marcar hito | "Marca hito: estructura terminada piso 8" | Crea registro de hito - opcionalmente dispara notificacion a compradores | admin, obra |
| Fotos de avance | Envia fotos por WhatsApp | Descarga - sube a S3 - asocia a `obra_update` del periodo actual | admin, obra |
| Invitar usuario | "Agrega a +54... como obra" | Genera invitacion con codigo de activacion | admin |

#### Flujo de clasificacion de documentos (WhatsApp)

Cuando un developer envia un archivo por WhatsApp sin contexto, el agente NO lo guarda directamente. Inicia un flujo conversacional para clasificarlo correctamente:

1. **Proyecto**: Si el developer tiene acceso a multiples proyectos, el agente pregunta a cual corresponde. Si solo tiene uno, lo asume.
2. **Tipo de documento**: El agente ofrece opciones (plano, precios, memoria, reglamento, contrato, cronograma, FAQ, otro).
3. **Metadata especifica**: Segun el tipo:
   - **Plano**: general o de unidad especifica? Si es de unidad: cual? (ej: 4B piso 4)
   - **Precios**: reemplaza la lista vigente? (activa versionado automatico)
   - **Foto de obra**: a que etapa/piso corresponde?
4. **Confirmacion**: El agente muestra un resumen y pide OK antes de persistir.

Si el developer envia el archivo CON contexto en el mismo mensaje (ej: "Aca va el plano del 4B piso 4 de Torres del Parque"), Claude extrae la metadata automaticamente y solo pide confirmacion:

```
Developer: [PDF] "Plano actualizado del 4B piso 4 Torres del Parque"
Agente: "Registre: Plano de unidad 4B piso 4 - Torres del Parque.
         Reemplaza la version anterior. Confirmo?"
Developer: "Si"
Agente: "Guardado. El agente ya puede responder sobre este plano y
         enviarselo a leads que lo pidan."
```
| Invitar usuario | "Agregá a +54... como obra" | Genera invitación con código de activación | admin |

#### Flujo de confirmación

El agente siempre pide confirmación antes de persistir cambios críticos (nuevo precio, hito de obra, documento que reemplaza versión anterior). Ejemplo:
```
Developer: [audio] "Avance de obra: terminamos cerramientos del piso 4, estamos al 60%"
Agente: "Registré: Cerramientos - Piso 4 - 60% avance. ¿Confirmo este update?"
Developer: "Si"
Agente: "Listo, update registrado. ¿Querés que notifique a los compradores de unidades del piso 4?"
```

#### Revocación de acceso

Un admin puede revocar acceso en cualquier momento:
```
Admin: "Eliminá el acceso de +54 11 2222-2222"
Agente: "Desactivé el acceso de Juan (obra). ¿Confirmo?"
Admin: "Si"
```
El registro pasa a `status = 'revoked'` y los mensajes futuros de ese número entran como Modo Lead.

### Módulo 4: Seguimiento de obra

**Compradores post-firma:**
- Actualizaciones mensuales personalizadas por WhatsApp
- Incluye nombre, unidad, piso, avance específico de etapa
- Updates cargados por el equipo de obra vía WhatsApp (Modo Developer)

**Leads activos:**
- El agente cita avance de obra como argumento de venta

**Hitos de obra:**
- Eventos discretos (ej: "estructura terminada", "inicio de cerramientos") registrados por el developer
- Pueden disparar notificaciones automáticas a compradores relevantes

### Módulo 5: Human-in-the-Loop (Handoff via Chatwoot)

Cuando la conversación requiere intervención humana, el agente transfiere el chat a un vendedor **sin que el lead cambie de número ni de conversación**. El vendedor responde desde **Chatwoot** (inbox compartido) en vez de por WhatsApp directo, lo que le permite manejar múltiples conversaciones en paralelo con una UI adecuada.

**Por qué Chatwoot y no relay por WhatsApp:** manejar múltiples conversaciones en paralelo dentro de un solo chat de WhatsApp (vía comandos como `@nombre`, `FIN`, `TOMAR`) es confuso y propenso a errores. Un vendedor necesita ver cada conversación por separado, con historial, notas, y contexto. Eso es un inbox, no un chat.

**Por qué Chatwoot y no Callbell/otro SaaS:** Chatwoot es open source, se puede hostear en Railway al lado de Realia, tiene integración nativa con WhatsApp Cloud API, y no genera dependencia de un SaaS que pueda cambiar precios. Para V2+ se puede reemplazar por un inbox propio si hace falta.

#### Triggers de handoff

El handoff se activa cuando:
1. **El lead lo pide explícitamente:** "Quiero hablar con una persona"
2. **El agente detecta intención de cierre:** el lead está listo para reservar/comprar y necesita un humano para cerrar
3. **Pregunta fuera del alcance del agente:** temas legales específicos, negociaciones de precio, excepciones contractuales
4. **Frustración del lead:** el lead repite la misma pregunta o expresa insatisfacción con las respuestas
5. **Score hot:** el agente puede sugerir handoff proactivamente cuando detecta alto interés de compra
6. **Escalamiento manual:** un vendedor desde Chatwoot puede tomar una conversación que el agente estaba manejando

#### Arquitectura del handoff

```mermaid
flowchart TD
    LEAD["Lead manda WhatsApp"] --> WEBHOOK["Webhook Realia\n(FastAPI)"]

    WEBHOOK --> DECISION{"Handoff trigger?"}

    DECISION -->|"No (90%)"| AGENT["Agente responde automaticamente\nRAG + calificacion + nurturing"]

    DECISION -->|Si| CREATE["Realia crea conversacion en Chatwoot\nvia API con historial + score + contexto"]

    CREATE --> ASSIGN["Chatwoot asigna vendedor\nauto-assign o round-robin"]

    ASSIGN --> NOTIFY["Vendedor recibe notificacion\npush mobile + web"]

    NOTIFY --> RESPOND["Vendedor abre Chatwoot\nve conversacion completa y responde"]

    RESPOND --> SEND["Chatwoot envia via WhatsApp Cloud API\nmismo numero - lead ve mismo chat"]

    SEND --> LEAD_REPLY["Lead responde - WhatsApp webhook"]

    LEAD_REPLY --> DETECT["Realia detecta handoff activo\nreenvia a Chatwoot"]

    DETECT --> RESPOND

    RESPOND --> CLOSE["Vendedor cierra conversacion\nen Chatwoot"]

    CLOSE --> RESUME["Realia recibe evento de cierre\nvia webhook"]

    RESUME --> RETOMA["Agente retoma la conversacion\ncon el lead"]
```

#### Lo que ve cada parte

**El lead:** experiencia 100% transparente. Mismo chat, mismo número. Solo nota que le dicen "te paso con Martín" y las respuestas suenan más humanas. Cuando el vendedor cierra, el agente retoma.

**El vendedor:** abre Chatwoot (web o app mobile). Ve cada conversación en un panel separado con todo el historial. Puede manejar 5, 10 conversaciones en paralelo sin confusión. Agrega notas internas, etiquetas, asigna a colegas. UX pensada para esto.

**El agente (Realia):** orquesta todo. Decide cuándo escalar, arma el resumen de contexto para el vendedor, recibe el evento de cierre, y retoma la conversación.

#### Integración Realia ↔ Chatwoot

| Evento | Dirección | Mecanismo |
|---|---|---|
| Handoff trigger | Realia → Chatwoot | API: crear conversación con historial y asignar a vendedor |
| Mensaje del lead durante handoff | Realia → Chatwoot | API: agregar mensaje a la conversación existente |
| Respuesta del vendedor | Chatwoot → WhatsApp | Directo vía WhatsApp Cloud API (Chatwoot tiene integración nativa) |
| Vendedor cierra conversación | Chatwoot → Realia | Webhook: evento de cierre, Realia retoma la conversación |
| Nota del vendedor sobre el lead | Chatwoot → Realia | Webhook o API sync: nota se guarda en `handoffs.lead_note` |

**Opción de arquitectura para la integración de mensajes:**

Hay dos formas de manejar la integración de WhatsApp con Chatwoot:

- **Opción A — Realia como proxy:** el webhook de WhatsApp apunta siempre a Realia. Cuando hay handoff activo, Realia reenvía los mensajes del lead a Chatwoot vía API, y recibe las respuestas del vendedor vía webhook de Chatwoot para registrarlas. Chatwoot no tiene acceso directo a WhatsApp.
- **Opción B — Dual webhook:** Chatwoot se conecta directo a WhatsApp Cloud API como un canal. Realia y Chatwoot comparten el número. Realia maneja el agente automático, Chatwoot maneja las conversaciones humanas. La coordinación es por estado en la DB: si `handoff.status = 'active'`, Realia no procesa los mensajes del lead.

**Recomendación: Opción A** para V1 — Realia mantiene el control total del webhook, es el punto de entrada único. Más simple de debuggear y no hay riesgo de conflictos entre dos sistemas procesando el mismo mensaje.

#### Asignación del vendedor

Chatwoot maneja la asignación nativamente:
1. **Auto-assign:** Chatwoot asigna al vendedor con menos conversaciones activas
2. **Round-robin:** distribuye equitativamente entre vendedores disponibles
3. **Cola:** si todos están ocupados, la conversación queda sin asignar y cualquier vendedor puede tomarla
4. **Timeout:** si nadie toma la conversación en 15 minutos, Realia recibe el evento y el agente retoma: "Nuestro equipo te va a contactar a la brevedad. ¿Puedo ayudarte con algo más?"

#### Qué ve el lead durante la espera

Entre que se dispara el handoff y el vendedor responde, el agente mantiene la conversación:
- Puede seguir respondiendo preguntas factuales (RAG)
- Si el lead pregunta algo nuevo, responde normalmente y agrega: "Martín se va a sumar en breve para ayudarte con lo que necesites"
- Si pasan más de 2 minutos sin respuesta del vendedor: "Martín está terminando con otro cliente, ya te atiende"

#### HITL desde el panel web (Inbox Next.js)

Además de Telegram/Chatwoot, el handoff se puede gestionar desde el **panel web** (Inbox en Next.js):

- **Activar HITL:** cuando el lead pide humano (el agente emite `[HANDOFF]`) o cuando un operador hace "Tomar conversación" o envía el primer mensaje desde el Inbox; en ambos casos se crea/activa un handoff y el agente deja de responder a ese lead.
- **Durante el takeover:** los mensajes del lead se reenvían a Telegram (si está configurado) o solo se registran; las respuestas se envían desde el panel con "Enviar" (POST `/admin/leads/{id}/message`), que además asegura handoff activo.
- **Volver al agente:** el operador hace "Terminar intervención" (POST `/admin/leads/{id}/handoff/close`), o **timeout de 30 minutos**: si el lead no escribe en 30 min, el siguiente mensaje del lead lo atiende de nuevo el agente (se cierra el handoff automáticamente sin enviar mensaje de despedida).
- **API:** `GET /admin/leads/{id}/handoff` (estado), `POST .../handoff/start`, `POST .../handoff/close`.

El Inbox muestra una conversación por persona (agrupado por teléfono), con el último proyecto de interés; los mensajes del agente se distinguen visualmente de usuario y humano.

#### WhatsApp sigue para lo operativo

El Modo Developer por WhatsApp (audios de obra, PDFs, updates) no cambia. Chatwoot es solo para el handoff de ventas. El developer sigue mandando audios y documentos por WhatsApp al número del proyecto.

| Canal | Quien lo usa | Para que |
|---|---|---|
| **WhatsApp** (agente) | Lead | Consultas, calificacion, nurturing, recibir docs |
| **WhatsApp** (modo developer) | Equipo obra/admin | Campo: audios, fotos, PDFs, hitos, updates rapidos |
| **Panel web Next.js** | Admin, director, ventas | Oficina: proyectos, unidades, leads kanban, reservas, documentos, obra, inbox |
| **Chatwoot** | Equipo ventas | Handoff: conversaciones humanas con leads (Fase 4) |
| **WhatsApp** (notificacion) | Equipo ventas | Alerta de lead hot |

### Modulo 6: Panel de Gestion (NocoDB)

NocoDB se conecta directamente al PostgreSQL de Realia y expone las tablas como una interfaz tipo Airtable. El admin/director lo usa como panel de control centralizado para toda la gestion que no es operacion de campo.

**Que se gestiona desde NocoDB:**

| Tabla | Operaciones | Notas |
|---|---|---|
| `projects` | Crear, editar proyectos | Nombre, numero WA, estado |
| `units` | ABM de unidades | Piso, m2, precio, dormitorios, estado |
| `authorized_numbers` | Gestionar equipo | Invitar, revocar, cambiar roles |
| `documents` | Upload de docs + fotos | Attachment en S3, webhook dispara RAG |
| `leads` | Ver pipeline, filtrar por score | Vista kanban o tabla filtrable |
| `obra_updates` | Cargar avance manual | Formulario con fotos, cuando WhatsApp no alcanza |
| `obra_milestones` | Registrar hitos | Marcar notify_buyers para notificacion automatica |
| `buyers` | Gestionar compradores | Asociar a unidad, registrar firma |
| `conversations` | Ver historial de leads | Solo lectura, para contexto |
| `handoffs` | Ver handoffs activos/cerrados | Notas del vendedor, metricas |

**Integracion NocoDB - Realia:**
- NocoDB lee/escribe directamente en PostgreSQL (misma DB)
- Webhooks de NocoDB notifican a Realia cuando hay cambios relevantes:
  - Nuevo documento subido -> dispara pipeline RAG
  - Nuevo milestone con `notify_buyers=true` -> dispara notificaciones
  - Cambio de precio en unidad -> agente usa el precio actualizado
- NocoDB Attachments configurados para usar el mismo bucket S3

#### Registro y atribución

Toda la conversación queda en la tabla `conversations` de Realia, incluyendo mensajes del vendedor humano (synceados desde Chatwoot). El campo `sender_type` distingue si fue generado por el agente (`'agent'`) o por un humano (`'human'`). Esto es crítico para la atribución de revenue share.

### Módulo 6b: Panel web Realia (Next.js) — ✅ IMPLEMENTADO

Panel unificado en `frontend/` — Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui v3 (tema claro, estética OpenAI).
Auth: JWT almacenado en `sessionStorage` bajo `realia_token`; rutas protegidas por `AuthLayout`.

**Auth:** JWT desde tabla `users` (no env vars). JWT incluye `user_id`, `role`, `org_id`, `nombre`. Roles: superadmin/admin/gerente/vendedor/lector. Primer login fuerza cambio de contraseña (modal bloqueante).

**Rutas:**

| Ruta | Descripción |
|---|---|
| `/` | Login — email/contraseña contra tabla `users`; JWT almacenado en sessionStorage |
| `/admin/usuarios` | CRUD usuarios: tabla, modal crear/editar, toggle activo, reset password; solo admin/superadmin |
| `/proyectos` | Tarjetas de proyectos con métricas de leads + avance; modal "Nuevo Proyecto" sube CSV |
| `/proyectos/[id]` | Dashboard: funnel (total/hot/reservadas/vendidas), revenue (disponible/reservado/vendido), gráfico semanal de leads, fuentes |
| `/proyectos/[id]/unidades` | Grilla de unidades por piso; marcar `reserved` abre ReservationSheet; venta directa sin reserva previa |
| `/proyectos/[id]/leads` | Kanban hot/warm/cold; Sheet con score, edición de campos, notas del equipo, "Reservar unidad" |
| `/proyectos/[id]/reservas` | Lista de reservas con chips de filtro (activas/canceladas/convertidas); acciones: imprimir, convertir, cancelar |
| `/proyectos/[id]/reservas/[reservationId]` | Detalle reserva: tabs "Detalle" + "Plan de Pagos"; grilla de cuotas; registrar/editar/eliminar pagos |
| `/proyectos/[id]/reservas/[id]/print` | Comprobante de reserva imprimible: auto-print; layout limpio |
| `/proyectos/[id]/documentos` | Documentos por tipo con upload directo |
| `/proyectos/[id]/obra` | Etapas con barra de progreso ponderada; updates con fotos; tab "Pagos" (obra_payments a proveedores) |
| `/proyectos/[id]/financiero` | Tabs: "Resumen" (KPIs + barras presupuesto/ejecutado + tabla gastos), "Facturas" (CRUD + PDF upload + vínculo a cuota), "Flujo de Caja" (bar chart + tabla mes a mes) |
| `/proyectos/[id]/inversores` | Portal inversores; envío de reporte por WhatsApp con preview HTML; historial |
| `/inbox` | Conversaciones WhatsApp; HITL con polling 1.5 s; "Tomar conversación" / "Terminar intervención" |
| `/tools` | Tipos de cambio ARS/USD (Oficial/Blue/MEP) + simulador de conversión bidireccional |

**Flujo de reserva asistida:**
- Entrada desde **unidades** (trigger al marcar `reserved`) o desde **leads** (botón "Reservar unidad" en Sheet).
- `ReservationSheet` captura: unidad, nombre/teléfono/email del comprador, monto seña, método de pago, fecha de firma, notas.
- Al confirmar: `POST /admin/reservations/{project_id}` → unidad se marca `reserved` en DB → se abre comprobante en nueva pestaña para imprimir como PDF.
- Desde la lista de reservas: **Convertir en venta** → unidad pasa a `sold` + se crea buyer; **Cancelar** → unidad vuelve a `available`.

**Deploy:** `render.yaml` — servicios `realia` (FastAPI) y `realia-frontend` (Next.js). Frontend necesita `NEXT_PUBLIC_API_URL`; backend necesita `CORS_ORIGINS` con la URL del frontend.

### Módulo 6c: Tools — Herramientas de mercado ✅ IMPLEMENTADO

Panel `/tools` con utilidades específicas para el mercado inmobiliario argentino (donde las unidades se venden en USD pero los pagos ocurren en ARS).

**Tipos de cambio ARS/USD** — `app/modules/tools/exchange_rates.py`

- Fuente: `https://api.argentinadatos.com/v1/cotizaciones/dolares/{tipo}` (pública, sin auth)
- Tipos: `oficial` (BCRA), `blue` (informal), `bolsa` → expuesto como `mep`
- ⚠️ La API devuelve **301 redirect** → httpx debe usar `follow_redirects=True`
- ⚠️ El tipo MEP se llama `bolsa` en la URL (no `mep`)
- ⚠️ La API publica con **1 día de lag** — el dato de hoy no está disponible hasta el día siguiente
- Cache en memoria con TTL de 15 minutos
- Endpoints: `GET /admin/tools/exchange-rates`, `GET /admin/tools/exchange-rates/history/{tipo}?days=N`

**Simulador de conversión** (frontend, cálculo local):
- Toggle "Comprar USD / Vender USD" — define dirección y precio (venta / compra)
- Pills Oficial / MEP / Blue con cotización en tiempo real
- Input con separador de miles (formato es-AR: puntos para miles, coma decimal)
- ⚠️ El estado interno usa **punto como decimal** (`"1000.5"`) → usar `parseFloat()` directo, NO `parseNum()` (que stripea todos los puntos)
- Tabla comparativa de los 3 tipos, clickeable
- Polling cada 5 minutos

---

## 6. Schema de Base de Datos

### Modelo de datos (ER)

```mermaid
erDiagram
    developers ||--o{ projects : tiene
    projects ||--o{ units : contiene
    projects ||--o{ authorized_numbers : autoriza
    projects ||--o{ leads : genera
    projects ||--o{ documents : tiene
    projects ||--o{ obra_updates : registra
    projects ||--o{ obra_milestones : marca
    projects ||--o{ buyers : vende
    projects ||--o{ handoffs : escala

    units ||--o{ unit_notes : tiene

    leads ||--o{ conversations : tiene
    leads ||--o{ handoffs : dispara
    leads ||--o| buyers : convierte
    leads ||--o{ sessions : mantiene

    documents ||--o{ document_chunks : genera

    authorized_numbers ||--o{ developer_conversations : tiene
    authorized_numbers ||--o{ obra_updates : crea
    authorized_numbers ||--o{ obra_milestones : crea

    buyers }o--|| units : compra

    handoffs }o--|| authorized_numbers : asignado

    organizations {
        uuid id PK
        text nombre
        varchar tipo
        text cuit
        text contact_phone
    }

    users {
        uuid id PK
        uuid organization_id FK
        text email
        text password_hash
        text nombre
        varchar role
        boolean activo
        boolean debe_cambiar_password
    }

    projects {
        uuid id PK
        uuid organization_id FK
        text name
        text slug UK
        text address
        text neighborhood
        text city
        text description
        text_arr amenities
        int total_floors
        int total_units
        date construction_start
        date estimated_delivery
        varchar delivery_status
        text payment_info
        text whatsapp_number UK
        varchar status
    }

    units {
        uuid id PK
        uuid project_id FK
        text identifier
        int floor
        int bedrooms
        decimal area_m2
        decimal price_usd
        varchar status
    }

    unit_notes {
        uuid id PK
        uuid unit_id FK
        text author_name
        text note
        timestamptz created_at
    }

    leads {
        uuid id PK
        uuid project_id FK
        text phone
        text name
        varchar intent
        varchar financing
        varchar timeline
        int budget_usd
        int bedrooms
        text location_pref
        varchar score
    }

    conversations {
        uuid id PK
        uuid lead_id FK
        varchar role
        varchar sender_type
        text content
    }

    handoffs {
        uuid id PK
        uuid lead_id FK
        uuid assigned_to FK
        varchar trigger_type
        varchar status
        text context_summary
    }

    authorized_numbers {
        uuid id PK
        text phone
        uuid project_id FK
        varchar role
        varchar status
    }

    documents {
        uuid id PK
        uuid project_id FK
        varchar doc_type
        text file_url
        varchar unit_id
        int floor
        int version
        boolean is_active
    }

    document_chunks {
        uuid id PK
        uuid document_id FK
        text content
        text embedding
        text metadata
    }

    units {
        uuid id PK
        uuid project_id FK
        text identifier
        int floor
        decimal price_usd
        varchar status
    }

    buyers {
        uuid id PK
        uuid lead_id FK
        uuid unit_id FK
        varchar status
    }

    payment_plans {
        uuid id PK
        uuid reservation_id FK
        text descripcion
        varchar moneda_base
        decimal monto_total
        varchar tipo_ajuste
    }

    payment_installments {
        uuid id PK
        uuid plan_id FK
        int numero_cuota
        varchar concepto
        decimal monto
        varchar moneda
        date fecha_vencimiento
        varchar estado
    }

    payment_records {
        uuid id PK
        uuid installment_id FK
        date fecha_pago
        decimal monto_pagado
        varchar moneda
        text metodo_pago
        text comprobante_url
    }

    facturas {
        uuid id PK
        uuid project_id FK
        varchar tipo
        text numero_factura
        text proveedor_nombre
        date fecha_emision
        decimal monto_total
        varchar moneda
        varchar categoria
        text file_url
        uuid gasto_id FK
        uuid payment_record_id FK
        varchar estado
    }

    obra_updates {
        uuid id PK
        uuid project_id FK
        varchar etapa
        int porcentaje_avance
        boolean enviado
    }

    obra_milestones {
        uuid id PK
        uuid project_id FK
        text name
        varchar etapa
        boolean notify_buyers
    }
```

### Core

```sql
CREATE TABLE developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id UUID REFERENCES developers(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  address TEXT,
  neighborhood TEXT,
  city TEXT DEFAULT 'CABA',
  description TEXT,
  amenities TEXT[],
  total_floors INT,
  total_units INT,
  construction_start DATE,
  estimated_delivery DATE,
  delivery_status VARCHAR(30) DEFAULT 'en_pozo',
  payment_info TEXT,
  whatsapp_number TEXT UNIQUE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  identifier TEXT,
  floor INT,
  bedrooms INT,
  area_m2 DECIMAL,
  price_usd DECIMAL,
  status VARCHAR(20) DEFAULT 'available',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE unit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id),
  author_name TEXT,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE authorized_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  role VARCHAR(20) NOT NULL,       -- 'admin', 'obra', 'ventas'
  name TEXT,
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'active', 'revoked'
  activation_code VARCHAR(6),      -- código one-time para activación
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone, project_id)
);
```

### Leads y conversaciones

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  phone TEXT NOT NULL,
  name TEXT,
  intent VARCHAR(20),       -- 'investment', 'own_home', 'rental', 'unknown'
  financing VARCHAR(20),    -- 'own_capital', 'needs_financing', 'mixed', 'unknown'
  timeline VARCHAR(20),     -- 'immediate', '3_months', '6_months', '1_year_plus'
  budget_usd INTEGER,       -- presupuesto en USD
  bedrooms SMALLINT,        -- cantidad de ambientes buscados
  location_pref TEXT,       -- zona o ubicación preferida
  score VARCHAR(10),        -- 'hot', 'warm', 'cold'
  source TEXT,              -- 'instagram', 'zonaprop', 'referido', etc
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact TIMESTAMPTZ
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  wa_message_id TEXT UNIQUE,  -- WhatsApp message ID for idempotency
  role VARCHAR(10),           -- 'user' | 'assistant'
  sender_type VARCHAR(10) DEFAULT 'agent',  -- 'agent' | 'human' | 'lead'
  sender_id UUID,             -- authorized_number_id si sender_type = 'human'
  handoff_id UUID,            -- FK a handoffs, si el mensaje fue parte de un handoff
  content TEXT,
  media_type VARCHAR(20),     -- 'text', 'audio', 'image', 'document', NULL
  media_url TEXT,             -- URL del media descargado (si aplica)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  phone TEXT NOT NULL,
  project_id UUID REFERENCES projects(id),
  lead_id UUID REFERENCES leads(id),
  state JSONB,    -- estado del flujo de calificación
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (phone, project_id)
);
```

### RAG

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  doc_type VARCHAR(50),       -- 'memoria', 'plano', 'reglamento', 'precios', 'faq'
  filename TEXT,
  file_url TEXT,              -- URL en S3 (compartido con NocoDB)
  file_size_bytes BIGINT,
  unit_identifier TEXT,       -- '4B', '2A' — para docs de unidad especifica
  floor INT,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  source VARCHAR(20) DEFAULT 'whatsapp',  -- 'whatsapp', 'nocodb', 'api'
  uploaded_by UUID REFERENCES authorized_numbers(id),
  rag_status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'processing', 'ready', 'error'
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  project_id UUID NOT NULL,
  content TEXT,
  embedding VECTOR(1536),
  metadata JSONB,  -- { "unit": "4B", "floor": 4, "page": 2 }
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Obra y compradores

```sql
CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  lead_id UUID REFERENCES leads(id),
  unit_id UUID REFERENCES units(id),
  phone TEXT NOT NULL,
  name TEXT,
  signed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active'  -- active, delivered, cancelled
);

CREATE TABLE obra_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  fecha DATE NOT NULL,
  etapa VARCHAR(50),          -- 'excavacion', 'estructura', 'cerramientos', 'terminaciones'
  porcentaje_avance INT,
  fotos_urls TEXT[],
  nota_publica TEXT,          -- visible para compradores
  nota_interna TEXT,          -- solo equipo
  source VARCHAR(20) DEFAULT 'whatsapp',  -- 'whatsapp', 'api', 'manual'
  created_by UUID REFERENCES authorized_numbers(id),
  enviado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE obra_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  name TEXT NOT NULL,         -- 'Estructura terminada piso 8'
  etapa VARCHAR(50),
  floor INT,                  -- NULL si aplica a todo el proyecto
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  notify_buyers BOOLEAN DEFAULT FALSE,
  notified BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES authorized_numbers(id)
);
```

### Reservaciones

```sql
CREATE TABLE reservations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    unit_id        UUID NOT NULL REFERENCES units(id),
    lead_id        UUID REFERENCES leads(id),
    buyer_name     TEXT,
    buyer_phone    TEXT NOT NULL,
    buyer_email    TEXT,
    amount_usd     DECIMAL,
    payment_method VARCHAR(30),   -- efectivo | transferencia | cheque | financiacion
    notes          TEXT,
    signed_at      DATE,
    status         VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | cancelled | converted
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Una sola reserva activa por unidad (índice parcial único)
CREATE UNIQUE INDEX idx_reservations_unit_active ON reservations(unit_id) WHERE status = 'active';
```

### Handoffs

```sql
CREATE TABLE handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  project_id UUID REFERENCES projects(id),
  assigned_to UUID REFERENCES authorized_numbers(id),
  trigger VARCHAR(30) NOT NULL,      -- 'lead_request', 'agent_escalation', 'hot_score', 'frustration', 'manual'
  status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'active', 'completed', 'expired'
  context_summary TEXT,              -- resumen que recibe el vendedor
  lead_note TEXT,                    -- nota post-handoff del vendedor
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Conversaciones internas (Modo Developer)

```sql
CREATE TABLE developer_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorized_number_id UUID REFERENCES authorized_numbers(id),
  project_id UUID REFERENCES projects(id),
  role VARCHAR(10),           -- 'user' | 'assistant'
  content TEXT,
  media_type VARCHAR(20),     -- 'text', 'audio', 'image', 'document'
  media_url TEXT,
  action_type VARCHAR(30),    -- 'obra_update', 'doc_upload', 'price_update', 'query', 'milestone', 'handoff'
  action_result JSONB,        -- resultado de la acción procesada
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Estructura de Carpetas

```
realia/
├── app/
│   ├── main.py                    # FastAPI app, routes
│   ├── config.py                  # Variables de entorno (Pydantic Settings)
│   ├── database.py                # Pool asyncpg
│   │
│   ├── modules/
│   │   ├── whatsapp/
│   │   │   ├── webhook.py         # Recibe mensajes — delega al provider activo
│   │   │   ├── sender.py          # Envía mensajes — delega al provider activo
│   │   │   ├── media.py           # Descarga media + extracción de filename
│   │   │   ├── templates.py       # Mensajes estructurados
│   │   │   └── providers/
│   │   │       ├── base.py        # IncomingMessage (modelo normalizado) + WhatsAppProvider protocol
│   │   │       ├── meta.py        # Implementación WhatsApp Cloud API (Meta)
│   │   │       └── twilio.py      # Implementación Twilio WhatsApp Sandbox
│   │   │
│   │   ├── agent/
│   │   │   ├── router.py          # Role Router: resolve developer, detecta lead vs developer
│   │   │   ├── lead_handler.py    # Modo Lead: sesión → contexto → calificación → Claude → doc sharing → WA
│   │   │   ├── dev_handler.py     # Modo Developer: commands, unit mgmt, PDF/CSV upload, doc sharing
│   │   │   ├── classifier.py      # Clasifica intención del mensaje (Claude)
│   │   │   ├── prompts.py         # System prompts (lead, developer, extraction, actions)
│   │   │   └── session.py         # Estado persistente, get_developer_context multi-proyecto
│   │   │
│   │   ├── rag/
│   │   │   ├── ingestion.py       # find_document_for_sharing + stubs para RAG pipeline
│   │   │   ├── retrieval.py       # Búsqueda vectorial en pgvector (stub embeddings)
│   │   │   └── chunker.py         # Estrategia de chunking por doc_type
│   │   │
│   │   ├── storage.py             # S3-compatible (Supabase Storage): upload, presigned URLs
│   │   ├── project_loader.py      # Parseo CSV → crear proyecto + unidades en DB
│   │   ├── nocodb_webhook.py      # Webhook handler para eventos de NocoDB (stub)
│   │   │
│   │   ├── media/
│   │   │   ├── transcription.py   # Whisper API para audios
│   │   │   └── processor.py       # Extrae info estructurada de transcripciones
│   │   │
│   │   ├── leads/
│   │   │   ├── qualification.py   # Scoring progresivo (7 campos), extracción con Claude
│   │   │   ├── nurturing.py       # Flujo de seguimiento automático (parcial)
│   │   │   └── alerts.py          # Notificaciones WhatsApp al vendedor
│   │   │
│   │   ├── handoff/
│   │   │   ├── manager.py         # Lógica de handoff: trigger, escalamiento, retoma
│   │   │   └── chatwoot.py        # Integración con Chatwoot API (stub)
│   │   │
│   │   └── obra/
│   │       ├── updates.py         # CRUD de actualizaciones de obra
│   │       ├── milestones.py      # Registro y gestión de hitos
│   │       └── notifier.py        # Envío personalizado a compradores
│   │
│   ├── models/
│   │   ├── lead.py
│   │   ├── project.py
│   │   ├── conversation.py
│   │   ├── developer.py
│   │   ├── handoff.py
│   │   └── obra.py
│   │
│   └── admin/
│       └── api.py                 # Endpoints admin: upload docs, manage units/projects, CSV loader
│
├── frontend/                          # Panel web Next.js
│   └── src/
│       ├── app/
│       │   ├── page.tsx               # Login
│       │   ├── inbox/page.tsx         # Conversaciones WhatsApp + HITL
│       │   └── proyectos/
│       │       ├── page.tsx           # Listado proyectos
│       │       └── [id]/
│       │           ├── layout.tsx     # Tabs de navegación del proyecto
│       │           ├── page.tsx       # Dashboard analytics
│       │           ├── unidades/page.tsx
│       │           ├── leads/page.tsx
│       │           ├── reservas/
│       │           │   ├── page.tsx   # Lista de reservas
│       │           │   └── [reservationId]/print/
│       │           │       ├── layout.tsx   # Layout limpio (sin nav)
│       │           │       └── page.tsx     # Comprobante imprimible
│       │           ├── documentos/page.tsx
│       │           └── obra/page.tsx
│       ├── components/
│       │   ├── AuthLayout.tsx
│       │   ├── Sidebar.tsx
│       │   ├── NewProjectModal.tsx
│       │   ├── ReservationSheet.tsx   # Wizard de reserva reutilizable
│       │   └── ui/                    # shadcn/ui components
│       ├── contexts/
│       │   └── AuthContext.tsx
│       ├── hooks/
│       │   └── useAsync.ts
│       └── lib/
│           ├── api.ts                 # Cliente HTTP tipado
│           └── utils.ts               # cn() helper
│
├── migrations/
│   ├── 001_initial_schema.sql     # Schema base (pgvector, índices)
│   ├── 002_lead_qualification_fields.sql  # Campos calificación en leads
│   ├── 003_project_details.sql    # Campos detallados en projects
│   ├── 004_unit_notes.sql         # Tabla unit_notes
│   ├── 005_telegram_handoff.sql   # Handoff via Telegram
│   ├── 006_lead_notes.sql         # Tabla lead_notes
│   ├── 007_obra_etapas.sql        # Tablas obra_etapas, obra_updates, obra_fotos
│   └── 009_reservations.sql       # Tabla reservations (índice parcial único)
│
├── scripts/
│   ├── seed_dev.py                # Seed Torre Palermo + 7 unidades
│   ├── seed_manzanares.py         # Seed Manzanares 2088 + 8 unidades + docs
│   └── generate_pdfs_manzanares.py # Genera PDFs reales con reportlab + sube a S3
│
├── templates/
│   └── proyecto_template.csv      # Template CSV para carga de proyectos desde WhatsApp
│
├── docs/
│   ├── CONTEXT.md                 # Contexto completo del proyecto
│   └── IMPLEMENTATION_PLAN.md     # Plan de fases con progreso
│
├── .env                           # Variables de entorno (todas centralizadas)
├── requirements.txt
├── Dockerfile
├── railway.toml                   # Config Railway (producción)
├── render.yaml                    # Config Render (desarrollo gratis)
└── README.md
```

### Estructura de S3 Storage

```
{bucket}/
└── projects/
    ├── torre-palermo/
    │   ├── brochure_torre_palermo.pdf
    │   └── lista_precios_torre_palermo.pdf
    ├── manzanares-2088/
    │   ├── brochure_manzanares_2088.pdf
    │   ├── lista_de_precios_manzanares_2088.pdf
    │   ├── memoria_descriptiva_manzanares_2088.pdf
    │   ├── plano_1a_manzanares_2088.pdf
    │   └── ...
    └── _templates/
        └── proyecto_template.csv
```

---

## 8. Variables de Entorno

```
# Database (Neon free tier en dev, Railway en produccion)
DATABASE_URL=postgresql://user:password@host:5432/realia

# AI
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001   # Modelo para dev (barato). Cambiar para prod.
OPENAI_API_KEY=                              # Whisper transcription + embeddings (pendiente)

# WhatsApp provider: "twilio" para dev, "meta" para produccion
WHATSAPP_PROVIDER=twilio

# Twilio WhatsApp Sandbox (dev)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=+14155238886

# WhatsApp Cloud API / Meta (produccion)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=

# S3-compatible storage (Supabase Storage)
S3_ENDPOINT_URL=https://xxx.storage.supabase.co/storage/v1/s3
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=real-state
S3_PUBLIC_URL=https://xxx.supabase.co/storage/v1/object/public/real-state
S3_REGION=us-west-2

# Dev: forzar desarrollador (Twilio sandbox comparte numero entre proyectos)
# En produccion dejarlo vacio — se resuelve por whatsapp_number del proyecto
ACTIVE_DEVELOPER_ID=

# Dev: teléfono que entra como developer (vacío = siempre lead)
DEV_PHONE=

# Chatwoot (DB propia en Railway, comunicacion via API/webhooks)
CHATWOOT_BASE_URL=
CHATWOOT_API_TOKEN=
CHATWOOT_ACCOUNT_ID=

# NocoDB (conectado a la misma DATABASE_URL)
NOCODB_BASE_URL=
NOCODB_API_TOKEN=

# App
ENVIRONMENT=development
SECRET_KEY=

# Admin panel login (web): usuario y contraseña para acceder al workspace. Si no se configuran, el login devuelve 503.
ADMIN_USERNAME=
ADMIN_PASSWORD=

# CORS (backend): orígenes permitidos separados por coma. Incluir URL del frontend en producción.
# Ejemplo: http://localhost:3000,https://realia-frontend.onrender.com
CORS_ORIGINS=

# Frontend (Next.js, build-time): URL del backend para las llamadas API.
# En local no hace falta; en Render configurar la URL del servicio realia.
NEXT_PUBLIC_API_URL=
```

---

## 9. Decisiones de Diseño

| Decisión | Justificación |
|---|---|
| **Estado persistente sin LangGraph** | Historial en tabla `conversations`, reconstruido por `lead_id` por request. Sin dependencias externas, control total del contexto. |
| **RAG segmentado por proyecto** | Filtro por `project_id` antes de similitud vectorial. Evita mezcla de información entre proyectos. |
| **Atribución irrefutable** | Todo queda en `conversations` con timestamp. Journey auditable para disputes de revenue share. Requisito contractual. |
| **Multi-intención por mensaje** | Si el usuario pregunta precio Y financiamiento, el clasificador detecta ambas y responde coherentemente. |
| **Versionado de documentos** | Nueva versión → anterior `is_active = false`. Chunks viejos desaparecen de búsquedas. |
| **WhatsApp como interfaz universal** | Tanto leads como developers usan WhatsApp. Reduce fricción, elimina necesidad de dashboard para operación diaria. |
| **Role Router por número autorizado** | Tabla `authorized_numbers` determina si el mensaje entra en Modo Lead o Modo Developer. Simple y extensible. |
| **Confirmación antes de persistir** | En Modo Developer, cambios críticos (precios, hitos, docs) requieren confirmación explícita antes de guardarse. |
| **Sesión con PK compuesta** | `(phone, project_id)` permite que un mismo número interactúe con múltiples proyectos sin conflicto. |
| **Embeddings OpenAI, LLM Anthropic** | Se usa cada proveedor en lo que es mejor: OpenAI para embeddings (no hay alternativa Anthropic), Claude para generación. |
| **Auth developer: 3 capas** | Número pre-registrado + código de activación one-time + permisos por rol. WhatsApp ya autentica el número (SIM), el código previene errores de onboarding, los roles limitan el blast radius si un teléfono se compromete. |
| **Un solo número de WhatsApp por proyecto** | Leads y developers hablan al mismo número. El role router diferencia internamente. Simplifica setup y reduce costos (cada número de la API tiene costo). |
| **Handoff vía Chatwoot, no relay WhatsApp** | Manejar múltiples chats en paralelo dentro de un solo hilo de WhatsApp (con comandos @nombre, FIN) es confuso y propenso a errores. Un vendedor necesita una UI de inbox. Chatwoot es open source, se hostea al lado de Realia, y tiene integración nativa con WhatsApp Cloud API. |
| **Realia como proxy unico del webhook** | El webhook de WhatsApp siempre apunta a Realia. Realia decide si procesa con el agente o reenvia a Chatwoot. Evita conflictos de dos sistemas procesando el mismo mensaje. |
| **S3 compartido como storage central** | Archivos entran por WhatsApp o NocoDB, terminan en el mismo bucket S3. Accesibles por RAG (indexar), agente (enviar al lead), y NocoDB (preview/descarga). |
| **NocoDB para gestion, no para operacion de campo** | WhatsApp para campo (audios, fotos rapidas). NocoDB para oficina (CRUD, batch uploads, pipeline, config). Cada herramienta donde rinde. |

---

## 10. Convenciones de Base de Datos

### Soft Delete

Toda tabla con registros editables/borrables por usuarios del panel **debe** implementar soft delete en lugar de `DELETE`:

```sql
-- Columna estándar a agregar en cada tabla
deleted_at TIMESTAMPTZ NULL
```

**Reglas:**
- `DELETE` de la API → `UPDATE SET deleted_at = NOW()` (nunca `DELETE FROM`)
- Todos los `SELECT` deben incluir `WHERE deleted_at IS NULL` (o `AND deleted_at IS NULL` si hay otras condiciones)
- Los endpoints `PATCH`/`UPDATE` también deben incluir `AND deleted_at IS NULL` en su `WHERE` para no operar sobre registros eliminados
- Tablas con soft delete activo: `users` (campo `activo`), `organizations` (campo `activa`), `project_expenses`, `payment_records`, `facturas`, `investors`
- Tablas con soft delete nativo por campo de estado: `reservations` (campo `status`: `active`/`cancelled`/`converted`)

**Patrón en `api.py`:**
```python
# Soft delete
await pool.execute(
    "UPDATE mi_tabla SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL",
    record_id,
)

# SELECT siempre filtra
rows = await pool.fetch(
    "SELECT ... FROM mi_tabla WHERE project_id = $1 AND deleted_at IS NULL",
    project_id,
)
```

---

### Audit Log

Toda operación de escritura (INSERT/UPDATE/DELETE) sobre registros de negocio debe registrarse en la tabla `audit_log`.

**Schema de la tabla:**
```sql
audit_log(
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID,           -- NULL si es sesión legacy (env vars)
    user_nombre  TEXT,           -- denormalizado para legibilidad
    action       TEXT NOT NULL,  -- INSERT | UPDATE | DELETE
    table_name   TEXT NOT NULL,
    record_id    UUID,
    project_id   UUID,
    details      JSONB,          -- contexto opcional (nombre, monto, campos modificados)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

**Tablas auditadas actualmente:** `project_expenses`, `payment_records`, `facturas`, `investors`, `reservations`.

**Helpers disponibles en `api.py`:**

```python
def _get_actor(credentials) -> tuple:
    """Extrae (user_id, user_nombre) del JWT. Retorna (None, None) si no hay token."""

async def _audit(pool, *, user_id, user_nombre, action, table_name,
                 record_id=None, project_id=None, details=None) -> None:
    """Inserta en audit_log. Silencia errores para no romper el flujo principal."""
```

**Patrón para nuevos endpoints:**
```python
@router.post("/mi-tabla/{project_id}")
async def create_algo(
    project_id: str,
    body: MiBody,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    pool = await get_pool()
    user_id, user_nombre = _get_actor(credentials)

    row = await pool.fetchrow("INSERT INTO mi_tabla (...) VALUES (...) RETURNING id", ...)

    await _audit(pool, user_id=user_id, user_nombre=user_nombre, action="INSERT",
                 table_name="mi_tabla", record_id=str(row["id"]), project_id=project_id,
                 details={"campo_clave": body.campo_clave})
    return dict(row)
```

**Endpoint de consulta:** `GET /admin/audit-log` — filtra por `project_id`, `table_name`, `record_id`, `user_id`; paginado con `limit`/`offset`; acceso restringido a roles `admin`/`superadmin`.

---

### Nuevas tablas: checklist

Al crear una nueva tabla que almacene registros editables por usuarios del panel:

1. Agregar `deleted_at TIMESTAMPTZ NULL` en la migración SQL
2. Todos los `SELECT` en `api.py` deben incluir `AND deleted_at IS NULL`
3. El endpoint `DELETE` debe hacer soft delete (`UPDATE SET deleted_at = NOW()`)
4. Los endpoints `PATCH`/`UPDATE` deben agregar `AND deleted_at IS NULL` al `WHERE`
5. Todo endpoint de escritura (POST/PATCH/DELETE) debe:
   - Recibir `credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)`
   - Llamar `user_id, user_nombre = _get_actor(credentials)`
   - Llamar `await _audit(...)` después de la operación exitosa
| **Clasificacion conversacional de docs por WhatsApp** | Cuando un developer envia un archivo sin contexto, el agente pregunta proyecto, tipo, y metadata antes de guardar. Si el mensaje incluye contexto, Claude lo extrae automaticamente. |
| **El agente envia documentos, no solo responde sobre ellos** | Cuando un lead pide planos o precios, el agente los envia como PDF/imagen por WhatsApp ademas de responder con texto. Diferencia clave de UX. |
| **WhatsApp para operativo, Chatwoot para ventas** | El Modo Developer (audios de obra, PDFs, hitos) sigue siendo por WhatsApp. Solo el handoff de ventas va a Chatwoot. Cada herramienta donde rinde. |
| **Dos instancias de PostgreSQL en Railway** | Realia y NocoDB comparten PG porque NocoDB es un cliente que se conecta a nuestras tablas existentes. Chatwoot necesita PG propia porque tiene 80+ tablas internas y un schema que no controlamos. Comunicacion entre Realia y Chatwoot es API + webhooks, nunca por DB compartida. |
| **Railway como plataforma unica de deploy** | Todo corre en Railway: Realia (FastAPI), NocoDB, Chatwoot, las 2 instancias de PG. Simplifica networking (comunicacion interna sin internet publico), deploy, logs, y scaling. El unico servicio externo de infra es Cloudflare R2 para S3 storage. |
| **Comunicacion entre servicios por API + webhooks** | Realia ↔ Chatwoot y NocoDB → Realia se comunican via HTTP. Sin colas ni message brokers. Cada servicio tiene su webhook endpoint en Realia. Mantenemos la complejidad baja. |
| **WhatsApp provider pattern (Twilio / Meta)** | `WHATSAPP_PROVIDER` env var selecciona Twilio (sandbox gratis, setup 5min) o Meta (Cloud API, produccion). El resto del código trabaja con `IncomingMessage` normalizado y funciones `send_text`, `send_document`, etc. Cambiar provider = cambiar 1 variable de entorno. |
| **Calificación progresiva en el prompt** | 7 campos (name, intent, financing, timeline, budget, bedrooms, location). Se inyectan al system prompt del lead como "datos conocidos" y "datos faltantes". Claude integra preguntas de calificación naturalmente en la conversación, max 1 por mensaje. |
| **Extracción con Claude post-mensaje** | Después de cada intercambio, Claude analiza la conversación y extrae datos estructurados (JSON). Merge inteligente: nunca sobreescribe con null. Scoring automático basado en campos completados. |
| **Carga de proyectos por CSV** | El developer manda un CSV por WhatsApp con datos del proyecto + unidades. El agente parsea, muestra resumen, pide confirmación, y crea todo en la DB. Lo que no completó en el CSV lo puede agregar después por WhatsApp (action `update_project`). Template descargable. |
| **DEV_PHONE para dual-role testing** | En desarrollo, un solo teléfono puede actuar como developer o lead según la variable `DEV_PHONE`. Simplifica testing sin necesidad de dos números. |
| **Supabase Storage en vez de Cloudflare R2** | Se eligió Supabase Storage por tener UI integrada para explorar archivos y API S3-compatible. Migración a R2 o AWS S3 es transparente (cambiar env vars). |

---

## 10. Roadmap

### V1 — Estado actual ✅

| Módulo | Estado |
|---|---|
| Agente WhatsApp (lead mode) | ✅ Completo |
| Calificación progresiva + scoring | ✅ Completo |
| Document sharing (envío de PDFs por WA) | ✅ Completo |
| Modo Developer (admin por WhatsApp) | ✅ Completo |
| Seguimiento de obra + notificaciones a compradores | ✅ Completo |
| Panel web Next.js completo | ✅ Completo |
| Flujo de reserva asistida con comprobante PDF | ✅ Completo |
| RAG (PDFs nativos a Claude) | ✅ Completo |
| Handoff a Chatwoot | ⬜ Pendiente |

### V2 (post-piloto)

- RAG con embeddings para contexto muy grande (muchos PDFs pesados): selección semántica previa para no saturar el context window
- Handoff completo a Chatwoot (inbox de ventas para humanos)
- Simulador de cuotas y financiamiento (widget web embebible)
- Ingesta de imágenes de planos con OCR/vision
- Multi-tenant: onboarding de nuevas desarrolladoras sin intervención técnica
- Portal de captación de terrenos para próximos desarrollos
