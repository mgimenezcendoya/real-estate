'use client';

import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { api, Lead, Conversation } from '@/lib/api';
import { UserSearch, FileText, Send, UserCircle2, MessageSquare, Sparkles } from 'lucide-react';
import clsx from 'clsx';

type LeadGroup = { phone: string; mainLead: Lead; allLeadIds: string[] };

function groupLeadsByPhone(leads: Lead[]): LeadGroup[] {
    const byPhone = new Map<string, Lead[]>();
    for (const l of leads) {
        const list = byPhone.get(l.phone) || [];
        list.push(l);
        byPhone.set(l.phone, list);
    }
    const result: LeadGroup[] = [];
    byPhone.forEach((list, phone) => {
        const sorted = [...list].sort((a, b) => {
            const aTime = a.last_contact || a.created_at || '';
            const bTime = b.last_contact || b.created_at || '';
            return bTime.localeCompare(aTime);
        });
        result.push({ phone, mainLead: sorted[0], allLeadIds: sorted.map(l => l.id) });
    });
    result.sort((a, b) => {
        const aTime = a.mainLead.last_contact || a.mainLead.created_at || '';
        const bTime = b.mainLead.last_contact || b.mainLead.created_at || '';
        return bTime.localeCompare(aTime);
    });
    return result;
}

async function loadMergedConversations(leadIds: string[]): Promise<Conversation[]> {
    if (leadIds.length === 0) return [];
    const results = await Promise.all(leadIds.map((id) => api.getLead(id)));
    const all: Conversation[] = [];
    for (const r of results) {
        if (r.conversations) all.push(...r.conversations);
    }
    all.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    return all;
}

export default function InboxPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loadingLeads, setLoadingLeads] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [selectedLeadIdsForMerge, setSelectedLeadIdsForMerge] = useState<string[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation[]>([]);
    const [loadingChat, setLoadingChat] = useState(false);
    const [messageInput, setMessageInput] = useState('');
    const [sending, setSending] = useState(false);
    const [handoffActive, setHandoffActive] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const refreshHandoffStatus = useCallback(async (leadId: string) => {
        try {
            const res = await api.getLeadHandoff(leadId);
            setHandoffActive(res.active);
        } catch { setHandoffActive(false); }
    }, []);

    const leadGroups = useMemo(() => groupLeadsByPhone(leads), [leads]);

    useEffect(() => {
        api.getLeads()
            .then(async (data) => {
                setLeads(data);
                if (data.length > 0) {
                    const groups = groupLeadsByPhone(data);
                    const first = groups[0];
                    setSelectedLeadId(first.mainLead.id);
                    setSelectedLeadIdsForMerge(first.allLeadIds);
                    setLoadingChat(true);
                    try {
                        const [merged, handoff] = await Promise.all([
                            loadMergedConversations(first.allLeadIds),
                            api.getLeadHandoff(first.mainLead.id),
                        ]);
                        setActiveConversation(merged);
                        setHandoffActive(handoff.active);
                    } catch (err) {
                        console.error(err);
                    } finally {
                        setLoadingChat(false);
                    }
                }
            })
            .catch(() => setError('No se pudieron cargar las conversaciones. ¿Está corriendo el backend?'))
            .finally(() => setLoadingLeads(false));
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeConversation]);

    // Poll for new messages and handoff status every 5 seconds
    useEffect(() => {
        if (selectedLeadIdsForMerge.length === 0 || !selectedLeadId) return;
        const interval = setInterval(async () => {
            try {
                const [merged, handoff] = await Promise.all([
                    loadMergedConversations(selectedLeadIdsForMerge),
                    api.getLeadHandoff(selectedLeadId),
                ]);
                setActiveConversation(prev => (merged.length !== prev.length ? merged : prev));
                setHandoffActive(handoff.active);
            } catch { /* silent */ }
        }, 5000);
        return () => clearInterval(interval);
    }, [selectedLeadIdsForMerge.join(','), selectedLeadId]);

    // Poll leads list every 15 seconds for new contacts
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const data = await api.getLeads();
                setLeads(data);
            } catch { /* silent */ }
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    const handleSelectPerson = async (group: LeadGroup) => {
        setSelectedLeadId(group.mainLead.id);
        setSelectedLeadIdsForMerge(group.allLeadIds);
        setLoadingChat(true);
        setMessageInput('');
        try {
            const [merged, handoff] = await Promise.all([
                loadMergedConversations(group.allLeadIds),
                api.getLeadHandoff(group.mainLead.id),
            ]);
            setActiveConversation(merged);
            setHandoffActive(handoff.active);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingChat(false);
        }
    };

    const handleEndHandoff = async () => {
        if (!selectedLeadId) return;
        try {
            const res = await api.closeLeadHandoff(selectedLeadId);
            if (res.closed) setHandoffActive(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleStartHandoff = async () => {
        if (!selectedLeadId) return;
        try {
            await api.startLeadHandoff(selectedLeadId);
            setHandoffActive(true);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSendMessage = async () => {
        if (!selectedLeadId || !messageInput.trim() || sending) return;

        const content = messageInput.trim();
        setMessageInput('');
        setSending(true);

        try {
            // Optimistic update
            const optimisticMsg: Conversation = {
                id: Math.random().toString(),
                role: 'assistant',
                sender_type: 'human',
                content: content,
                media_type: null,
                created_at: new Date().toISOString()
            };
            setActiveConversation(prev => [...prev, optimisticMsg]);

            await api.sendLeadMessage(selectedLeadId, content);

            if (selectedLeadIdsForMerge.length > 0) {
                const merged = await loadMergedConversations(selectedLeadIdsForMerge);
                setActiveConversation(merged);
            } else {
                const data = await api.getLead(selectedLeadId);
                setActiveConversation(data.conversations || []);
            }
            setHandoffActive(true);
        } catch (err) {
            console.error('Error sending message:', err);
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const formatTime = (isoString?: string) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) {
            return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    };

    const selectedLead = leads.find(l => l.id === selectedLeadId);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden p-10 max-w-[1920px] mx-auto">
            {/* Page header - misma estética que Proyectos */}
            <div className="flex flex-col mb-6 flex-shrink-0">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2 w-fit">
                    <MessageSquare size={12} />
                    Conversaciones
                </div>
                <h1 className="text-4xl font-display font-bold text-white tracking-tight mb-1">Inbox</h1>
                <p className="text-[#94A3B8] text-base max-w-xl">Todas las conversaciones con leads en un solo lugar. Agrupadas por contacto.</p>
            </div>

            <div className="flex flex-1 min-h-0 rounded-3xl overflow-hidden glass-elevated border border-[rgba(255,255,255,0.08)]">
            {/* Sidebar Inbox List - misma estética que Proyectos */}
            <div className="w-80 flex flex-col border-r border-[rgba(255,255,255,0.08)] flex-shrink-0">
                <div className="p-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between sticky top-0 z-10">
                    <h2 className="text-base font-display font-semibold text-white tracking-tight">Conversaciones</h2>
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-indigo-500/20">
                        {leadGroups.length}
                    </span>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <UserSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                        <input
                            type="text"
                            placeholder="Buscar conversaciones..."
                            className="w-full bg-white/5 border border-[rgba(255,255,255,0.1)] text-sm text-white rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 placeholder:text-[#94A3B8]"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loadingLeads ? (
                        <div className="p-4 space-y-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="flex gap-3 animate-pulse">
                                    <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
                                    <div className="flex-1 space-y-2 py-1">
                                        <div className="h-4 bg-white/10 rounded w-full" />
                                        <div className="h-3 bg-white/10 rounded w-2/3" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col p-2">
                            {leadGroups.map((group) => {
                                const { mainLead } = group;
                                const isActive = selectedLeadId === mainLead.id;
                                return (
                                    <button
                                        key={group.phone}
                                        onClick={() => handleSelectPerson(group)}
                                        className={clsx(
                                            "flex items-start gap-3 p-3 rounded-xl transition-colors text-left group",
                                            isActive
                                                ? "bg-indigo-500/15 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                                                : "hover:bg-white/5 border border-transparent"
                                        )}
                                    >
                                        <div className={clsx(
                                            "w-10 h-10 rounded-xl flex flex-shrink-0 items-center justify-center font-semibold text-sm transition-colors",
                                            isActive ? "bg-indigo-500/30 text-indigo-200" : "bg-white/10 text-[#94A3B8] group-hover:bg-white/15"
                                        )}>
                                            {mainLead.name ? mainLead.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div className="flex-1 min-w-0 py-0.5">
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <h3 className="text-sm font-semibold text-white truncate pr-2">
                                                    {mainLead.name || mainLead.phone}
                                                </h3>
                                                <span className="text-[11px] text-[#94A3B8] font-medium whitespace-nowrap">
                                                    {formatDate(mainLead.last_contact || mainLead.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-[#94A3B8] truncate mb-1.5 font-normal tracking-tight">
                                                {mainLead.phone}
                                            </p>
                                            <div className="flex gap-1.5 items-center mt-1 flex-wrap">
                                                <span className={clsx(
                                                    "w-2 h-2 rounded-full flex-shrink-0",
                                                    mainLead.score === 'hot' && "bg-red-500",
                                                    mainLead.score === 'warm' && "bg-amber-500",
                                                    mainLead.score === 'cold' && "bg-slate-400",
                                                    !mainLead.score && "bg-white/30"
                                                )} />
                                                <span className="text-[10px] text-[#94A3B8] tracking-wider uppercase font-semibold">
                                                    {mainLead.score || 'NO_SCORE'}
                                                </span>
                                                {mainLead.project_name && (
                                                    <>
                                                        <span className="text-white/30 mx-1">•</span>
                                                        <span className="text-[10px] text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded font-semibold truncate max-w-[120px] border border-indigo-500/20" title={`Último proyecto: ${mainLead.project_name}`}>
                                                            {mainLead.project_name}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Chat Area - tema oscuro */}
            <div className="flex-1 flex flex-col relative h-full max-w-full">
                {/* Chat Header */}
                {selectedLead ? (
                    <div className="flex justify-between px-6 py-4 glass border-b border-[rgba(255,255,255,0.06)] items-center flex-shrink-0 z-10">
                        <div className="flex items-center gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-display font-semibold text-white leading-tight">
                                        {selectedLead.name || 'Usuario desconocido'}
                                    </h2>
                                    {selectedLead.project_name && (
                                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20 uppercase tracking-wider font-bold" title="Último proyecto de interés">
                                            {selectedLead.project_name}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-[#94A3B8] mt-0.5">
                                    {selectedLead.phone}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={clsx(
                                "px-2.5 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider border",
                                selectedLead.score === 'hot' && "text-red-300 bg-red-500/20 border-red-500/30",
                                selectedLead.score === 'warm' && "text-amber-300 bg-amber-500/20 border-amber-500/30",
                                selectedLead.score === 'cold' && "text-slate-400 bg-slate-500/20 border-slate-500/30",
                                !selectedLead.score && "text-[#94A3B8] bg-white/5 border-white/10"
                            )}>
                                {selectedLead.score || 'N/A'}
                            </span>
                            <div className="h-6 w-px bg-white/10 mx-1" />
                            <button className="p-2 border border-white/10 rounded-xl hover:bg-white/5 transition-colors text-[#94A3B8] hover:text-white tooltip group relative">
                                <UserCircle2 size={18} />
                                <span className="absolute -bottom-8 right-0 bg-[#1A1E2A] border border-white/10 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                    Ver Perfil CRM
                                </span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="h-16 border-b border-transparent flex-shrink-0" />
                )}

                {/* Chat View */}
                <div className="flex-1 overflow-y-auto w-full scroll-smooth">
                    {loadingChat ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-6 h-6 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
                                <span className="text-sm font-medium text-[#94A3B8]">Cargando conversación...</span>
                            </div>
                        </div>
                    ) : activeConversation.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                                <MessageSquare size={24} className="text-[#94A3B8]" />
                            </div>
                            <p className="text-[#94A3B8] font-medium">No hay mensajes en esta conversación.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col w-full pb-8">
                            {activeConversation.map((msg, idx) => {
                                const isUser = msg.role === 'user';
                                const isAI = msg.role === 'assistant' && (msg.sender_type === 'ai' || msg.sender_type === 'agent');
                                const isHuman = msg.role === 'assistant' && msg.sender_type === 'human';

                                return (
                                    <div key={idx} className={clsx(
                                        "w-full group border-t border-white/5 first:border-t-0",
                                        isUser && "bg-white/5",
                                        isAI && "bg-indigo-500/5 border-indigo-500/10",
                                        isHuman && "bg-sky-500/10 border-sky-500/10"
                                    )}>
                                        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex gap-4 md:gap-6">
                                            {/* Left Column: Avatar */}
                                            <div className="flex-shrink-0">
                                                {isUser && (
                                                    <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white font-bold text-sm">
                                                        U
                                                    </div>
                                                )}
                                                {isAI && (
                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-md ring-2 ring-indigo-500/30">
                                                        <Sparkles size={16} className="text-white" />
                                                    </div>
                                                )}
                                                {isHuman && (
                                                    <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center shadow-sm ring-2 ring-sky-500/30">
                                                        <UserCircle2 size={18} className="text-white" />
                                                    </div>
                                                )}
                                                {!isUser && !isAI && !isHuman && (
                                                    <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[#94A3B8] text-xs">
                                                        ?
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Column: Name & Message content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className={clsx(
                                                        "font-semibold text-[15px] leading-tight",
                                                        isUser && "text-white",
                                                        isAI && "text-indigo-300",
                                                        isHuman && "text-sky-300"
                                                    )}>
                                                        {isUser && "Usuario"}
                                                        {(isAI || (!isUser && !isHuman)) && "Realia AI"}
                                                        {isHuman && "Soporte (Humano)"}
                                                    </span>
                                                    {isAI && (
                                                        <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border border-indigo-500/20">
                                                            Bot
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-[#94A3B8] font-medium ml-auto">
                                                        {formatTime(msg.created_at)}
                                                    </span>
                                                </div>

                                                <div className={clsx(
                                                    "text-[15px] leading-relaxed whitespace-pre-wrap tracking-[-0.01em] text-[#E2E8F0]"
                                                )}>
                                                    {msg.content}
                                                </div>

                                                {msg.media_type && (
                                                    <div className="mt-4 flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 w-fit transition-colors cursor-pointer group/file">
                                                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center group-hover/file:bg-white/15 transition-colors">
                                                            <FileText size={20} className="text-[#94A3B8]" />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-white">Documento Adjunto</div>
                                                            <div className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{msg.media_type}</div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} className="h-4" />
                        </div>
                    )}
                </div>

                {/* Input Area - tema oscuro */}
                {selectedLead && (
                    <div className="p-4 glass border-t border-[rgba(255,255,255,0.06)] flex-shrink-0">
                        <div className="max-w-3xl mx-auto relative px-4 sm:px-6 md:px-0">
                            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 focus-within:ring-1 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/30 transition-all flex flex-col">
                                <textarea
                                    placeholder="Escribe un mensaje..."
                                    className="w-full bg-transparent text-white text-[15px] placeholder:text-[#94A3B8] focus:outline-none p-4 resize-none min-h-[60px] max-h-[200px]"
                                    rows={1}
                                    style={{ lineHeight: '1.5' }}
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={sending}
                                />
                                <div className="flex items-center justify-between px-2 pb-2 mt-auto flex-wrap gap-2">
                                    <div className="flex items-center gap-2 px-2">
                                        {handoffActive ? (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse" />
                                                <span className="text-xs font-medium text-emerald-400">Takeover humano activo</span>
                                                <button
                                                    type="button"
                                                    onClick={handleEndHandoff}
                                                    className="text-[11px] font-semibold text-[#94A3B8] hover:text-white border border-white/10 hover:border-white/20 px-2 py-1 rounded-lg transition-colors"
                                                >
                                                    Terminar intervención
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                                                <span className="text-xs font-medium text-[#94A3B8]">Modo agente</span>
                                                <button
                                                    type="button"
                                                    onClick={handleStartHandoff}
                                                    className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 border border-sky-500/30 hover:border-sky-500/50 px-2 py-1 rounded-lg transition-colors"
                                                >
                                                    Tomar conversación
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={sending || !messageInput.trim()}
                                        className="p-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white hover:from-indigo-400 hover:to-indigo-500 transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Send size={16} className="-ml-0.5 mt-0.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-center mt-3">
                                <p className="text-[11px] text-[#94A3B8]">
                                    {handoffActive
                                        ? 'El agente no interviene. Al terminar, hacé click en "Terminar intervención" para volver al bot.'
                                        : 'Al enviar un mensaje o hacer "Tomar conversación", el bot se pausa y solo vos respondés.'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}
