# Tenant Channels & Agent Config — Onboarding Panel

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que el superadmin registre canales de WhatsApp (tenant_channels) y configure el agente (agent_configs) por organización desde el panel, sin necesidad de SQL manual.

**Architecture:** Backend CRUD en api.py siguiendo los patrones existentes (auth JWT, org scoping). Frontend como dos tabs nuevas ("Canales" y "Agente") dentro de la página existente `/admin/usuarios`, que ya funciona como hub de administración con tabs Usuarios + Organizaciones.

**Tech Stack:** FastAPI + asyncpg, Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui v3, Lucide React.

---

## Contexto del codebase

- Auth pattern: `credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)` → `verify_token(credentials.credentials)` → `payload.get("role")` / `payload.get("organization_id")`
- Scoping: superadmin ve todo, el resto solo su org
- Frontend: página `/admin/usuarios` tiene tabs `Tab = 'usuarios' | 'organizaciones'`. Extender con `'canales' | 'agente'`
- `useAuth()` expone `role`, `isAdmin`, `isSuperAdmin` (donde `isSuperAdmin = role === 'superadmin'`)
- API client en `frontend/src/lib/api.ts` — agregar métodos ahí
- Tabla `tenant_channels`: campos id, organization_id, provider ('twilio'|'meta'), phone_number, display_name, account_sid, auth_token, access_token, phone_number_id, verify_token, waba_id, activo
- Tabla `agent_configs`: id, organization_id, agent_name, system_prompt_override, system_prompt_append, model, max_tokens, temperature

---

### Task 1: Backend — CRUD endpoints tenant_channels

**Files:**
- Modify: `app/admin/api.py` (agregar después de los endpoints de organizations, ~línea 450)

**Pydantic models a agregar antes de los endpoints:**

```python
class TenantChannelCreate(BaseModel):
    organization_id: Optional[str] = None   # requerido si es superadmin
    provider: str  # 'twilio' | 'meta'
    phone_number: str
    display_name: Optional[str] = None
    # Twilio
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    # Meta
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    verify_token: Optional[str] = None
    waba_id: Optional[str] = None

class TenantChannelUpdate(BaseModel):
    display_name: Optional[str] = None
    phone_number: Optional[str] = None
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    verify_token: Optional[str] = None
    waba_id: Optional[str] = None
    activo: Optional[bool] = None
```

**Endpoints a agregar:**

```python
@router.get("/tenant-channels")
async def list_tenant_channels(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """List tenant channels. Superadmin sees all, admin sees own org."""
    pool = await get_pool()
    payload = verify_token(credentials.credentials) if credentials and credentials.scheme == "Bearer" else None
    if not payload:
        raise HTTPException(401)

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role == "superadmin":
        rows = await pool.fetch(
            """SELECT tc.*, o.name as org_name
               FROM tenant_channels tc
               JOIN organizations o ON o.id = tc.organization_id
               ORDER BY o.name, tc.provider"""
        )
    else:
        rows = await pool.fetch(
            """SELECT tc.*, o.name as org_name
               FROM tenant_channels tc
               JOIN organizations o ON o.id = tc.organization_id
               WHERE tc.organization_id = $1
               ORDER BY tc.provider""",
            caller_org
        )
    return [dict(r) for r in rows]


@router.post("/tenant-channels")
async def create_tenant_channel(
    body: TenantChannelCreate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Create a tenant channel. Superadmin can set any org_id; admin creates for own org."""
    pool = await get_pool()
    payload = verify_token(credentials.credentials) if credentials and credentials.scheme == "Bearer" else None
    if not payload:
        raise HTTPException(401)

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role != "superadmin" and caller_role not in ("admin",):
        raise HTTPException(403, "Solo admin o superadmin pueden crear canales")

    target_org = body.organization_id if caller_role == "superadmin" else caller_org
    if not target_org:
        raise HTTPException(400, "organization_id requerido")

    if body.provider not in ("twilio", "meta"):
        raise HTTPException(400, "provider debe ser 'twilio' o 'meta'")

    row = await pool.fetchrow(
        """INSERT INTO tenant_channels
           (organization_id, provider, phone_number, display_name,
            account_sid, auth_token, access_token, phone_number_id, verify_token, waba_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *""",
        target_org, body.provider, body.phone_number, body.display_name,
        body.account_sid, body.auth_token, body.access_token,
        body.phone_number_id, body.verify_token, body.waba_id
    )
    return dict(row)


@router.patch("/tenant-channels/{channel_id}")
async def update_tenant_channel(
    channel_id: str,
    body: TenantChannelUpdate,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    pool = await get_pool()
    payload = verify_token(credentials.credentials) if credentials and credentials.scheme == "Bearer" else None
    if not payload:
        raise HTTPException(401)

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    # Verify ownership
    channel = await pool.fetchrow("SELECT * FROM tenant_channels WHERE id = $1", channel_id)
    if not channel:
        raise HTTPException(404)
    if caller_role != "superadmin" and str(channel["organization_id"]) != caller_org:
        raise HTTPException(403)

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return dict(channel)

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())
    row = await pool.fetchrow(
        f"UPDATE tenant_channels SET {set_clause}, updated_at = NOW() WHERE id = $1 RETURNING *",
        channel_id, *values
    )
    return dict(row)


@router.delete("/tenant-channels/{channel_id}")
async def delete_tenant_channel(
    channel_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    pool = await get_pool()
    payload = verify_token(credentials.credentials) if credentials and credentials.scheme == "Bearer" else None
    if not payload:
        raise HTTPException(401)

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    channel = await pool.fetchrow("SELECT organization_id FROM tenant_channels WHERE id = $1", channel_id)
    if not channel:
        raise HTTPException(404)
    if caller_role != "superadmin" and str(channel["organization_id"]) != caller_org:
        raise HTTPException(403)

    await pool.execute(
        "UPDATE tenant_channels SET activo = false, updated_at = NOW() WHERE id = $1",
        channel_id
    )
    return {"status": "ok"}
```

**Commit:**
```bash
git add app/admin/api.py
git commit -m "feat: CRUD endpoints for tenant_channels"
```

---

### Task 2: Backend — endpoints agent_configs

**Files:**
- Modify: `app/admin/api.py` (agregar después de tenant_channels endpoints)

**Pydantic model:**

```python
class AgentConfigUpdate(BaseModel):
    agent_name: Optional[str] = None
    system_prompt_override: Optional[str] = None
    system_prompt_append: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
```

**Endpoints:**

```python
@router.get("/agent-config")
async def get_agent_config_endpoint(
    org_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Get agent config for org. Superadmin can pass ?org_id=. Others get own org."""
    pool = await get_pool()
    payload = verify_token(credentials.credentials) if credentials and credentials.scheme == "Bearer" else None
    if not payload:
        raise HTTPException(401)

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    target_org = org_id if (caller_role == "superadmin" and org_id) else caller_org

    row = await pool.fetchrow(
        "SELECT * FROM agent_configs WHERE organization_id = $1", target_org
    )
    if not row:
        # Return defaults (no row yet — config_loader handles this in runtime too)
        return {
            "organization_id": target_org,
            "agent_name": "Asistente",
            "system_prompt_override": None,
            "system_prompt_append": None,
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 800,
            "temperature": 0.7,
        }
    return dict(row)


@router.patch("/agent-config")
async def update_agent_config_endpoint(
    body: AgentConfigUpdate,
    org_id: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
):
    """Upsert agent config for org."""
    pool = await get_pool()
    payload = verify_token(credentials.credentials) if credentials and credentials.scheme == "Bearer" else None
    if not payload:
        raise HTTPException(401)

    caller_role = payload.get("role")
    caller_org = payload.get("organization_id")

    if caller_role not in ("superadmin", "admin"):
        raise HTTPException(403)

    target_org = org_id if (caller_role == "superadmin" and org_id) else caller_org

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    if not updates:
        raise HTTPException(400, "Nada que actualizar")

    # Validate temperature if provided
    if "temperature" in updates and not (0.0 <= updates["temperature"] <= 2.0):
        raise HTTPException(400, "temperature debe estar entre 0.0 y 2.0")

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())

    row = await pool.fetchrow(
        f"""INSERT INTO agent_configs (organization_id, {', '.join(updates.keys())})
            VALUES ($1, {', '.join(f'${i+2}' for i in range(len(updates)))})
            ON CONFLICT (organization_id) DO UPDATE SET {set_clause}, updated_at = NOW()
            RETURNING *""",
        target_org, *values
    )
    return dict(row)
```

**Commit:**
```bash
git add app/admin/api.py
git commit -m "feat: GET/PATCH endpoints for agent_configs"
```

---

### Task 3: Frontend — interfaces y métodos en api.ts

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces a agregar** (después de las interfaces existentes, antes de la clase `ApiClient`):

```typescript
export interface TenantChannel {
  id: string;
  organization_id: string;
  org_name?: string;
  provider: 'twilio' | 'meta';
  phone_number: string;
  display_name?: string;
  account_sid?: string;
  auth_token?: string;
  access_token?: string;
  phone_number_id?: string;
  verify_token?: string;
  waba_id?: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantChannelCreate {
  organization_id?: string;
  provider: 'twilio' | 'meta';
  phone_number: string;
  display_name?: string;
  account_sid?: string;
  auth_token?: string;
  access_token?: string;
  phone_number_id?: string;
  verify_token?: string;
  waba_id?: string;
}

export interface AgentConfig {
  organization_id: string;
  agent_name: string;
  system_prompt_override?: string;
  system_prompt_append?: string;
  model: string;
  max_tokens: number;
  temperature: number;
}
```

**Métodos a agregar en la clase ApiClient** (después de los métodos de organizations):

```typescript
// Tenant Channels
getTenantChannels(): Promise<TenantChannel[]> {
  return fetcher(`${BASE_URL}/admin/tenant-channels`);
}

createTenantChannel(data: TenantChannelCreate): Promise<TenantChannel> {
  return fetcher(`${BASE_URL}/admin/tenant-channels`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

updateTenantChannel(id: string, data: Partial<TenantChannelCreate & { activo: boolean }>): Promise<TenantChannel> {
  return fetcher(`${BASE_URL}/admin/tenant-channels/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

deleteTenantChannel(id: string): Promise<void> {
  return fetcher(`${BASE_URL}/admin/tenant-channels/${id}`, { method: 'DELETE' });
}

// Agent Config
getAgentConfig(orgId?: string): Promise<AgentConfig> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return fetcher(`${BASE_URL}/admin/agent-config${qs}`);
}

updateAgentConfig(data: Partial<AgentConfig>, orgId?: string): Promise<AgentConfig> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return fetcher(`${BASE_URL}/admin/agent-config${qs}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
```

**Commit:**
```bash
git add frontend/src/lib/api.ts
git commit -m "feat: TenantChannel and AgentConfig types and API methods"
```

---

### Task 4: Frontend — tab "Canales" en /admin/usuarios

**Files:**
- Modify: `frontend/src/app/admin/usuarios/page.tsx`

**Cambios:**

1. Extender el tipo Tab:
```typescript
type Tab = 'usuarios' | 'organizaciones' | 'canales' | 'agente';
```

2. Agregar imports:
```typescript
import { api, User, Organization, TenantChannel, TenantChannelCreate } from '@/lib/api';
import { Wifi, WifiOff, Phone, Bot } from 'lucide-react';
// (agregar a los lucide imports existentes)
```

3. Agregar state para canales (dentro del componente, después del state de organizations):
```typescript
const [channels, setChannels] = useState<TenantChannel[]>([]);
const [channelModal, setChannelModal] = useState<'create' | 'edit' | null>(null);
const [selectedChannel, setSelectedChannel] = useState<TenantChannel | null>(null);
const [channelForm, setChannelForm] = useState<TenantChannelCreate>({
  organization_id: '',
  provider: 'meta',
  phone_number: '',
  display_name: '',
  account_sid: '',
  auth_token: '',
  access_token: '',
  phone_number_id: '',
  verify_token: '',
  waba_id: '',
});

const loadChannels = useCallback(async () => {
  try {
    const data = await api.getTenantChannels();
    setChannels(data);
  } catch {
    // silent
  }
}, []);

useEffect(() => {
  if (activeTab === 'canales') loadChannels();
}, [activeTab, loadChannels]);
```

4. Agregar los tabs en el header (donde están los botones de tab actuales):
```tsx
{/* Tabs */}
<div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
  {(['usuarios', 'organizaciones', 'canales', 'agente'] as Tab[]).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={cn(
        'px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize',
        activeTab === tab
          ? 'bg-white shadow-sm text-gray-900'
          : 'text-gray-500 hover:text-gray-700'
      )}
    >
      {tab === 'usuarios' && 'Usuarios'}
      {tab === 'organizaciones' && 'Organizaciones'}
      {tab === 'canales' && 'Canales WhatsApp'}
      {tab === 'agente' && 'Agente IA'}
    </button>
  ))}
</div>
```

5. Agregar sección de canales (después del bloque de organizaciones, antes del cierre del return):

```tsx
{/* ===== CANALES ===== */}
{activeTab === 'canales' && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="font-display font-semibold text-gray-900">Canales WhatsApp</h2>
        <p className="text-sm text-muted-foreground">Números de WhatsApp registrados por organización</p>
      </div>
      <Button onClick={() => {
        setChannelForm({ organization_id: '', provider: 'meta', phone_number: '', display_name: '', account_sid: '', auth_token: '', access_token: '', phone_number_id: '', verify_token: '', waba_id: '' });
        setSelectedChannel(null);
        setChannelModal('create');
      }}>
        <Plus size={14} className="mr-1.5" /> Nuevo canal
      </Button>
    </div>

    {channels.length === 0 ? (
      <div className="text-center py-16 text-muted-foreground">
        <Phone size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No hay canales registrados</p>
      </div>
    ) : (
      <div className="space-y-2">
        {channels.map((ch) => (
          <div key={ch.id} className="glass flex items-center gap-4 px-4 py-3 rounded-xl">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
              ch.provider === 'meta' ? 'bg-green-100' : 'bg-blue-100'
            )}>
              <Phone size={14} className={ch.provider === 'meta' ? 'text-green-700' : 'text-blue-700'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900">{ch.phone_number}</span>
                {ch.display_name && <span className="text-xs text-muted-foreground">— {ch.display_name}</span>}
                <Badge variant="outline" className="text-[10px] uppercase">
                  {ch.provider}
                </Badge>
              </div>
              {isSuperAdmin && ch.org_name && (
                <p className="text-xs text-muted-foreground">{ch.org_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn(
                'text-[10px]',
                ch.activo ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500'
              )}>
                {ch.activo ? 'Activo' : 'Inactivo'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedChannel(ch);
                  setChannelForm({
                    organization_id: ch.organization_id,
                    provider: ch.provider,
                    phone_number: ch.phone_number,
                    display_name: ch.display_name || '',
                    account_sid: ch.account_sid || '',
                    auth_token: ch.auth_token || '',
                    access_token: ch.access_token || '',
                    phone_number_id: ch.phone_number_id || '',
                    verify_token: ch.verify_token || '',
                    waba_id: ch.waba_id || '',
                  });
                  setChannelModal('edit');
                }}
              >
                <Pencil size={13} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!confirm('¿Desactivar este canal?')) return;
                  await api.deleteTenantChannel(ch.id);
                  toast.success('Canal desactivado');
                  loadChannels();
                }}
              >
                <WifiOff size={13} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

6. Agregar el Dialog de crear/editar canal (antes del cierre del return, después del dialog de usuarios):

```tsx
<Dialog open={channelModal !== null} onOpenChange={(o) => !o && setChannelModal(null)}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>{channelModal === 'create' ? 'Nuevo canal WhatsApp' : 'Editar canal'}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-2">
      {/* Provider */}
      <div>
        <Label>Provider</Label>
        <Select
          value={channelForm.provider}
          onValueChange={(v: 'twilio' | 'meta') => setChannelForm(f => ({ ...f, provider: v }))}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="meta">Meta Cloud API</SelectItem>
            <SelectItem value="twilio">Twilio Sandbox</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Org — superadmin only */}
      {isSuperAdmin && (
        <div>
          <Label>Organización</Label>
          <Select
            value={channelForm.organization_id}
            onValueChange={(v) => setChannelForm(f => ({ ...f, organization_id: v }))}
          >
            <SelectTrigger><SelectValue placeholder="Seleccionar org..." /></SelectTrigger>
            <SelectContent>
              {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {/* Phone number */}
      <div>
        <Label>Número de teléfono (E.164)</Label>
        <Input
          placeholder="+5491112345678"
          value={channelForm.phone_number}
          onChange={e => setChannelForm(f => ({ ...f, phone_number: e.target.value }))}
        />
      </div>
      <div>
        <Label>Nombre descriptivo (opcional)</Label>
        <Input
          placeholder="Canal principal"
          value={channelForm.display_name || ''}
          onChange={e => setChannelForm(f => ({ ...f, display_name: e.target.value }))}
        />
      </div>

      {/* Meta fields */}
      {channelForm.provider === 'meta' && (<>
        <div>
          <Label>Access Token</Label>
          <Input
            type="password"
            placeholder="EAA..."
            value={channelForm.access_token || ''}
            onChange={e => setChannelForm(f => ({ ...f, access_token: e.target.value }))}
          />
        </div>
        <div>
          <Label>Phone Number ID</Label>
          <Input
            placeholder="123456789012345"
            value={channelForm.phone_number_id || ''}
            onChange={e => setChannelForm(f => ({ ...f, phone_number_id: e.target.value }))}
          />
        </div>
        <div>
          <Label>Verify Token (para webhook)</Label>
          <Input
            placeholder="mi_verify_token_secreto"
            value={channelForm.verify_token || ''}
            onChange={e => setChannelForm(f => ({ ...f, verify_token: e.target.value }))}
          />
        </div>
        <div>
          <Label>WABA ID (opcional)</Label>
          <Input
            placeholder="123456789"
            value={channelForm.waba_id || ''}
            onChange={e => setChannelForm(f => ({ ...f, waba_id: e.target.value }))}
          />
        </div>
      </>)}

      {/* Twilio fields */}
      {channelForm.provider === 'twilio' && (<>
        <div>
          <Label>Account SID</Label>
          <Input
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={channelForm.account_sid || ''}
            onChange={e => setChannelForm(f => ({ ...f, account_sid: e.target.value }))}
          />
        </div>
        <div>
          <Label>Auth Token</Label>
          <Input
            type="password"
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={channelForm.auth_token || ''}
            onChange={e => setChannelForm(f => ({ ...f, auth_token: e.target.value }))}
          />
        </div>
      </>)}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setChannelModal(null)}>Cancelar</Button>
      <Button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            if (channelModal === 'create') {
              await api.createTenantChannel(channelForm);
              toast.success('Canal creado');
            } else if (selectedChannel) {
              await api.updateTenantChannel(selectedChannel.id, channelForm);
              toast.success('Canal actualizado');
            }
            setChannelModal(null);
            loadChannels();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar');
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? 'Guardando...' : 'Guardar'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Commit:**
```bash
git add frontend/src/app/admin/usuarios/page.tsx
git commit -m "feat: tab Canales WhatsApp en panel de admin"
```

---

### Task 5: Frontend — tab "Agente IA" en /admin/usuarios

**Files:**
- Modify: `frontend/src/app/admin/usuarios/page.tsx`

**Agregar state:**
```typescript
const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
const [agentForm, setAgentForm] = useState({
  agent_name: '',
  system_prompt_append: '',
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 800,
  temperature: 0.7,
});
const [savingAgent, setSavingAgent] = useState(false);
const [selectedAgentOrg, setSelectedAgentOrg] = useState('');

const loadAgentConfig = useCallback(async (orgId?: string) => {
  try {
    const data = await api.getAgentConfig(orgId);
    setAgentConfig(data);
    setAgentForm({
      agent_name: data.agent_name,
      system_prompt_append: data.system_prompt_append || '',
      model: data.model,
      max_tokens: data.max_tokens,
      temperature: data.temperature,
    });
  } catch {
    // silent
  }
}, []);

useEffect(() => {
  if (activeTab === 'agente') loadAgentConfig(isSuperAdmin ? selectedAgentOrg || undefined : undefined);
}, [activeTab, selectedAgentOrg, loadAgentConfig, isSuperAdmin]);
```

**Agregar sección en el return (después del bloque de canales):**

```tsx
{/* ===== AGENTE IA ===== */}
{activeTab === 'agente' && (
  <div className="max-w-2xl space-y-6">
    <div>
      <h2 className="font-display font-semibold text-gray-900">Configuración del Agente IA</h2>
      <p className="text-sm text-muted-foreground">Personalizar el nombre, tono y comportamiento del agente para esta organización.</p>
    </div>

    {/* Superadmin: org selector */}
    {isSuperAdmin && (
      <div>
        <Label>Organización</Label>
        <Select
          value={selectedAgentOrg}
          onValueChange={setSelectedAgentOrg}
        >
          <SelectTrigger><SelectValue placeholder="Mi organización" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Mi organización</SelectItem>
            {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    )}

    <div className="glass p-5 rounded-xl space-y-4">
      <div>
        <Label>Nombre del agente</Label>
        <Input
          placeholder="Asistente"
          value={agentForm.agent_name}
          onChange={e => setAgentForm(f => ({ ...f, agent_name: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground mt-1">El nombre que usa el agente para identificarse internamente</p>
      </div>

      <div>
        <Label>Instrucciones adicionales (append)</Label>
        <textarea
          className="w-full min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Ejemplo: Siempre mencionar que los precios son en USD. Nunca ofrecer descuentos sin consultar al asesor."
          value={agentForm.system_prompt_append}
          onChange={e => setAgentForm(f => ({ ...f, system_prompt_append: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground mt-1">Se agrega al final del prompt base. Ideal para reglas específicas del negocio.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Modelo</Label>
          <Select
            value={agentForm.model}
            onValueChange={v => setAgentForm(f => ({ ...f, model: v }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-haiku-4-5-20251001">Haiku 4.5 (rápido)</SelectItem>
              <SelectItem value="claude-sonnet-4-6">Sonnet 4.6 (mejor)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Max tokens</Label>
          <Input
            type="number"
            min={100}
            max={4096}
            value={agentForm.max_tokens}
            onChange={e => setAgentForm(f => ({ ...f, max_tokens: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Temperature (0–2)</Label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={agentForm.temperature}
            onChange={e => setAgentForm(f => ({ ...f, temperature: Number(e.target.value) }))}
          />
        </div>
      </div>
    </div>

    <div className="flex justify-end">
      <Button
        disabled={savingAgent}
        onClick={async () => {
          setSavingAgent(true);
          try {
            await api.updateAgentConfig(
              agentForm,
              isSuperAdmin && selectedAgentOrg ? selectedAgentOrg : undefined
            );
            toast.success('Configuración del agente guardada');
            loadAgentConfig(isSuperAdmin ? selectedAgentOrg || undefined : undefined);
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al guardar');
          } finally {
            setSavingAgent(false);
          }
        }}
      >
        {savingAgent ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </div>
  </div>
)}
```

**Commit:**
```bash
git add frontend/src/app/admin/usuarios/page.tsx
git commit -m "feat: tab Agente IA en panel de admin"
```

---

### Task 6: Sidebar — link a Configuración visible para superadmin

La página `/admin/usuarios` ya está linkeada desde el sidebar como "Usuarios". Cuando llega el segundo cliente, el superadmin necesita saber que ahí vive también la config de canales.

Único cambio: renombrar el label del link de "Usuarios" a "Admin" o "Configuración" en el sidebar, para que sea obvio que es el hub admin general.

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**Cambio:**
```tsx
// Antes:
{!collapsed && <span className="text-sm font-medium">Usuarios</span>}

// Después:
{!collapsed && <span className="text-sm font-medium">Administración</span>}
```

**Commit:**
```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: rename sidebar Admin link to Administración"
```
