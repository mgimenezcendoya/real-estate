# Realia — Stack Técnico y Costos

> Última actualización: 2026-03-09

---

## 1. Stack actual (desarrollo)

Todo el entorno de desarrollo corre en free tiers. Costo fijo mensual: **$0 USD**.

| Servicio | Propósito | Plan | Costo mensual | Limitaciones clave |
|----------|-----------|------|---------------|-------------------|
| **Neon** | PostgreSQL + pgvector | Free | $0 | 0.5 GB storage, auto-suspend a los 5min (cold start ~500ms), 100 CU-hours/mes |
| **Render** | Backend FastAPI + Frontend Next.js (panel admin) | Hobby (free) | $0 | Spin-down a los 15min (~60s cold restart), 512 MB RAM, 0.1 CPU |
| **Vercel** | Landing page (estática) | Hobby (free) | $0 | CDN global, solo uso no-comercial en free |
| **Supabase Storage** | S3-compatible (archivos) | Free | $0 | 1 GB storage, 2 GB bandwidth/mes |
| **Twilio** | WhatsApp Sandbox (dev) | Pay-per-use | ~$0 | Sandbox: máx 50 msg/día en trial, sin templates |
| **Claude Haiku 4.5** | LLM (agente conversacional) | Pay-per-use | Variable | $1/M input tokens, $5/M output tokens |
| **OpenAI Whisper** | Transcripción de audio | Pay-per-use | ~$0 | $0.006/minuto |

### Costos variables (APIs pay-per-use)

Estimación para desarrollo activo (~50 conversaciones/día de testing):

| API | Uso estimado/mes | Costo estimado |
|-----|-----------------|----------------|
| Claude Haiku 4.5 | ~2M input + ~500K output tokens | ~$4.50 |
| Twilio WhatsApp | ~1500 mensajes | ~$0 (sandbox) |
| OpenAI Whisper | ~30 min audio | ~$0.18 |
| **Total variable** | | **~$5/mes** |

### Costos en producción (por tenant, estimado)

Con un tenant activo procesando ~1000 conversaciones/mes:

| API | Uso estimado/mes | Costo estimado |
|-----|-----------------|----------------|
| Claude Haiku 4.5 | ~10M input + ~3M output tokens | ~$25 |
| Meta WhatsApp Cloud API | ~5000 mensajes (service: gratis en ventana 24h) | ~$0-15 |
| OpenAI Whisper | ~120 min audio | ~$0.72 |
| **Total variable/tenant** | | **~$25-40/mes** |

---

## 2. Diagnóstico: dolores del stack actual

| Problema | Impacto | Severidad |
|----------|---------|-----------|
| **Render cold start (~60s)** | Primer mensaje de WhatsApp tarda 1 min. Twilio/Meta reenvían el webhook si no reciben 200 en 15s → mensajes duplicados o perdidos | CRITICO |
| **Neon cold start (~500ms)** | Primer query tras 5min idle agrega latencia. No bloqueante pero se suma al cold start de Render | MEDIO |
| **Neon 0.5 GB storage** | Para dev está bien. Para producción con múltiples tenants + conversaciones + documentos, se queda corto rápido | BAJO (solo afecta prod) |
| **Stack fragmentado (2 plataformas)** | Neon + Render = 2 dashboards, 2 configs, sin networking interno entre back y DB | BAJO |

### El problema más grave: cold starts en el webhook

```
Lead envía mensaje en WhatsApp
    → Meta/Twilio envía webhook a Render
    → Render está dormido (15min inactividad)
    → 60 segundos arrancando el container
    → Meta/Twilio timeout (15s) → reintenta
    → Segundo intento llega, Render ya levantó
    → Primer intento también llega → mensaje procesado 2 veces
```

Esto **no es aceptable para producción**. El webhook de WhatsApp necesita responder 200 en < 5 segundos.

---

## 3. Análisis: Railway como reemplazo unificado

### Qué es Railway

Plataforma de hosting que permite correr servicios (Docker containers) y bases de datos (PostgreSQL, Redis, etc.) en un solo lugar con networking interno.

### Planes relevantes

| Plan | Costo base | Créditos incluidos | Always-on | Límites por servicio |
|------|-----------|-------------------|-----------|---------------------|
| **Hobby** | $5/mes | $5 de uso | Si | 48 GB RAM, 48 vCPU, 6 replicas, 50 servicios |
| **Pro** | $20/mes | $20 de uso | Si | 1 TB RAM, 1000 vCPU, 42 replicas |

### Precios de recursos (después de créditos)

| Recurso | Precio |
|---------|--------|
| RAM | $10/GB/mes |
| CPU | $20/vCPU/mes |
| Storage (volumen) | $0.15/GB/mes |
| Egress | $0.05/GB |

### Consumo estimado para Realia en Railway Hobby

| Servicio | RAM | CPU | Storage | Costo estimado |
|----------|-----|-----|---------|---------------|
| FastAPI backend | ~256 MB | ~0.25 vCPU | — | ~$7.50/mes |
| PostgreSQL + pgvector | ~256 MB | ~0.1 vCPU | ~1 GB | ~$4.65/mes |
| **Total** | | | | **~$12/mes** |

Con los $5 de créditos incluidos: **~$7/mes efectivos**.

> Nota: estos son estimados conservadores. Con tráfico bajo de dev, el consumo real podría estar dentro de los $5 de créditos.

### Puede Railway reemplazar Neon + Render?

**Si. Railway puede hosear backend + PostgreSQL + pgvector en un solo lugar.**

| Capacidad | Neon (free) | Render (free) | Railway (Hobby $5) |
|-----------|-------------|---------------|---------------------|
| PostgreSQL | Si (serverless) | No (DB expira en 30 días) | Si (container dedicado) |
| pgvector | Si (nativo) | N/A | Si (template oficial) |
| Backend hosting | No | Si (con cold starts) | Si (always-on) |
| Always-on | No (suspend 5min) | No (suspend 15min) | **Si** |
| Cold start | ~500ms (DB) | ~60s (app) | **0ms** |
| Networking interno | N/A | N/A | **Si** (DB < 1ms latency) |
| Storage | 0.5 GB | Efímero | **Persistent volumes** |
| Dashboard unificado | No | No | **Si** |

---

## 4. Opciones de migración

### Opción A: Railway Hobby — todo en uno ($5/mes) [RECOMENDADA]

```
Railway Hobby ($5/mes)
├── FastAPI backend (servicio Docker, always-on)
├── Next.js panel admin (servicio Docker, always-on)
├── PostgreSQL + pgvector (servicio DB, always-on)
└── (futuro) Redis, workers, etc.

Vercel Free (se mantiene)
└── Landing page (estática, CDN global)
```

**Pros:**
- Backend + frontend + DB siempre encendidos → webhook responde en < 1s
- Networking interno → queries a DB en ~1ms (vs ~50ms externo a Neon)
- Un solo dashboard, un solo billing — reemplaza Neon + Render
- pgvector oficialmente soportado con template de un click
- Fácil agregar servicios después (Redis, Chatwoot, etc.)
- $5/mes incluye créditos que absorben parte del uso

**Contras:**
- Ya no es $0/mes (pero $5 es trivial para el valor que da)
- Frontend sin edge CDN (Vercel lo hace mejor para Next.js, pero para B2B Argentina no es crítico)
- PostgreSQL sin branching ni serverless auto-scale (features de Neon que no usás)
- Backup manual (vs Neon que tiene snapshots automáticos)

**Migración:**
1. `pg_dump` desde Neon
2. Crear PostgreSQL + pgvector en Railway
3. `pg_restore` en Railway
4. Deploy FastAPI + Next.js apuntando a la nueva DB (cambiar `DATABASE_URL` y env vars)
5. Apuntar DNS / webhooks a las nuevas URLs de Railway

### Opción B: Railway back + DB, panel admin en Vercel (híbrido)

```
Railway Hobby ($5/mes)
├── FastAPI backend (servicio Docker, always-on)
└── PostgreSQL + pgvector (servicio DB, always-on)

Vercel Free ($0)
├── Landing page (estática, CDN global)
└── Next.js panel admin (edge CDN, optimizado para Next.js)
```

**Pros:**
- Panel admin con CDN global y optimización nativa de Next.js
- Backend + DB en Railway con networking interno

**Contras:**
- Panel admin en Vercel free es solo para uso no-comercial (necesitás Pro $20/mes para producción)
- Dos plataformas para servicios core (Railway + Vercel)

### Opción C: Quedarse en Render + Neon (status quo)

**Solo viable para desarrollo.** No sirve para producción por los cold starts del webhook.

---

## 5. Recomendación

### Para ahora (desarrollo con cliente en testing): **Opción A — Railway todo en uno**

| Concepto | Costo |
|----------|-------|
| Railway Hobby (back + panel admin + DB) | $5/mes |
| Vercel Free (landing page) | $0 |
| Supabase Storage Free | $0 |
| APIs (Claude, Twilio, Whisper) | ~$5-10/mes |
| **Total** | **~$10-15/mes** |

### Para producción (primer cliente pagando): **Railway Hobby o Pro**

| Concepto | Hobby | Pro |
|----------|-------|-----|
| Railway base (back + front + DB) | $5/mes | $20/mes |
| Recursos estimados (1 tenant) | ~$10-15/mes | ~$10-15/mes |
| APIs (Claude, WhatsApp, Whisper) | ~$25-40/mes | ~$25-40/mes |
| **Total** | **~$40-60/mes** | **~$55-75/mes** |

> El salto a Pro se justifica cuando necesitás: más replicas, Railway Support, 30-day log history, o concurrent global regions.
> Si en algún momento necesitás CDN global para el frontend, podés mover solo el Next.js a Vercel Pro ($20/mes) y dejar back + DB en Railway.

---

## 6. Dónde vive cada frontend

Realia tiene dos frontends distintos con necesidades opuestas:

### Landing page → Vercel Free (se mantiene)

Contenido estático público. Se beneficia de CDN global, caching agresivo, y cero costo. No hay razón para moverla.

### Panel admin (Next.js) → Railway (junto con back + DB)

App B2B interna para vendedores/admins (2-10 usuarios por tenant, todos en Argentina). Necesita:
- **Always-on** (un admin no puede esperar 60s de cold start para abrir el inbox)
- **Misma red que el backend** (las llamadas API son internas, ~1ms vs ~50ms externo)
- **SSE en tiempo real** (inbox de mensajes con Server-Sent Events)

No necesita:
- CDN global (usuarios en una sola región)
- Edge functions (no hay rendering distribuido)
- ISR/SSG optimizado (no es un sitio de alto tráfico público)

| Aspecto | Vercel | Railway | Ganador para panel admin |
|---------|--------|---------|------------------------|
| Always-on | Si (Pro $20/mes) | Si ($5/mes compartido) | **Railway** (más barato) |
| Networking interno con backend | No (requiere llamadas externas) | Si (~1ms latency) | **Railway** |
| CDN global | Si | No | Vercel (pero no lo necesitás) |
| Edge functions | Si | No | Vercel (pero no las usás) |
| Uso comercial | Solo Pro ($20/mes) | Si (Hobby $5/mes) | **Railway** |
| Costo incremental | $0-20/mes extra | ~$3-5/mes del mismo plan | **Railway** |

**Conclusión:** El panel admin está mejor en Railway. Ahorrás $15-20/mes vs Vercel Pro, ganás networking interno con el backend, y tenés todo en un solo lugar.

---

## 7. Resumen de costos por fase

| Fase | Stack | Costo/mes |
|------|-------|-----------|
| **Dev actual** | Neon + Render (free) + APIs | ~$5 (solo APIs) |
| **Dev mejorado** | Railway Hobby (todo en uno) + APIs | ~$10-15 |
| **Producción MVP** | Railway Hobby + APIs (1 tenant) | ~$40-60 |
| **Producción escalada** | Railway Pro + APIs (5 tenants) | ~$120-200 |

Con el modelo de revenue share al 1.5% sobre unidades de $60-100K USD, una sola venta cubre ~6-12 meses de infraestructura.
