# Mapa de Ubicación — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar la ubicación geográfica de cada proyecto en el dashboard admin con un mapa interactivo Leaflet + OpenStreetMap, y permitir al admin cargar/editar lat/lng desde la lista de proyectos.

**Architecture:** Se agrega `lat FLOAT` y `lng FLOAT` a la tabla `projects`. El backend expone esos campos en `GET /admin/projects` y los acepta en `PATCH /admin/projects/{id}`. En el frontend, un componente `MapView` reutilizable renderiza el mapa; se muestra como sección en el dashboard `/proyectos/[id]` y se puede editar desde un modal en la lista de proyectos.

**Tech Stack:** React-Leaflet 4 + Leaflet + OpenStreetMap (tiles gratuitos, sin API key), Python/asyncpg, Next.js App Router.

---

## Task 1: Migración DB — agregar lat/lng a projects

**Files:**
- Create: `migrations/039_project_location.sql`

**Step 1: Escribir la migración**

```sql
-- migrations/039_project_location.sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lat FLOAT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lng FLOAT;
```

**Step 2: Aplicar en Railway**

```bash
psql $DATABASE_URL -f migrations/039_project_location.sql
```

Expected output: `ALTER TABLE` (x2)

**Step 3: Verificar**

```bash
psql $DATABASE_URL -c "\d projects" | grep -E "lat|lng"
```

Expected: columnas `lat` y `lng` tipo `double precision`.

**Step 4: Commit**

```bash
git add migrations/039_project_location.sql
git commit -m "feat: add lat/lng columns to projects table"
```

---

## Task 2: Backend — exponer y aceptar lat/lng

**Files:**
- Modify: `app/admin/routers/projects.py:17-21`

**Step 1: Agregar lat y lng a UPDATABLE_PROJECT_FIELDS**

Cambiar:
```python
UPDATABLE_PROJECT_FIELDS = {
    "name", "slug", "address", "neighborhood", "city", "description",
    "amenities", "total_floors", "total_units", "construction_start",
    "estimated_delivery", "delivery_status", "payment_info", "status",
}
```

Por:
```python
UPDATABLE_PROJECT_FIELDS = {
    "name", "slug", "address", "neighborhood", "city", "description",
    "amenities", "total_floors", "total_units", "construction_start",
    "estimated_delivery", "delivery_status", "payment_info", "status",
    "lat", "lng",
}
```

**Step 2: Verificar que GET /admin/projects devuelve lat/lng**

Buscar el query SELECT en `projects.py` y confirmar que usa `SELECT *` o incluye `lat, lng` explícitamente. Si usa columnas explícitas, agregarlas.

```bash
grep -n "SELECT" app/admin/routers/projects.py | head -10
```

Si el query usa `SELECT *` o `SELECT p.*`, no hace falta cambio. Si lista columnas, agregar `lat, lng`.

**Step 3: Test manual**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/admin/projects | python3 -m json.tool | grep -E "lat|lng"
```

Expected: campos `lat` y `lng` en cada proyecto (puede ser `null` si no se cargaron aún).

**Step 4: Commit**

```bash
git add app/admin/routers/projects.py
git commit -m "feat: expose lat/lng in projects API"
```

---

## Task 3: Frontend — actualizar tipo Project y api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts:101-122`

**Step 1: Agregar lat y lng a la interfaz Project**

```typescript
export interface Project {
  id: string;
  organization_id: string;
  developer_id?: string;
  name: string;
  slug: string;
  address: string;
  neighborhood: string;
  city: string;
  description: string;
  amenities: string[];
  total_floors: number;
  total_units: number;
  construction_start: string;
  estimated_delivery: string;
  delivery_status: string;
  payment_info: string;
  whatsapp_number: string;
  status: string;
  deleted_at: string | null;
  created_at: string;
  lat: number | null;
  lng: number | null;
}
```

**Step 2: Verificar compilación TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: sin errores relacionados a `lat`/`lng`.

**Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add lat/lng to Project type"
```

---

## Task 4: Frontend — instalar react-leaflet

**Files:**
- Modify: `frontend/package.json`

**Step 1: Instalar dependencias**

```bash
cd frontend && npm install leaflet react-leaflet
npm install -D @types/leaflet
```

**Step 2: Verificar instalación**

```bash
cd frontend && node -e "require('react-leaflet'); console.log('ok')"
```

Expected: `ok`

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: install react-leaflet and leaflet"
```

---

## Task 5: Frontend — componente MapView

**Files:**
- Create: `frontend/src/components/MapView.tsx`

**Step 1: Crear el componente**

```tsx
'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default marker icons broken by webpack
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  lat: number;
  lng: number;
  label?: string;
  className?: string;
}

export default function MapView({ lat, lng, label, className }: MapViewProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      scrollWheelZoom={false}
      className={className}
      style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]}>
        {label && <Popup>{label}</Popup>}
      </Marker>
    </MapContainer>
  );
}
```

**Nota importante:** Leaflet requiere que el componente se importe con `next/dynamic` (no SSR) porque accede a `window`. Ver Task 6.

**Step 2: Verificar que no hay errores de TS**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep MapView
```

Expected: sin errores.

**Step 3: Commit**

```bash
git add frontend/src/components/MapView.tsx
git commit -m "feat: add MapView component with Leaflet"
```

---

## Task 6: Frontend — widget de mapa en dashboard del proyecto

**Files:**
- Modify: `frontend/src/app/proyectos/[id]/page.tsx`

**Step 1: Agregar import dinámico de MapView al inicio del archivo**

Después de los imports existentes, agregar:

```tsx
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
```

**Step 2: Agregar sección de mapa al final del JSX**

Buscar la última sección del return (antes del cierre `</div>`) y agregar:

```tsx
{/* Ubicación */}
{!loading && project?.lat && project?.lng && (
  <section>
    <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.14em] mb-4 section-divider">
      Ubicación
    </h2>
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden" style={{ height: 300 }}>
      <MapView
        lat={project.lat}
        lng={project.lng}
        label={project.name}
        className="rounded-2xl"
      />
    </div>
    <p className="text-xs text-gray-400 mt-2">{project.address}</p>
  </section>
)}
```

**Step 3: Verificar en browser**

```bash
cd frontend && npm run dev
```

Abrir `/proyectos/[id]` de un proyecto que tenga lat/lng cargados. El mapa debe aparecer con el pin.

Si el proyecto no tiene lat/lng todavía, cargarlos manualmente en DB para testear:

```bash
psql $DATABASE_URL -c "UPDATE projects SET lat=-34.6037, lng=-58.3816 WHERE id='<project_id>'"
```

**Step 4: Commit**

```bash
git add frontend/src/app/proyectos/[id]/page.tsx
git commit -m "feat: add location map widget to project dashboard"
```

---

## Task 7: Frontend — edición de lat/lng en modal de proyectos

**Files:**
- Modify: `frontend/src/app/proyectos/page.tsx`

**Step 1: Agregar estado para el modal de ubicación**

Buscar la línea donde está `const [renameProject, setRenameProject]` y agregar debajo:

```tsx
const [locationProject, setLocationProject] = useState<Project | null>(null);
const [locationLat, setLocationLat] = useState('');
const [locationLng, setLocationLng] = useState('');
```

**Step 2: Agregar handler para guardar ubicación**

Después de la función `handleRename`, agregar:

```tsx
const handleSaveLocation = async () => {
  if (!locationProject) return;
  const lat = parseFloat(locationLat);
  const lng = parseFloat(locationLng);
  if (isNaN(lat) || isNaN(lng)) {
    toast.error('Coordenadas inválidas');
    return;
  }
  try {
    await api.updateProject(locationProject.id, { lat, lng });
    toast.success('Ubicación guardada');
    setLocationProject(null);
    loadProjects();
  } catch {
    toast.error('Error al guardar ubicación');
  }
};
```

**Step 3: Agregar opción "Editar ubicación" en el menú del proyecto**

Buscar el menú contextual de cada project card (donde están "Renombrar" y "Eliminar") y agregar:

```tsx
<DropdownMenuItem onClick={() => {
  setLocationProject(project);
  setLocationLat(project.lat?.toString() ?? '');
  setLocationLng(project.lng?.toString() ?? '');
}}>
  <MapPin className="w-4 h-4 mr-2" />
  Editar ubicación
</DropdownMenuItem>
```

Agregar `MapPin` al import de `lucide-react`.

**Step 4: Agregar el modal de edición de ubicación**

Antes del cierre del return (junto al Dialog de renombrar), agregar:

```tsx
<Dialog open={!!locationProject} onOpenChange={(o) => { if (!o) setLocationProject(null); }}>
  <DialogContent className="sm:max-w-sm">
    <DialogHeader>
      <DialogTitle>Ubicación del proyecto</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 mt-2">
      <p className="text-sm text-gray-500">
        Ingresá las coordenadas geográficas del proyecto.<br />
        Podés obtenerlas buscando la dirección en{' '}
        <a
          href="https://www.openstreetmap.org"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 underline"
        >
          openstreetmap.org
        </a>{' '}
        y haciendo click derecho → "Mostrar coordenadas".
      </p>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Latitud</label>
        <Input
          className="mt-1"
          placeholder="-34.6037"
          value={locationLat}
          onChange={(e) => setLocationLat(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Longitud</label>
        <Input
          className="mt-1"
          placeholder="-58.3816"
          value={locationLng}
          onChange={(e) => setLocationLng(e.target.value)}
        />
      </div>
    </div>
    <DialogFooter className="mt-4">
      <Button variant="outline" onClick={() => setLocationProject(null)}>Cancelar</Button>
      <Button onClick={handleSaveLocation}>Guardar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Step 5: Verificar en browser**

- Ir a `/proyectos`
- Hacer click en "..." de un proyecto → "Editar ubicación"
- Ingresar lat/lng válidos → guardar
- Ir al dashboard del proyecto → verificar que aparece el mapa

**Step 6: Commit**

```bash
git add frontend/src/app/proyectos/page.tsx
git commit -m "feat: add location edit modal to project list"
```

---

## Task 8: SCHEMA_COMPLETO.sql — actualizar schema consolidado

**Files:**
- Modify: `migrations/SCHEMA_COMPLETO.sql`

**Step 1: Agregar lat y lng al CREATE TABLE projects**

Buscar la línea:
```sql
    status VARCHAR(20) DEFAULT 'active',
```

Y agregar después:
```sql
    lat FLOAT,
    lng FLOAT,
```

**Step 2: Commit**

```bash
git add migrations/SCHEMA_COMPLETO.sql
git commit -m "docs: update SCHEMA_COMPLETO with lat/lng columns"
```

---

## Verificación final

1. Proyecto sin lat/lng → sección de mapa NO aparece en el dashboard (correcto)
2. Cargar lat/lng desde "Editar ubicación" → sección de mapa aparece con pin correcto
3. El mapa no rompe el SSR (gracias a `dynamic` con `ssr: false`)
4. En mobile el mapa tiene altura fija de 300px y no hace scroll con touch inesperado

---

## Notas

- **Sin API key:** OpenStreetMap es gratuito y no requiere registro
- **Geocoding futuro:** Si se quiere buscar por dirección (en lugar de ingresar lat/lng manual), se puede integrar Nominatim (API gratuita de OSM) en una iteración posterior
- **Portal público:** El componente `MapView` ya es reutilizable; cuando exista el portal, se importa con `dynamic` igual que en el admin
