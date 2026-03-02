'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Unit } from '@/lib/api';
import clsx from 'clsx';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

const STATUS_CONFIG = {
    available: {
        label: 'Disponible',
        bg: 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25',
        text: 'text-emerald-400',
        dot: 'bg-emerald-400',
        icon: CheckCircle2,
    },
    reserved: {
        label: 'Reservada',
        bg: 'bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25',
        text: 'text-amber-400',
        dot: 'bg-amber-400',
        icon: Clock,
    },
    sold: {
        label: 'Vendida',
        bg: 'bg-red-500/15 border-red-500/30 hover:bg-red-500/25',
        text: 'text-red-400',
        dot: 'bg-red-400',
        icon: XCircle,
    },
} as const;

type UnitStatus = keyof typeof STATUS_CONFIG;

export default function UnidadesPage() {
    const { id } = useParams<{ id: string }>();
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [selected, setSelected] = useState<Unit | null>(null);

    useEffect(() => {
        if (id) api.getUnits(id).then(setUnits).finally(() => setLoading(false));
    }, [id]);

    // Group by floor descending
    const byFloor = units.reduce<Record<number, Unit[]>>((acc, u) => {
        const f = u.floor ?? 0;
        (acc[f] = acc[f] || []).push(u);
        return acc;
    }, {});
    const floors = Object.keys(byFloor).map(Number).sort((a, b) => b - a);

    const handleStatusChange = async (unit: Unit, newStatus: string) => {
        setUpdatingId(unit.id);
        try {
            await api.updateUnitStatus(unit.id, newStatus);
            setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, status: newStatus as UnitStatus } : u));
            setSelected(prev => prev?.id === unit.id ? { ...prev, status: newStatus as UnitStatus } : prev);
        } catch (e) {
            console.error(e);
        } finally {
            setUpdatingId(null);
        }
    };

    const counts = {
        available: units.filter(u => u.status === 'available').length,
        reserved: units.filter(u => u.status === 'reserved').length,
        sold: units.filter(u => u.status === 'sold').length,
    };

    return (
        <div className="flex h-full">
            {/* Main grid */}
            <div className="flex-1 p-8 overflow-auto">
                {/* Legend */}
                <div className="flex items-center gap-4 mb-6">
                    {Object.entries(STATUS_CONFIG).map(([key, conf]) => (
                        <div key={key} className="flex items-center gap-2 text-xs text-[#8B91A8]">
                            <div className={clsx('w-2.5 h-2.5 rounded-full', conf.dot)} />
                            {conf.label} ({counts[key as UnitStatus]})
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="space-y-6">
                        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-[#11141D] rounded-xl animate-pulse" />)}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {floors.map(floor => (
                            <div key={floor} className="flex items-start gap-4">
                                <div className="w-12 pt-3 text-right flex-shrink-0">
                                    <span className="text-xs text-[#4B5268] font-medium">P{floor}</span>
                                </div>
                                <div className="flex-1 flex flex-wrap gap-2 pb-3 border-b border-[#1E2235]">
                                    {byFloor[floor].sort((a, b) => a.identifier.localeCompare(b.identifier)).map(unit => {
                                        const conf = STATUS_CONFIG[unit.status] || STATUS_CONFIG.available;
                                        return (
                                            <button
                                                key={unit.id}
                                                onClick={() => setSelected(unit)}
                                                disabled={updatingId === unit.id}
                                                className={clsx(
                                                    'px-3 py-2 rounded-lg border text-xs font-semibold transition-all duration-150 min-w-[52px]',
                                                    conf.bg, conf.text,
                                                    selected?.id === unit.id && 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-[#090B10]'
                                                )}
                                            >
                                                {unit.identifier}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Detail panel */}
            {selected && (
                <div className="w-72 bg-[#11141D] border-l border-[#1E2235] p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-white font-bold text-lg">Unidad {selected.identifier}</h3>
                        <button onClick={() => setSelected(null)} className="text-[#4B5268] hover:text-white text-sm">✕</button>
                    </div>

                    <div className="space-y-3 flex-1">
                        {[
                            { label: 'Piso', value: selected.floor ? `Piso ${selected.floor}` : '—' },
                            { label: 'Ambientes', value: selected.bedrooms ? `${selected.bedrooms} amb.` : '—' },
                            { label: 'Superficie', value: selected.area_m2 ? `${selected.area_m2} m²` : '—' },
                            { label: 'Precio', value: selected.price_usd ? `USD ${Number(selected.price_usd).toLocaleString('es-AR')}` : '—' },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between py-2 border-b border-[#1E2235]">
                                <span className="text-[#8B91A8] text-sm">{label}</span>
                                <span className="text-white text-sm font-medium">{value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Status change */}
                    <div className="mt-6">
                        <p className="text-xs text-[#8B91A8] mb-2 font-medium">Cambiar estado</p>
                        <div className="space-y-2">
                            {(Object.keys(STATUS_CONFIG) as UnitStatus[]).map(s => {
                                const conf = STATUS_CONFIG[s];
                                const active = selected.status === s;
                                return (
                                    <button
                                        key={s}
                                        onClick={() => handleStatusChange(selected, s)}
                                        disabled={active || updatingId === selected.id}
                                        className={clsx(
                                            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                                            active
                                                ? clsx(conf.bg, conf.text, 'border-current cursor-default')
                                                : 'bg-transparent border-[#1E2235] text-[#8B91A8] hover:bg-[#161A26] hover:text-white'
                                        )}
                                    >
                                        <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', active ? conf.dot : 'bg-[#4B5268]')} />
                                        {conf.label}
                                        {active && <span className="ml-auto text-xs opacity-60">actual</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
