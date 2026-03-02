'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Project, Metrics, Unit } from '@/lib/api';
import { Users, Flame, TrendingUp, Building2, Home, DollarSign } from 'lucide-react';
import clsx from 'clsx';

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
    return (
        <div className="bg-[#11141D] border border-[#1E2235] rounded-2xl p-5 hover:border-indigo-600/30 transition-colors">
            <div className="flex items-start justify-between mb-4">
                <p className="text-[#8B91A8] text-sm font-medium">{label}</p>
                <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', color)}>
                    <Icon size={17} />
                </div>
            </div>
            <p className="text-3xl font-bold text-white">{value}</p>
        </div>
    );
}

const DELIVERY_CONFIG: Record<string, { label: string; pct: number; color: string }> = {
    en_pozo: { label: 'En pozo', pct: 15, color: 'bg-amber-500' },
    en_construccion: { label: 'En construcción', pct: 55, color: 'bg-indigo-500' },
    terminado: { label: 'Terminado', pct: 100, color: 'bg-emerald-500' },
};

export default function ProjectDashboard() {
    const { id } = useParams<{ id: string }>();
    const [project, setProject] = useState<Project | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [units, setUnits] = useState<Unit[]>([]);

    useEffect(() => {
        if (!id) return;
        Promise.all([
            api.getProject(id).then(setProject),
            api.getMetrics(id).then(setMetrics),
            api.getUnits(id).then(setUnits),
        ]).catch(console.error);
    }, [id]);

    const soldUnits = units.filter(u => u.status === 'sold').length;
    const reservedUnits = units.filter(u => u.status === 'reserved').length;
    const availableUnits = units.filter(u => u.status === 'available').length;
    const deliveryConf = DELIVERY_CONFIG[project?.delivery_status || 'en_pozo'];

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-6">
            {/* Leads metrics */}
            <section>
                <h2 className="text-xs font-semibold text-[#4B5268] uppercase tracking-widest mb-3">Resumen de leads</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Total leads" value={metrics?.total_leads ?? '—'} icon={Users} color="bg-indigo-600/15 text-indigo-400" />
                    <StatCard label="Hot 🔥" value={metrics?.hot ?? '—'} icon={Flame} color="bg-red-500/15 text-red-400" />
                    <StatCard label="Warm 🌡" value={metrics?.warm ?? '—'} icon={TrendingUp} color="bg-amber-500/15 text-amber-400" />
                    <StatCard label="Cold 🧊" value={metrics?.cold ?? '—'} icon={Users} color="bg-sky-500/15 text-sky-400" />
                </div>
            </section>

            {/* Units metrics */}
            <section>
                <h2 className="text-xs font-semibold text-[#4B5268] uppercase tracking-widest mb-3">Estado de unidades</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Disponibles" value={availableUnits} icon={Building2} color="bg-emerald-500/15 text-emerald-400" />
                    <StatCard label="Reservadas" value={reservedUnits} icon={Home} color="bg-amber-500/15 text-amber-400" />
                    <StatCard label="Vendidas" value={soldUnits} icon={DollarSign} color="bg-red-500/15 text-red-400" />
                    <StatCard label="Total" value={units.length} icon={Building2} color="bg-indigo-600/15 text-indigo-400" />
                </div>
            </section>

            {/* Obra progress */}
            {project && (
                <section>
                    <h2 className="text-xs font-semibold text-[#4B5268] uppercase tracking-widest mb-3">Avance de obra</h2>
                    <div className="bg-[#11141D] border border-[#1E2235] rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-white font-semibold">{deliveryConf?.label}</span>
                            <span className="text-[#8B91A8] text-sm">{deliveryConf?.pct}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#1E2235] rounded-full overflow-hidden">
                            <div
                                className={clsx('h-full rounded-full transition-all duration-700', deliveryConf?.color)}
                                style={{ width: `${deliveryConf?.pct}%` }}
                            />
                        </div>
                        {project.construction_start && (
                            <div className="flex gap-6 mt-4 text-sm">
                                <div>
                                    <p className="text-[#8B91A8] text-xs">Inicio de obra</p>
                                    <p className="text-white mt-0.5">{project.construction_start}</p>
                                </div>
                                {project.estimated_delivery && (
                                    <div>
                                        <p className="text-[#8B91A8] text-xs">Entrega estimada</p>
                                        <p className="text-white mt-0.5">{project.estimated_delivery}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Project details */}
            {project?.description && (
                <section>
                    <h2 className="text-xs font-semibold text-[#4B5268] uppercase tracking-widest mb-3">Descripción</h2>
                    <div className="bg-[#11141D] border border-[#1E2235] rounded-2xl p-6">
                        <p className="text-[#8B91A8] text-sm leading-relaxed">{project.description}</p>
                    </div>
                </section>
            )}

            {/* Amenities */}
            {project?.amenities && project.amenities.length > 0 && (
                <section>
                    <h2 className="text-xs font-semibold text-[#4B5268] uppercase tracking-widest mb-3">Amenities</h2>
                    <div className="flex flex-wrap gap-2">
                        {project.amenities.map((a) => (
                            <span key={a} className="px-3 py-1.5 rounded-lg bg-indigo-600/10 border border-indigo-600/20 text-indigo-300 text-xs font-medium">
                                {a}
                            </span>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
