'use client';

import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { api, Lead, Conversation } from '@/lib/api';
import { useNotifications } from '@/contexts/NotificationsContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Search, FileText, Send, UserCircle2, MessageSquare, Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';

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
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

// Markdown renderer — handles **bold**, - lists, and paragraphs
function parseLine(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      : part
  );
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const result: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    result.push(
      <ul key={key++} className="my-1.5 space-y-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2 items-start text-sm leading-relaxed text-gray-700">
            <span className="text-gray-300 flex-shrink-0 select-none mt-px">—</span>
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
        result.push(<div key={key++} className="h-2" />);
      } else {
        result.push(
          <p key={key++} className="text-sm leading-relaxed text-gray-700">
            {parseLine(line)}
          </p>
        );
      }
    }
  });
  flushList();

  return <div className="space-y-0">{result}</div>;
}

const SCORE_BADGE: Record<string, string> = {
  hot: 'bg-red-50 text-red-700 border-red-200',
  warm: 'bg-amber-50 text-amber-700 border-amber-200',
  cold: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function InboxPage() {
  const { markInboxAsRead } = useNotifications();
  const { isReader } = useAuth();

  useEffect(() => {
    markInboxAsRead();
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const leadGroups = useMemo(() => groupLeadsByPhone(leads), [leads]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return leadGroups;
    const q = searchQuery.toLowerCase();
    return leadGroups.filter(
      (g) =>
        g.mainLead.name?.toLowerCase().includes(q) ||
        g.mainLead.phone.includes(q)
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
          } catch {
            // ignore
          } finally {
            setLoadingChat(false);
          }
        }
      })
      .catch(() => toast.error('No se pudieron cargar las conversaciones'))
      .finally(() => setLoadingLeads(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation]);

  // Poll messages every 1.5s for fast AI response updates
  useEffect(() => {
    if (selectedLeadIdsForMerge.length === 0 || !selectedLeadId) return;
    const interval = setInterval(async () => {
      try {
        const [merged, handoff] = await Promise.all([
          loadMergedConversations(selectedLeadIdsForMerge),
          api.getLeadHandoff(selectedLeadId),
        ]);
        setActiveConversation((prev) => (merged.length !== prev.length ? merged : prev));
        setHandoffActive(handoff.active);
      } catch { /* silent */ }
    }, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadIdsForMerge.join(','), selectedLeadId]);

  // Poll lead list every 15s
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
    setMobileShowChat(true);
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

  const handleEndHandoff = async () => {
    if (!selectedLeadId) return;
    try {
      const res = await api.closeLeadHandoff(selectedLeadId);
      if (res.closed) setHandoffActive(false);
    } catch {
      toast.error('No se pudo cerrar el handoff');
    }
  };

  const handleStartHandoff = async () => {
    if (!selectedLeadId) return;
    try {
      await api.startLeadHandoff(selectedLeadId);
      setHandoffActive(true);
    } catch {
      toast.error('No se pudo iniciar el handoff');
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  };

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden p-4 md:p-8 max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="flex flex-col mb-5 flex-shrink-0">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold uppercase tracking-wider mb-2 w-fit">
          <MessageSquare size={12} />
          Conversaciones
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-gray-900 tracking-tight mb-1">Inbox</h1>
        <p className="text-gray-500 text-sm md:text-base max-w-xl">
          Todas las conversaciones con leads en un solo lugar.
        </p>
      </div>

      <div className="flex flex-1 min-h-0 rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-sm">
        {/* Sidebar */}
        <div
          className={cn(
            'flex-col border-r border-gray-200 flex-shrink-0',
            'w-full md:w-80',
            mobileShowChat ? 'hidden md:flex' : 'flex'
          )}
        >
          <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10 bg-white">
            <h2 className="text-base font-display font-semibold text-gray-900">Conversaciones</h2>
            <Badge className="bg-blue-50 text-blue-800 border-blue-200 text-[10px] uppercase font-bold">
              {filteredGroups.length}
            </Badge>
          </div>

          <div className="p-3">
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                autoComplete="off"
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-sm text-gray-900 rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-gray-400 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingLeads ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex gap-3 items-start p-2">
                    <Skeleton className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-4 w-3/4 bg-gray-200" />
                      <Skeleton className="h-3 w-1/2 bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <MessageSquare size={24} className="text-gray-300 mb-3" />
                <p className="text-gray-400 text-sm">Sin conversaciones</p>
              </div>
            ) : (
              <div className="flex flex-col p-2">
                {filteredGroups.map((group) => {
                  const { mainLead } = group;
                  const isActive = selectedLeadId === mainLead.id;
                  return (
                    <button
                      key={group.phone}
                      onClick={() => handleSelectPerson(group)}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-xl transition-all text-left group w-full',
                        isActive
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      )}
                    >
                      <Avatar className={cn('w-10 h-10 rounded-xl flex-shrink-0 border', isActive ? 'border-blue-200' : 'border-gray-200')}>
                        <AvatarFallback className={cn('rounded-xl text-sm font-semibold', isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600')}>
                          {getInitials(mainLead.name || mainLead.phone)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <h3 className="text-sm font-semibold text-gray-900 truncate pr-2">
                            {mainLead.name || mainLead.phone}
                          </h3>
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">
                            {formatDate(mainLead.last_contact || mainLead.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mb-1">{mainLead.phone}</p>
                        <div className="flex gap-1.5 items-center flex-wrap">
                          {mainLead.score && (
                            <Badge className={cn('text-[10px] uppercase tracking-wider font-bold border px-1.5 py-0', SCORE_BADGE[mainLead.score] || 'bg-gray-100 text-gray-500 border-gray-200')}>
                              {mainLead.score}
                            </Badge>
                          )}
                          {mainLead.project_name && (
                            <Badge className="text-[10px] bg-blue-50 text-blue-800 border-blue-200 font-semibold truncate max-w-[110px]">
                              {mainLead.project_name}
                            </Badge>
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

        {/* Chat area */}
        <div
          className={cn(
            'flex-1 flex flex-col relative h-full min-w-0 bg-gray-50',
            !mobileShowChat && 'hidden md:flex',
            mobileShowChat && 'flex'
          )}
        >
          {/* Chat Header */}
          {selectedLead ? (
            <div className="flex justify-between px-4 md:px-6 py-4 border-b border-gray-200 items-center flex-shrink-0 bg-white">
              <div className="flex items-center gap-3">
                {/* Mobile back button */}
                <button
                  onClick={() => setMobileShowChat(false)}
                  className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar className="w-9 h-9 rounded-xl border border-gray-200 hidden md:flex">
                  <AvatarFallback className="rounded-xl bg-blue-100 text-blue-800 text-sm font-bold">
                    {getInitials(selectedLead.name || selectedLead.phone)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-display font-semibold text-gray-900 leading-tight">
                      {selectedLead.name || 'Usuario desconocido'}
                    </h2>
                    {selectedLead.project_name && (
                      <Badge className="text-[10px] bg-blue-50 text-blue-800 border-blue-200 uppercase tracking-wider font-bold">
                        {selectedLead.project_name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedLead.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedLead.score && (
                  <Badge className={cn('text-xs uppercase tracking-wider border', SCORE_BADGE[selectedLead.score] || 'bg-gray-100 text-gray-500 border-gray-200')}>
                    {selectedLead.score}
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="h-16 border-b border-transparent flex-shrink-0" />
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto w-full scroll-smooth">
            {!selectedLead ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4">
                  <MessageSquare size={28} className="text-blue-700" />
                </div>
                <h3 className="text-gray-900 font-semibold mb-2">Seleccioná una conversación</h3>
                <p className="text-gray-500 text-sm max-w-xs">
                  Elegí un contacto de la lista para ver su historial de mensajes.
                </p>
              </div>
            ) : loadingChat ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={24} className="animate-spin text-blue-700" />
                  <span className="text-sm text-gray-500">Cargando conversación...</span>
                </div>
              </div>
            ) : activeConversation.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-3">
                  <MessageSquare size={22} className="text-gray-400" />
                </div>
                <p className="text-gray-400 text-sm">No hay mensajes en esta conversación.</p>
              </div>
            ) : (
              <div className="flex flex-col w-full pb-8 pt-2">
                {activeConversation.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  const isAI = msg.role === 'assistant' && (msg.sender_type === 'ai' || msg.sender_type === 'agent');
                  const isHuman = msg.role === 'assistant' && msg.sender_type === 'human';
                  const isTelegram = msg.role === 'assistant' && msg.sender_type === 'telegram';
                  const prevMsg = activeConversation[idx - 1];
                  const sameAsPrev = prevMsg && prevMsg.role === msg.role && prevMsg.sender_type === msg.sender_type;

                  return (
                    <div
                      key={idx}
                      className={cn(
                        'w-full',
                        sameAsPrev ? 'pt-1' : 'pt-4',
                        idx === 0 && 'pt-4'
                      )}
                    >
                      <div className="max-w-3xl mx-auto px-4 sm:px-6 flex gap-3">
                        {/* Avatar — only show on first message of a group */}
                        <div className="flex-shrink-0 w-8">
                          {!sameAsPrev ? (
                            <>
                              {isUser && (
                                <div className="w-8 h-8 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-600 font-semibold text-xs">
                                  {getInitials(selectedLead?.name || 'U')}
                                </div>
                              )}
                              {isAI && (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-sm">
                                  <Sparkles size={14} className="text-white" />
                                </div>
                              )}
                              {isHuman && (
                                <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center shadow-sm">
                                  <UserCircle2 size={15} className="text-white" />
                                </div>
                              )}
                              {isTelegram && (
                                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shadow-sm">
                                  <UserCircle2 size={15} className="text-white" />
                                </div>
                              )}
                              {!isUser && !isAI && !isHuman && !isTelegram && (
                                <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs">?</div>
                              )}
                            </>
                          ) : null}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-1">
                          {/* Header — only on first of group */}
                          {!sameAsPrev && (
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={cn(
                                'font-semibold text-sm',
                                isUser && 'text-gray-900',
                                isAI && 'text-blue-800',
                                isHuman && 'text-sky-700',
                                isTelegram && 'text-emerald-700',
                                !isUser && !isAI && !isHuman && !isTelegram && 'text-gray-500'
                              )}>
                                {isUser ? (selectedLead?.name || 'Usuario') : isAI ? 'Realia AI' : isHuman ? 'Soporte (Panel)' : isTelegram ? 'Soporte (Telegram)' : 'Sistema'}
                              </span>
                              {isAI && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5 font-bold uppercase tracking-wide">AI</span>
                              )}
                              <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
                            </div>
                          )}

                          {/* Message bubble */}
                          <div className={cn(
                            'rounded-2xl px-3.5 py-2.5 text-sm w-fit max-w-full',
                            isUser && 'bg-white border border-gray-200 shadow-sm text-gray-800',
                            isAI && 'bg-white border border-blue-100 shadow-sm text-gray-700',
                            isHuman && 'bg-white border border-sky-200 shadow-sm text-gray-800',
                            isTelegram && 'bg-white border border-emerald-200 shadow-sm text-gray-800',
                            !isUser && !isAI && !isHuman && !isTelegram && 'bg-gray-50 text-gray-500'
                          )}>
                            {isAI || isHuman || isTelegram
                              ? renderMarkdown(msg.content)
                              : <p className="text-sm leading-relaxed">{msg.content}</p>
                            }
                          </div>

                          {msg.media_type && (
                            <div className="mt-2 flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-white w-fit">
                              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                <FileText size={16} className="text-gray-500" />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">Documento Adjunto</div>
                                <div className="text-[11px] text-gray-400 uppercase tracking-wider">{msg.media_type}</div>
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

          {/* Input area */}
          {selectedLead && !isReader && (
            <div className="p-3 md:p-4 border-t border-gray-200 flex-shrink-0 bg-white">
              <div className="max-w-3xl mx-auto">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 transition-all flex flex-col shadow-sm">
                  <textarea
                    placeholder="Escribí un mensaje... (Enter para enviar)"
                    className="w-full bg-transparent text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none p-4 resize-none min-h-[60px] max-h-[160px]"
                    rows={1}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                  />
                  <div className="flex items-center justify-between px-3 pb-3 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {handoffActive ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-medium text-emerald-600">Takeover activo</span>
                          <button
                            type="button"
                            onClick={handleEndHandoff}
                            className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2 py-1 rounded-lg transition-colors"
                          >
                            Terminar
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          <span className="text-xs text-gray-400">Modo agente</span>
                          <button
                            type="button"
                            onClick={handleStartHandoff}
                            className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 border border-sky-300 px-2 py-1 rounded-lg transition-colors"
                          >
                            Tomar
                          </button>
                        </>
                      )}
                    </div>
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !messageInput.trim()}
                      className="p-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
                <p className="text-center mt-2 text-[11px] text-gray-400">
                  {handoffActive
                    ? 'El agente AI está pausado. Hacé clic en "Terminar" para volver al bot.'
                    : 'Al enviar, el bot se pausa y solo vos respondés.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
