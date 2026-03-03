'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ObraData, ObraEtapa, ObraUpdate, Buyer, Unit } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  HardHat, CheckCircle2, Circle, Clock, Plus, Trash2, Send,
  Users, ChevronDown, ChevronUp, Settings2, Image as ImageIcon,
  Loader2, X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

// ─── helpers ──────────────────────────────────────────────────────────────────

function calcProgress(etapas: ObraEtapa[]): number {
  const active = etapas.filter((e) => e.activa);
  const totalWeight = active.reduce((s, e) => s + Number(e.peso_pct), 0);
  if (!totalWeight) return 0;
  const weighted = active.reduce((s, e) => s + Number(e.peso_pct) * e.porcentaje_completado / 100, 0);
  return Math.round(weighted / totalWeight * 100);
}

function etapaStatus(e: ObraEtapa): 'done' | 'active' | 'pending' {
  if (e.porcentaje_completado === 100) return 'done';
  if (e.porcentaje_completado > 0) return 'active';
  return 'pending';
}

function formatDate(iso: string) {
  return new Date(iso + (iso.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: '2-digit',
  });
}

// ─── EtapaCard ────────────────────────────────────────────────────────────────

function EtapaCard({
  etapa,
  onAddUpdate,
  onDeleteUpdate,
  onNotify,
  onEditEtapa,
}: {
  etapa: ObraEtapa;
  onAddUpdate: (etapa: ObraEtapa) => void;
  onDeleteUpdate: (updateId: string, etapaId: string) => void;
  onNotify: (updateId: string) => void;
  onEditEtapa: (etapa: ObraEtapa) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = etapaStatus(etapa);

  const statusIcon = status === 'done'
    ? <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
    : status === 'active'
    ? <Clock size={18} className="text-indigo-500 flex-shrink-0" />
    : <Circle size={18} className="text-gray-300 flex-shrink-0" />;

  const borderClass = status === 'done'
    ? 'border-emerald-200'
    : status === 'active'
    ? 'border-indigo-200'
    : 'border-gray-200';

  return (
    <div className={cn('bg-white border rounded-2xl overflow-hidden shadow-sm', borderClass, !etapa.activa && 'opacity-50')}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate">{etapa.nombre}</p>
            {!etapa.es_standard && (
              <Badge className="text-[10px] bg-gray-100 text-gray-500 border-gray-200">custom</Badge>
            )}
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500',
                  status === 'done' ? 'bg-emerald-500' : status === 'active' ? 'bg-indigo-500' : 'bg-gray-200'
                )}
                style={{ width: `${etapa.porcentaje_completado}%` }}
              />
            </div>
            <span className={cn('text-xs font-bold tabular-nums',
              status === 'done' ? 'text-emerald-600' : status === 'active' ? 'text-indigo-600' : 'text-gray-400'
            )}>
              {etapa.porcentaje_completado}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onEditEtapa(etapa)}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Configurar etapa"
          >
            <Settings2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => onAddUpdate(etapa)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold transition-colors border border-indigo-200"
          >
            <Plus size={12} />
            Update
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Updates list */}
      {expanded && (
        <div className="border-t border-gray-100">
          {etapa.updates.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">Sin updates todavía</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {etapa.updates.map((upd) => (
                <UpdateItem
                  key={upd.id}
                  update={upd}
                  onDelete={() => onDeleteUpdate(upd.id, etapa.id)}
                  onNotify={() => onNotify(upd.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── UpdateItem ───────────────────────────────────────────────────────────────

function UpdateItem({ update, onDelete, onNotify }: {
  update: ObraUpdate;
  onDelete: () => void;
  onNotify: () => void;
}) {
  const [notifying, setNotifying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const scopeLabel: Record<string, string> = { general: 'General', unit: `Unidad ${update.unit_identifier}`, floor: `Piso ${update.floor}` };

  return (
    <div className="px-5 py-3 group hover:bg-gray-50/50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Fotos thumbnails */}
        {update.fotos.length > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {update.fotos.slice(0, 3).map((f) => (
              <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={f.file_url}
                  alt={f.filename}
                  className="w-12 h-12 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                />
              </a>
            ))}
            {update.fotos.length > 3 && (
              <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-semibold">
                +{update.fotos.length - 3}
              </div>
            )}
          </div>
        )}
        {update.fotos.length === 0 && (
          <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
            <ImageIcon size={14} className="text-gray-400" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {update.nota_publica && (
            <p className="text-sm text-gray-700 leading-snug">{update.nota_publica}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] text-gray-400">{formatDate(update.fecha)}</span>
            {update.scope !== 'general' && (
              <Badge className="text-[10px] bg-gray-100 text-gray-500 border-gray-200 px-1.5 py-0">
                {scopeLabel[update.scope] || update.scope}
              </Badge>
            )}
            {update.enviado && (
              <Badge className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200 px-1.5 py-0">
                ✓ Notificado
              </Badge>
            )}
          </div>
          {update.nota_interna && (
            <p className="text-[11px] text-amber-600 mt-1 italic">Interno: {update.nota_interna}</p>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {!update.enviado && (
            <button
              type="button"
              onClick={async () => {
                setNotifying(true);
                await onNotify();
                setNotifying(false);
              }}
              className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Notificar compradores"
            >
              {notifying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              setDeleting(true);
              await onDelete();
              setDeleting(false);
            }}
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Eliminar update"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AddUpdateSheet ───────────────────────────────────────────────────────────

function AddUpdateSheet({
  open,
  onClose,
  etapas,
  defaultEtapaId,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  etapas: ObraEtapa[];
  defaultEtapaId: string | null;
  onSave: (formData: FormData, etapaId: string, pct: number) => Promise<void>;
}) {
  const [etapaId, setEtapaId] = useState(defaultEtapaId || '');
  const [pct, setPct] = useState(0);
  const [notaPublica, setNotaPublica] = useState('');
  const [notaInterna, setNotaInterna] = useState('');
  const [scope, setScope] = useState<'general' | 'unit' | 'floor'>('general');
  const [unitId, setUnitId] = useState('');
  const [floorNum, setFloorNum] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setEtapaId(defaultEtapaId || etapas[0]?.id || '');
      const current = etapas.find((e) => e.id === (defaultEtapaId || etapas[0]?.id));
      setPct(current?.porcentaje_completado ?? 0);
      setNotaPublica('');
      setNotaInterna('');
      setScope('general');
      setUnitId('');
      setFloorNum('');
      setFiles([]);
    }
  }, [open, defaultEtapaId, etapas]);

  useEffect(() => {
    if (etapaId) {
      const current = etapas.find((e) => e.id === etapaId);
      if (current) setPct(current.porcentaje_completado);
    }
  }, [etapaId, etapas]);

  const handleSubmit = async () => {
    if (!etapaId) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('etapa_id', etapaId);
      fd.append('porcentaje_etapa', String(pct));
      fd.append('nota_publica', notaPublica);
      if (notaInterna) fd.append('nota_interna', notaInterna);
      fd.append('scope', scope);
      if (scope === 'unit' && unitId) fd.append('unit_identifier', unitId);
      if (scope === 'floor' && floorNum) fd.append('floor_num', floorNum);
      for (const f of files) fd.append('fotos', f);
      await onSave(fd, etapaId, pct);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const activeEtapas = etapas.filter((e) => e.activa);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col bg-white border-l border-gray-200">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <SheetTitle className="text-gray-900 font-bold">Agregar update de obra</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* Etapa selector */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Etapa</label>
            <select
              value={etapaId}
              onChange={(e) => setEtapaId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 bg-white"
            >
              {activeEtapas.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>

          {/* Porcentaje slider */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">% completado de esta etapa</label>
              <span className="text-sm font-bold text-indigo-600 tabular-nums">{pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          <Separator className="bg-gray-100" />

          {/* Scope */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Alcance de las fotos</label>
            <div className="flex gap-2">
              {(['general', 'unit', 'floor'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all',
                    scope === s ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  )}
                >
                  {s === 'general' ? 'General' : s === 'unit' ? 'Unidad' : 'Piso'}
                </button>
              ))}
            </div>
            {scope === 'unit' && (
              <input
                type="text"
                placeholder="Ej: 4B"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
              />
            )}
            {scope === 'floor' && (
              <input
                type="number"
                placeholder="Número de piso"
                value={floorNum}
                onChange={(e) => setFloorNum(e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
              />
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Nota pública (para compradores)</label>
            <textarea
              value={notaPublica}
              onChange={(e) => setNotaPublica(e.target.value)}
              placeholder="Ej: Se completó la losa del piso 5..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Nota interna (solo panel)</label>
            <textarea
              value={notaInterna}
              onChange={(e) => setNotaInterna(e.target.value)}
              placeholder="Observaciones internas del equipo..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 resize-none"
            />
          </div>

          {/* Fotos */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Fotos</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors flex flex-col items-center gap-2"
            >
              <ImageIcon size={20} />
              {files.length > 0 ? `${files.length} foto${files.length > 1 ? 's' : ''} seleccionada${files.length > 1 ? 's' : ''}` : 'Subir fotos de obra'}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            {files.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {files.map((f, i) => (
                  <div key={i} className="relative">
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] leading-none"
                    >
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!etapaId || saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            Guardar update
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── EditEtapaDialog ──────────────────────────────────────────────────────────

function EditEtapaDialog({
  etapa,
  onClose,
  onSave,
}: {
  etapa: ObraEtapa | null;
  onClose: () => void;
  onSave: (id: string, data: { nombre: string; activa: boolean }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [activa, setActiva] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (etapa) {
      setNombre(etapa.nombre);
      setActiva(etapa.activa);
    }
  }, [etapa]);

  const handleSave = async () => {
    if (!etapa) return;
    setSaving(true);
    try {
      await onSave(etapa.id, { nombre, activa });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!etapa} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm bg-white border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Configurar etapa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Nombre</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Etapa activa</label>
            <button
              type="button"
              onClick={() => setActiva((v) => !v)}
              className={cn('relative w-10 h-5 rounded-full transition-colors', activa ? 'bg-indigo-600' : 'bg-gray-200')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', activa ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar
            </button>
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PesosSheet ───────────────────────────────────────────────────────────────

function PesosSheet({
  open,
  onClose,
  etapas,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  etapas: ObraEtapa[];
  onSave: (pesos: Array<{ id: string; peso_pct: number }>) => Promise<void>;
}) {
  const [pesos, setPesos] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const initial: Record<string, number> = {};
      for (const e of etapas) initial[e.id] = Number(e.peso_pct);
      setPesos(initial);
    }
  }, [open, etapas]);

  const total = Object.values(pesos).reduce((s, v) => s + v, 0);
  const totalOk = Math.round(total) === 100;
  const diff = Math.round(total) - 100;

  const set = (id: string, val: number) =>
    setPesos((prev) => ({ ...prev, [id]: Math.min(100, Math.max(0, val)) }));

  const handleSave = async () => {
    if (!totalOk) return;
    setSaving(true);
    try {
      await onSave(etapas.map((e) => ({ id: e.id, peso_pct: pesos[e.id] ?? Number(e.peso_pct) })));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[440px] p-0 flex flex-col bg-white border-l border-gray-200">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <SheetTitle className="text-gray-900 font-bold">Distribución de pesos</SheetTitle>
          <p className="text-sm text-gray-500 mt-0.5">La suma debe ser exactamente 100%.</p>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {etapas.map((etapa) => {
            const val = pesos[etapa.id] ?? Number(etapa.peso_pct);
            return (
              <div key={etapa.id} className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900 flex-1 truncate">{etapa.nombre}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={val}
                      onChange={(e) => set(etapa.id, Number(e.target.value) || 0)}
                      className="w-14 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                    />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={val}
                  onChange={(e) => set(etapa.id, Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            );
          })}
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-gray-100 space-y-3">
          <div className={cn(
            'flex items-center justify-between px-4 py-3 rounded-xl border font-semibold',
            totalOk ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
          )}>
            <span className="text-sm">Total</span>
            <span className="text-lg tabular-nums">
              {Math.round(total)}%
              {!totalOk && (
                <span className="text-sm font-normal ml-2">
                  {diff > 0 ? `(sobran ${diff}%)` : `(faltan ${-diff}%)`}
                </span>
              )}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !totalOk}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar pesos
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── BuyerModal ───────────────────────────────────────────────────────────────

function BuyerModal({
  open,
  onClose,
  soldUnits,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  soldUnits: Unit[];
  onSave: (data: { unit_id: string; name: string; phone: string; signed_at: string }) => Promise<void>;
}) {
  const [unitId, setUnitId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUnitId(soldUnits[0]?.id || '');
      setName('');
      setPhone('');
      setSignedAt(new Date().toISOString().slice(0, 10));
    }
  }, [open, soldUnits]);

  const handleSave = async () => {
    if (!unitId || !name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      await onSave({ unit_id: unitId, name: name.trim(), phone: phone.trim(), signed_at: signedAt });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm bg-white border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Registrar comprador</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Unidad vendida</label>
            {soldUnits.length === 0 ? (
              <p className="text-sm text-gray-400">No hay unidades vendidas todavía</p>
            ) : (
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
              >
                {soldUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.identifier} — Piso {u.floor}, {u.bedrooms} amb.
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan García"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+54 11 1234-5678"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Fecha de firma</label>
            <input
              type="date"
              value={signedAt}
              onChange={(e) => setSignedAt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !unitId || !name.trim() || !phone.trim()}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Registrar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ObraPage() {
  const { id } = useParams<{ id: string }>();
  const [obra, setObra] = useState<ObraData | null>(null);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [initing, setIniting] = useState(false);

  // Sheets / dialogs
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);
  const [activeEtapaId, setActiveEtapaId] = useState<string | null>(null);
  const [editingEtapa, setEditingEtapa] = useState<ObraEtapa | null>(null);
  const [pesosSheetOpen, setPesosSheetOpen] = useState(false);
  const [buyerModalOpen, setBuyerModalOpen] = useState(false);
  const [addingEtapa, setAddingEtapa] = useState(false);

  const load = async () => {
    if (!id) return;
    const [obraData, buyerData, unitData] = await Promise.all([
      api.getObra(id).catch(() => null),
      api.getBuyers(id).catch(() => []),
      api.getUnits(id).catch(() => []),
    ]);
    if (obraData) setObra(obraData);
    setBuyers(buyerData as Buyer[]);
    setUnits(unitData as Unit[]);
  };

  useEffect(() => {
    if (!id) return;
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleInit = async () => {
    if (!id) return;
    setIniting(true);
    try {
      await api.initObra(id);
      await load();
      toast.success('Etapas de obra inicializadas');
    } catch {
      toast.error('No se pudo inicializar');
    } finally {
      setIniting(false);
    }
  };

  const handleAddUpdate = (etapa: ObraEtapa) => {
    setActiveEtapaId(etapa.id);
    setUpdateSheetOpen(true);
  };

  const handleSaveUpdate = async (formData: FormData, etapaId: string, pct: number) => {
    if (!id) return;
    await api.createObraUpdate(id, formData);
    // Optimistic update on etapa %
    setObra((prev) => {
      if (!prev) return prev;
      const etapas = prev.etapas.map((e) =>
        e.id === etapaId ? { ...e, porcentaje_completado: pct } : e
      );
      return { etapas, progress: calcProgress(etapas) };
    });
    await load();
    toast.success('Update guardado');
  };

  const handleDeleteUpdate = async (updateId: string, etapaId: string) => {
    try {
      await api.deleteObraUpdate(updateId);
      setObra((prev) => {
        if (!prev) return prev;
        const etapas = prev.etapas.map((e) =>
          e.id === etapaId ? { ...e, updates: e.updates.filter((u) => u.id !== updateId) } : e
        );
        return { ...prev, etapas };
      });
      toast.success('Update eliminado');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const handleNotify = async (updateId: string) => {
    if (!id) return;
    try {
      const res = await api.notifyBuyers(id, updateId);
      toast.success(`Notificación enviada a ${res.sent} comprador${res.sent !== 1 ? 'es' : ''}`);
      await load();
    } catch {
      toast.error('Error al notificar');
    }
  };

  const handleEditEtapa = async (etapaId: string, data: { nombre: string; activa: boolean }) => {
    await api.patchEtapa(etapaId, data);
    setObra((prev) => {
      if (!prev) return prev;
      const etapas = prev.etapas.map((e) => e.id === etapaId ? { ...e, ...data } : e);
      return { etapas, progress: calcProgress(etapas) };
    });
    toast.success('Etapa actualizada');
  };

  const handleUpdatePesos = async (pesos: Array<{ id: string; peso_pct: number }>) => {
    await api.updatePesos(id, pesos);
    setObra((prev) => {
      if (!prev) return prev;
      const etapas = prev.etapas.map((e) => {
        const p = pesos.find((x) => x.id === e.id);
        return p ? { ...e, peso_pct: p.peso_pct } : e;
      });
      return { etapas, progress: calcProgress(etapas) };
    });
    toast.success('Pesos actualizados');
  };

  const handleAddEtapa = async () => {
    if (!id) return;
    setAddingEtapa(true);
    try {
      const nombre = prompt('Nombre de la nueva etapa:');
      if (!nombre?.trim()) return;
      const newEtapa = await api.addEtapa(id, { nombre: nombre.trim(), peso_pct: 0 }) as ObraEtapa;
      setObra((prev) => prev ? { ...prev, etapas: [...prev.etapas, { ...newEtapa, updates: [] }] } : prev);
      toast.success(`Etapa "${nombre}" agregada`);
    } catch {
      toast.error('No se pudo agregar la etapa');
    } finally {
      setAddingEtapa(false);
    }
  };

  const handleRegisterBuyer = async (data: { unit_id: string; name: string; phone: string; signed_at: string }) => {
    if (!id) return;
    const res = await api.registerBuyer(id, data) as { id?: string; error?: string };
    if (res.error) { toast.error(res.error); return; }
    await load();
    toast.success(`Comprador ${data.name} registrado`);
  };

  const soldUnits = units.filter((u) => u.status === 'sold');
  const progress = obra ? calcProgress(obra.etapas) : 0;

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-20 w-full rounded-2xl bg-gray-100" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl bg-gray-100" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <HardHat size={18} className="text-indigo-600" />
            <h2 className="text-base font-bold text-gray-900">Seguimiento de obra</h2>
          </div>
          <div className="flex items-center gap-3">
            {obra && obra.etapas.length > 0 && (
              <button
                type="button"
                onClick={() => setPesosSheetOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 text-xs font-medium transition-colors"
              >
                <Settings2 size={13} />
                Pesos
              </button>
            )}
            <span className="text-2xl font-bold text-gray-900 tabular-nums">{progress}%</span>
          </div>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">Avance general del proyecto</span>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Completado</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />En progreso</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />Pendiente</span>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {(!obra || obra.etapas.length === 0) && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mb-4">
            <HardHat size={28} className="text-indigo-600" />
          </div>
          <p className="text-gray-900 font-semibold mb-2">Obra sin etapas</p>
          <p className="text-gray-500 text-sm max-w-xs mb-6">
            Inicializá las 8 etapas estándar de construcción para empezar a registrar el avance.
          </p>
          <button
            type="button"
            onClick={handleInit}
            disabled={initing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {initing ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Iniciar etapas de obra
          </button>
        </div>
      )}

      {obra && obra.etapas.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Timeline */}
          <div className="space-y-3">
            {obra.etapas.map((etapa) => (
              <EtapaCard
                key={etapa.id}
                etapa={etapa}
                onAddUpdate={handleAddUpdate}
                onDeleteUpdate={handleDeleteUpdate}
                onNotify={handleNotify}
                onEditEtapa={setEditingEtapa}
              />
            ))}
            <button
              type="button"
              onClick={handleAddEtapa}
              disabled={addingEtapa}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {addingEtapa ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Agregar etapa personalizada
            </button>
          </div>

          {/* Buyers panel */}
          <div className="space-y-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-900">Compradores</h3>
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold">
                    {buyers.length}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setBuyerModalOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold transition-colors border border-indigo-200"
                >
                  <Plus size={11} />
                  Registrar
                </button>
              </div>

              {buyers.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">
                  Sin compradores registrados
                </p>
              ) : (
                <div className="space-y-3">
                  {buyers.map((b) => (
                    <div key={b.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-indigo-700 text-xs font-bold">
                          {(b.name || 'C').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{b.name || 'Sin nombre'}</p>
                        <p className="text-xs text-gray-500">
                          Unidad {b.unit_identifier} · P{b.unit_floor}
                        </p>
                        {b.signed_at && (
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Firmó {formatDate(b.signed_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddUpdateSheet
        open={updateSheetOpen}
        onClose={() => setUpdateSheetOpen(false)}
        etapas={obra?.etapas ?? []}
        defaultEtapaId={activeEtapaId}
        onSave={handleSaveUpdate}
      />

      <EditEtapaDialog
        etapa={editingEtapa}
        onClose={() => setEditingEtapa(null)}
        onSave={handleEditEtapa}
      />

      <PesosSheet
        open={pesosSheetOpen}
        onClose={() => setPesosSheetOpen(false)}
        etapas={obra?.etapas ?? []}
        onSave={handleUpdatePesos}
      />

      <BuyerModal
        open={buyerModalOpen}
        onClose={() => setBuyerModalOpen(false)}
        soldUnits={soldUnits}
        onSave={handleRegisterBuyer}
      />
    </div>
  );
}
