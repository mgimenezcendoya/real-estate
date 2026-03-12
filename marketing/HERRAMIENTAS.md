# Stack de Marketing — Realia

> Última actualización: 2026-03-11
> Guía de herramientas, cuentas y configuración para ejecutar la estrategia de captación.

---

## Resumen rápido

| Herramienta | Para qué | Costo | Prioridad | Estado |
|-------------|----------|-------|-----------|--------|
| **LinkedIn personal** | Outbound, contenido, networking | $0 | Crítico | [ ] Optimizar |
| **LinkedIn company page** | Credibilidad, link en perfil | $0 | Importante | [ ] Crear |
| **WhatsApp Business** | Follow-ups, demos, contacto directo | $0 | Crítico | [ ] Número real |
| **Cal.com** | Agendar demos | $0 (free tier) | Crítico | [ ] Configurar |
| **Loom** | Video demo + videos outbound | $0 (free tier) | Crítico | [ ] Crear cuenta |
| **Canva** | Carousels, banners, posts LinkedIn | $0 (free tier) | Importante | [ ] Crear cuenta |
| **Google Sheets** | Tracking outbound + métricas | $0 | Crítico | [ ] Crear sheet |
| **Plausible** | Analytics del landing | USD 9/mes | Importante | [ ] Configurar |
| **Google Search Console** | Monitorear indexación y búsquedas | $0 | Nice to have | [ ] Verificar dominio |
| **Notion** (opcional) | Base de conocimiento compartible | $0 (free tier) | Nice to have | [ ] Evaluar |

**Costo total del stack: USD 0–9/mes** (todo free tier excepto analytics si elegís Plausible).

---

## 1. LinkedIn — Tu canal principal

### Perfil personal (CRÍTICO — prioridad #1)

**Por qué personal y no solo empresa:** En B2B, la gente conecta con personas, no con logos. Tu perfil personal va a generar 10x más engagement que la company page. El 90% de tu outbound y contenido sale de acá.

**Qué optimizar:**

| Elemento | Recomendación |
|----------|---------------|
| **Headline** | No poner "CEO de Realia". Poner algo orientado al cliente: `Ayudo a desarrolladoras inmobiliarias a no perder leads fuera de horario · Founder @Realia` |
| **Banner** | Imagen profesional con propuesta de valor. Hacerlo en Canva (1584x396px). Texto sugerido: "El copiloto de IA para desarrolladoras en pozo" + logo + mockup del producto |
| **About** | 3-4 párrafos: (1) El problema que resolvés, (2) Cómo lo resolvés, (3) Para quién, (4) CTA a demo. Incluir datos: "40% de consultas llegan fuera de horario" |
| **Experiencia** | Agregar Realia como experiencia actual con descripción del producto |
| **Featured** | Fijar: (1) el video Loom de 3 min, (2) link al landing, (3) el 1-pager PDF |
| **URL personalizada** | Cambiar a linkedin.com/in/tunombre (sin números random) |

**Assets necesarios:** guardados en `marketing/linkedin/profile/`

### Company page de Realia

**Para qué sirve:** Da credibilidad cuando un prospecto investiga. No es donde vas a publicar (al menos no ahora). Es el respaldo visual.

**Qué configurar:**

- Logo (usar el SVG que ya existe)
- Banner (misma línea que el perfil personal)
- Descripción: 2-3 párrafos con posicionamiento + link al landing
- Industry: Technology, Information and Internet
- Company size: 2-10
- Specialties: Real estate tech, AI, WhatsApp automation

**No publicar contenido acá todavía.** Todo el contenido sale de tu perfil personal. La company page es solo para que cuando alguien haga clic en "Realia" desde tu experiencia, vea algo profesional.

### Instagram — NO todavía

Como dice la estrategia (sección 10): tu buyer no busca software en Instagram. Abrir Instagram tiene sentido recién en semanas 11-12, cuando tengas:
- Case studies con resultados reales
- Screenshots y videos del producto en acción
- Al menos 5-10 clientes (para social proof)

Cuando lo abras, será como canal de **contenido visual** (reels cortos, carousels), no como canal de outbound.

---

## 2. Herramientas — Setup detallado

### Cal.com — Agenda de demos

**Por qué Cal.com y no Calendly:** Cal.com es open source, el free tier es más generoso, y permite custom branding gratis (Calendly cobra por eso).

**Configuración:**

1. Crear cuenta en [cal.com](https://cal.com)
2. Crear evento tipo: **"Demo Realia — 15 minutos"**
   - Duración: 15 min (la demo real puede ser 20, pero 15 min suena menos compromiso)
   - Buffer entre reuniones: 10 min
   - Disponibilidad: Lunes a viernes 9-18hs Argentina (UTC-3)
   - Zona horaria: America/Argentina/Buenos_Aires
3. Personalizar la página de reserva:
   - Título: "Agendá una demo personalizada de Realia"
   - Descripción: "En 15 minutos te muestro tu proyecto funcionando con IA. Sin compromiso."
4. Agregar pregunta obligatoria: "¿Nombre de tu desarrolladora y proyecto activo?" (esto te da info para personalizar la demo)
5. Configurar confirmación por email + recordatorio 1h antes
6. Integrar con Google Calendar

**Link resultante:** algo como `cal.com/tunombre/demo-realia` — este link va en:
- Bio de LinkedIn
- One-pager PDF
- Footer de emails
- Mensajes de follow-up

### Loom — Videos

**Free tier:** hasta 25 videos de 5 min cada uno. Suficiente para arrancar.

**Configuración:**

1. Crear cuenta en [loom.com](https://www.loom.com)
2. Instalar la extensión de Chrome
3. Configurar: pantalla + cámara (burbuja abajo a la derecha)

**Videos a grabar:**

| Video | Duración | Uso | Guardado en |
|-------|----------|-----|-------------|
| **Demo general** | 3 min | Outbound LinkedIn, landing, featured section | `marketing/videos/demo-general.md` (link) |
| **Video por vertical** | 1-2 min | Cuando personalices para un prospecto | Grabar ad-hoc |
| **"Así responde Realia a las 3AM"** | 30 seg | Post LinkedIn del viernes | `marketing/linkedin/posts/` |

### Canva — Diseño de contenido

**Free tier** alcanza para todo lo que necesitás ahora.

**Templates a crear:**

| Asset | Medida | Para qué |
|-------|--------|----------|
| **LinkedIn post image** | 1200x1200px | Posts de lunes y miércoles |
| **LinkedIn carousel** | 1080x1350px (PDF) | "5 cosas que tu equipo no debería hacer manualmente" |
| **LinkedIn banner personal** | 1584x396px | Tu perfil |
| **LinkedIn banner company** | 1128x191px | Company page |

**Brand kit en Canva:**
- Primario: `#1d4ed8` (azul Realia)
- Secundario: `#6366f1` (indigo)
- Texto: `#0f172a`
- Fuente títulos: Outfit Bold
- Fuente body: DM Sans Regular

Guardar los templates de Canva y los exports en `marketing/assets/`.

### Google Sheets — Tracking

Necesitás **dos sheets** (o dos tabs en uno):

**Sheet 1: Prospecting Tracker** (complementa el CSV)
- Importar `prospecting_list.csv` como base
- Agregar columnas de tracking: fecha de connection request, fecha de mensaje, fecha de follow-up WA, fecha de demo, resultado
- Esto es tu mini-CRM hasta que tengas volumen para algo más

**Sheet 2: Weekly Metrics**
- Una fila por semana
- Columnas: requests enviados, conexiones, conversaciones, demos agendadas, demos hechas, propuestas, cierres
- Targets de ESTRATEGIA.md como referencia

### Plausible — Analytics del landing

**Por qué Plausible y no Google Analytics:** Es más simple, no requiere cookies, cumple GDPR/privacidad, y la interfaz es limpia. Cuesta USD 9/mes pero vale la pena vs. GA4 que es gratis pero complejo.

**Alternativa gratuita:** Si no querés pagar, usá [Umami](https://umami.is/) (self-hosted gratis en Vercel/Railway) o Google Analytics 4 (gratis pero más complejo).

**Configuración:**
1. Crear cuenta en [plausible.io](https://plausible.io)
2. Agregar dominio `realia.lat`
3. Pegar el script en el `<head>` del landing
4. Configurar goals: "Form submit" y "WhatsApp click"

---

## 3. Cuentas a crear — Checklist de setup

### Día 1 — Lo urgente

- [ ] **LinkedIn personal:** optimizar headline, about, banner, featured
- [ ] **Cal.com:** crear cuenta + evento "Demo Realia 15 min" + link personalizado
- [ ] **Loom:** crear cuenta + instalar extensión Chrome
- [ ] **WhatsApp Business:** definir el número real para ventas (reemplazar placeholder en landing)

### Día 2 — Lo importante

- [ ] **LinkedIn company page:** crear con logo, banner, descripción
- [ ] **Canva:** crear cuenta + brand kit (colores, fuentes) + templates base
- [ ] **Google Sheets:** crear prospecting tracker importando el CSV

### Día 3 — Lo complementario

- [ ] **Plausible/Umami:** crear cuenta + integrar en landing
- [ ] **Google Search Console:** verificar `realia.lat`
- [ ] **Loom:** grabar video demo de 3 minutos

---

## 4. Lo que NO necesitás todavía

| Herramienta | Por qué no ahora | Cuándo sí |
|-------------|-------------------|-----------|
| **HubSpot/Pipedrive** | El CSV + Sheet alcanza con <50 prospectos activos | Con 100+ prospectos o cuando necesites email sequences |
| **Mailchimp/Resend** | No tenés lista de emails todavía | Cuando tengas 50+ contactos para nurturing |
| **LinkedIn Sales Navigator** | USD 80/mes, el plan free de LinkedIn alcanza para 50 requests/semana | Si el free te limita demasiado (mes 2-3) |
| **Figma** | Los templates de Canva alcanzan para LinkedIn | Si contratás un diseñador o querés carousels más complejos |
| **Buffer/Hootsuite** | Publicás 3 posts/semana, no necesitás scheduler | Con 5+ posts/semana o si querés programar en batch |
| **Instagram** | Tu buyer no busca software ahí | Semana 11-12, con case studies y contenido visual |
| **Notion** | Overkill para un equipo de 1 | Si sumás alguien al equipo de marketing |
| **Zapier/Make** | No hay automaciones que conectar todavía | Cuando quieras conectar Cal.com → Sheet → Slack automáticamente |

---

## 5. Flujo completo — Cómo encajan las herramientas

```
PROSPECCIÓN                           CONTENIDO
─────────────                         ─────────
Google Sheets (lista)                 Canva (diseño)
      │                                    │
      ▼                                    ▼
LinkedIn personal ──────────────► Posts 3x/semana
      │                                    │
      │ connection request                 │ engagement
      │ mensaje día +2                     │
      ▼                                    │
WhatsApp (audio día +5)                    │
      │                                    │
      ▼                                    │
Cal.com (agendar demo) ◄──────────────────┘
      │
      ▼
Loom (enviar video pre-demo si no agenda)
      │
      ▼
Demo en vivo (15 min)
      │
      ▼
Piloto gratuito 7 días
      │
      ▼
Cierre → Google Sheet (actualizar estado)
```

---

## 6. Estructura de carpetas

Toda la carpeta `marketing/` del repo está organizada así:

```
marketing/
├── ESTRATEGIA.md              ← Plan maestro (ya existe)
├── HERRAMIENTAS.md            ← Este documento
├── one-pager.html             ← 1-pager descargable (ya existe)
├── prospecting_list.csv       ← Lista de prospectos (ya existe)
│
├── linkedin/
│   ├── profile/               ← Textos y assets del perfil personal
│   │   └── README.md
│   ├── company-page/          ← Assets de la company page
│   │   └── README.md
│   └── posts/                 ← Borradores y calendario de posts
│       └── README.md
│
├── assets/
│   ├── brand/                 ← Logo, colores, fuentes (referencia)
│   │   └── README.md
│   ├── screenshots/           ← Capturas del producto para posts
│   │   └── README.md
│   └── carousels/             ← PDFs de carousels de LinkedIn
│       └── README.md
│
├── videos/                    ← Links a Loom + guiones
│   └── README.md
│
├── case-studies/              ← Cuando tengas clientes (mes 2+)
│   └── README.md
│
└── weekly-log/                ← Registro semanal de métricas
    └── README.md
```
