'use client';

import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { api, Lead, Conversation } from '@/lib/api';
import { useNotifications } from '@/contexts/NotificationsContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Search, FileText, Send, Sparkles, Loader2, ArrowLeft, Wifi, WifiOff, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useSSE, SSEMessageEvent, SSEHandoffUpdateEvent } from '@/hooks/useSSE';

type LeadGroup = { phone: string; mainLead: Lead; allLeadIds: string[]; lastMessage?: string };

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
    result.push({ phone, mainLead: sorted[0], allLeadIds: sorted.map((l) => l.id) });
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

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

function parseLine(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

function renderMarkdown(content: string, isOutgoing: boolean): React.ReactNode {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    result.push(
      <ul key={key++} className="my-1.5 space-y-0.5">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2 items-start text-sm leading-relaxed">
            <span className={cn('flex-shrink-0 select-none mt-px', isOutgoing ? 'text-indigo-200' : 'text-gray-300')}>—</span>
            <span>{parseLine(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      listItems.push(line.slice(2));
    } else {
      flushList();
      if (line.trim() === '') {
        result.push(<div key={key++} className="h-1.5" />);
      } else {
        result.push(
          <p key={key++} className="text-sm leading-relaxed">{parseLine(line)}</p>
        );
      }
    }
  });
  flushList();
  return <div className="space-y-0">{result}</div>;
}

const SCORE_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  hot:  { label: '🔥 Caliente', dot: 'bg-red-500',   badge: 'bg-red-50 text-red-700 border-red-200' },
  warm: { label: '☀️ Tibio',    dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  cold: { label: '❄️ Frío',     dot: 'bg-blue-400',  badge: 'bg-blue-50 text-blue-700 border-blue-200' },
};

// Typing indicator with bouncing dots
function TypingIndicator() {
  return (
    <div className="flex items-end gap-1 px-4 py-2.5 rounded-2xl rounded-bl-sm bg-[#eef1ff] border border-indigo-100/60 shadow-sm w-fit">
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .typing-dot { animation: typing-bounce 1.2s infinite; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
      <div className="typing-dot w-2 h-2 rounded-full bg-indigo-400" />
      <div className="typing-dot w-2 h-2 rounded-full bg-indigo-400" />
      <div className="typing-dot w-2 h-2 rounded-full bg-indigo-400" />
    </div>
  );
}

// Chat background — soft neutral with a barely-visible dot grid
const chatBgStyle: React.CSSProperties = {
  backgroundColor: '#f4f6fb',
  backgroundImage: `radial-gradient(circle, #c7cfe8 1px, transparent 1px)`,
  backgroundSize: '24px 24px',
};

function formatTime(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatSidebarTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function isSameDay(a?: string, b?: string) {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function InboxPage() {
  const { markInboxAsRead } = useNotifications();
  const { isReader } = useAuth();

  useEffect(() => {
    markInboxAsRead();
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadIdsForMerge, setSelectedLeadIdsForMerge] = useState<string[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [handoffActive, setHandoffActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedLeadIdsForMergeRef = useRef(selectedLeadIdsForMerge);
  useEffect(() => { selectedLeadIdsForMergeRef.current = selectedLeadIdsForMerge; }, [selectedLeadIdsForMerge]);
  const selectedLeadIdRef = useRef(selectedLeadId);
  useEffect(() => { selectedLeadIdRef.current = selectedLeadId; }, [selectedLeadId]);

  const leadGroups = useMemo(() => groupLeadsByPhone(leads), [leads]);
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return leadGroups;
    const q = searchQuery.toLowerCase();
    return leadGroups.filter(
      (g) => g.mainLead.name?.toLowerCase().includes(q) || g.mainLead.phone.includes(q)
    );
  }, [leadGroups, searchQuery]);

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
          } catch { /* ignore */ }
          finally { setLoadingChat(false); }
        }
      })
      .catch(() => toast.error('No se pudieron cargar las conversaciones'))
      .finally(() => setLoadingLeads(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation, agentTyping]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [messageInput]);

  const handleSSEMessage = useCallback((data: SSEMessageEvent) => {
    const currentLeadIds = selectedLeadIdsForMergeRef.current;
    const currentLeadId = selectedLeadIdRef.current;
    if (!currentLeadId || !currentLeadIds.includes(data.lead_id)) return;

    // If incoming message is from the lead, show typing indicator for AI response
    if (data.sender_type === 'lead') {
      setAgentTyping(true);
      // Safety fallback: hide after 30s
      if (agentTypingTimerRef.current) clearTimeout(agentTypingTimerRef.current);
      agentTypingTimerRef.current = setTimeout(() => setAgentTyping(false), 30000);
    }

    setActiveConversation((prev) => {
      const alreadyExists = prev.some(
        (m) => m.content === data.content && m.sender_type === data.sender_type
      );
      if (alreadyExists) return prev;
      loadMergedConversations(currentLeadIds).then((msgs) => {
        setActiveConversation(msgs);
        setAgentTyping(false);
        if (agentTypingTimerRef.current) clearTimeout(agentTypingTimerRef.current);
      }).catch(() => {});
      return prev;
    });
  }, []);

  const handleSSEHandoffUpdate = useCallback((data: SSEHandoffUpdateEvent) => {
    const currentLeadId = selectedLeadIdRef.current;
    if (data.lead_id === currentLeadId) setHandoffActive(data.handoff_active);
    setLeads((prev) =>
      prev.map((l) => l.id === data.lead_id ? { ...l, handoff_active: data.handoff_active } : l)
    );
    if (data.handoff_active) {
      const leadLabel = data.lead_name || data.lead_phone || 'Un lead';
      const projectLabel = data.project_name ? ` — ${data.project_name}` : '';
      const body = `${leadLabel}${projectLabel} necesita atención de un asesor.`;
      toast(body, { duration: 8000, icon: '🔔' });
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Nuevo handoff — Realia', { body, icon: '/favicon.ico', tag: `handoff-${data.lead_id}` });
      }
    }
  }, []);

  const handleSSEReconnect = useCallback(() => {
    api.getLeads().then(setLeads).catch(() => {});
    const ids = selectedLeadIdsForMergeRef.current;
    const leadId = selectedLeadIdRef.current;
    if (ids.length > 0 && leadId) {
      loadMergedConversations(ids).then(setActiveConversation).catch(() => {});
      api.getLeadHandoff(leadId).then((h) => setHandoffActive(h.active)).catch(() => {});
    }
  }, []);

  const { status: sseStatus } = useSSE({
    onMessage: handleSSEMessage,
    onHandoffUpdate: handleSSEHandoffUpdate,
    onReconnect: handleSSEReconnect,
  });

  useEffect(() => {
    const interval = setInterval(async () => {
      try { const data = await api.getLeads(); setLeads(data); } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectPerson = async (group: LeadGroup) => {
    setSelectedLeadId(group.mainLead.id);
    setSelectedLeadIdsForMerge(group.allLeadIds);
    setLoadingChat(true);
    setMessageInput('');
    setMobileShowChat(true);
    setAgentTyping(false);
    try {
      const [merged, handoff] = await Promise.all([
        loadMergedConversations(group.allLeadIds),
        api.getLeadHandoff(group.mainLead.id),
      ]);
      setActiveConversation(merged);
      setHandoffActive(handoff.active);
    } catch {
      toast.error('Error al cargar la conversación');
    } finally {
      setLoadingChat(false);
    }
  };

  const handleSendMessage = useCallback(async () => {
    if (!selectedLeadId || !messageInput.trim() || sending) return;
    const content = messageInput.trim();
    setMessageInput('');
    setSending(true);
    try {
      const optimistic: Conversation = {
        id: Math.random().toString(),
        role: 'assistant',
        sender_type: 'human',
        content,
        media_type: null,
        created_at: new Date().toISOString(),
      };
      setActiveConversation((prev) => [...prev, optimistic]);
      await api.sendLeadMessage(selectedLeadId, content);
      const merged = await loadMergedConversations(selectedLeadIdsForMerge);
      setActiveConversation(merged);
      setHandoffActive(true);
    } catch {
      toast.error('Error al enviar el mensaje');
    } finally {
      setSending(false);
    }
  }, [selectedLeadId, messageInput, sending, selectedLeadIdsForMerge]);

  const handleEndHandoff = async () => {
    if (!selectedLeadId) return;
    try {
      const res = await api.closeLeadHandoff(selectedLeadId);
      if (res.closed) setHandoffActive(false);
    } catch { toast.error('No se pudo cerrar el handoff'); }
  };

  const handleStartHandoff = async () => {
    if (!selectedLeadId) return;
    try {
      await api.startLeadHandoff(selectedLeadId);
      setHandoffActive(true);
    } catch { toast.error('No se pudo iniciar el handoff'); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  // Last message per group for sidebar preview
  const lastMessageByPhone = useMemo(() => {
    // We only have the active conversation loaded; show nothing for others
    return new Map<string, string>();
  }, []);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden p-4 md:p-6 max-w-[1920px] mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold uppercase tracking-wider mb-1.5 w-fit">
            <MessageSquare size={11} />
            Inbox
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-gray-900 tracking-tight leading-none">
            Conversaciones
          </h1>
        </div>
        {/* SSE status */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
          sseStatus === 'connected'    && 'bg-emerald-50 border-emerald-200 text-emerald-700',
          sseStatus === 'connecting'   && 'bg-amber-50 border-amber-200 text-amber-700',
          sseStatus === 'disconnected' && 'bg-red-50 border-red-200 text-red-700',
        )}>
          {sseStatus === 'connected'    && <><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><Wifi size={11} />En vivo</>}
          {sseStatus === 'connecting'   && <><div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /><Loader2 size={11} className="animate-spin" />Conectando</>}
          {sseStatus === 'disconnected' && <><div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /><WifiOff size={11} />Reconectando</>}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex flex-1 min-h-0 rounded-2xl overflow-hidden shadow-sm border border-gray-200">

        {/* ── Sidebar ── */}
        <div className={cn(
          'flex flex-col bg-white border-r border-gray-100 flex-shrink-0 w-full md:w-[300px] lg:w-[320px]',
          mobileShowChat ? 'hidden md:flex' : 'flex'
        )}>
          {/* Sidebar header */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                autoComplete="off"
                placeholder="Buscar contacto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-200 text-sm text-gray-900 rounded-full pl-8 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 placeholder:text-gray-400 transition-all"
              />
            </div>
          </div>

          {/* Contact list */}
          <div className="flex-1 overflow-y-auto">
            {loadingLeads ? (
              <div className="p-3 space-y-1">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex gap-3 items-center p-3">
                    <Skeleton className="w-11 h-11 rounded-full bg-gray-100 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-3/4 bg-gray-100" />
                      <Skeleton className="h-3 w-1/2 bg-gray-50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <MessageSquare size={24} className="text-gray-200 mb-3" />
                <p className="text-gray-400 text-sm">Sin conversaciones</p>
              </div>
            ) : (
              filteredGroups.map((group) => {
                const { mainLead } = group;
                const isActive = selectedLeadId === mainLead.id;
                const score = mainLead.score ? SCORE_CONFIG[mainLead.score] : null;
                const timeLabel = formatSidebarTime(mainLead.last_contact || mainLead.created_at);
                return (
                  <button
                    key={group.phone}
                    onClick={() => handleSelectPerson(group)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors relative',
                      isActive ? 'bg-indigo-50/60' : 'hover:bg-slate-50',
                      'border-b border-gray-50'
                    )}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-indigo-500 rounded-r-full" />
                    )}

                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-11 h-11 rounded-full border-2 border-white shadow-sm">
                        <AvatarFallback className={cn(
                          'rounded-full text-sm font-bold',
                          isActive ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
                        )}>
                          {getInitials(mainLead.name || mainLead.phone)}
                        </AvatarFallback>
                      </Avatar>
                      {/* Score dot */}
                      {score && (
                        <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white', score.dot)} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1 mb-0.5">
                        <span className={cn('text-sm font-semibold truncate', isActive ? 'text-indigo-900' : 'text-gray-900')}>
                          {mainLead.name || mainLead.phone}
                        </span>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">{timeLabel}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400 truncate flex-1">
                          {mainLead.project_name || mainLead.phone}
                        </span>
                        {mainLead.handoff_active ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Humano activo" />
                        ) : (
                          <Sparkles size={10} className="text-indigo-300 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div className={cn(
          'flex-1 flex flex-col min-w-0',
          !mobileShowChat && 'hidden md:flex',
          mobileShowChat && 'flex'
        )}>

          {/* Chat header */}
          {selectedLead ? (
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileShowChat(false)}
                  className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar className="w-9 h-9 rounded-full border-2 border-white shadow-sm">
                  <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-800 text-sm font-bold">
                    {getInitials(selectedLead.name || selectedLead.phone)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {selectedLead.name || 'Usuario desconocido'}
                    </span>
                    {selectedLead.project_name && selectedLead.project_id && (
                      <Link href={`/proyectos/${selectedLead.project_id}/leads`} onClick={(e) => e.stopPropagation()}>
                        <Badge className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer">
                          {selectedLead.project_name} ↗
                        </Badge>
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {agentTyping ? (
                      <span className="text-emerald-600 font-medium">escribiendo...</span>
                    ) : (
                      selectedLead.phone
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedLead.score && (
                  <Badge className={cn('text-xs border', SCORE_CONFIG[selectedLead.score]?.badge)}>
                    {SCORE_CONFIG[selectedLead.score]?.label}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="h-[57px] bg-gray-50 border-b border-gray-100 flex-shrink-0" />
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto scroll-smooth" style={chatBgStyle}>
            {!selectedLead ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 rounded-full bg-white/80 border border-gray-200 flex items-center justify-center mb-4 shadow-sm">
                  <MessageSquare size={26} className="text-emerald-600" />
                </div>
                <h3 className="text-gray-700 font-semibold mb-1">Seleccioná una conversación</h3>
                <p className="text-gray-400 text-sm max-w-xs">Elegí un contacto de la lista para ver su historial de mensajes.</p>
              </div>
            ) : loadingChat ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={22} className="animate-spin text-emerald-600" />
                  <span className="text-sm text-gray-500">Cargando conversación...</span>
                </div>
              </div>
            ) : activeConversation.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="bg-white/80 rounded-xl px-5 py-3 shadow-sm border border-gray-100">
                  <p className="text-gray-400 text-sm">Sin mensajes aún.</p>
                </div>
              </div>
            ) : (
              <div className="py-3 px-2 md:px-4">
                {activeConversation.map((msg, idx) => {
                  const isLead     = msg.role === 'user';
                  const isAI       = msg.role === 'assistant' && (msg.sender_type === 'ai' || msg.sender_type === 'agent');
                  const isHuman    = msg.role === 'assistant' && msg.sender_type === 'human';
                  const isTelegram = msg.role === 'assistant' && msg.sender_type === 'telegram';
                  const isOutgoing = !isLead;

                  const prevMsg    = activeConversation[idx - 1];
                  const sameAsPrev = prevMsg && prevMsg.role === msg.role && prevMsg.sender_type === msg.sender_type;
                  const showDateSep = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);

                  // Tail only on first message of each group
                  const showTail = !sameAsPrev;

                  // Bubble colors — cohesive with app palette
                  const bubbleBg = isLead ? '#ffffff'
                    : isAI      ? '#eef1ff'   // indigo-50: brand AI
                    : isHuman   ? '#f0fdf4'   // green-50: human/handoff
                    : isTelegram? '#f0f9ff'   // sky-50: telegram
                    : '#f8f8f8';

                  const senderName = isLead
                    ? (selectedLead?.name || 'Usuario')
                    : isAI ? 'Realia AI'
                    : isHuman ? 'Soporte (Panel)'
                    : isTelegram ? 'Soporte (Telegram)'
                    : 'Sistema';

                  const senderColor = isLead ? '#4b5563'
                    : isAI      ? '#4338ca'
                    : isHuman   ? '#15803d'
                    : isTelegram? '#0284c7'
                    : '#6b7280';

                  return (
                    <React.Fragment key={idx}>
                      {showDateSep && (
                        <div className="flex items-center justify-center my-4">
                          <span className="bg-white/80 text-slate-500 text-xs font-medium px-4 py-1 rounded-full shadow-sm border border-slate-200/60">
                            {formatDateLabel(msg.created_at)}
                          </span>
                        </div>
                      )}

                      <div className={cn(
                        'flex w-full',
                        isOutgoing ? 'justify-end' : 'justify-start',
                        sameAsPrev ? 'mt-[2px]' : 'mt-3',
                      )}>
                        {/* Bubble wrapper — max 65% width */}
                        <div style={{ maxWidth: '65%', minWidth: 0 }}>

                          {/* Sender label above bubble (only first in group, incoming) */}
                          {!sameAsPrev && !isOutgoing && (
                            <div className="text-xs font-semibold mb-0.5 px-[13px] flex items-center gap-1.5" style={{ color: senderColor }}>
                              {senderName}
                              {isAI && (
                                <span className="text-[9px] bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide">
                                  AI
                                </span>
                              )}
                            </div>
                          )}
                          {!sameAsPrev && isOutgoing && (
                            <div className="text-xs font-semibold mb-0.5 px-[13px] text-right flex items-center justify-end gap-1.5" style={{ color: senderColor }}>
                              {isAI && (
                                <span className="text-[9px] bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide">
                                  AI
                                </span>
                              )}
                              {senderName}
                            </div>
                          )}

                          {/* The bubble itself */}
                          <div
                            className="relative"
                            style={{
                              backgroundColor: bubbleBg,
                              borderRadius: showTail
                                ? (isOutgoing ? '12px 2px 12px 12px' : '2px 12px 12px 12px')
                                : '12px',
                              padding: '7px 12px 5px',
                              boxShadow: isLead
                                ? '0 1px 2px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)'
                                : '0 1px 2px rgba(79,70,229,0.08)',
                              wordBreak: 'break-word',
                              overflowWrap: 'break-word',
                            }}
                          >
                            {/* Message content */}
                            <div className="text-[13.5px] leading-[1.5] text-gray-800">
                              {isAI || isHuman || isTelegram
                                ? renderMarkdown(msg.content, isOutgoing)
                                : <span>{msg.content}</span>
                              }
                            </div>

                            {/* Media attachment */}
                            {msg.media_type && (
                              <div className="mt-1.5 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/8">
                                <FileText size={13} className="text-gray-500 flex-shrink-0" />
                                <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{msg.media_type}</span>
                              </div>
                            )}

                            {/* Timestamp row — inline at bottom right */}
                            <div className="flex items-center justify-end gap-1 mt-0.5 -mb-[1px]">
                              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                {formatTime(msg.created_at)}
                              </span>
                              {isHuman && (
                                <svg viewBox="0 0 16 11" width="16" height="11" className="flex-shrink-0">
                                  <path d="M11.071.653a.45.45 0 0 0-.631 0L5.767 5.33l-1.2-1.2a.45.45 0 1 0-.636.636l1.519 1.519a.45.45 0 0 0 .636 0l4.985-4.996a.45.45 0 0 0 0-.636z" fill="#53bdeb"/>
                                  <path d="M14.071.653a.45.45 0 0 0-.631 0L8.767 5.33" stroke="#53bdeb" strokeWidth="0.9" fill="none"/>
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}

                {/* Typing indicator */}
                {agentTyping && (
                  <div className="flex justify-start mt-3">
                    <div>
                      <div className="text-xs font-semibold mb-0.5 px-[13px] text-indigo-600 flex items-center gap-1.5">
                        Realia AI
                        <span className="text-[9px] bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide">AI</span>
                      </div>
                      <div style={{ borderRadius: '2px 12px 12px 12px', backgroundColor: '#e8e6ff', boxShadow: '0 1px 1px rgba(0,0,0,0.1)', padding: '10px 14px' }}>
                        <TypingIndicator />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} className="h-4" />
              </div>
            )}
          </div>

          {/* Input area */}
          {selectedLead && !isReader && (
            <div className="bg-gray-50 border-t border-gray-100 flex-shrink-0">

              {/* Mode bar */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    handoffActive ? 'bg-emerald-500' : 'bg-indigo-400 animate-pulse',
                  )} />
                  <span className="text-xs font-medium text-gray-600">
                    {handoffActive ? 'Modo humano' : 'Modo agente'}
                  </span>
                  {handoffActive && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-1.5 py-px font-semibold uppercase tracking-wide">
                      Bot pausado
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handoffActive ? handleEndHandoff : handleStartHandoff}
                  className={cn(
                    'text-xs font-semibold px-3 py-1 rounded-full border transition-all',
                    handoffActive
                      ? 'bg-white border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                      : 'bg-white border-blue-300 text-blue-600 hover:bg-blue-50',
                  )}
                >
                  {handoffActive ? 'Ceder al bot' : 'Tomar'}
                </button>
              </div>

              {/* Compose row */}
              <div className="flex items-end gap-2 px-3 md:px-4 py-3">
                {/* Text input */}
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    placeholder="Escribí un mensaje..."
                    className="w-full bg-white border border-gray-200 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 rounded-lg px-4 py-2.5 resize-none transition-all shadow-sm"
                    style={{ minHeight: '40px', maxHeight: '120px', overflowY: 'auto' }}
                    rows={1}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                  />
                </div>

                {/* Send button */}
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !messageInput.trim()}
                  className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-all shadow-sm"
                >
                  {sending
                    ? <Loader2 size={15} className="animate-spin" />
                    : <Send size={15} />
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
