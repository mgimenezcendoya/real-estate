'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Upload, X, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface Result {
  ok?: boolean;
  project_name?: string;
  units_created?: number;
  project_id?: string;
  error?: string;
  errors?: string[];
  message?: string;
  summary?: string;
}

interface Props {
  open: boolean;
  developerId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewProjectModal({ open, developerId, onClose, onCreated }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<UploadState>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setState('idle');
    setResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFile = useCallback((f: File | undefined) => {
    if (!f) return;
    const valid = f.name.endsWith('.csv') || f.type === 'text/csv' || f.type === 'application/vnd.ms-excel';
    if (!valid) {
      setResult({ ok: false, error: 'Solo se aceptan archivos CSV.' });
      setState('error');
      return;
    }
    setFile(f);
    setState('idle');
    setResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setState('uploading');
    setResult(null);
    try {
      const res = await api.loadProject(file, developerId);
      setResult(res);
      if (res.ok) {
        setState('success');
        setTimeout(() => {
          onCreated();
          handleClose();
        }, 2000);
      } else {
        setState('error');
      }
    } catch {
      setResult({ ok: false, error: 'Error de conexión con el servidor.' });
      setState('error');
    }
  }, [file, developerId, onCreated, handleClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg glass-elevated rounded-3xl p-8 animate-fade-in-up shadow-2xl">
        {/* Close */}
        <button onClick={handleClose} className="absolute top-5 right-5 text-[#94A3B8] hover:text-white transition-colors">
          <X size={20} />
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center mb-4">
            <FileSpreadsheet size={22} className="text-indigo-400" />
          </div>
          <h2 className="text-2xl font-display font-semibold text-white">Nuevo Proyecto</h2>
          <p className="text-[#94A3B8] text-sm mt-1">
            Subí el CSV con los datos del proyecto y sus unidades.
          </p>
        </div>

        {/* Download template */}
        <a
          href={api.getTemplateUrl()}
          download="proyecto_template.csv"
          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors mb-6 group"
        >
          <Download size={16} className="group-hover:-translate-y-0.5 transition-transform" />
          Descargar template CSV
        </a>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200
            ${dragOver
              ? 'border-indigo-400 bg-indigo-500/10'
              : file
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-[rgba(255,255,255,0.1)] hover:border-indigo-500/30 hover:bg-white/[0.02]'
            }
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {file ? (
            <>
              <FileSpreadsheet size={28} className="text-emerald-400" />
              <div className="text-center">
                <p className="text-white font-medium text-sm">{file.name}</p>
                <p className="text-[#94A3B8] text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); reset(); }}
                className="text-xs text-[#94A3B8] hover:text-red-400 transition-colors"
              >
                Cambiar archivo
              </button>
            </>
          ) : (
            <>
              <Upload size={28} className="text-[#94A3B8]" />
              <div className="text-center">
                <p className="text-white text-sm font-medium">Arrastrá tu CSV acá</p>
                <p className="text-[#94A3B8] text-xs mt-1">o hacé click para seleccionar</p>
              </div>
            </>
          )}
        </div>

        {/* Result messages */}
        {state === 'success' && result && (
          <div className="flex items-start gap-3 mt-5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-emerald-300 font-medium">Proyecto creado</p>
              <p className="text-emerald-200/70 mt-0.5">
                {result.project_name} — {result.units_created} unidades cargadas.
              </p>
            </div>
          </div>
        )}

        {state === 'error' && result && (
          <div className="flex items-start gap-3 mt-5 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-red-300 font-medium">{result.message || result.error || 'Error al cargar'}</p>
              {result.errors && result.errors.length > 0 && (
                <ul className="text-red-200/70 mt-1.5 list-disc list-inside space-y-0.5">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-8">
          <button
            onClick={handleClose}
            className="flex-1 px-5 py-3 rounded-xl text-sm font-medium text-[#94A3B8] hover:text-white glass hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || state === 'uploading' || state === 'success'}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-indigo-500 disabled:hover:to-indigo-600"
          >
            {state === 'uploading' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Cargando...
              </>
            ) : (
              <>
                <Upload size={16} />
                Crear Proyecto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
