# Factura PDF Upload — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir subir PDFs de facturas a Supabase Storage bajo una jerarquía org → proyecto, y migrar archivos existentes al nuevo path.

**Architecture:** Nuevo endpoint de upload separado del CRUD de facturas (`POST /admin/facturas/{project_id}/upload-pdf`). El frontend sube el archivo antes de guardar el formulario y usa la URL resultante como `file_url`. Los archivos se almacenan bajo `orgs/{org_id}/projects/{project_slug}/facturas/{YYYY}/{MM}/{timestamp}_{filename}`.

**Tech Stack:** FastAPI (UploadFile), boto3 (S3), Next.js (fetch + FormData), asyncpg (migration script), httpx (download en migración).

---

## Task 1: storage.py — función upload_factura_pdf

**Files:**
- Modify: `app/modules/storage.py`

**Step 1: Agregar la función al final del archivo**

```python
async def upload_factura_pdf(
    file_bytes: bytes,
    org_id: str,
    project_slug: str,
    filename: str,
) -> str:
    """Upload a factura PDF with org-hierarchical path.

    Path: orgs/{org_id}/projects/{project_slug}/facturas/{YYYY}/{MM}/{ts}_{filename}
    """
    import time
    from datetime import datetime as _dt

    if not file_bytes[:5] == b"%PDF-":
        raise ValueError(f"El archivo '{filename}' no es un PDF válido")

    settings = get_settings()
    safe_filename = filename.replace(" ", "_").lower()
    now = _dt.utcnow()
    ts = int(time.time())
    key = (
        f"orgs/{org_id}/projects/{project_slug}/facturas/"
        f"{now.year}/{now.month:02d}/{ts}_{safe_filename}"
    )

    client = _get_s3_client()
    client.put_object(
        Bucket=settings.s3_bucket_name,
        Key=key,
        Body=file_bytes,
        ContentType="application/pdf",
    )

    public_url = f"{settings.s3_public_url}/{key}"
    logger.info("Uploaded factura PDF %s (%d bytes) to %s", filename, len(file_bytes), public_url)
    return public_url
```

**Step 2: Verificar manualmente que no hay imports faltantes**

`time` y `datetime` se importan localmente dentro de la función para no contaminar el scope del módulo. `get_settings`, `_get_s3_client`, `logger` ya están disponibles en el módulo.

**Step 3: Commit**

```bash
git add app/modules/storage.py
git commit -m "feat: add upload_factura_pdf with org-hierarchical S3 path"
```

---

## Task 2: api.py — endpoint POST /admin/facturas/{project_id}/upload-pdf

**Files:**
- Modify: `app/admin/api.py`

**Step 1: Agregar el import de la nueva función**

Buscar la línea que dice:
```python
from app.modules.storage import upload_file, upload_obra_foto
```
Reemplazarla con:
```python
from app.modules.storage import upload_file, upload_obra_foto, upload_factura_pdf
```

**Step 2: Agregar el endpoint después de `delete_factura`**

Buscar el bloque `# ---------- Cash Flow ----------` y agregar antes de él:

```python
@router.post("/facturas/{project_id}/upload-pdf")
async def upload_factura_pdf_endpoint(
    project_id: str,
    file: UploadFile = File(...),
    user=Depends(require_auth),
):
    """Upload a factura PDF to S3 under orgs/{org_id}/projects/{slug}/facturas/..."""
    pool = await get_pool()
    project = await pool.fetchrow(
        "SELECT slug, organization_id FROM projects WHERE id = $1",
        project_id,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if project["organization_id"] is None:
        raise HTTPException(status_code=400, detail="El proyecto no tiene organización asignada")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío")

    try:
        url = await upload_factura_pdf(
            file_bytes=content,
            org_id=str(project["organization_id"]),
            project_slug=project["slug"],
            filename=file.filename or "factura.pdf",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"file_url": url}
```

**Step 3: Probar manualmente con curl**

```bash
curl -X POST http://localhost:8000/admin/facturas/{project_id}/upload-pdf \
  -H "Authorization: Bearer {token}" \
  -F "file=@/path/to/test.pdf"
# Expected: {"file_url": "https://...supabase.co/storage/v1/object/public/realia-docs/orgs/.../facturas/..."}
```

**Step 4: Commit**

```bash
git add app/admin/api.py
git commit -m "feat: add factura PDF upload endpoint with org-hierarchical path"
```

---

## Task 3: api.ts — método uploadFacturaPdf en el cliente

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Agregar el método en la sección de facturas**

Buscar la línea:
```typescript
  deleteFactura: (facturaId: string) =>
    fetcher<{ ok: boolean }>(`/admin/facturas/${facturaId}`, { method: 'DELETE' }),
```

Agregar después:
```typescript
  uploadFacturaPdf: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetcher<{ file_url: string }>(`/admin/facturas/${projectId}/upload-pdf`, {
      method: 'POST',
      body: form,
      // No Content-Type header — browser sets multipart boundary automatically
    });
  },
```

**Nota importante:** El `fetcher` base debe NO incluir `Content-Type: application/json` cuando el body es FormData. Verificar que `fetcher` en `api.ts` no hardcodea ese header cuando `body` es `FormData`. Si lo hardcodea, agregar una excepción:

Buscar en `fetcher`:
```typescript
headers: { 'Content-Type': 'application/json', ... }
```
Si existe, cambiarlo por:
```typescript
headers: {
  ...(!(options?.body instanceof FormData) && { 'Content-Type': 'application/json' }),
  ...
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add uploadFacturaPdf API method"
```

---

## Task 4: financiero/page.tsx — file picker en modal de facturas

**Files:**
- Modify: `frontend/src/app/proyectos/[id]/financiero/page.tsx`

**Step 1: Agregar estado para el upload**

Buscar el bloque de estados existentes (cerca de `showFacturaModal`):
```typescript
const [showFacturaModal, setShowFacturaModal] = useState(false);
```

Agregar después:
```typescript
const [uploadingPdf, setUploadingPdf] = useState(false);
```

**Step 2: Agregar handler de upload**

Agregar esta función junto a los otros handlers de facturas (cerca de `saveFactura`):

```typescript
const handlePdfUpload = async (file: File) => {
  if (!file || !id) return;
  setUploadingPdf(true);
  try {
    const { file_url } = await api.uploadFacturaPdf(id as string, file);
    setFacturaForm(f => ({ ...f, file_url }));
    toast.success('PDF subido correctamente');
  } catch {
    toast.error('Error subiendo el PDF');
  } finally {
    setUploadingPdf(false);
  }
};
```

**Step 3: Reemplazar el input de texto file_url por un file picker**

Buscar la línea:
```tsx
<input className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500" value={facturaForm.file_url} onChange={(e) => setFacturaForm(f => ({ ...f, file_url: e.target.value }))} placeholder="https://..." />
```

Reemplazarla con:
```tsx
<div className="space-y-2">
  <input
    type="file"
    accept=".pdf,application/pdf"
    className="hidden"
    id="factura-pdf-input"
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) handlePdfUpload(file);
      e.target.value = '';
    }}
  />
  <div className="flex items-center gap-2">
    <label
      htmlFor="factura-pdf-input"
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors flex-shrink-0',
        uploadingPdf && 'opacity-50 pointer-events-none',
      )}
    >
      <FileText size={14} className="text-gray-400" />
      {uploadingPdf ? 'Subiendo...' : 'Subir PDF'}
    </label>
    {facturaForm.file_url && (
      <a
        href={facturaForm.file_url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-xs text-blue-700 hover:underline truncate"
      >
        <ExternalLink size={12} />
        Ver PDF
      </a>
    )}
    {facturaForm.file_url && (
      <button
        type="button"
        onClick={() => setFacturaForm(f => ({ ...f, file_url: '' }))}
        className="ml-auto p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
        title="Quitar PDF"
      >
        <X size={13} />
      </button>
    )}
  </div>
</div>
```

**Step 4: Verificar que `ExternalLink` y `X` ya están importados**

La línea de imports ya incluye `X` y `ExternalLink` — confirmado en el código existente.

**Step 5: Commit**

```bash
git add frontend/src/app/proyectos/[id]/financiero/page.tsx
git commit -m "feat: replace file_url text input with PDF upload picker in facturas modal"
```

---

## Task 5: Script de migración de archivos existentes

**Files:**
- Create: `migrations/020_migrate_factura_files.py`

**Step 1: Crear el script**

```python
#!/usr/bin/env python3
"""
Migration 020: Move existing factura PDFs from old S3 paths to org-hierarchical path.

Usage:
  DATABASE_URL=... S3_ENDPOINT_URL=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  S3_BUCKET_NAME=realia-docs S3_PUBLIC_URL=... python migrations/020_migrate_factura_files.py

Safe to run multiple times (skips already-migrated files).
"""
import asyncio
import os
import time
from datetime import datetime

import asyncpg
import boto3
import httpx
from botocore.config import Config

DATABASE_URL = os.environ["DATABASE_URL"]
S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL", "")
S3_KEY = os.environ["S3_ACCESS_KEY_ID"]
S3_SECRET = os.environ["S3_SECRET_ACCESS_KEY"]
S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "realia-docs")
S3_PUBLIC_URL = os.environ.get("S3_PUBLIC_URL", "").rstrip("/")
S3_REGION = os.environ.get("S3_REGION", "us-east-1")


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_KEY,
        aws_secret_access_key=S3_SECRET,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4"),
    )


async def migrate():
    conn = await asyncpg.connect(DATABASE_URL)
    s3 = get_s3()

    rows = await conn.fetch(
        """
        SELECT f.id, f.file_url, p.slug AS project_slug, p.organization_id
        FROM facturas f
        JOIN projects p ON p.id = f.project_id
        WHERE f.file_url IS NOT NULL
        """
    )

    print(f"Found {len(rows)} facturas with file_url")
    migrated = skipped = errors = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        for row in rows:
            file_url: str = row["file_url"]
            org_id = str(row["organization_id"]) if row["organization_id"] else None
            project_slug = row["project_slug"]
            factura_id = str(row["id"])

            # Skip if not in our S3 bucket
            if not S3_PUBLIC_URL or not file_url.startswith(S3_PUBLIC_URL):
                print(f"  SKIP (external URL) [{factura_id}]: {file_url}")
                skipped += 1
                continue

            old_key = file_url[len(S3_PUBLIC_URL):].lstrip("/")

            # Skip if already under the new hierarchy
            if org_id and old_key.startswith(f"orgs/{org_id}/"):
                print(f"  SKIP (already migrated) [{factura_id}]")
                skipped += 1
                continue

            if not org_id:
                print(f"  SKIP (no organization_id) [{factura_id}]")
                skipped += 1
                continue

            try:
                # Download from old location
                resp = await client.get(file_url)
                resp.raise_for_status()
                file_bytes = resp.content

                # Build new key
                filename = old_key.rsplit("/", 1)[-1]
                now = datetime.utcnow()
                ts = int(time.time())
                new_key = (
                    f"orgs/{org_id}/projects/{project_slug}/facturas/"
                    f"{now.year}/{now.month:02d}/{ts}_{filename}"
                )

                # Upload to new location
                s3.put_object(
                    Bucket=S3_BUCKET,
                    Key=new_key,
                    Body=file_bytes,
                    ContentType="application/pdf",
                )

                new_url = f"{S3_PUBLIC_URL}/{new_key}"

                # Update DB
                await conn.execute(
                    "UPDATE facturas SET file_url = $1 WHERE id = $2",
                    new_url,
                    row["id"],
                )

                # Delete old file
                s3.delete_object(Bucket=S3_BUCKET, Key=old_key)

                print(f"  OK [{factura_id}]: {old_key} → {new_key}")
                migrated += 1

            except Exception as e:
                print(f"  ERROR [{factura_id}]: {e}")
                errors += 1

    await conn.close()
    print(f"\nDone: {migrated} migrated, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    asyncio.run(migrate())
```

**Step 2: Verificar que asyncpg y httpx están disponibles**

```bash
cd /Users/mcendoya/repos/real-estate
pip show asyncpg httpx boto3
```

Si faltan, son dependencias del backend que ya deberían estar instaladas.

**Step 3: Correr en dry-run (comentar las líneas de execute/delete) para verificar detección correcta**

Antes de correr en producción, comentar temporalmente:
```python
# await conn.execute(...)
# s3.delete_object(...)
```
Y verificar output de la consola.

**Step 4: Correr la migración real**

```bash
cd /Users/mcendoya/repos/real-estate
DATABASE_URL="..." S3_ENDPOINT_URL="..." S3_ACCESS_KEY_ID="..." \
S3_SECRET_ACCESS_KEY="..." S3_BUCKET_NAME="realia-docs" S3_PUBLIC_URL="..." \
python migrations/020_migrate_factura_files.py
```

**Step 5: Commit**

```bash
git add migrations/020_migrate_factura_files.py
git commit -m "feat: add migration script to move factura PDFs to org-hierarchical S3 path"
```

---

## Verificación final

1. Backend corriendo: `make dev` (o el comando equivalente del proyecto)
2. Ir a `/proyectos/{id}/financiero` → tab Facturas
3. Crear una nueva factura → el campo "Archivo PDF" ahora muestra botón "Subir PDF"
4. Subir un PDF → debe aparecer link "Ver PDF" con URL del estilo `orgs/{org_id}/projects/{slug}/facturas/...`
5. Guardar la factura → el link de PDF aparece en la tabla
6. Correr script de migración → verificar que facturas existentes apunten al nuevo path
