'use client';

import { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X, PanelRightClose } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Lead } from '@/lib/api';
import { toast } from 'sonner';

const PREDEFINED_TAGS = ['urgente', 'seguimiento', 'reclamo', 'pre-aprobado', 'primer contacto', 'sin respuesta'];

const SCORE_CONFIG = {
  hot: { label: 'Hot', className: 'bg-red-100 text-red-700 border-red-200' },
  warm: { label: 'Warm', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  cold: { label: 'Cold', className: 'bg-blue-100 text-blue-700 border-blue-200' },
};

interface ContactDetailPanelProps {
  lead: Lead;
  handoffActive: boolean;
  onClose: () => void;
}

export function ContactDetailPanel({ lead, handoffActive, onClose }: ContactDetailPanelProps) {
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [notes, setNotes] = useState<string>(lead.internal_notes ?? '');
  const [tagInput, setTagInput] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when lead changes
  useEffect(() => {
    setTags(lead.tags ?? []);
    setNotes(lead.internal_notes ?? '');
    setEditingNotes(false);
  }, [lead.id]);

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
      setEditingNotes(false);
      toast.success('Notas guardadas');
    } catch {
      toast.error('Error al guardar notas');
    } finally {
      setSavingNotes(false);
    }
  };

  const initials = (lead.name || lead.phone)
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const formattedDate = new Date(lead.created_at).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const suggestedTags = PREDEFINED_TAGS.filter(t => !tags.includes(t));

  return (
    <div className="flex flex-col h-full border-l border-border bg-background overflow-y-auto">
      {/* Header con botón cerrar */}
      <div className="flex items-center justify-end px-4 pt-4 pb-2">
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Cerrar panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Avatar + nombre */}
      <div className="flex flex-col items-center gap-2 px-4 pb-5">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="font-semibold text-foreground text-sm leading-tight">
            {lead.name || 'Sin nombre'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{lead.phone}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {lead.score && (
            <Badge variant="outline" className={cn('text-xs', SCORE_CONFIG[lead.score]?.className)}>
              {SCORE_CONFIG[lead.score]?.label}
            </Badge>
          )}
          <Badge variant="outline" className={cn(
            'text-xs',
            handoffActive
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
          )}>
            {handoffActive ? 'Humano activo' : 'Bot activo'}
          </Badge>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Datos del contacto */}
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Datos del Contacto
        </p>
        <dl className="space-y-2">
          {lead.project_name && (
            <div className="flex justify-between items-center">
              <dt className="text-xs text-muted-foreground">Proyecto</dt>
              <dd className="text-xs text-foreground font-medium truncate max-w-[140px]">{lead.project_name}</dd>
            </div>
          )}
          <div className="flex justify-between items-center">
            <dt className="text-xs text-muted-foreground">Creado</dt>
            <dd className="text-xs text-foreground tabular">{formattedDate}</dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-xs text-muted-foreground">Handoff</dt>
            <dd className={cn('text-xs font-medium', handoffActive ? 'text-green-600' : 'text-muted-foreground')}>
              {handoffActive ? 'Activo' : 'Inactivo'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-border" />

      {/* Etiquetas */}
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Etiquetas
        </p>

        {/* Tags activos */}
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground italic mb-2">Sin etiquetas</p>
        ) : (
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 glass-pill text-xs text-foreground px-2 py-0.5 rounded-full"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Input nueva etiqueta */}
        <input
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Agregar etiqueta..."
          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />

        {/* Sugeridas */}
        {suggestedTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {suggestedTags.map(tag => (
              <button
                key={tag}
                onClick={() => addTag(tag)}
                className="text-xs text-primary hover:text-primary/80 glass-pill px-2 py-0.5 rounded-full transition-colors"
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Notas internas */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notas Internas
          </p>
          {!editingNotes && (
            <button
              onClick={() => setEditingNotes(true)}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>

        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              className="w-full text-xs px-2.5 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-colors"
              placeholder="Agregar notas internas..."
              autoFocus
            />
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={() => { setNotes(lead.internal_notes ?? ''); setEditingNotes(false); }}
                className="text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <Check size={11} />
                {savingNotes ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <p className={cn('text-xs', notes ? 'text-foreground' : 'text-muted-foreground italic')}>
            {notes || 'Sin notas. Hace click en el lápiz para agregar.'}
          </p>
        )}
      </div>
    </div>
  );
}
