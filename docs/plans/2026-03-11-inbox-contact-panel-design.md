# Inbox — Panel de Detalle de Contacto

**Fecha:** 2026-03-11
**Estado:** Aprobado

## Objetivo

Agregar un panel lateral derecho colapsable en el inbox que muestre información del contacto seleccionado: datos generales, etiquetas y notas internas.

## Backend

### Migración SQL
Agregar dos columnas a la tabla `leads`:
```sql
ALTER TABLE leads ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE leads ADD COLUMN internal_notes TEXT;
```

### Endpoint nuevo
`PATCH /admin/leads/{id}/details`
- Body: `{ tags?: string[], internal_notes?: string }`
- Respuesta: lead actualizado
- Auth: misma que el resto de endpoints (HTTPAuthorizationCredentials)

### Impacto en endpoints existentes
- `GET /admin/leads` y `GET /admin/leads/{id}` devuelven los nuevos campos automáticamente sin cambios en el código (columnas nuevas se incluyen en SELECT *)

## Frontend

### Layout
- El inbox pasa de 2 a 3 paneles en desktop
- Panel derecho: `w-[280px]`, colapsable via botón toggle en el header del chat
- En mobile: el panel no existe (datos ya accesibles via header)
- Estado de visibilidad: `showContactPanel` (useState, default `true`)

### Componente: `ContactDetailPanel`
Ubicación: `/frontend/src/app/inbox/ContactDetailPanel.tsx`

#### Secciones

**1. Header**
- Avatar con iniciales (mismo estilo que sidebar)
- Nombre del lead
- Teléfono
- Badge score (hot=rojo, warm=ámbar, cold=azul)
- Badge "Bot activo" / "Humano activo" según `handoff_active`

**2. Datos del Contacto**
| Campo | Valor |
|-------|-------|
| Proyecto | Link a `/proyectos/{id}` |
| Score | Badge con color |
| Creado | Fecha formateada (DD/MM/YYYY) |
| Handoff | "Activo" / "Inactivo" |

**3. Etiquetas**
- Chips de tags activos con botón `×` para eliminar
- Input "Agregar etiqueta..." — Enter o click afuera guarda
- Sugerencias predefinidas clickeables: `urgente`, `seguimiento`, `reclamo`, `pre-aprobado`, `primer contacto`, `sin respuesta`
- Auto-guarda via PATCH con debounce de 800ms al modificar

**4. Notas Internas**
- Modo lectura: muestra texto o "Sin notas." en gris con ícono lápiz
- Modo edición: textarea con botón "Guardar" explícito
- PATCH al backend al hacer click en Guardar

### Estado y sincronización
- Tags y notas se cargan junto con el lead (`/admin/leads/{id}`)
- Actualizaciones optimistas: UI cambia inmediatamente, PATCH en background
- En error: revertir al estado anterior + `toast.error()`

### Toggle del panel
- Botón con ícono `PanelRight` (Lucide) en el header del chat
- Estilo: mismo que los otros botones del header (ghost, rounded)
