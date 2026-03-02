'use client';

import { useEffect, useState, useRef } from 'react';
import { api, Lead, Conversation } from '@/lib/api';
import { Bot, User, UserSearch, Phone, Clock, FileText, Send, UserCircle2, MessageSquare, Sparkles, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export default function InboxPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loadingLeads, setLoadingLeads] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [activeConversation, setActiveConversation] = useState<Conversation[]>([]);
    const [loadingChat, setLoadingChat] = useState(false);
    const [messageInput, setMessageInput] = useState('');
    const [sending, setSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        api.getLeads()
            .then(data => {
                setLeads(data);
                if (data.length > 0) {
                    handleSelectLead(data[0].id);
                }
            })
            .catch(() => setError('No se pudieron cargar las conversaciones. ¿Está corriendo el backend?'))
            .finally(() => setLoadingLeads(false));
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeConversation]);

    const handleSelectLead = async (leadId: string) => {
        setSelectedLeadId(leadId);
        setLoadingChat(true);
        setMessageInput('');
        try {
            const data = await api.getLead(leadId);
            setActiveConversation(data.conversations || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingChat(false);
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

            // Reload to get the real message from DB to ensure sync
            const data = await api.getLead(selectedLeadId);
            setActiveConversation(data.conversations || []);
        } catch (err) {
            console.error('Error sending message:', err);
            // Si falla podríamos mostrar un toast o revertir el estado optimista
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
        <div className="flex h-full w-full bg-white text-slate-900 font-sans overflow-hidden">
            {/* Sidebar Inbox List */}
            <div className="w-80 border-r border-slate-200 flex flex-col bg-[#F9F9F9] flex-shrink-0">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-[#F9F9F9] z-10">
                    <h2 className="text-lg font-semibold text-slate-800 tracking-tight">Inbox</h2>
                    <span className="bg-slate-200 text-slate-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">
                        {leads.length} leads
                    </span>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <UserSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search conversations..."
                            className="w-full bg-white text-sm text-slate-800 rounded-md pl-9 pr-4 py-2 border border-slate-200 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-300 transition-all placeholder:text-slate-400"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loadingLeads ? (
                        <div className="p-4 space-y-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="flex gap-3 animate-pulse">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                                    <div className="flex-1 space-y-2 py-1">
                                        <div className="h-4 bg-slate-200 rounded w-full" />
                                        <div className="h-3 bg-slate-200 rounded w-2/3" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {leads.map((lead) => {
                                const isActive = selectedLeadId === lead.id;
                                return (
                                    <button
                                        key={lead.id}
                                        onClick={() => handleSelectLead(lead.id)}
                                        className={clsx(
                                            "flex items-start gap-3 p-3 mx-2 my-0.5 rounded-lg transition-colors text-left group",
                                            isActive
                                                ? "bg-slate-200/50 shadow-sm"
                                                : "hover:bg-slate-200/30"
                                        )}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex flex-shrink-0 items-center justify-center text-slate-600 font-semibold text-sm shadow-sm group-hover:border-slate-300 transition-colors">
                                            {lead.name ? lead.name.charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <div className="flex-1 min-w-0 py-0.5">
                                            <div className="flex justify-between items-baseline mb-0.5">
                                                <h3 className="text-sm font-semibold text-slate-900 truncate pr-2">
                                                    {lead.name || lead.phone}
                                                </h3>
                                                <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                                                    {formatDate(lead.last_contact || lead.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-slate-500 truncate mb-1.5 font-normal tracking-tight">
                                                {lead.phone}
                                            </p>
                                            <div className="flex gap-1.5 items-center mt-1">
                                                <span className={clsx(
                                                    "w-2 h-2 rounded-full",
                                                    lead.score === 'hot' && "bg-red-500",
                                                    lead.score === 'warm' && "bg-amber-500",
                                                    lead.score === 'cold' && "bg-slate-300",
                                                    !lead.score && "bg-slate-200"
                                                )} />
                                                <span className="text-[10px] text-slate-500 tracking-wider uppercase font-semibold">
                                                    {lead.score || 'NO_SCORE'}
                                                </span>
                                                {lead.project_name && (
                                                    <>
                                                        <span className="text-slate-300 mx-1">•</span>
                                                        <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold truncate max-w-[120px]">
                                                            {lead.project_name}
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

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-white relative h-full max-w-full">
                {/* Chat Header */}
                {selectedLead ? (
                    <div className="flex justify-between px-6 py-3 bg-white z-10 border-b border-slate-200 items-center flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-semibold text-slate-900 leading-tight">
                                        {selectedLead.name || 'Usuario desconocido'}
                                    </h2>
                                    {selectedLead.project_name && (
                                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 uppercase tracking-wider font-bold">
                                            {selectedLead.project_name}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-500 mt-0.5">
                                    {selectedLead.phone}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={clsx(
                                "px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border",
                                selectedLead.score === 'hot' && "text-red-700 bg-red-50 border-red-200",
                                selectedLead.score === 'warm' && "text-amber-700 bg-amber-50 border-amber-200",
                                selectedLead.score === 'cold' && "text-slate-600 bg-slate-100 border-slate-200",
                            )}>
                                {selectedLead.score || 'N/A'}
                            </span>
                            <div className="h-6 w-px bg-slate-200 mx-1" />
                            <button className="p-2 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors text-slate-600 tooltip group relative">
                                <UserCircle2 size={18} />
                                <span className="absolute -bottom-8 right-0 bg-slate-800 text-white text-[11px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    Ver Perfil CRM
                                </span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="h-14 border-b border-transparent flex-shrink-0" />
                )}

                {/* Chat View */}
                <div className="flex-1 overflow-y-auto w-full scroll-smooth">
                    {loadingChat ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
                                <span className="text-sm font-medium text-slate-500">Cargando conversación...</span>
                            </div>
                        </div>
                    ) : activeConversation.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                                <MessageSquare size={24} className="text-slate-300" />
                            </div>
                            <p className="text-slate-500 font-medium">No hay mensajes en esta conversación.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col w-full pb-8">
                            {activeConversation.map((msg, idx) => {
                                const isUser = msg.role === 'user';
                                const isAI = msg.role === 'assistant' && msg.sender_type === 'ai';
                                const isHuman = msg.role === 'assistant' && msg.sender_type === 'human';

                                return (
                                    <div key={idx} className="w-full group">
                                        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex gap-4 md:gap-6">
                                            {/* Left Column: Avatar */}
                                            <div className="flex-shrink-0">
                                                {isUser && (
                                                    <div className="w-8 h-8 rounded-sm bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm">
                                                        U
                                                    </div>
                                                )}
                                                {isAI && (
                                                    <div className="w-8 h-8 rounded-sm bg-[#0F172A] flex items-center justify-center">
                                                        <Sparkles size={14} className="text-white" />
                                                    </div>
                                                )}
                                                {isHuman && (
                                                    <div className="w-8 h-8 rounded-sm bg-[#0369A1] flex items-center justify-center">
                                                        <UserCircle2 size={16} className="text-white" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Column: Name & Message content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-semibold text-[15px] text-slate-900 leading-tight">
                                                        {isUser && "Usuario"}
                                                        {isAI && "Realia AI"}
                                                        {isHuman && "Soporte (Humano)"}
                                                    </span>
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {formatTime(msg.created_at)}
                                                    </span>
                                                </div>

                                                <div className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700 tracking-[-0.01em]">
                                                    {msg.content}
                                                </div>

                                                {/* Archivo adjunto mockup */}
                                                {msg.media_type && (
                                                    <div className="mt-4 flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 w-fit transition-colors cursor-pointer group/file">
                                                        <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center group-hover/file:bg-slate-200 transition-colors">
                                                            <FileText size={20} className="text-slate-500" />
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-slate-900">Documento Adjunto</div>
                                                            <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{msg.media_type}</div>
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

                {/* Input Area */}
                {selectedLead && (
                    <div className="p-4 bg-white border-t border-slate-200 flex-shrink-0">
                        <div className="max-w-3xl mx-auto relative px-4 sm:px-6 md:px-0">
                            <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm focus-within:ring-1 focus-within:ring-slate-400 focus-within:border-slate-400 transition-all flex flex-col">
                                <textarea
                                    placeholder="Escribe un mensaje..."
                                    className="w-full bg-transparent text-slate-900 text-[15px] placeholder:text-slate-400 focus:outline-none p-4 resize-none min-h-[60px] max-h-[200px]"
                                    rows={1}
                                    style={{ lineHeight: '1.5' }}
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={sending}
                                />
                                <div className="flex items-center justify-between px-2 pb-2 mt-auto">
                                    <div className="flex items-center gap-2 px-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                        <span className="text-xs font-medium text-slate-500">Takeover Humano Activo</span>
                                    </div>
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={sending || !messageInput.trim()}
                                        className="p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Send size={16} className="-ml-0.5 mt-0.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-center mt-3">
                                <p className="text-[11px] text-slate-400">
                                    El bot de inteligencia artificial se pausará al enviar un mensaje.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
