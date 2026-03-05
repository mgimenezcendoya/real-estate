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
import { Plus, Pencil, KeyRound, UserX, UserCheck } from 'lucide-react';

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

type ModalMode = 'create' | 'edit' | 'reset-password' | null;

export default function UsuariosPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    email: '', password: '', nombre: '', apellido: '',
    role: 'vendedor', organization_id: '',
  });
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    load();
  }, []);

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
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }

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

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No tenés permisos para ver esta sección.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestioná los usuarios y sus roles de acceso.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo usuario
        </Button>
      </div>

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
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
                    {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Nunca'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(u)} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openResetPassword(u)} title="Cambiar contraseña">
                        <KeyRound className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className={cn('h-7 w-7', u.activo ? 'text-destructive hover:text-destructive' : 'text-emerald-600 hover:text-emerald-600')} onClick={() => toggleActive(u)} title={u.activo ? 'Desactivar' : 'Activar'}>
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

      {/* Create / Edit modal */}
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

      {/* Reset password modal */}
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
    </div>
  );
}
