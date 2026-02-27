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

| Capa | Tecnologia | Dev (gratis) | Producción |
|---|---|---|---|
| Backend | Python + FastAPI | Render free tier | Railway (servicio) |
| Base de datos app | PostgreSQL + pgvector | Neon free tier | Railway (plugin) — compartida con NocoDB |
| Base de datos Chatwoot | PostgreSQL | — (Fase 4+) | Railway (plugin) — instancia separada |
| File storage | S3-compatible (Cloudflare R2) | Cloudflare R2 free tier (10GB) | Cloudflare R2 |
| AI / LLM | Claude 3.5 Sonnet (Anthropic) | API externa | API externa |
| Audio transcription | OpenAI Whisper API | API externa | API externa |
| Embeddings | OpenAI text-embedding-3-small (1536 dims) | API externa | API externa |
| WhatsApp | Twilio Sandbox (dev) / Meta Cloud API (prod) | Twilio sandbox (gratis) | Meta Cloud API |
| Panel de gestion (V1) | NocoDB (open source) | — (Fase 5+) | Railway (servicio) |
| Handoff / Inbox ventas | Chatwoot (open source) | — (Fase 4+) | Railway (servicio) |
| Analytics (V1) | NocoDB views + Metabase o Streamlit | — | — |
| Panel unificado (V2+) | Next.js admin panel propio | — | — |
| Background jobs | Cron → endpoints internos | Render cron (free) | Railway cron |

### Estrategia de deploy

La app se configura 100% por variables de entorno (`DATABASE_URL`, API keys, etc.). No tiene dependencias en la plataforma de hosting. **Migrar = cambiar env vars + redeploy.** Se mantiene `Dockerfile` + `railway.toml` + `render.yaml` para que funcione en cualquier plataforma sin cambios.

**Entorno de desarrollo (gratis — Fases 0 a 3):**
- **Neon** para PostgreSQL — pgvector incluido, 0.5GB storage, always-on, `pg_dump`/`pg_restore` estándar
- **ngrok** + FastAPI local para desarrollo rápido (iteración sin deploys)
- **Render** para testing estable cuando el código esté listo (free tier, spin-down tras 15min)
- **Twilio WhatsApp Sandbox** para mensajería — setup en 5min, sin verificación Meta
- **Cloudflare R2** para S3 — 10GB gratis/mes, API compatible con S3

**Entorno de producción (pago — cuando hay cliente validado):**
- **Railway** para todo (FastAPI, NocoDB, Chatwoot, 2x PostgreSQL) — networking interno, deploy simple
- Migración de DB: `pg_dump` desde Neon → `pg_restore` en Railway PG
- Migración de app: `git push` al proyecto Railway, copiar env vars

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

#### WhatsApp sigue para lo operativo

El Modo Developer por WhatsApp (audios de obra, PDFs, updates) no cambia. Chatwoot es solo para el handoff de ventas. El developer sigue mandando audios y documentos por WhatsApp al número del proyecto.

| Canal | Quien lo usa | Para que |
|---|---|---|
| **WhatsApp** (agente) | Lead | Consultas, calificacion, nurturing, recibir docs |
| **WhatsApp** (modo developer) | Equipo obra/admin | Campo: audios, fotos, PDFs, hitos, updates rapidos |
| **NocoDB** | Admin, director | Oficina: gestion de proyectos, unidades, empleados, precios, docs (batch upload), pipeline leads, obra manual |
| **Chatwoot** | Equipo ventas | Handoff: conversaciones humanas con leads |
| **WhatsApp** (notificacion) | Equipo ventas | Alerta de lead hot (con link a Chatwoot) |

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

    developers {
        uuid id PK
        text name
        text contact_phone
    }

    projects {
        uuid id PK
        uuid developer_id FK
        text name
        text whatsapp_number
        varchar status
    }

    leads {
        uuid id PK
        uuid project_id FK
        text phone
        varchar score
        varchar intent
        varchar financing
        varchar timeline
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
  whatsapp_number TEXT UNIQUE,
  status VARCHAR(20) DEFAULT 'active',  -- active, sold_out, delivered
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  identifier TEXT,        -- '4B', '2A', etc
  floor INT,
  bedrooms INT,
  area_m2 DECIMAL,
  price_usd DECIMAL,
  status VARCHAR(20) DEFAULT 'available'  -- available, reserved, sold
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
  intent VARCHAR(20),       -- 'investment', 'own_home', 'unknown'
  financing VARCHAR(20),    -- 'own_capital', 'needs_financing', 'unknown'
  timeline VARCHAR(20),     -- 'immediate', '3_months', '6_months', 'exploring'
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
│   ├── main.py                  # FastAPI app, routes
│   ├── config.py                # Variables de entorno
│   ├── database.py              # Conexión PostgreSQL
│   │
│   ├── modules/
│   │   ├── whatsapp/
│   │   │   ├── webhook.py       # Recibe mensajes — delega al provider activo
│   │   │   ├── sender.py        # Envía mensajes — delega al provider activo
│   │   │   ├── media.py         # Descarga media — delega al provider activo
│   │   │   ├── templates.py     # Mensajes estructurados
│   │   │   └── providers/
│   │   │       ├── base.py      # IncomingMessage (modelo normalizado) + interfaz
│   │   │       ├── meta.py      # Implementación WhatsApp Cloud API (Meta)
│   │   │       └── twilio.py    # Implementación Twilio WhatsApp Sandbox
│   │   │
│   │   ├── agent/
│   │   │   ├── router.py        # Role Router: detecta lead vs developer
│   │   │   ├── lead_handler.py  # Orquestador Modo Lead
│   │   │   ├── dev_handler.py   # Orquestador Modo Developer
│   │   │   ├── classifier.py    # Clasifica intención del mensaje
│   │   │   ├── prompts.py       # System prompts y templates
│   │   │   └── session.py       # Manejo de estado persistente
│   │   │
│   │   ├── rag/
│   │   │   ├── ingestion.py     # Procesa, sube a S3, vectoriza documentos
│   │   │   ├── retrieval.py     # Búsqueda vectorial en pgvector
│   │   │   └── chunker.py       # Estrategia de chunking por doc_type
│   │   │
│   │   ├── storage.py           # S3-compatible file storage (compartido con NocoDB)
│   │   ├── nocodb_webhook.py    # Webhook handler para eventos de NocoDB
│   │   │
│   │   ├── media/
│   │   │   ├── transcription.py # Whisper API para audios
│   │   │   └── processor.py     # Extrae info estructurada de transcripciones
│   │   │
│   │   ├── leads/
│   │   │   ├── qualification.py # Lógica de scoring de leads
│   │   │   ├── nurturing.py     # Flujo de seguimiento automático
│   │   │   └── alerts.py        # Notificaciones WhatsApp al vendedor
│   │   │
│   │   ├── handoff/
│   │   │   ├── manager.py       # Lógica de handoff: trigger, escalamiento, retoma
│   │   │   └── chatwoot.py      # Integración con Chatwoot API (crear conversación, sync mensajes)
│   │   │
│   │   └── obra/
│   │       ├── updates.py       # CRUD de actualizaciones de obra
│   │       ├── milestones.py    # Registro y gestión de hitos
│   │       └── notifier.py      # Envío personalizado a compradores
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
│       └── api.py               # Endpoints admin (pipeline, métricas, config)
│
├── migrations/
│   └── 001_initial_schema.sql
│
├── docs/
│   ├── CONTEXT.md
│   └── IMPLEMENTATION_PLAN.md
│
├── .env.example
├── requirements.txt
├── Dockerfile                 # Para deploy en cualquier plataforma
├── railway.toml               # Config Railway (producción)
├── render.yaml                # Config Render (desarrollo gratis)
└── README.md
```

---

## 8. Variables de Entorno

```
# Database (Neon free tier en dev, Railway en produccion)
DATABASE_URL=postgresql://user:password@host:5432/realia

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=                  # Whisper transcription + embeddings

# WhatsApp provider: "twilio" for dev, "meta" for production
WHATSAPP_PROVIDER=twilio

# Twilio WhatsApp Sandbox (dev)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=+14155238886

# WhatsApp Cloud API / Meta (production)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=

# S3-compatible storage (compartido entre Realia, NocoDB, Chatwoot)
S3_ENDPOINT_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=realia-docs
S3_PUBLIC_URL=

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
| **Clasificacion conversacional de docs por WhatsApp** | Cuando un developer envia un archivo sin contexto, el agente pregunta proyecto, tipo, y metadata antes de guardar. Si el mensaje incluye contexto, Claude lo extrae automaticamente. |
| **El agente envia documentos, no solo responde sobre ellos** | Cuando un lead pide planos o precios, el agente los envia como PDF/imagen por WhatsApp ademas de responder con texto. Diferencia clave de UX. |
| **WhatsApp para operativo, Chatwoot para ventas** | El Modo Developer (audios de obra, PDFs, hitos) sigue siendo por WhatsApp. Solo el handoff de ventas va a Chatwoot. Cada herramienta donde rinde. |
| **Dos instancias de PostgreSQL en Railway** | Realia y NocoDB comparten PG porque NocoDB es un cliente que se conecta a nuestras tablas existentes. Chatwoot necesita PG propia porque tiene 80+ tablas internas y un schema que no controlamos. Comunicacion entre Realia y Chatwoot es API + webhooks, nunca por DB compartida. |
| **Railway como plataforma unica de deploy** | Todo corre en Railway: Realia (FastAPI), NocoDB, Chatwoot, las 2 instancias de PG. Simplifica networking (comunicacion interna sin internet publico), deploy, logs, y scaling. El unico servicio externo de infra es Cloudflare R2 para S3 storage. |
| **Comunicacion entre servicios por API + webhooks** | Realia ↔ Chatwoot y NocoDB → Realia se comunican via HTTP. Sin colas ni message brokers. Cada servicio tiene su webhook endpoint en Realia. Mantenemos la complejidad baja. |
| **WhatsApp provider pattern (Twilio / Meta)** | `WHATSAPP_PROVIDER` env var selecciona Twilio (sandbox gratis, setup 5min) o Meta (Cloud API, produccion). El resto del código trabaja con `IncomingMessage` normalizado y funciones `send_text`, `send_document`, etc. Cambiar provider = cambiar 1 variable de entorno. |

---

## 10. Roadmap

### V1 (8 semanas)

| Semanas | Objetivo |
|---|---|
| 1-2 | RAG engine: ingesta, chunking, pgvector, endpoint de consulta testeable |
| 3-4 | Agente WhatsApp Modo Lead: webhook, role router, calificación, estado persistente, alertas WhatsApp al vendedor |
| 5-6 | Modo Developer: audio transcription (Whisper), ingesta de PDFs vía WhatsApp, updates de obra por audio/texto. Integración RAG + agente. Testing con docs reales del cliente ancla |
| 7-8 | Seguimiento de obra: hitos, notificaciones personalizadas a compradores. Admin API básica para analytics |

### V2 (post-piloto)

- Next.js admin dashboard (pipeline de leads, analytics, config de proyectos)
- Simulador de cuotas y financiamiento (widget web embebible)
- Ingesta de imágenes de planos con OCR/vision para extraer metadata automáticamente
- Portal de captación de terrenos para próximos desarrollos
- Multi-tenant completo para onboarding sin intervención técnica
