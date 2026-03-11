# Suscripciones y Panel de Cobros — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tabla `subscriptions` en PostgreSQL + endpoints CRUD + tab "Cobros" en `/admin/usuarios` para que el superadmin gestione manualmente el plan, estado y período de pago de cada organización.

**Architecture:** Nueva migración SQL (032), endpoints en `app/admin/api.py` siguiendo los patrones existentes (auth JWT, `_require_admin`, asyncpg), interfaz TypeScript en `api.ts`, y tab nueva en el hub de admin `/admin/usuarios` que ya tiene el patrón de tabs usuarios/organizaciones/canales/agente.

**Tech Stack:** FastAPI + asyncpg, PostgreSQL, Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui v3, Lucide React.

---

## Task 1: Migración SQL — tabla `subscriptions`

**Files:**
- Create: `migrations/032_subscriptions.sql`

**Step 1: Crear el archivo de migración**

```sql
-- migrations/032_subscriptions.sql

CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan                  TEXT NOT NULL CHECK (plan IN ('base', 'pro', 'studio')),
    status                TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
    billing_cycle         TEXT NOT NULL DEFAULT 'monthly'
                              CHECK (billing_cycle IN ('monthly', 'annual')),
    price_usd             NUMERIC(10, 2) NOT NULL,
    current_period_start  DATE NOT NULL,
    current_period_end    DATE NOT NULL,
    postventa_projects    INT NOT NULL DEFAULT 0,
    notes                 TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id)
);

COMMENT ON TABLE subscriptions IS 'Plan de suscripción activo por organización. Gestión manual vía panel admin.';
COMMENT ON COLUMN subscriptions.status IS 'trial|active|past_due|suspended|cancelled';
COMMENT ON COLUMN subscriptions.postventa_projects IS 'Número de proyectos en modo postventa ($199/mes cada uno)';
```

**Step 2: Aplicar en la base de datos**

```bash
psql $DATABASE_URL -f migrations/032_subscriptions.sql
```

Verificar que la tabla existe:
```bash
psql $DATABASE_URL -c "\d subscriptions"
```

**Step 3: Commit**

```bash
git add migrations/032_subscriptions.sql
git commit -m "feat: tabla subscriptions para gestión manual de planes"
```

---

## Task 2: Backend — modelos Pydantic + endpoints CRUD

**Files:**
- Modify: `app/admin/api.py` (agregar después de la línea ~490, después del bloque de organizations)

**Step 1: Agregar modelos Pydantic**

Insertar después del bloque de `AgentConfigUpdate` (~línea 423):

```python
# ── Subscriptions ──────────────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    organization_id: str
    plan: str  # 'base' | 'pro' | 'studio'
    billing_cycle: str = "monthly"  # 'monthly' | 'annual'
    price_usd: float
    current_period_start: str  # ISO date string YYYY-MM-DD
    current_period_end: str    # ISO date string YYYY-MM-DD
    postventa_projects: int = 0
    notes: Optional[str] = None
    status: str = "active"


class SubscriptionUpdate(BaseModel):
    plan: Optional[str] = None
    status: Optional[str] = None
    billing_cycle: Optional[str] = None
    price_usd: Optional[float] = None
    current_period_start: Optional[str] = None
    current_period_end: Optional[str] = None
    postventa_projects: Optional[int] = None
    notes: Optional[str] = None
```

**Step 2: Agregar endpoints**

Insertar después del bloque de organizations (~línea 490):

```python
# ── Subscriptions ──────────────────────────────────────────────────────────


@router.get("/subscriptions")
async def list_subscriptions(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Lista todas las suscripciones. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede ver suscripciones")
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT s.*, o.name AS org_name
           FROM subscriptions s
           JOIN organizations o ON o.id = s.organization_id
           ORDER BY o.name"""
    )
    return [dict(r) for r in rows]


@router.get("/subscriptions/{org_id}")
async def get_subscription(
    org_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Obtiene la suscripción de una organización."""
    payload = _require_admin(credentials)
    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")
    # Admin solo puede ver la suya
    if caller_role != "superadmin" and caller_org != org_id:
        raise HTTPException(status_code=403)
    pool = await get_pool()
    row = await pool.fetchrow(
        """SELECT s.*, o.name AS org_name
           FROM subscriptions s
           JOIN organizations o ON o.id = s.organization_id
           WHERE s.organization_id = $1""",
        org_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Sin suscripción activa")
    return dict(row)


@router.post("/subscriptions")
async def create_subscription(
    body: SubscriptionCreate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Crea una suscripción para una organización. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede crear suscripciones")
    if body.plan not in ("base", "pro", "studio"):
        raise HTTPException(status_code=400, detail="plan debe ser base, pro o studio")
    if body.status not in ("trial", "active", "past_due", "suspended", "cancelled"):
        raise HTTPException(status_code=400, detail="status inválido")
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO subscriptions
               (organization_id, plan, status, billing_cycle, price_usd,
                current_period_start, current_period_end, postventa_projects, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *""",
        body.organization_id, body.plan, body.status, body.billing_cycle,
        body.price_usd, body.current_period_start, body.current_period_end,
        body.postventa_projects, body.notes,
    )
    logger.info("Subscription created for org %s: plan=%s", body.organization_id, body.plan)
    return dict(row)


@router.patch("/subscriptions/{org_id}")
async def update_subscription(
    org_id: str,
    body: SubscriptionUpdate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    """Actualiza la suscripción de una organización. Superadmin only."""
    payload = _require_admin(credentials)
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede modificar suscripciones")
    if body.plan and body.plan not in ("base", "pro", "studio"):
        raise HTTPException(status_code=400, detail="plan debe ser base, pro o studio")
    if body.status and body.status not in ("trial", "active", "past_due", "suspended", "cancelled"):
        raise HTTPException(status_code=400, detail="status inválido")
    pool = await get_pool()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        row = await pool.fetchrow("SELECT * FROM subscriptions WHERE organization_id = $1", org_id)
        return dict(row) if row else {}
    set_clause = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await pool.fetchrow(
        f"UPDATE subscriptions SET {set_clause}, updated_at = NOW() WHERE organization_id = $1 RETURNING *",
        org_id, *values,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Suscripción no encontrada")
    logger.info("Subscription updated for org %s: %s", org_id, updates)
    return dict(row)
```

**Step 3: Verificar que el backend levanta sin errores**

```bash
cd /Users/mcendoya/repos/real-estate
uvicorn app.main:app --reload --port 8000
```

Esperado: sin errores de importación ni de sintaxis.

**Step 4: Probar endpoints manualmente**

```bash
# Obtener token
TOKEN=$(curl -s -X POST http://localhost:8000/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Listar suscripciones (vacío inicialmente)
curl -s http://localhost:8000/admin/subscriptions \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Esperado: array vacío `[]`.

**Step 5: Commit**

```bash
git add app/admin/api.py
git commit -m "feat: endpoints CRUD de suscripciones en api.py"
```

---

## Task 3: Frontend — interfaces y métodos en api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Agregar interfaces**

Insertar después de la interfaz `AgentConfig` (~línea 543):

```typescript
export interface Subscription {
  id: string;
  organization_id: string;
  org_name: string;
  plan: 'base' | 'pro' | 'studio';
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
  billing_cycle: 'monthly' | 'annual';
  price_usd: number;
  current_period_start: string; // YYYY-MM-DD
  current_period_end: string;   // YYYY-MM-DD
  postventa_projects: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCreate {
  organization_id: string;
  plan: 'base' | 'pro' | 'studio';
  billing_cycle: 'monthly' | 'annual';
  price_usd: number;
  current_period_start: string;
  current_period_end: string;
  postventa_projects?: number;
  notes?: string;
  status?: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
}
```

**Step 2: Agregar métodos al objeto `api`**

Insertar antes de la línea `login:` (~línea 875):

```typescript
  // --- Subscriptions ---
  getSubscriptions: () => fetcher<Subscription[]>('/admin/subscriptions'),
  getSubscription: (orgId: string) => fetcher<Subscription>(`/admin/subscriptions/${orgId}`),
  createSubscription: (data: SubscriptionCreate) =>
    fetcher<Subscription>('/admin/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
  updateSubscription: (orgId: string, data: Partial<SubscriptionCreate>) =>
    fetcher<Subscription>(`/admin/subscriptions/${orgId}`, { method: 'PATCH', body: JSON.stringify(data) }),
```

**Step 3: Verificar que el frontend compila**

```bash
cd /Users/mcendoya/repos/real-estate/frontend
npx tsc --noEmit
```

Esperado: sin errores de tipos.

**Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: interfaz Subscription y métodos en api.ts"
```

---

## Task 4: Frontend — tab "Cobros" en /admin/usuarios

**Files:**
- Modify: `frontend/src/app/admin/usuarios/page.tsx`

**Step 1: Extender el tipo Tab**

En la línea 40:
```typescript
// Antes:
type Tab = 'usuarios' | 'organizaciones' | 'canales' | 'agente';
// Después:
type Tab = 'usuarios' | 'organizaciones' | 'canales' | 'agente' | 'cobros';
```

**Step 2: Agregar imports**

Buscar la línea de imports de lucide-react y agregar `CreditCard, CalendarDays, AlertCircle, CheckCircle2, Clock`:

```typescript
// Agregar a los imports de lucide-react existentes:
import { ..., CreditCard, CalendarDays, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
```

Agregar import de Subscription al import de api:
```typescript
import { api, ..., Subscription, SubscriptionCreate } from '@/lib/api';
```

**Step 3: Agregar estado para cobros**

Después del estado de agentConfig (~línea 130), agregar:

```typescript
const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
const [subModal, setSubModal] = useState<'create' | 'edit' | null>(null);
const [editingSub, setEditingSub] = useState<Subscription | null>(null);
const [savingSub, setSavingSub] = useState(false);
const [subForm, setSubForm] = useState<SubscriptionCreate>({
  organization_id: '',
  plan: 'pro',
  billing_cycle: 'monthly',
  price_usd: 599,
  current_period_start: new Date().toISOString().slice(0, 10),
  current_period_end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  postventa_projects: 0,
  notes: '',
  status: 'active',
});

const loadSubscriptions = useCallback(async () => {
  try {
    const data = await api.getSubscriptions();
    setSubscriptions(data);
  } catch { /* silent */ }
}, []);

useEffect(() => {
  if (activeTab === 'cobros') loadSubscriptions();
}, [activeTab, loadSubscriptions]);
```

**Step 4: Agregar botón de tab en el header**

Buscar el bloque de botones de tabs (donde están los onClick de 'usuarios', 'organizaciones', 'canales', 'agente') y agregar al final del grupo, antes del cierre del div:

```tsx
{isSuperAdmin && (
  <button
    onClick={() => setActiveTab('cobros')}
    className={cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
      activeTab === 'cobros'
        ? 'bg-white shadow-sm text-gray-900'
        : 'text-gray-500 hover:text-gray-700'
    )}
  >
    <CreditCard size={13} />
    Cobros
  </button>
)}
```

**Step 5: Helpers de UI (agregar antes del return)**

```typescript
const PLAN_LABELS: Record<string, string> = { base: 'Base', pro: 'Pro', studio: 'Studio' };
const PLAN_PRICES: Record<string, number> = { base: 349, pro: 599, studio: 1100 };

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  trial:     { label: 'Trial',     className: 'bg-blue-100 text-blue-700 border-blue-200',     icon: <Clock size={11} /> },
  active:    { label: 'Activo',    className: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11} /> },
  past_due:  { label: 'Vencido',   className: 'bg-amber-100 text-amber-700 border-amber-200',  icon: <AlertCircle size={11} /> },
  suspended: { label: 'Suspendido',className: 'bg-red-100 text-red-700 border-red-200',        icon: <AlertCircle size={11} /> },
  cancelled: { label: 'Cancelado', className: 'bg-gray-100 text-gray-500 border-gray-200',     icon: <AlertCircle size={11} /> },
};

function calcMonthlyCost(sub: Subscription): number {
  return sub.price_usd + sub.postventa_projects * 199;
}

function isExpiringSoon(sub: Subscription): boolean {
  const end = new Date(sub.current_period_end);
  const diff = (end.getTime() - Date.now()) / 86400000;
  return diff <= 5 && sub.status === 'active';
}
```

**Step 6: Agregar sección "Cobros" en el return**

Agregar antes del cierre del div principal (antes del primer `<Dialog`), después del bloque de `activeTab === 'agente'`:

```tsx
{/* ===== COBROS ===== */}
{activeTab === 'cobros' && isSuperAdmin && (
  <div className="space-y-4">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div>
        <h2 className="font-display font-semibold text-gray-900">Cobros y Suscripciones</h2>
        <p className="text-sm text-muted-foreground">
          Gestión manual de planes activos por organización
        </p>
      </div>
      <Button onClick={() => {
        setEditingSub(null);
        setSubForm({
          organization_id: '',
          plan: 'pro',
          billing_cycle: 'monthly',
          price_usd: 599,
          current_period_start: new Date().toISOString().slice(0, 10),
          current_period_end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          postventa_projects: 0,
          notes: '',
          status: 'active',
        });
        setSubModal('create');
      }}>
        <Plus size={14} className="mr-1.5" />
        Nueva suscripción
      </Button>
    </div>

    {/* Alertas de vencimiento */}
    {subscriptions.filter(isExpiringSoon).length > 0 && (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            {subscriptions.filter(isExpiringSoon).length} suscripción(es) vencen en los próximos 5 días
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {subscriptions.filter(isExpiringSoon).map(s => s.org_name).join(', ')}
          </p>
        </div>
      </div>
    )}

    {/* Lista */}
    {subscriptions.length === 0 ? (
      <div className="text-center py-16 text-muted-foreground">
        <CreditCard size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No hay suscripciones registradas</p>
      </div>
    ) : (
      <div className="space-y-2">
        {subscriptions.map((sub) => {
          const sc = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.active;
          const monthlyCost = calcMonthlyCost(sub);
          const expiringSoon = isExpiringSoon(sub);
          return (
            <div
              key={sub.id}
              className={cn(
                'glass flex items-center gap-4 px-4 py-3 rounded-xl',
                expiringSoon && 'border-amber-300'
              )}
            >
              {/* Plan badge */}
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CreditCard size={16} className="text-primary" />
              </div>

              {/* Info principal */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">{sub.org_name}</span>
                  <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                    {PLAN_LABELS[sub.plan]}
                  </Badge>
                  <Badge className={cn('text-[10px] flex items-center gap-1', sc.className)}>
                    {sc.icon}{sc.label}
                  </Badge>
                  {expiringSoon && (
                    <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                      Vence pronto
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays size={10} />
                    Período: {sub.current_period_start} → {sub.current_period_end}
                  </span>
                  {sub.postventa_projects > 0 && (
                    <span>+ {sub.postventa_projects} postventa</span>
                  )}
                </div>
                {sub.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{sub.notes}</p>
                )}
              </div>

              {/* Monto */}
              <div className="text-right flex-shrink-0">
                <p className="font-semibold text-sm text-gray-900">USD {monthlyCost.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">/mes</p>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Renovar período */}
                <Button
                  variant="ghost"
                  size="sm"
                  title="Renovar 30 días"
                  onClick={async () => {
                    const start = new Date().toISOString().slice(0, 10);
                    const end = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                    await api.updateSubscription(sub.organization_id, {
                      status: 'active',
                      current_period_start: start,
                      current_period_end: end,
                    });
                    toast.success('Período renovado — acceso activo por 30 días');
                    loadSubscriptions();
                  }}
                >
                  <CheckCircle2 size={13} className="text-emerald-600" />
                </Button>

                {/* Editar */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingSub(sub);
                    setSubForm({
                      organization_id: sub.organization_id,
                      plan: sub.plan,
                      billing_cycle: sub.billing_cycle,
                      price_usd: sub.price_usd,
                      current_period_start: sub.current_period_start,
                      current_period_end: sub.current_period_end,
                      postventa_projects: sub.postventa_projects,
                      notes: sub.notes ?? '',
                      status: sub.status,
                    });
                    setSubModal('edit');
                  }}
                >
                  <Pencil size={13} />
                </Button>

                {/* Suspender */}
                {sub.status === 'active' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Suspender acceso"
                    className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (!confirm(`¿Suspender acceso de ${sub.org_name}?`)) return;
                      await api.updateSubscription(sub.organization_id, { status: 'suspended' });
                      toast.success('Acceso suspendido');
                      loadSubscriptions();
                    }}
                  >
                    <AlertCircle size={13} />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
```

**Step 7: Agregar Dialog de crear/editar suscripción**

Insertar antes del cierre del `</div>` final del return (junto a los otros Dialogs):

```tsx
{/* Dialog — crear / editar suscripción */}
<Dialog open={subModal !== null} onOpenChange={(o) => !o && setSubModal(null)}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>
        {subModal === 'create' ? 'Nueva suscripción' : `Editar — ${editingSub?.org_name}`}
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-2">
      {/* Organización (solo en create) */}
      {subModal === 'create' && (
        <div className="space-y-1.5">
          <Label>Organización</Label>
          <Select
            value={subForm.organization_id}
            onValueChange={(v) => setSubForm(f => ({ ...f, organization_id: v }))}
          >
            <SelectTrigger><SelectValue placeholder="Seleccionar organización..." /></SelectTrigger>
            <SelectContent>
              {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Plan + Ciclo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Select
            value={subForm.plan}
            onValueChange={(v: 'base' | 'pro' | 'studio') => {
              setSubForm(f => ({ ...f, plan: v, price_usd: PLAN_PRICES[v] }));
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="base">Base — USD 349/mes</SelectItem>
              <SelectItem value="pro">Pro — USD 599/mes</SelectItem>
              <SelectItem value="studio">Studio — USD 1.100/mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ciclo</Label>
          <Select
            value={subForm.billing_cycle}
            onValueChange={(v: 'monthly' | 'annual') => setSubForm(f => ({ ...f, billing_cycle: v }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="annual">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Precio real cobrado */}
      <div className="space-y-1.5">
        <Label>Precio cobrado (USD/mes)</Label>
        <Input
          type="number"
          min={0}
          value={subForm.price_usd}
          onChange={e => setSubForm(f => ({ ...f, price_usd: Number(e.target.value) }))}
        />
        <p className="text-xs text-muted-foreground">Puede diferir del precio de lista si hay descuento acordado.</p>
      </div>

      {/* Período */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Inicio del período</Label>
          <Input
            type="date"
            value={subForm.current_period_start}
            onChange={e => setSubForm(f => ({ ...f, current_period_start: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Fin del período</Label>
          <Input
            type="date"
            value={subForm.current_period_end}
            onChange={e => setSubForm(f => ({ ...f, current_period_end: e.target.value }))}
          />
        </div>
      </div>

      {/* Status */}
      <div className="space-y-1.5">
        <Label>Estado</Label>
        <Select
          value={subForm.status}
          onValueChange={(v) => setSubForm(f => ({ ...f, status: v as SubscriptionCreate['status'] }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="past_due">Vencido (past_due)</SelectItem>
            <SelectItem value="suspended">Suspendido</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Proyectos postventa */}
      <div className="space-y-1.5">
        <Label>Proyectos en postventa</Label>
        <Input
          type="number"
          min={0}
          value={subForm.postventa_projects}
          onChange={e => setSubForm(f => ({ ...f, postventa_projects: Number(e.target.value) }))}
        />
        <p className="text-xs text-muted-foreground">USD 199/mes cada uno — se suma al total.</p>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <Label>Notas internas <span className="text-muted-foreground text-xs">(opcional)</span></Label>
        <Input
          placeholder="Ej: Descuento acordado en reunión, paga el 5 de cada mes..."
          value={subForm.notes ?? ''}
          onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setSubModal(null)}>Cancelar</Button>
      <Button
        disabled={savingSub || (subModal === 'create' && !subForm.organization_id)}
        onClick={async () => {
          setSavingSub(true);
          try {
            if (subModal === 'create') {
              await api.createSubscription(subForm);
              toast.success('Suscripción creada');
            } else if (editingSub) {
              await api.updateSubscription(editingSub.organization_id, subForm);
              toast.success('Suscripción actualizada');
            }
            setSubModal(null);
            loadSubscriptions();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar');
          } finally {
            setSavingSub(false);
          }
        }}
      >
        {savingSub ? 'Guardando...' : 'Guardar'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Step 8: Verificar que el frontend compila**

```bash
cd /Users/mcendoya/repos/real-estate/frontend
npx tsc --noEmit
```

Esperado: sin errores.

**Step 9: Commit**

```bash
git add frontend/src/app/admin/usuarios/page.tsx
git commit -m "feat: tab Cobros con gestión de suscripciones en panel admin"
```

---

## Verificación final

1. Levantar el backend: `uvicorn app.main:app --reload`
2. Levantar el frontend: `cd frontend && npm run dev`
3. Ir a `/admin/usuarios` como superadmin → verificar que aparece la tab "Cobros"
4. Crear una suscripción para una org existente → verificar que aparece en la lista
5. Usar el botón de renovar → verificar que el período se actualiza
6. Usar el botón de suspender → verificar que el status cambia a "suspended"
7. Verificar que el banner de alerta aparece cuando hay suscripciones que vencen en ≤5 días

---

## Qué queda para la Opción A (próxima iteración)

- **Middleware de bloqueo:** un `if` en `_require_admin` o en el middleware de org que rechaza requests de orgs con `status IN ('suspended', 'cancelled')`
- **Cron de alertas:** `POST /admin/jobs/check-subscriptions` que detecta vencimientos y te notifica por Telegram
