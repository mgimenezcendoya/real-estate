# REALIA — Nuevas Features: Diseño y Plan

**Fecha:** 2026-03-14
**Prioridad:** Features ordenadas por impacto en negocio y dependencias técnicas.

---

## Orden de implementación

1. **Mapa de Ubicación** ← arranca aquí
2. **Generador de Memoria Descriptiva (PDF)**
3. **Firma Digital (simple)**
4. **Calendario de Citas**
5. **Olvide Contraseña** ← bloqueado hasta tener email configurado

---

## Feature 1 — Mapa de Ubicación

**Objetivo:** Mostrar la ubicación geográfica de cada proyecto en el admin y en el futuro portal público.

### Flujo
1. En la edición del proyecto, el admin ingresa lat/lng o busca la dirección
2. En el dashboard del proyecto `/proyectos/[id]` aparece un widget de mapa con el pin
3. En el portal público (cuando exista), la ficha del proyecto incluye el mismo mapa

### Stack
- **Librería:** Leaflet + OpenStreetMap (gratuito, sin API key)
- **Componente:** `MapView` reutilizable en `frontend/src/components/`
- Google Maps se evalúa más adelante si se necesita búsqueda de direcciones avanzada

### DB
- Agregar columnas `lat FLOAT` y `lng FLOAT` a la tabla `projects`

### Puntos de entrada UI
- Widget en `/proyectos/[id]` (dashboard del proyecto)
- Campo en el modal/form de edición del proyecto

---

## Feature 2 — Generador de Memoria Descriptiva (PDF)

**Objetivo:** Reemplazar el proceso manual en Canva. El admin completa un formulario y obtiene un PDF profesional automáticamente.

### Flujo
1. Admin entra a `/proyectos/[id]/documentos` → botón "Generar Memoria Descriptiva"
2. Completa formulario estructurado: datos generales, características, materiales, imágenes
3. Backend inyecta los datos en un template HTML/CSS y genera PDF con Playwright
4. PDF se guarda en Supabase S3 (estructura existente: `orgs/{org_id}/projects/{slug}/documentos/`)
5. Aparece en la lista de documentos del proyecto con botón "Ver PDF"

### Stack
- **Backend:** Playwright (Python) para render HTML → PDF
- **Template:** HTML/CSS con diseño de marca, variables tipo `{{nombre_proyecto}}`
- **Storage:** Supabase S3 (mismo sistema que facturas)

### DB
- Nueva tabla `project_documents` (project_id, tipo, nombre, url_pdf, generado_at, datos_json)

---

## Feature 3 — Firma Digital (simple)

**Objetivo:** Permitir que clientes y vendedores firmen documentos digitalmente desde el admin. Primera versión: firma dibujada. Segunda versión (futura): proveedor legal (DocuSign/Signaturit).

### Flujo
1. Al generar un documento, paso final "Firma del cliente"
2. Canvas interactivo para dibujar la firma (librería `signature_pad`)
3. Firma guardada como base64 en DB, asociada al documento
4. PDF generado incluye la firma en la página de cierre

### Stack
- **Frontend:** `react-signature-canvas` o `signature_pad`
- **Backend:** base64 embebida en el HTML template antes de generar PDF

### DB
- Columna `firma_base64 TEXT` y `firmado_at TIMESTAMP` en `project_documents`

---

## Feature 4 — Calendario de Citas

**Objetivo:** Los vendedores agendan visitas/llamadas con leads desde el admin.

### Flujo
1. Nueva ruta `/proyectos/[id]/citas` (tab o sección propia)
2. Vista semanal del calendario
3. Click en slot → modal: lead, fecha/hora, tipo (visita/llamada/reunión), notas
4. Notificación opcional por WhatsApp al lead al confirmar
5. Las citas aparecen también en la ficha del lead dentro del Kanban

### Stack
- **Frontend:** `react-big-calendar` o similar
- **Backend:** endpoints CRUD en `/admin/citas/{project_id}`

### DB
- Nueva tabla `citas` (id, project_id, lead_id, vendedor_id, fecha, tipo, estado, notas, created_at)

---

## Feature 5 — Olvide Contraseña (BLOQUEADA)

**Estado:** Pendiente hasta tener email (SMTP / Resend / SendGrid) configurado.

### Flujo planeado
1. Pantalla de login → link "¿Olvidaste tu contraseña?"
2. Usuario ingresa email → sistema envía link de reseteo con token
3. Usuario hace click en link → formulario para nueva contraseña
4. Token expira en 1 hora

### Stack (cuando esté listo)
- **Email:** Resend o SendGrid (a definir)
- **Backend:** tabla `password_reset_tokens` (user_id, token, expires_at, used)

---

## Notas generales

- Todas las features del admin siguen el patrón auth existente: `credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)`
- Storage en Supabase S3 bajo `orgs/{org_id}/projects/{slug}/`
- Migraciones nuevas se aplican en Railway (base activa), nunca en Neon
- No instalar nuevas librerías de íconos — usar Lucide React
