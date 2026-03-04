'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, Project, Metrics } from '@/lib/api';
import { Building2, ChevronRight, Plus, SlidersHorizontal, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import NewProjectModal from '@/components/NewProjectModal';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_CONFIG = {
  active: { label: 'Activo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused: { label: 'Pausado', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Terminado', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
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

export default function ProyectosPage() {
  const { isReader } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [metricsByProject, setMetricsByProject] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('');
  const filterRef = useRef<HTMLDivElement>(null);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchName = !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchStatus = !statusFilter || p.status === statusFilter;
      const matchDelivery = !deliveryFilter || (p.delivery_status || '') === deliveryFilter;
      return matchName && matchStatus && matchDelivery;
    });
  }, [projects, searchQuery, statusFilter, deliveryFilter]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    if (filterOpen) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [filterOpen]);

  const loadProjects = useCallback(() => {
    setLoading(true);
    api.getProjects()
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
      .catch(() => toast.error('No se pudo conectar con el backend'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const developerId = projects[0]?.developer_id ?? '';
  const hasFilters = !!(searchQuery || statusFilter || deliveryFilter);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto min-h-full animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-600 text-[10px] font-bold uppercase tracking-widest mb-3">
            <Building2 size={10} />
            Portafolio
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-extrabold text-gray-900 tracking-tight mb-2 leading-none">Proyectos</h1>
          <p className="text-gray-400 text-sm max-w-xl font-medium">
            Gestioná y monitoreá el progreso de todos tus desarrollos inmobiliarios.
          </p>
        </div>

        <div className="flex items-center gap-3 relative flex-wrap" ref={filterRef}>
          {/* Filter button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen(!filterOpen)}
            className={cn(
              'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 gap-2',
              filterOpen && 'bg-gray-50 ring-1 ring-indigo-400',
              hasFilters && 'border-indigo-300 text-indigo-700'
            )}
          >
            <SlidersHorizontal size={15} />
            Filtrar
            {hasFilters && (
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                {[searchQuery, statusFilter, deliveryFilter].filter(Boolean).length}
              </span>
            )}
          </Button>

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
                  className="pl-9 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-indigo-400 h-9"
                />
              </div>

              <div className="space-y-1.5 mb-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Estado</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['', 'active', 'paused', 'completed'] as const).map((s) => (
                    <button
                      key={s || 'all'}
                      onClick={() => setStatusFilter(s)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        statusFilter === s
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
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
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
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
                  onClick={() => { setSearchQuery(''); setStatusFilter(''); setDeliveryFilter(''); }}
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
              className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 gap-2 transition-colors"
            >
              <Plus size={17} />
              Nuevo Proyecto
            </Button>
          )}
        </div>
      </div>

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
            const statusConf = STATUS_CONFIG[project.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active;
            return (
              <Link
                key={project.id}
                href={`/proyectos/${project.id}`}
                className="group block animate-fade-in-up"
                style={{ animationDelay: `${idx * 45}ms`, animationFillMode: 'both' }}
              >
                {/* Card — top accent stripe animates in on hover */}
                <div className="card-top-accent relative h-full bg-white border border-gray-200 rounded-2xl group-hover:border-indigo-200 group-hover:shadow-lg group-hover:shadow-indigo-500/[0.06] transition-all duration-200 flex flex-col overflow-hidden">
                  <div className="p-5 flex flex-col flex-1">
                    {/* Top row */}
                    <div className="flex items-start justify-between mb-5">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200/70 flex items-center justify-center shadow-sm">
                        <Building2 size={20} className="text-indigo-600" />
                      </div>
                      <Badge className={cn('text-[10px] font-semibold border', statusConf.className)}>
                        {statusConf.label}
                      </Badge>
                    </div>

                    {/* Info */}
                    <div className="mb-5 flex-1">
                      <h3 className="text-base font-display font-bold text-gray-900 mb-1 group-hover:text-indigo-700 transition-colors duration-150 line-clamp-1 tracking-tight">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                        <div className="w-1 h-1 rounded-full bg-indigo-400/60 flex-shrink-0" />
                        <span className="truncate font-medium">
                          {project.neighborhood ? `${project.neighborhood}, ` : ''}{project.city || 'CABA'}
                        </span>
                      </div>
                    </div>

                    {/* Stats grid */}
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

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3.5 border-t border-gray-100 mt-auto">
                      <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          project.delivery_status === 'terminado' ? 'bg-emerald-500' :
                          project.delivery_status === 'en_construccion' ? 'bg-indigo-500' : 'bg-amber-500'
                        )} />
                        {DELIVERY_LABELS[project.delivery_status] ?? project.delivery_status ?? 'En planificación'}
                      </span>
                      <div className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all duration-200">
                        <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-28 text-center bg-white border border-gray-200 rounded-2xl shadow-sm max-w-2xl mx-auto">
          <div className="w-20 h-20 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-6">
            <Building2 size={36} className="text-indigo-600" />
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
              onClick={() => { setSearchQuery(''); setStatusFilter(''); setDeliveryFilter(''); }}
              className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Limpiar filtros
            </Button>
          ) : (
            <Button
              onClick={() => setShowNewModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white border-0"
            >
              <Plus size={16} className="mr-2" />
              Nuevo Proyecto
            </Button>
          )}
        </div>
      )}

      <NewProjectModal
        open={showNewModal}
        developerId={developerId}
        onClose={() => setShowNewModal(false)}
        onCreated={loadProjects}
      />
    </div>
  );
}
