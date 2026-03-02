'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Lead } from '@/lib/api';
import clsx from 'clsx';
import { Phone, Calendar, DollarSign, Home, Target } from 'lucide-react';

const COLUMNS = [
    { key: 'hot', label: '🔥 Hot', color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/5' },
    { key: 'warm', label: '🌡 Warm', color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5' },
    { key: 'cold', label: '🧊 Cold', color: 'text-sky-400', border: 'border-sky-500/20', bg: 'bg-sky-500/5' },
] as const;

const INTENT_LABELS: Record<string, string> = {
    investment: 'Inversión',
    own_home: 'Vivienda propia',
    rental: 'Renta',
    unknown: '—',
};

const TIMELINE_LABELS: Record<string, string> = {
    immediate: 'Inmediato',
    '3_months': '3 meses',
    '6_months': '6 meses',
    '1_year_plus': '+1 año',
    unknown: '—',
};

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="w-full text-left bg-[#11141D] border border-[#1E2235] rounded-xl p-4 hover:border-indigo-600/30 hover:bg-[#13172A] transition-all duration-150"
        >
            <div className="flex items-start justify-between mb-3">
                <div>
                    <p className="text-white font-semibold text-sm">{lead.name || 'Sin nombre'}</p>
                    <p className="text-[#8B91A8] text-xs mt-0.5">{lead.phone}</p>
                </div>
                {lead.source && (
                    <span className="text-xs text-[#8B91A8] bg-[#1E2235] px-2 py-0.5 rounded-full">{lead.source}</span>
                )}
            </div>

            <div className="space-y-1">
                {lead.intent && lead.intent !== 'unknown' && (
                    <div className="flex items-center gap-2 text-xs text-[#8B91A8]">
                        <Target size={11} /> {INTENT_LABELS[lead.intent] || lead.intent}
                    </div>
                )}
                {lead.budget_usd && (
                    <div className="flex items-center gap-2 text-xs text-[#8B91A8]">
                        <DollarSign size={11} /> USD {Number(lead.budget_usd).toLocaleString('es-AR')}
                    </div>
                )}
                {lead.bedrooms && (
                    <div className="flex items-center gap-2 text-xs text-[#8B91A8]">
                        <Home size={11} /> {lead.bedrooms} ambientes
                    </div>
                )}
                {lead.timeline && lead.timeline !== 'unknown' && (
                    <div className="flex items-center gap-2 text-xs text-[#8B91A8]">
                        <Calendar size={11} /> {TIMELINE_LABELS[lead.timeline] || lead.timeline}
                    </div>
                )}
            </div>

            {lead.last_contact && (
                <p className="text-[#4B5268] text-xs mt-3 pt-3 border-t border-[#1E2235]">
                    Último contacto: {new Date(lead.last_contact).toLocaleDateString('es-AR')}
                </p>
            )}
        </button>
    );
}

export default function LeadsPage() {
    const { id } = useParams<{ id: string }>();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Lead | null>(null);

    useEffect(() => {
        if (id) api.getLeads(id).then(setLeads).finally(() => setLoading(false));
    }, [id]);

    const grouped = {
        hot: leads.filter(l => l.score === 'hot'),
        warm: leads.filter(l => l.score === 'warm'),
        cold: leads.filter(l => l.score === 'cold'),
    };

    return (
        <div className="flex h-full">
            <div className="flex-1 overflow-auto p-8">
                {loading ? (
                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-96 bg-[#11141D] rounded-2xl animate-pulse" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                        {COLUMNS.map(({ key, label, color, border, bg }) => (
                            <div key={key} className={clsx('rounded-2xl border p-4 flex flex-col', border, bg)}>
                                <div className="flex items-center gap-2 mb-4">
                                    <h3 className={clsx('font-semibold text-sm', color)}>{label}</h3>
                                    <span className={clsx('text-xs px-2 py-0.5 rounded-full bg-white/5', color)}>
                                        {grouped[key].length}
                                    </span>
                                </div>

                                {grouped[key].length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-[#4B5268] text-sm text-center">Sin leads {key}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 flex-1 overflow-auto">
                                        {grouped[key].map(lead => (
                                            <LeadCard key={lead.id} lead={lead} onClick={() => setSelected(lead)} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {leads.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <p className="text-white font-semibold mb-2">Sin leads todavía</p>
                        <p className="text-[#8B91A8] text-sm">Los leads aparecerán acá cuando escriban al WhatsApp del proyecto.</p>
                    </div>
                )}
            </div>

            {/* Lead detail panel */}
            {selected && (
                <div className="w-80 bg-[#11141D] border-l border-[#1E2235] p-6 overflow-auto">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-white font-bold">{selected.name || 'Sin nombre'}</h3>
                        <button onClick={() => setSelected(null)} className="text-[#4B5268] hover:text-white">✕</button>
                    </div>

                    <div className="space-y-3">
                        {[
                            { label: 'Teléfono', value: selected.phone },
                            { label: 'Intención', value: INTENT_LABELS[selected.intent] || selected.intent || '—' },
                            { label: 'Financiamiento', value: selected.financing || '—' },
                            { label: 'Timeline', value: TIMELINE_LABELS[selected.timeline] || selected.timeline || '—' },
                            { label: 'Presupuesto', value: selected.budget_usd ? `USD ${Number(selected.budget_usd).toLocaleString('es-AR')}` : '—' },
                            { label: 'Ambientes', value: selected.bedrooms ? `${selected.bedrooms} amb.` : '—' },
                            { label: 'Zona preferida', value: selected.location_pref || '—' },
                            { label: 'Fuente', value: selected.source || '—' },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between py-2 border-b border-[#1E2235]">
                                <span className="text-[#8B91A8] text-xs">{label}</span>
                                <span className="text-white text-xs font-medium text-right max-w-[60%]">{value}</span>
                            </div>
                        ))}
                    </div>

                    <a
                        href={`https://wa.me/${selected.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full mt-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                    >
                        <Phone size={15} /> Contactar por WhatsApp
                    </a>
                </div>
            )}
        </div>
    );
}
