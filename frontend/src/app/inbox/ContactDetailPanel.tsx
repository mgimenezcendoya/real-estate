'use client';

import { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X, PanelRightClose, Tag, StickyNote, Info } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Lead } from '@/lib/api';
import { toast } from 'sonner';

const PREDEFINED_TAGS = ['urgente', 'seguimiento', 'reclamo', 'pre-aprobado', 'primer contacto', 'sin respuesta'];

const SCORE_CONFIG = {
  hot: {
    label: 'Hot',
    ring: 'ring-2 ring-red-200',
    avatarBg: 'bg-gradient-to-br from-red-400 to-red-600',
    badge: 'bg-red-50 text-red-600 border border-red-200',
  },
  warm: {
    label: 'Warm',
    ring: 'ring-2 ring-amber-200',
    avatarBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  cold: {
    label: 'Frío',
    ring: 'ring-2 ring-blue-200',
    avatarBg: 'bg-gradient-to-br from-blue-400 to-blue-600',
    badge: 'bg-blue-50 text-blue-600 border border-blue-200',
  },
};

interface ContactDetailPanelProps {
  lead: Lead;
  handoffActive: boolean;
  onClose: () => void;
}

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-3.5 bg-primary rounded-full" />
      <Icon size={11} className="text-primary/70" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

export function ContactDetailPanel({ lead, handoffActive, onClose }: ContactDetailPanelProps) {
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [notes, setNotes] = useState<string>(lead.internal_notes ?? '');
  const [tagInput, setTagInput] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedNotesRef = useRef<string>(lead.internal_notes ?? '');

  useEffect(() => {
    setTags(lead.tags ?? []);
    setNotes(lead.internal_notes ?? '');
    savedNotesRef.current = lead.internal_notes ?? '';
    setEditingNotes(false);
  }, [lead.id]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const saveTags = (newTags: string[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await api.patchLeadDetails(lead.id, { tags: newTags });
      } catch {
        toast.error('Error al guardar etiquetas');
      }
    }, 800);
  };

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || tags.includes(normalized)) return;
    const newTags = [...tags, normalized];
    setTags(newTags);
    saveTags(newTags);
  };

  const removeTag = (tag: string) => {
    const newTags = tags.filter(t => t !== tag);
    setTags(newTags);
    saveTags(newTags);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.patchLeadDetails(lead.id, { internal_notes: notes });
      savedNotesRef.current = notes;
      setEditingNotes(false);
      toast.success('Notas guardadas');
    } catch {
      toast.error('Error al guardar notas');
    } finally {
      setSavingNotes(false);
    }
  };

  const initials = (lead.name || lead.phone || '?')
    .split(' ')
    .map((w: string) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const formattedDate = new Date(lead.created_at).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const suggestedTags = PREDEFINED_TAGS.filter(t => !tags.includes(t));
  const scoreConf = lead.score ? SCORE_CONFIG[lead.score] : null;

  return (
    <div className="flex flex-col h-full border-l border-border bg-background overflow-y-auto">

      {/* ── Hero header ── */}
      <div className="relative bg-gradient-to-b from-accent/50 via-accent/20 to-background px-4 pt-3 pb-6">
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            aria-label="Cerrar panel"
            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors"
          >
            <PanelRightClose size={15} />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className={cn(
            'rounded-full p-0.5',
            scoreConf?.ring ? '' : 'ring-2 ring-border ring-offset-1 ring-offset-background'
          )}>
            <Avatar className={cn(
              'h-16 w-16 shadow-md',
              scoreConf?.ring && 'ring-2 ring-offset-2 ring-offset-background',
              scoreConf?.ring
            )}>
              <AvatarFallback className={cn(
                'text-white font-display font-semibold text-xl tracking-wide shadow-inner',
                scoreConf?.avatarBg ?? 'bg-gradient-to-br from-primary to-primary/80'
              )}>
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="text-center space-y-1">
            <p className="font-display font-semibold text-foreground text-[15px] leading-snug tracking-tight">
              {lead.name || 'Sin nombre'}
            </p>
            <p className="text-[11px] text-muted-foreground tabular tracking-wider font-mono">
              {lead.phone}
            </p>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {scoreConf && (
              <span className={cn('inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full tracking-wide', scoreConf.badge)}>
                {scoreConf.label}
              </span>
            )}
            <span className={cn(
              'inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-full border',
              handoffActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-secondary text-muted-foreground border-border'
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full mr-1.5 shrink-0',
                handoffActive ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
              )} />
              {handoffActive ? 'Humano activo' : 'Bot activo'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Datos del contacto ── */}
      <div className="px-4 pt-4 pb-5 border-t border-border/50">
        <SectionLabel icon={Info}>Datos del Contacto</SectionLabel>

        <dl className="space-y-1">
          {lead.project_name && (
            <div className="flex justify-between items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors">
              <dt className="text-xs text-muted-foreground shrink-0">Proyecto</dt>
              <dd className="text-xs text-foreground font-medium text-right truncate max-w-[140px]">
                {lead.project_name}
              </dd>
            </div>
          )}
          <div className="flex justify-between items-center py-1.5 px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors">
            <dt className="text-xs text-muted-foreground">Creado</dt>
            <dd className="text-xs text-foreground tabular">{formattedDate}</dd>
          </div>
          <div className="flex justify-between items-center py-1.5 px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors">
            <dt className="text-xs text-muted-foreground">Handoff</dt>
            <dd className={cn(
              'text-xs font-medium',
              handoffActive ? 'text-emerald-600' : 'text-muted-foreground/60'
            )}>
              {handoffActive ? 'Activo' : 'Inactivo'}
            </dd>
          </div>
        </dl>
      </div>

      {/* ── Etiquetas ── */}
      <div className="px-4 pt-4 pb-5 border-t border-border/50">
        <SectionLabel icon={Tag}>Etiquetas</SectionLabel>

        {/* Tags activos */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium px-2.5 py-0.5 rounded-full"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  aria-label={`Eliminar etiqueta ${tag}`}
                  className="text-primary/40 hover:text-primary transition-colors ml-0.5"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input con placeholder dinámico */}
        <input
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder={tags.length === 0 ? 'Agregar primera etiqueta...' : 'Agregar etiqueta...'}
          className="w-full text-xs px-3 py-2 rounded-lg border border-input bg-secondary/40 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background focus:border-primary/30 transition-all"
        />

        {/* Sugeridas */}
        {suggestedTags.length > 0 && (
          <div className="mt-2.5">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1.5">Sugeridas</p>
            <div className="flex flex-wrap gap-1">
              {suggestedTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="text-[11px] text-muted-foreground hover:text-primary border border-dashed border-border/70 hover:border-primary/30 hover:bg-primary/5 px-2 py-0.5 rounded-full transition-all"
                >
                  +{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Notas internas ── */}
      <div className="px-4 pt-4 pb-8 border-t border-border/50 flex-1">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel icon={StickyNote}>Notas Internas</SectionLabel>
          {!editingNotes && notes && (
            <button
              onClick={() => setEditingNotes(true)}
              aria-label="Editar notas"
              className="p-1.5 -mt-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={5}
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-input bg-secondary/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background focus:border-primary/30 resize-none transition-all leading-relaxed"
              placeholder="Notas internas sobre este contacto..."
              autoFocus
            />
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={() => { setNotes(savedNotesRef.current); setEditingNotes(false); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5 font-medium shadow-sm"
              >
                <Check size={11} />
                {savingNotes ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : notes ? (
          <button
            onClick={() => setEditingNotes(true)}
            className="w-full text-left group"
            aria-label="Editar nota"
          >
            <div className="border-l-2 border-primary/25 pl-3 group-hover:border-primary/50 transition-colors">
              <p className="text-xs text-foreground/75 leading-relaxed whitespace-pre-wrap group-hover:text-foreground/90 transition-colors">
                {notes}
              </p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="w-full text-left border border-dashed border-border hover:border-primary/30 rounded-lg px-3 py-3 transition-all hover:bg-primary/5 group"
          >
            <div className="flex items-center gap-2 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
              <Pencil size={12} />
              <span className="text-xs italic">Agregar notas internas...</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
