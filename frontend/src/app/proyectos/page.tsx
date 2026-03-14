'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, Project, Metrics, Organization, CashFlowRow } from '@/lib/api';
import { Building2, ChevronRight, Plus, SlidersHorizontal, X, Search, ShieldCheck, BarChart2, ArrowUpCircle, ArrowDownCircle, MoreVertical, Pencil, Trash2, RotateCcw, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import NewProjectModal from '@/components/NewProjectModal';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_CONFIG = {
  active: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused: { label: 'Pausado', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Terminado', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  deleted: { label: 'Eliminado', className: 'bg-red-50 text-red-600 border-red-200' },
};

const DELIVERY_LABELS: Record<string, string> = {
  en_pozo: 'En pozo',
  en_construccion: 'En construcción',
  terminado: 'Terminado',
};

function ProjectCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between">
        <Skeleton className="w-12 h-12 rounded-2xl bg-gray-200" />
        <Skeleton className="w-20 h-6 rounded-full bg-gray-100" />
      </div>
      <div className="space-y-2">
        <Skeleton className="w-3/4 h-6 bg-gray-200" />
        <Skeleton className="w-1/2 h-4 bg-gray-100" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl bg-gray-100" />
        ))}
      </div>
      <Skeleton className="h-10 rounded-xl bg-gray-100 mt-auto" />
    </div>
  );
}

const MES_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};
function fmtMes(ym: string) {
  const [y, m] = ym.split('-');
  return `${MES_LABELS[m] ?? m} ${y}`;
}

const defaultDesde = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const defaultHasta = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 13);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function ProyectosPage() {
  const { isReader, role, organizationId, organizationName } = useAuth();
  const isSuperAdmin = role === 'superadmin';
  const [projects, setProjects] = useState<Project[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [metricsByProject, setMetricsByProject] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const filterRef = useRef<HTMLDivElement>(null);

  // Rename dialog
  const [renameProject, setRenameProject] = useState<Project | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [locationProject, setLocationProject] = useState<Project | null>(null);
  const [locationLat, setLocationLat] = useState('');
  const [locationLng, setLocationLng] = useState('');
  // Delete dialog
  const [deleteProject, setDeleteProjectState] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Consolidated cash flow
  const [cashFlow, setCashFlow] = useState<CashFlowRow[]>([]);
  const [loadingCF, setLoadingCF] = useState(false);
  const [cfDesde, setCfDesde] = useState(defaultDesde);
  const [cfHasta, setCfHasta] = useState(defaultHasta);
  const [activeTab, setActiveTab] = useState('proyectos');

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const isDeleted = !!p.deleted_at;
      const matchName = !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchStatus = statusFilter === 'deleted' ? isDeleted : (!statusFilter ? !isDeleted : (!isDeleted && p.status === statusFilter));
      const matchDelivery = !deliveryFilter || (p.delivery_status || '') === deliveryFilter;
      const matchOrg = !orgFilter || p.organization_id === orgFilter;
      return matchName && matchStatus && matchDelivery && matchOrg;
    });
  }, [projects, searchQuery, statusFilter, deliveryFilter, orgFilter]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    if (filterOpen) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [filterOpen]);

  const showingDeleted = statusFilter === 'deleted';

  const loadProjects = useCallback(() => {
    setLoading(true);
    const fetches: Promise<void>[] = [
      api.getProjects(true)
        .then(async (list) => {
          setProjects(list);
          const metrics: Record<string, Metrics> = {};
          await Promise.all(
            list.map((p) =>
              api.getMetrics(p.id).then((m) => { metrics[p.id] = m; }).catch(() => {})
            )
          );
          setMetricsByProject(metrics);
        })
        .catch(() => { toast.error('No se pudo conectar con el backend'); }),
    ];
    if (isSuperAdmin) {
      fetches.push(
        api.getOrganizations().then(setOrgs).catch(() => {})
      );
    }
    Promise.all(fetches).finally(() => setLoading(false));
  }, [isSuperAdmin]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const loadCashFlow = useCallback(async (desde?: string, hasta?: string) => {
    setLoadingCF(true);
    try { setCashFlow(await api.getConsolidatedCashFlow(desde ?? cfDesde, hasta ?? cfHasta)); }
    catch { toast.error('Error cargando flujo de fondos'); }
    finally { setLoadingCF(false); }
  }, [cfDesde, cfHasta]);

  useEffect(() => {
    if (activeTab === 'flujo') loadCashFlow();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'flujo') loadCashFlow(cfDesde, cfHasta);
  }, [cfDesde, cfHasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRenameConfirm = async () => {
    if (!renameProject || !renameName.trim()) return;
    setRenaming(true);
    try {
      await api.updateProject(renameProject.id, { name: renameName.trim() });
      toast.success('Proyecto renombrado');
      setRenameProject(null);
      loadProjects();
    } catch {
      toast.error('No se pudo renombrar el proyecto');
    } finally {
      setRenaming(false);
    }
  };

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

  const handleDeleteConfirm = async () => {
    if (!deleteProject) return;
    setDeleting(true);
    try {
      await api.deleteProject(deleteProject.id);
      toast.success('Proyecto eliminado');
      setDeleteProjectState(null);
      loadProjects();
    } catch {
      toast.error('No se pudo eliminar el proyecto');
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (project: Project) => {
    try {
      await api.restoreProject(project.id);
      toast.success('Proyecto restaurado');
      loadProjects();
    } catch {
      toast.error('No se pudo restaurar el proyecto');
    }
  };

  // For superadmin: no org restriction; for others: scoped to their org
  // When superadmin has an org filter active, use that org for new projects
  const developerId = isSuperAdmin ? (orgFilter || '') : (organizationId ?? '');
  const hasFilters = !!(searchQuery || statusFilter || deliveryFilter || orgFilter);
  const activeOrgName = isSuperAdmin && orgFilter ? orgs.find(o => o.id === orgFilter)?.name : null;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto min-h-full animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          {isSuperAdmin ? (
            <div className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest mb-3',
              activeOrgName
                ? 'bg-blue-50 border-blue-200/80 text-blue-700'
                : 'bg-violet-50 border-violet-200/80 text-violet-700'
            )}>
              {activeOrgName ? <Building2 size={10} /> : <ShieldCheck size={10} />}
              {activeOrgName ?? 'Superadmin · Todas las organizaciones'}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-[10px] font-bold uppercase tracking-widest mb-3">
              <Building2 size={10} />
              {organizationName ?? 'Portafolio'}
            </div>
          )}
          <h1 className="text-3xl md:text-4xl font-display font-extrabold text-gray-900 tracking-tight mb-2 leading-none">Proyectos</h1>
          <p className="text-gray-400 text-sm max-w-xl font-medium">
            Gestioná y monitoreá el progreso de todos tus desarrollos inmobiliarios.
          </p>
        </div>

        <div className="flex items-center gap-3 relative flex-wrap" ref={filterRef}>
          {/* Filter button — only on proyectos tab */}
          {activeTab === 'proyectos' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterOpen(!filterOpen)}
              className={cn(
                'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 gap-2',
                filterOpen && 'bg-gray-50 ring-1 ring-blue-500',
                hasFilters && 'border-blue-300 text-blue-800'
              )}
            >
              <SlidersHorizontal size={15} />
              Filtrar
              {hasFilters && (
                <span className="w-5 h-5 rounded-full bg-blue-700 text-white text-[10px] flex items-center justify-center font-bold">
                  {[searchQuery, statusFilter, deliveryFilter, orgFilter].filter(Boolean).length}
                </span>
              )}
            </Button>
          )}

          {/* Filter dropdown */}
          {filterOpen && (
            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl p-4 shadow-xl border border-gray-200 z-20 animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-900">Filtrar proyectos</span>
                <button onClick={() => setFilterOpen(false)} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <X size={15} />
                </button>
              </div>

              <div className="relative mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-blue-500 h-9"
                />
              </div>

              {/* Org filter — superadmin only */}
              {isSuperAdmin && orgs.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Organización</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      key="all-orgs"
                      onClick={() => setOrgFilter('')}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        orgFilter === ''
                          ? 'bg-violet-50 text-violet-800 border-violet-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      Todas
                    </button>
                    {orgs.map(o => (
                      <button
                        key={o.id}
                        onClick={() => setOrgFilter(o.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                          orgFilter === o.id
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-900'
                        )}
                      >
                        {o.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Estado</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['', 'active', 'paused', 'completed', 'deleted'] as const).map((s) => (
                    <button
                      key={s || 'all'}
                      onClick={() => { setStatusFilter(s); if (s !== 'deleted') setDeliveryFilter(''); }}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        statusFilter === s
                          ? s === 'deleted'
                            ? 'bg-red-50 text-red-700 border-red-300'
                            : 'bg-blue-50 text-blue-800 border-blue-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      {s === '' ? 'Todos' : STATUS_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avance real</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['', 'en_pozo', 'en_construccion', 'terminado'] as const).map((d) => (
                    <button
                      key={d || 'all'}
                      onClick={() => setDeliveryFilter(d)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        deliveryFilter === d
                          ? 'bg-blue-50 text-blue-800 border-blue-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      {d === '' ? 'Todos' : DELIVERY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              {hasFilters && (
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter(''); setDeliveryFilter(''); setOrgFilter(''); }}
                  className="mt-3 w-full text-xs text-gray-500 hover:text-gray-900 transition-colors py-1.5 rounded-lg hover:bg-gray-100"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {!isReader && (
            <Button
              onClick={() => setShowNewModal(true)}
              className="bg-blue-700 hover:bg-blue-800 text-white border-0 gap-2 transition-colors"
            >
              <Plus size={17} />
              Nuevo Proyecto
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="proyectos">Proyectos</TabsTrigger>
          <TabsTrigger value="flujo">Flujo de Fondos</TabsTrigger>
        </TabsList>

        {/* ─── Tab: Proyectos ─── */}
        <TabsContent value="proyectos">
          {/* Results count */}
          {hasFilters && !loading && (
            <p className="text-sm text-gray-500 mb-5">
              {filteredProjects.length} de {projects.length} proyecto{projects.length !== 1 ? 's' : ''}
            </p>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => <ProjectCardSkeleton key={i} />)}
            </div>
          )}

          {/* Projects grid */}
          {!loading && filteredProjects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProjects.map((project, idx) => {
                const isDeleted = !!project.deleted_at;
                const statusConf = isDeleted
                  ? STATUS_CONFIG.deleted
                  : (STATUS_CONFIG[project.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active);
                return (
                  <div
                    key={project.id}
                    className={cn('group animate-fade-in-up relative', isDeleted && 'opacity-60')}
                    style={{ animationDelay: `${idx * 45}ms`, animationFillMode: 'both' }}
                  >
                    <Link
                      href={isDeleted ? '#' : `/proyectos/${project.id}`}
                      onClick={isDeleted ? (e) => e.preventDefault() : undefined}
                      className="block"
                    >
                    <div className={cn(
                      'card-top-accent relative h-full bg-white border border-gray-200 rounded-2xl transition-all duration-200 flex flex-col',
                      !isDeleted && 'group-hover:border-blue-200 group-hover:shadow-lg group-hover:shadow-blue-500/[0.06]',
                      isDeleted && 'border-dashed border-red-200 bg-red-50/20'
                    )}>
                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-start justify-between mb-5">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/70 flex items-center justify-center shadow-sm">
                            <Building2 size={20} className="text-blue-700" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn('text-[10px] font-semibold border', statusConf.className)}>
                              {statusConf.label}
                            </Badge>
                            {!isReader && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    onClick={(e) => e.preventDefault()}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                                  >
                                    <MoreVertical size={14} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  {isDeleted ? (
                                    <DropdownMenuItem
                                      onClick={(e) => { e.preventDefault(); handleRestore(project); }}
                                      className="gap-2 cursor-pointer text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                                    >
                                      <RotateCcw size={13} />
                                      Restaurar
                                    </DropdownMenuItem>
                                  ) : (
                                    <>
                                      <DropdownMenuItem
                                        onClick={(e) => { e.preventDefault(); setRenameProject(project); setRenameName(project.name); }}
                                        className="gap-2 cursor-pointer"
                                      >
                                        <Pencil size={13} />
                                        Renombrar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.preventDefault();
                                          setLocationProject(project);
                                          setLocationLat(project.lat?.toString() ?? '');
                                          setLocationLng(project.lng?.toString() ?? '');
                                        }}
                                        className="gap-2 cursor-pointer"
                                      >
                                        <MapPin className="w-4 h-4 mr-2" />
                                        Editar ubicación
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={(e) => { e.preventDefault(); setDeleteProjectState(project); }}
                                        className="gap-2 cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                                      >
                                        <Trash2 size={13} />
                                        Eliminar
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>

                        <div className="mb-5 flex-1">
                          <h3 className="text-base font-display font-bold text-gray-900 mb-1 group-hover:text-blue-800 transition-colors duration-150 line-clamp-1 tracking-tight">
                            {project.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                            <div className="w-1 h-1 rounded-full bg-blue-500/60 flex-shrink-0" />
                            <span className="truncate font-medium">
                              {project.neighborhood ? `${project.neighborhood}, ` : ''}{project.city || 'CABA'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 mb-5">
                          {[
                            { value: project.total_units ?? '—', label: 'Unidades' },
                            { value: project.total_floors ?? '—', label: 'Pisos' },
                            { value: metricsByProject[project.id]?.total_leads ?? '—', label: 'Leads' },
                          ].map(({ value, label }) => (
                            <div key={label} className="bg-gray-50/80 border border-gray-100 p-2.5 rounded-xl text-center">
                              <p className="text-lg font-display font-bold text-gray-900 tabular leading-tight">{value}</p>
                              <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-3.5 border-t border-gray-100 mt-auto">
                          <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                            <span className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              isDeleted ? 'bg-red-400' :
                              project.delivery_status === 'terminado' ? 'bg-emerald-500' :
                              project.delivery_status === 'en_construccion' ? 'bg-blue-500' : 'bg-amber-500'
                            )} />
                            {isDeleted
                              ? `Eliminado ${new Date(project.deleted_at!).toLocaleDateString('es-AR')}`
                              : (DELIVERY_LABELS[project.delivery_status] ?? project.delivery_status ?? 'En planificación')}
                          </span>
                          {!isDeleted && (
                            <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 group-hover:bg-blue-700 group-hover:text-white group-hover:border-blue-700 transition-all duration-200">
                              <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!loading && filteredProjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-28 text-center bg-white border border-gray-200 rounded-2xl shadow-sm max-w-2xl mx-auto">
              <div className="w-20 h-20 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-6">
                <Building2 size={36} className="text-blue-700" />
              </div>
              <h3 className="text-2xl font-display font-semibold text-gray-900 mb-3">
                {projects.length === 0 ? 'Tu portafolio está vacío' : 'Sin resultados'}
              </h3>
              <p className="text-gray-500 text-sm max-w-sm mb-8">
                {projects.length === 0
                  ? 'Cargá tu primer proyecto para empezar a gestionar tus desarrollos.'
                  : 'Probá cambiar o limpiar los filtros para ver más proyectos.'}
              </p>
              {hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => { setSearchQuery(''); setStatusFilter(''); setDeliveryFilter(''); setOrgFilter(''); }}
                  className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Limpiar filtros
                </Button>
              ) : (
                <Button
                  onClick={() => setShowNewModal(true)}
                  className="bg-blue-700 hover:bg-blue-800 text-white border-0"
                >
                  <Plus size={16} className="mr-2" />
                  Nuevo Proyecto
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Tab: Flujo de Fondos Consolidado ─── */}
        <TabsContent value="flujo" className="space-y-4">
          {/* Filtros de rango */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Desde</label>
              <input
                type="month"
                value={cfDesde}
                onChange={e => setCfDesde(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Hasta</label>
              <input
                type="month"
                value={cfHasta}
                onChange={e => setCfHasta(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              onClick={() => { setCfDesde(defaultDesde()); setCfHasta(defaultHasta()); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline"
            >
              Resetear
            </button>
          </div>

          {loadingCF ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-gray-100" />)}</div>
          ) : cashFlow.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
              <BarChart2 size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Sin datos de flujo de fondos. Registrá pagos de cuotas o gastos en tus proyectos.</p>
            </div>
          ) : (
            <>
              {/* Bar chart */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Ingresos vs Egresos por mes — todos los proyectos</h3>
                <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ minHeight: 120 }}>
                  {(() => {
                    const max = Math.max(...cashFlow.map(r => Math.max(r.ingresos + r.proyeccion, r.egresos)), 1);
                    return cashFlow.map(row => (
                      <div key={row.mes} className="flex flex-col items-center gap-1 flex-shrink-0" style={{ minWidth: 48 }}>
                        <div className="flex items-end gap-0.5" style={{ height: 100 }}>
                          <div
                            className="w-4 rounded-t bg-emerald-400 opacity-70"
                            style={{ height: `${(row.ingresos / max) * 100}%` }}
                            title={`Cobrado: USD ${row.ingresos.toLocaleString('es-AR')}`}
                          />
                          {row.proyeccion > 0 && (
                            <div
                              className="w-4 rounded-t bg-emerald-200"
                              style={{ height: `${(row.proyeccion / max) * 100}%` }}
                              title={`Proyectado: USD ${row.proyeccion.toLocaleString('es-AR')}`}
                            />
                          )}
                          <div
                            className="w-4 rounded-t bg-red-400 opacity-70"
                            style={{ height: `${(row.egresos / max) * 100}%` }}
                            title={`Egresos: USD ${row.egresos.toLocaleString('es-AR')}`}
                          />
                        </div>
                        <span className="text-[9px] text-gray-400">{fmtMes(row.mes).split(' ')[0]}</span>
                      </div>
                    ));
                  })()}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-400 opacity-70" /> Cobrado</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-200" /> Proyectado</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400 opacity-70" /> Egresos</div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Mes</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Ingresos</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Proyectado</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Egresos</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Saldo mes</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashFlow.map((row) => (
                      <tr key={row.mes} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{fmtMes(row.mes)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium tabular">
                          {row.ingresos > 0 ? `USD ${row.ingresos.toLocaleString('es-AR')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-400 tabular">
                          {row.proyeccion > 0 ? `USD ${row.proyeccion.toLocaleString('es-AR')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-red-500 font-medium tabular">
                          {row.egresos > 0 ? `USD ${row.egresos.toLocaleString('es-AR')}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular">
                          <span className={row.saldo >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                            {row.saldo >= 0 ? <ArrowUpCircle className="inline w-3 h-3 mr-0.5" /> : <ArrowDownCircle className="inline w-3 h-3 mr-0.5" />}
                            USD {Math.abs(row.saldo).toLocaleString('es-AR')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular">
                          <span className={row.acumulado >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                            USD {row.acumulado.toLocaleString('es-AR')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <NewProjectModal
        open={showNewModal}
        developerId={developerId}
        orgs={isSuperAdmin ? orgs : []}
        onClose={() => setShowNewModal(false)}
        onCreated={loadProjects}
      />

      {/* Rename dialog */}
      <Dialog open={!!renameProject} onOpenChange={(o) => { if (!o) setRenameProject(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renombrar proyecto</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm(); }}
            placeholder="Nombre del proyecto"
            className="mt-2"
            autoFocus
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setRenameProject(null)} disabled={renaming}>
              Cancelar
            </Button>
            <Button onClick={handleRenameConfirm} disabled={renaming || !renameName.trim()}>
              {renaming ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location edit dialog */}
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

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteProject} onOpenChange={(o) => { if (!o) setDeleteProjectState(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar proyecto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 mt-1">
            ¿Seguro que querés eliminar <span className="font-semibold text-gray-800">{deleteProject?.name}</span>? El proyecto se ocultará pero su información se conserva.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteProjectState(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
