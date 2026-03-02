'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Project } from '@/lib/api';
import { Building2, ChevronRight, Wifi, AlertCircle, Plus, Menu } from 'lucide-react';
import clsx from 'clsx';
import NewProjectModal from '@/components/NewProjectModal';

const STATUS_CONFIG = {
    active: { label: 'Activo', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    paused: { label: 'Pausado', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    completed: { label: 'Terminado', color: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20' },
};

const DELIVERY_LABELS: Record<string, string> = {
    en_pozo: 'En pozo',
    en_construccion: 'En construcción',
    terminado: 'Terminado',
};

export default function ProyectosPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewModal, setShowNewModal] = useState(false);

    const loadProjects = useCallback(() => {
        setLoading(true);
        api.getProjects()
            .then(setProjects)
            .catch(() => setError('No se pudo conectar con el backend. ¿Está corriendo en localhost:8000?'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    const developerId = projects[0]?.developer_id ?? '';

    return (
        <div className="p-10 max-w-7xl mx-auto min-h-full animate-fade-in-up">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4">
                        <Building2 size={12} />
                        Portafolio
                    </div>
                    <h1 className="text-4xl font-display font-bold text-white tracking-tight mb-2">Proyectos</h1>
                    <p className="text-[#94A3B8] text-base max-w-xl">Gestioná y monitoreá el progreso de todos tus desarrollos inmobiliarios desde un solo panel de control.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 glass px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/5 transition-all text-white">
                        <Menu size={16} />
                        Filtrar
                    </button>
                    <button
                        onClick={() => setShowNewModal(true)}
                        className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] transform hover:-translate-y-0.5"
                    >
                        <Plus size={18} />
                        Nuevo Proyecto
                    </button>
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="flex items-start gap-3 p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 mb-8 max-w-2xl backdrop-blur-md">
                    <AlertCircle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <h3 className="font-semibold text-red-400 text-sm mb-1">Error de conexión</h3>
                        <p className="text-sm opacity-90">{error}</p>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-64 rounded-3xl glass opacity-50 animate-pulse border-[rgba(255,255,255,0.05)]" />
                    ))}
                </div>
            )}

            <NewProjectModal
                open={showNewModal}
                developerId={developerId}
                onClose={() => setShowNewModal(false)}
                onCreated={loadProjects}
            />

            {/* Projects grid */}
            {!loading && !error && (
                <>
                    {projects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center glass-elevated rounded-3xl max-w-3xl mx-auto mt-10">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/5 flex items-center justify-center mb-6 shadow-xl relative overflow-hidden">
                                <div className="absolute inset-0 bg-indigo-500/10 blur-xl"></div>
                                <Building2 size={36} className="text-indigo-400 relative z-10" />
                            </div>
                            <h3 className="text-2xl font-display font-semibold text-white mb-3">Tu portafolio está vacío</h3>
                            <p className="text-[#94A3B8] text-base max-w-md mb-8">
                                Comenzá cargando tu primer desarrollo para aprovechar todas las herramientas de gestión e IA.
                            </p>
                            <button className="bg-white/10 hover:bg-white/15 border border-white/10 text-white px-6 py-3 rounded-xl font-medium transition-all hover-glow">
                                Configurar proyecto local
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map((project, idx) => {
                                const statusConf = STATUS_CONFIG[project.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.active;
                                return (
                                    <Link
                                        key={project.id}
                                        href={`/proyectos/${project.id}`}
                                        className="group block relative rounded-3xl p-[1px] overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                                        style={{ animationDelay: `${idx * 100}ms` }}
                                    >
                                        {/* Animated border gradient on hover */}
                                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/50 via-transparent to-purple-500/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                                        <div className="relative h-full glass-elevated rounded-[23px] p-6 group-hover:bg-[#1A1F2E] transition-colors duration-300 flex flex-col">
                                            {/* Top row */}
                                            <div className="flex items-start justify-between mb-6">
                                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/20 flex items-center justify-center shadow-inner">
                                                    <Building2 size={22} className="text-indigo-400" />
                                                </div>
                                                <span className={clsx('text-[11px] font-bold px-3 py-1.5 rounded-full border uppercase tracking-wider', statusConf.color)}>
                                                    {statusConf.label}
                                                </span>
                                            </div>

                                            {/* Info */}
                                            <div className="mb-8 flex-1">
                                                <h3 className="text-xl font-display font-semibold text-white mb-2 group-hover:text-indigo-300 transition-colors">
                                                    {project.name}
                                                </h3>
                                                <div className="flex items-center gap-1.5 text-[#94A3B8] text-sm font-medium">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50"></div>
                                                    {project.neighborhood ? `${project.neighborhood}, ` : ''}{project.city || 'CABA'}
                                                </div>
                                            </div>

                                            {/* Stats Grid */}
                                            <div className="grid grid-cols-2 gap-3 mb-6">
                                                <div className="glass-pill p-3 rounded-2xl">
                                                    <p className="text-2xl font-display font-light text-white">{project.total_units || '—'}</p>
                                                    <p className="text-xs text-[#94A3B8] font-medium uppercase tracking-wide">Unidades</p>
                                                </div>
                                                <div className="glass-pill p-3 rounded-2xl">
                                                    <p className="text-2xl font-display font-light text-white">{project.total_floors || '—'}</p>
                                                    <p className="text-xs text-[#94A3B8] font-medium uppercase tracking-wide">Pisos</p>
                                                </div>
                                            </div>

                                            {/* Footer area & Status */}
                                            <div className="flex items-center justify-between pt-5 border-t border-[rgba(255,255,255,0.06)] mt-auto">
                                                <div>
                                                    <p className="text-[10px] text-[#94A3B8] font-semibold uppercase tracking-widest mb-1">Avance Real</p>
                                                    <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
                                                        {DELIVERY_LABELS[project.delivery_status] || project.delivery_status || 'En planificación'}
                                                    </span>
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-500 transition-all duration-300">
                                                    <ChevronRight size={16} className="transform group-hover:translate-x-0.5 transition-transform" />
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
