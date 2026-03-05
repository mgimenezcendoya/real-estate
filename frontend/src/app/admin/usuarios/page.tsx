'use client';

import { useEffect, useState } from 'react';
import { api, User, Organization } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Plus, Pencil, KeyRound, UserX, UserCheck, Users, Building2, PowerOff, Power } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
  lector: 'Lector',
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: 'bg-violet-100 text-violet-700 border-violet-200',
  admin: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  gerente: 'bg-blue-100 text-blue-700 border-blue-200',
  vendedor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  lector: 'bg-gray-100 text-gray-600 border-gray-200',
};

const TIPO_LABELS: Record<string, string> = {
  desarrolladora: 'Desarrolladora',
  inmobiliaria: 'Inmobiliaria',
  ambas: 'Desarrolladora + Inmobiliaria',
};

type ModalMode = 'create' | 'edit' | 'reset-password' | null;
type Tab = 'usuarios' | 'organizaciones';

export default function UsuariosPage() {
  const { isAdmin, role } = useAuth();
  const isSuperAdmin = role === 'superadmin';

  const [activeTab, setActiveTab] = useState<Tab>('usuarios');

  // --- Users state ---
  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', nombre: '', apellido: '',
    role: 'vendedor', organization_id: '',
  });
  const [newPassword, setNewPassword] = useState('');

  // --- Orgs state ---
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: '', tipo: 'ambas', cuit: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [u, o] = await Promise.all([api.getUsers(), api.getOrganizations()]);
      setUsers(u);
      setOrgs(o);
      if (o.length > 0 && !form.organization_id) {
        setForm(f => ({ ...f, organization_id: o[0].id }));
      }
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }

  // --- Users handlers ---
  function openCreate() {
    setSelectedUser(null);
    setForm({ email: '', password: '', nombre: '', apellido: '', role: 'vendedor', organization_id: orgs[0]?.id || '' });
    setModalMode('create');
  }

  function openEdit(u: User) {
    setSelectedUser(u);
    setForm({ email: u.email, password: '', nombre: u.nombre, apellido: u.apellido, role: u.role, organization_id: u.organization_id });
    setModalMode('edit');
  }

  function openResetPassword(u: User) {
    setSelectedUser(u);
    setNewPassword('');
    setModalMode('reset-password');
  }

  async function handleCreate() {
    if (!form.email || !form.password || !form.nombre) {
      toast.error('Email, contraseña y nombre son requeridos');
      return;
    }
    setSaving(true);
    try {
      await api.createUser({
        organization_id: form.organization_id,
        email: form.email,
        password: form.password,
        nombre: form.nombre,
        apellido: form.apellido,
        role: form.role,
      });
      toast.success('Usuario creado');
      setModalMode(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al crear usuario');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await api.updateUser(selectedUser.id, {
        nombre: form.nombre,
        apellido: form.apellido,
        role: form.role,
      });
      toast.success('Usuario actualizado');
      setModalMode(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser || !newPassword) return;
    setSaving(true);
    try {
      await api.resetUserPassword(selectedUser.id, newPassword);
      toast.success('Contraseña actualizada');
      setModalMode(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al resetear contraseña');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: User) {
    try {
      if (u.activo) {
        await api.deleteUser(u.id);
        toast.success('Usuario desactivado');
      } else {
        await api.updateUser(u.id, { activo: true });
        toast.success('Usuario activado');
      }
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  // --- Org handlers ---
  function openOrgModal() {
    setEditingOrg(null);
    setOrgForm({ name: '', tipo: 'ambas', cuit: '' });
    setOrgModalOpen(true);
  }

  function openEditOrg(o: Organization) {
    setEditingOrg(o);
    setOrgForm({ name: o.name, tipo: o.tipo, cuit: o.cuit ?? '' });
    setOrgModalOpen(true);
  }

  async function handleCreateOrg() {
    if (!orgForm.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    setSavingOrg(true);
    try {
      if (editingOrg) {
        await api.updateOrganization(editingOrg.id, {
          name: orgForm.name.trim(),
          tipo: orgForm.tipo,
          cuit: orgForm.cuit.trim() || undefined,
        });
        toast.success(`Organización "${orgForm.name.trim()}" actualizada`);
      } else {
        await api.createOrganization({
          name: orgForm.name.trim(),
          tipo: orgForm.tipo,
          cuit: orgForm.cuit.trim() || undefined,
        });
        toast.success(`Organización "${orgForm.name.trim()}" creada`);
      }
      setOrgModalOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar organización');
    } finally {
      setSavingOrg(false);
    }
  }

  async function toggleOrgActive(o: Organization) {
    try {
      await api.toggleOrganizationActive(o.id);
      toast.success(o.activa ? `"${o.name}" desactivada` : `"${o.name}" activada`);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No tenés permisos para ver esta sección.
      </div>
    );
  }

  const userCountByOrg = users.reduce<Record<string, number>>((acc, u) => {
    acc[u.organization_id] = (acc[u.organization_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Administración</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestioná usuarios y organizaciones del sistema.</p>
        </div>
        {activeTab === 'usuarios' && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Nuevo usuario
          </Button>
        )}
        {activeTab === 'organizaciones' && isSuperAdmin && (
          <Button onClick={openOrgModal} className="gap-2">
            <Plus className="w-4 h-4" />
            Nueva organización
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1 w-fit border border-border">
        <button
          type="button"
          onClick={() => setActiveTab('usuarios')}
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all',
            activeTab === 'usuarios'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-muted-foreground hover:text-gray-700'
          )}
        >
          <Users size={14} />
          Usuarios
          <span className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            activeTab === 'usuarios' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
          )}>
            {users.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('organizaciones')}
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-all',
            activeTab === 'organizaciones'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-muted-foreground hover:text-gray-700'
          )}
        >
          <Building2 size={14} />
          Organizaciones
          <span className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            activeTab === 'organizaciones' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'
          )}>
            {orgs.length}
          </span>
        </button>
      </div>

      {/* ── USUARIOS TAB ── */}
      {activeTab === 'usuarios' && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Usuario</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Organización</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Rol</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Último acceso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3" />
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No hay usuarios todavía.
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className={cn('border-b border-border last:border-0 transition-colors hover:bg-muted/30', !u.activo && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{u.nombre} {u.apellido}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                      {u.debe_cambiar_password && (
                        <span className="text-xs text-amber-600 font-medium">Debe cambiar password</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.organization_name}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', ROLE_COLORS[u.role] || ROLE_COLORS.lector)}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.activo ? 'default' : 'secondary'} className="text-xs">
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {u.ultimo_acceso
                        ? new Date(u.ultimo_acceso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : 'Nunca'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(u)} title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openResetPassword(u)} title="Cambiar contraseña">
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn('h-7 w-7', u.activo ? 'text-destructive hover:text-destructive' : 'text-emerald-600 hover:text-emerald-600')}
                          onClick={() => toggleActive(u)}
                          title={u.activo ? 'Desactivar' : 'Activar'}
                        >
                          {u.activo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ORGANIZACIONES TAB ── */}
      {activeTab === 'organizaciones' && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Organización</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">CUIT</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Usuarios</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Estado</th>
                {isSuperAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    {isSuperAdmin && <td className="px-4 py-3" />}
                  </tr>
                ))
              ) : orgs.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 6 : 5} className="px-4 py-12 text-center text-muted-foreground">
                    No hay organizaciones todavía.
                  </td>
                </tr>
              ) : (
                orgs.map(o => (
                  <tr key={o.id} className={cn('border-b border-border last:border-0 hover:bg-muted/30 transition-colors', !o.activa && 'opacity-50')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                          <Building2 size={14} className="text-blue-700" />
                        </div>
                        <span className="font-medium text-foreground">{o.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {TIPO_LABELS[o.tipo] ?? o.tipo}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {o.cuit || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Users size={11} />
                        {userCountByOrg[o.id] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={o.activa ? 'default' : 'secondary'} className="text-xs">
                        {o.activa ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditOrg(o)} title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn('h-7 w-7', o.activa ? 'text-destructive hover:text-destructive' : 'text-emerald-600 hover:text-emerald-600')}
                            onClick={() => toggleOrgActive(o)}
                            title={o.activa ? 'Desactivar' : 'Activar'}
                          >
                            {o.activa ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal crear / editar usuario ── */}
      <Dialog open={modalMode === 'create' || modalMode === 'edit'} onOpenChange={open => !open && setModalMode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{modalMode === 'create' ? 'Nuevo usuario' : 'Editar usuario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {modalMode === 'create' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nombre</Label>
                    <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Martín" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apellido</Label>
                    <Input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} placeholder="García" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="usuario@ejemplo.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>Contraseña inicial</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
                </div>
                <div className="space-y-1.5">
                  <Label>Organización</Label>
                  <Select value={form.organization_id} onValueChange={v => setForm(f => ({ ...f, organization_id: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {modalMode === 'edit' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre</Label>
                  <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Apellido</Label>
                  <Input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMode(null)}>Cancelar</Button>
            <Button onClick={modalMode === 'create' ? handleCreate : handleEdit} disabled={saving}>
              {saving ? 'Guardando...' : modalMode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal reset password ── */}
      <Dialog open={modalMode === 'reset-password'} onOpenChange={open => !open && setModalMode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <p className="text-sm text-muted-foreground mb-3">
              Cambiando contraseña de <span className="font-medium text-foreground">{selectedUser?.email}</span>
            </p>
            <Label>Nueva contraseña</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMode(null)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={saving || !newPassword}>
              {saving ? 'Guardando...' : 'Actualizar contraseña'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal nueva/editar organización ── */}
      <Dialog open={orgModalOpen} onOpenChange={open => !open && setOrgModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOrg ? 'Editar organización' : 'Nueva organización'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input
                value={orgForm.name}
                onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Constructora Palermo S.A."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={orgForm.tipo} onValueChange={v => setOrgForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desarrolladora">Desarrolladora</SelectItem>
                  <SelectItem value="inmobiliaria">Inmobiliaria</SelectItem>
                  <SelectItem value="ambas">Desarrolladora + Inmobiliaria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>CUIT <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                value={orgForm.cuit}
                onChange={e => setOrgForm(f => ({ ...f, cuit: e.target.value }))}
                placeholder="30-12345678-9"
              />
            </div>
            {!editingOrg && (
              <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                Una vez creada la organización, podés agregarle usuarios desde la tab de Usuarios.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateOrg} disabled={savingOrg || !orgForm.name.trim()}>
              {savingOrg ? 'Guardando...' : editingOrg ? 'Guardar cambios' : 'Crear organización'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
