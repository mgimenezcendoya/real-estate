'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, Lead, LeadNote } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Phone, Calendar, DollarSign, Home, Target, Pencil, X, Loader2, StickyNote, Send, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import ReservationSheet from '@/components/ReservationSheet';

const COLUMNS = [
  { key: 'hot', label: '🔥 Hot', color: 'text-red-600', border: 'border-red-200', bg: 'bg-red-50' },
  { key: 'warm', label: '🌡 Warm', color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50' },
  { key: 'cold', label: '🧊 Cold', color: 'text-sky-600', border: 'border-sky-200', bg: 'bg-sky-50' },
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

const SCORE_BUTTONS = [
  { key: 'hot' as const, label: '🔥 Hot', activeClass: 'bg-red-100 border-red-400 text-red-700', hoverClass: 'hover:bg-red-50' },
  { key: 'warm' as const, label: '🌡 Warm', activeClass: 'bg-amber-100 border-amber-400 text-amber-700', hoverClass: 'hover:bg-amber-50' },
  { key: 'cold' as const, label: '🧊 Cold', activeClass: 'bg-sky-100 border-sky-400 text-sky-700', hoverClass: 'hover:bg-sky-50' },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

function LeadCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Skeleton className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4 bg-gray-200" />
          <Skeleton className="h-3 w-1/2 bg-gray-100" />
        </div>
      </div>
      <Skeleton className="h-3 w-full bg-gray-100" />
      <Skeleton className="h-3 w-2/3 bg-gray-100" />
    </div>
  );
}

function LeadCard({ lead, onClick, isSelected }: { lead: Lead; onClick: () => void; isSelected: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left bg-white border rounded-xl p-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all duration-150 shadow-sm',
        isSelected ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-200'
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <Avatar className="w-8 h-8 flex-shrink-0 border border-gray-200">
          <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-bold">
            {getInitials(lead.name || lead.phone)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 font-semibold text-sm truncate">{lead.name || 'Sin nombre'}</p>
          <p className="text-gray-500 text-xs mt-0.5">{lead.phone}</p>
        </div>
        {lead.source && (
          <Badge variant="secondary" className="text-[10px] bg-gray-100 text-gray-600 border-gray-200 shrink-0">
            {lead.source}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        {lead.intent && lead.intent !== 'unknown' && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Target size={11} className="shrink-0" />
            {INTENT_LABELS[lead.intent] || lead.intent}
          </div>
        )}
        {lead.budget_usd ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <DollarSign size={11} className="shrink-0" />
            USD {Number(lead.budget_usd).toLocaleString('es-AR')}
          </div>
        ) : null}
        {lead.bedrooms ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Home size={11} className="shrink-0" />
            {lead.bedrooms} ambientes
          </div>
        ) : null}
        {lead.timeline && lead.timeline !== 'unknown' && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar size={11} className="shrink-0" />
            {TIMELINE_LABELS[lead.timeline] || lead.timeline}
          </div>
        )}
      </div>

      {lead.last_contact && (
        <p className="text-gray-400 text-xs mt-3 pt-3 border-t border-gray-100">
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

  // Notes state
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({ name: '', budget_usd: '', source: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Reservation sheet
  const [reservationLead, setReservationLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getLeads(id)
      .then(setLeads)
      .catch(() => toast.error('No se pudieron cargar los leads'))
      .finally(() => setLoading(false));
  }, [id]);

  // Load notes when a lead is selected
  useEffect(() => {
    if (!selected) { setNotes([]); return; }
    setLoadingNotes(true);
    api.getLeadNotes(selected.id)
      .then(setNotes)
      .catch(() => toast.error('No se pudieron cargar las notas'))
      .finally(() => setLoadingNotes(false));
  }, [selected?.id]);

  const handleSelectLead = (lead: Lead) => {
    setSelected(lead);
    setEditMode(false);
    setNewNote('');
    setEditFields({
      name: lead.name || '',
      budget_usd: lead.budget_usd ? String(lead.budget_usd) : '',
      source: lead.source || '',
    });
  };

  const handleScoreChange = async (score: 'hot' | 'warm' | 'cold') => {
    if (!selected) return;
    const prevScore = selected.score;
    // Optimistic update
    const updated = { ...selected, score };
    setSelected(updated);
    setLeads((list) => list.map((l) => l.id === selected.id ? updated : l));
    try {
      await api.updateLead(selected.id, { score });
      toast.success(`Score actualizado a ${score}`);
    } catch {
      // Revert
      setSelected({ ...selected, score: prevScore });
      setLeads((list) => list.map((l) => l.id === selected.id ? { ...selected, score: prevScore } : l));
      toast.error('No se pudo actualizar el score');
    }
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    setSavingEdit(true);
    try {
      const fields: Parameters<typeof api.updateLead>[1] = {};
      if (editFields.name.trim()) fields.name = editFields.name.trim();
      if (editFields.source.trim()) fields.source = editFields.source.trim();
      const budget = parseFloat(editFields.budget_usd);
      if (!isNaN(budget) && budget > 0) fields.budget_usd = budget;

      await api.updateLead(selected.id, fields);
      const updatedLead = { ...selected, ...fields };
      setSelected(updatedLead);
      setLeads((prev) => prev.map((l) => l.id === selected.id ? updatedLead : l));
      setEditMode(false);
      toast.success('Lead actualizado');
    } catch {
      toast.error('No se pudo actualizar el lead');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddNote = async () => {
    if (!selected || !newNote.trim()) return;
    setAddingNote(true);
    const optimisticNote: LeadNote = {
      id: Math.random().toString(),
      author_name: null,
      note: newNote.trim(),
      created_at: new Date().toISOString(),
    };
    setNotes((prev) => [optimisticNote, ...prev]);
    setNewNote('');
    try {
      const saved = await api.addLeadNote(selected.id, optimisticNote.note);
      setNotes((prev) => prev.map((n) => n.id === optimisticNote.id ? saved : n));
    } catch {
      setNotes((prev) => prev.filter((n) => n.id !== optimisticNote.id));
      setNewNote(optimisticNote.note);
      toast.error('No se pudo guardar la nota');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selected) return;
    const prevNotes = notes;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    try {
      await api.deleteLeadNote(selected.id, noteId);
    } catch {
      setNotes(prevNotes);
      toast.error('No se pudo eliminar la nota');
    }
  };

  const grouped = {
    hot: leads.filter((l) => l.score === 'hot'),
    warm: leads.filter((l) => l.score === 'warm'),
    cold: leads.filter((l) => l.score === 'cold'),
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(({ key }) => (
            <div key={key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <Skeleton className="h-5 w-24 bg-gray-200" />
              {[1, 2, 3].map((i) => <LeadCardSkeleton key={i} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-fit">
          {COLUMNS.map(({ key, label, color, border, bg }) => (
            <div key={key} className={cn('rounded-2xl border p-4 flex flex-col', border, bg)}>
              <div className="flex items-center gap-2 mb-4">
                <h3 className={cn('font-semibold text-sm', color)}>{label}</h3>
                <span className={cn('text-xs px-2 py-0.5 rounded-full bg-white/70 font-semibold border', color, border)}>
                  {grouped[key].length}
                </span>
              </div>

              {grouped[key].length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-12">
                  <p className="text-gray-400 text-sm">Sin leads {key}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {grouped[key].map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onClick={() => handleSelectLead(lead)}
                      isSelected={selected?.id === lead.id}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && leads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mb-4">
            <Target size={28} className="text-indigo-600" />
          </div>
          <p className="text-gray-900 font-semibold mb-2">Sin leads todavía</p>
          <p className="text-gray-500 text-sm max-w-xs">
            Los leads aparecerán acá cuando escriban al WhatsApp del proyecto.
          </p>
        </div>
      )}

      {/* Reservation Sheet */}
      <ReservationSheet
        open={!!reservationLead}
        onOpenChange={(v) => !v && setReservationLead(null)}
        projectId={id}
        prefilledLead={
          reservationLead
            ? { id: reservationLead.id, name: reservationLead.name || '', phone: reservationLead.phone }
            : undefined
        }
        onSuccess={() => setReservationLead(null)}
      />

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] border-l border-gray-200 flex flex-col p-0 bg-white"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10 border border-gray-200">
                <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold">
                  {getInitials(selected?.name || selected?.phone || '?')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-gray-900 text-base font-bold truncate">
                  {selected?.name || 'Sin nombre'}
                </SheetTitle>
                <p className="text-gray-500 text-xs">{selected?.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                  editMode
                    ? 'bg-gray-100 border-gray-300 text-gray-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                )}
              >
                <Pencil size={12} />
                {editMode ? 'Cancelar' : 'Editar'}
              </button>
            </div>
          </SheetHeader>

          {selected && (
            <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
              {/* Score change */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Score</p>
                <div className="flex gap-2">
                  {SCORE_BUTTONS.map(({ key, label, activeClass, hoverClass }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleScoreChange(key)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                        selected.score === key
                          ? activeClass
                          : cn('border-gray-200 text-gray-500', hoverClass)
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator className="bg-gray-100" />

              {/* Info / Edit mode */}
              {editMode ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Editar lead</p>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Nombre</label>
                    <input
                      type="text"
                      value={editFields.name}
                      onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Presupuesto (USD)</label>
                    <input
                      type="number"
                      value={editFields.budget_usd}
                      onChange={(e) => setEditFields((f) => ({ ...f, budget_usd: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Fuente</label>
                    <input
                      type="text"
                      value={editFields.source}
                      onChange={(e) => setEditFields((f) => ({ ...f, source: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                      placeholder="whatsapp, instagram..."
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {savingEdit ? <Loader2 size={14} className="animate-spin" /> : null}
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMode(false)}
                      className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-0">
                  {[
                    { label: 'Teléfono', value: selected.phone },
                    { label: 'Intención', value: (selected.intent && INTENT_LABELS[selected.intent]) || selected.intent || '—' },
                    { label: 'Financiamiento', value: selected.financing || '—' },
                    { label: 'Timeline', value: (selected.timeline && TIMELINE_LABELS[selected.timeline]) || selected.timeline || '—' },
                    { label: 'Presupuesto', value: selected.budget_usd ? `USD ${Number(selected.budget_usd).toLocaleString('es-AR')}` : '—' },
                    { label: 'Ambientes', value: selected.bedrooms ? `${selected.bedrooms} amb.` : '—' },
                    { label: 'Zona preferida', value: selected.location_pref || '—' },
                    { label: 'Fuente', value: selected.source || '—' },
                  ].map(({ label, value }, i) => (
                    <div key={label}>
                      <div className="flex justify-between py-3">
                        <span className="text-gray-500 text-sm">{label}</span>
                        <span className="text-gray-900 text-sm font-medium text-right max-w-[55%] break-words">{value}</span>
                      </div>
                      {i < 7 && <Separator className="bg-gray-100" />}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => { setReservationLead(selected); setSelected(null); }}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
              >
                <ClipboardList size={15} />
                Reservar unidad
              </button>

              <a
                href={`https://wa.me/${selected.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
              >
                <Phone size={15} />
                Contactar por WhatsApp
              </a>

              <Separator className="bg-gray-100" />

              {/* Notes section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <StickyNote size={14} className="text-gray-400" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notas del equipo</p>
                  {notes.length > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                      {notes.length}
                    </span>
                  )}
                </div>

                {/* Add note */}
                <div className="flex gap-2 mb-4">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Agregar una nota..."
                    rows={2}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAddNote();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || addingNote}
                    className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-40 self-end"
                  >
                    {addingNote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>

                {/* Notes list */}
                {loadingNotes ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl bg-gray-100" />)}
                  </div>
                ) : notes.length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-4">Sin notas todavía</p>
                ) : (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 group relative">
                        <p className="text-sm text-gray-800 leading-relaxed pr-6">{note.note}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {note.author_name && (
                            <span className="text-[10px] text-gray-400 font-medium">{note.author_name}</span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {new Date(note.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })}
                            {' '}
                            {new Date(note.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="absolute top-2 right-2 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
