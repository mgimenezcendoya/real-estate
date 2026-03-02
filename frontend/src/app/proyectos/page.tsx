'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Project } from '@/lib/api';
import { Building2, ChevronRight, Wifi, AlertCircle, Plus } from 'lucide-react';
import clsx from 'clsx';

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

    useEffect(() => {
        api.getProjects()
            .then(setProjects)
            .catch(() => setError('No se pudo conectar con el backend. ¿Está corriendo en localhost:8000?'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="p-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">Proyectos</h1>
                    <p className="text-sm text-[#8B91A8] mt-1">Gestioná todos tus proyectos inmobiliarios</p>
                </div>
                <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    <Plus size={16} />
                    Nuevo proyecto
                </button>
            </div>

            {/* Error state */}
            {error && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
                    <AlertCircle size={18} />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-48 rounded-2xl bg-[#11141D] border border-[#1E2235] animate-pulse" />
                    ))}
                </div>
            )}

            {/* Projects grid */}
            {!loading && !error && (
                <>
                    {projects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center mb-4">
                                <Building2 size={28} className="text-indigo-400" />
                            </div>
                            <h3 className="text-white font-semibold mb-2">Sin proyectos</h3>
                            <p className="text-[#8B91A8] text-sm max-w-xs">
                                No hay proyectos cargados aún. Usá el agente de WhatsApp o cargá un CSV para crear el primero.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {projects.map((project) => {
                                const statusConf = STATUS_CONFIG[project.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.active;
                                return (
                                    <Link
                                        key={project.id}
                                        href={`/proyectos/${project.id}`}
                                        className="group block bg-[#11141D] border border-[#1E2235] rounded-2xl p-5 hover:border-indigo-600/40 hover:bg-[#13172A] transition-all duration-200"
                                    >
                                        {/* Top row */}
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-600/20 flex items-center justify-center">
                                                <Building2 size={18} className="text-indigo-400" />
                                            </div>
                                            <span className={clsx('text-xs font-medium px-2 py-1 rounded-full border', statusConf.color)}>
                                                {statusConf.label}
                                            </span>
                                        </div>

                                        <h3 className="text-white font-semibold text-base mb-1 group-hover:text-indigo-300 transition-colors">
                                            {project.name}
                                        </h3>
                                        <p className="text-[#8B91A8] text-xs mb-4">
                                            {project.neighborhood ? `${project.neighborhood}, ` : ''}{project.city || 'CABA'}
                                        </p>

                                        {/* Stats */}
                                        <div className="flex gap-4 py-3 border-t border-[#1E2235]">
                                            <div>
                                                <p className="text-lg font-bold text-white">{project.total_units || '—'}</p>
                                                <p className="text-xs text-[#8B91A8]">Unidades</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-bold text-white">{project.total_floors || '—'}</p>
                                                <p className="text-xs text-[#8B91A8]">Pisos</p>
                                            </div>
                                            <div>
                                                <p className="text-lg font-bold text-emerald-400">
                                                    {DELIVERY_LABELS[project.delivery_status] || project.delivery_status || '—'}
                                                </p>
                                                <p className="text-xs text-[#8B91A8]">Estado obra</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 mt-3 text-indigo-400 text-xs font-medium group-hover:gap-2 transition-all">
                                            Ver detalles <ChevronRight size={14} />
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
