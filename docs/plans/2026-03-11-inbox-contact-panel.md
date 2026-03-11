# Inbox Contact Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar un panel lateral derecho colapsable en el inbox con datos del contacto, etiquetas y notas internas persistidas en el backend.

**Architecture:** Se agrega una migración SQL que suma `tags TEXT[]` e `internal_notes TEXT` a la tabla `leads`. Se extienden el endpoint GET y el PATCH existentes para incluir esos campos. En el frontend se crea el componente `ContactDetailPanel` y se integra al layout del inbox con un toggle.

**Tech Stack:** FastAPI + asyncpg (backend), Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui v3 (frontend)

---

### Task 1: Migración SQL — agregar `tags` e `internal_notes` a `leads`

**Files:**
- Create: `migrations/034_leads_tags_notes.sql`

**Step 1: Crear el archivo de migración**

```sql
-- 034: Add tags and internal_notes to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS internal_notes TEXT;
```

**Step 2: Aplicar la migración en la base de datos**

```bash
psql $DATABASE_URL -f migrations/034_leads_tags_notes.sql
```

Expected: `ALTER TABLE` dos veces, sin errores.

**Step 3: Verificar**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'leads' AND column_name IN ('tags', 'internal_notes');
```

Expected: 2 filas — `tags` (ARRAY), `internal_notes` (text).

**Step 4: Commit**

```bash
git add migrations/034_leads_tags_notes.sql
git commit -m "feat: add tags and internal_notes columns to leads"
```

---

### Task 2: Backend — exponer `tags` e `internal_notes` en GET y PATCH

**Files:**
- Modify: `app/admin/api.py:1423-1425` (UPDATABLE_LEAD_FIELDS)
- Modify: `app/admin/api.py:1559-1568` (SELECT en get_lead)

**Step 1: Ampliar UPDATABLE_LEAD_FIELDS**

En `app/admin/api.py`, línea 1423–1425, cambiar:

```python
UPDATABLE_LEAD_FIELDS = {
    "name", "score", "source", "budget_usd", "intent", "timeline", "financing", "bedrooms", "location_pref",
}
```

Por:

```python
UPDATABLE_LEAD_FIELDS = {
    "name", "score", "source", "budget_usd", "intent", "timeline", "financing", "bedrooms", "location_pref",
    "tags", "internal_notes",
}
```

**Step 2: Agregar los campos al SELECT de get_lead**

En `app/admin/api.py`, línea 1561–1564, cambiar:

```python
        SELECT l.id, l.project_id, l.phone, l.name, l.intent, l.financing, l.timeline,
               l.budget_usd, l.bedrooms, l.location_pref, l.score, l.source,
               l.created_at, l.last_contact,
               p.organization_id
```

Por:

```python
        SELECT l.id, l.project_id, l.phone, l.name, l.intent, l.financing, l.timeline,
               l.budget_usd, l.bedrooms, l.location_pref, l.score, l.source,
               l.created_at, l.last_contact, l.tags, l.internal_notes,
               p.organization_id
```

**Step 3: Verificar manualmente**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/admin/leads/{id} | python3 -m json.tool | grep -E "tags|internal_notes"
```

Expected: `"tags": []`, `"internal_notes": null`

**Step 4: Probar PATCH**

```bash
curl -s -X PATCH http://localhost:8000/admin/leads/{id} \
  -H "Content-Type: application/json" \
  -d '{"tags": ["urgente", "seguimiento"], "internal_notes": "Lead muy interesado, llamar el lunes"}'
```

Expected: `{"updated": ["tags", "internal_notes"], ...}`

**Step 5: Commit**

```bash
git add app/admin/api.py
git commit -m "feat: expose tags and internal_notes in leads GET and PATCH"
```

---

### Task 3: Frontend — extender tipos y API client

**Files:**
- Modify: `frontend/src/lib/api.ts:113-130` (interface Lead)
- Modify: `frontend/src/lib/api.ts:635-636` (updateLead)

**Step 1: Agregar campos a la interfaz Lead**

En `api.ts`, línea 113–130, agregar `tags` e `internal_notes` al interface:

```typescript
export interface Lead {
  id: string;
  project_id: string;
  phone: string;
  name: string;
  intent: string;
  financing?: string;
  timeline?: string;
  budget_usd: number;
  bedrooms: number;
  location_pref: string;
  score?: 'hot' | 'warm' | 'cold' | null;
  source?: string;
  created_at: string;
  last_contact?: string;
  project_name?: string;
  handoff_active?: boolean;
  tags?: string[];
  internal_notes?: string | null;
}
```

**Step 2: Agregar función `patchLeadDetails` al api client**

Después de `updateLead` (línea 636), agregar:

```typescript
patchLeadDetails: (leadId: string, details: { tags?: string[]; internal_notes?: string | null }) =>
  fetcher(`/admin/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(details) }),
```

**Step 3: Verificar que no hay errores de TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores.

**Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add tags and internal_notes to Lead type and api client"
```

---

### Task 4: Crear componente `ContactDetailPanel`

**Files:**
- Create: `frontend/src/app/inbox/ContactDetailPanel.tsx`

**Step 1: Crear el componente**

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X, PanelRightClose } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Lead } from '@/lib/api';
import { toast } from 'sonner';

const PREDEFINED_TAGS = ['urgente', 'seguimiento', 'reclamo', 'pre-aprobado', 'primer contacto', 'sin respuesta'];

const SCORE_CONFIG = {
  hot: { label: 'Hot', className: 'bg-red-100 text-red-700 border-red-200' },
  warm: { label: 'Warm', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  cold: { label: 'Cold', className: 'bg-blue-100 text-blue-700 border-blue-200' },
};

interface ContactDetailPanelProps {
  lead: Lead;
  handoffActive: boolean;
  onClose: () => void;
}

export function ContactDetailPanel({ lead, handoffActive, onClose }: ContactDetailPanelProps) {
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [notes, setNotes] = useState<string>(lead.internal_notes ?? '');
  const [tagInput, setTagInput] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when lead changes
  useEffect(() => {
    setTags(lead.tags ?? []);
    setNotes(lead.internal_notes ?? '');
    setEditingNotes(false);
  }, [lead.id]);

  const saveTags = (newTags: string[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await api.patchLeadDetails(lead.id, { tags: newTags });
      } catch {
        toast.error('Error al guardar etiquetas');
      }
    }, 800);
  };

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || tags.includes(normalized)) return;
    const newTags = [...tags, normalized];
    setTags(newTags);
    saveTags(newTags);
  };

  const removeTag = (tag: string) => {
    const newTags = tags.filter(t => t !== tag);
    setTags(newTags);
    saveTags(newTags);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.patchLeadDetails(lead.id, { internal_notes: notes });
      setEditingNotes(false);
      toast.success('Notas guardadas');
    } catch {
      toast.error('Error al guardar notas');
    } finally {
      setSavingNotes(false);
    }
  };

  const initials = (lead.name || lead.phone)
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const formattedDate = new Date(lead.created_at).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const suggestedTags = PREDEFINED_TAGS.filter(t => !tags.includes(t));

  return (
    <div className="flex flex-col h-full border-l border-border bg-background overflow-y-auto">
      {/* Header con botón cerrar */}
      <div className="flex items-center justify-end px-4 pt-4 pb-2">
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Cerrar panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Avatar + nombre */}
      <div className="flex flex-col items-center gap-2 px-4 pb-5">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="font-semibold text-foreground text-sm leading-tight">
            {lead.name || 'Sin nombre'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{lead.phone}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {lead.score && (
            <Badge variant="outline" className={cn('text-xs', SCORE_CONFIG[lead.score]?.className)}>
              {SCORE_CONFIG[lead.score]?.label}
            </Badge>
          )}
          <Badge variant="outline" className={cn(
            'text-xs',
            handoffActive
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
          )}>
            {handoffActive ? 'Humano activo' : 'Bot activo'}
          </Badge>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Datos del contacto */}
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Datos del Contacto
        </p>
        <dl className="space-y-2">
          {lead.project_name && (
            <div className="flex justify-between items-center">
              <dt className="text-xs text-muted-foreground">Proyecto</dt>
              <dd className="text-xs text-foreground font-medium truncate max-w-[140px]">{lead.project_name}</dd>
            </div>
          )}
          <div className="flex justify-between items-center">
            <dt className="text-xs text-muted-foreground">Creado</dt>
            <dd className="text-xs text-foreground tabular">{formattedDate}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-xs text-muted-foreground">Handoff</dt>
            <dd className={cn('text-xs font-medium', handoffActive ? 'text-green-600' : 'text-muted-foreground')}>
              {handoffActive ? 'Activo' : 'Inactivo'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-border" />

      {/* Etiquetas */}
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Etiquetas
        </p>

        {/* Tags activos */}
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground italic mb-2">Sin etiquetas</p>
        ) : (
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 glass-pill text-xs text-foreground px-2 py-0.5 rounded-full"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input nueva etiqueta */}
        <input
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Agregar etiqueta..."
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />

        {/* Sugeridas */}
        {suggestedTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {suggestedTags.map(tag => (
              <button
                key={tag}
                onClick={() => addTag(tag)}
                className="text-xs text-primary hover:text-primary/80 glass-pill px-2 py-0.5 rounded-full transition-colors"
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Notas internas */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notas Internas
          </p>
          {!editingNotes && (
            <button
              onClick={() => setEditingNotes(true)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              className="w-full text-xs px-2.5 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-colors"
              placeholder="Agregar notas internas..."
              autoFocus
            />
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={() => { setNotes(lead.internal_notes ?? ''); setEditingNotes(false); }}
                className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <Check size={11} />
                {savingNotes ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <p className={cn('text-xs', notes ? 'text-foreground' : 'text-muted-foreground italic')}>
            {notes || 'Sin notas. Hace click en el lápiz para agregar.'}
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores.

**Step 3: Commit**

```bash
git add frontend/src/app/inbox/ContactDetailPanel.tsx
git commit -m "feat: ContactDetailPanel component with tags and notes"
```

---

### Task 5: Integrar el panel en el layout del inbox

**Files:**
- Modify: `frontend/src/app/inbox/page.tsx`

**Step 1: Agregar import del componente y el ícono**

Al principio del archivo, agregar import:

```tsx
import { ContactDetailPanel } from './ContactDetailPanel';
```

En el import de lucide-react, agregar `PanelRight` a la lista existente.

**Step 2: Agregar estado del panel**

Dentro del componente `InboxPage`, junto a los otros `useState`, agregar:

```tsx
const [showContactPanel, setShowContactPanel] = useState(true);
```

**Step 3: Agregar botón toggle en el header del chat**

En el header del chat (la sección con el avatar y nombre del lead seleccionado), buscar los botones existentes en la esquina derecha y agregar el toggle:

```tsx
<button
  onClick={() => setShowContactPanel(v => !v)}
  title={showContactPanel ? 'Ocultar panel' : 'Mostrar panel'}
  className={cn(
    'p-1.5 rounded-md transition-colors',
    showContactPanel
      ? 'text-primary bg-primary/10'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  )}
>
  <PanelRight size={16} />
</button>
```

**Step 4: Agregar el panel al layout**

El layout actual del inbox es:
```tsx
<div className="flex h-full">
  {/* sidebar */}
  {/* chat */}
</div>
```

Cambiarlo para incluir el panel derecho cuando hay un lead seleccionado:

```tsx
<div className="flex h-full overflow-hidden">
  {/* sidebar — sin cambios */}

  {/* chat — sin cambios */}

  {/* Panel derecho */}
  {selectedLead && showContactPanel && (
    <div className="hidden lg:flex flex-col w-[280px] shrink-0">
      <ContactDetailPanel
        lead={selectedLead}
        handoffActive={handoffActive}
        onClose={() => setShowContactPanel(false)}
      />
    </div>
  )}
</div>
```

Donde `selectedLead` es el lead actualmente seleccionado (el que se usa para renderizar el chat).

**Step 5: Verificar TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: sin errores.

**Step 6: Verificar en browser**

1. Abrir el inbox en `http://localhost:3000/inbox`
2. Seleccionar un contacto → verificar que el panel aparece a la derecha
3. Click en el botón toggle → el panel se colapsa/expande
4. El panel muestra nombre, teléfono, score, fecha, tags y notas del lead
5. Agregar un tag → aparece el chip, desaparece de sugeridas
6. Eliminar un tag con `×` → desaparece
7. Click en lápiz de notas → textarea editable
8. Guardar nota → toast success, vuelve a modo lectura

**Step 7: Commit**

```bash
git add frontend/src/app/inbox/page.tsx
git commit -m "feat: integrate ContactDetailPanel in inbox layout"
```

---

## Verificación final

1. Recargar el inbox — el panel muestra datos del lead seleccionado
2. Agregar tags, cambiar de lead — los tags del lead anterior no aparecen
3. Editar nota, guardar, recargar página — la nota persiste
4. En pantalla < 1024px (`lg`) — el panel no aparece (hidden)
5. Sin lead seleccionado — el panel no aparece
