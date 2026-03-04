'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Upload, FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  developerId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewProjectModal({ open, developerId, onClose, onCreated }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setUploading(false);
  }, []);

  const handleClose = useCallback(() => {
    if (uploading) return;
    reset();
    onClose();
  }, [uploading, reset, onClose]);

  const handleFile = useCallback((f: File | undefined) => {
    if (!f) return;
    const valid = f.name.endsWith('.csv') || f.type === 'text/csv' || f.type === 'application/vnd.ms-excel';
    if (!valid) {
      toast.error('Solo se aceptan archivos CSV');
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.loadProject(file, developerId);
      if (res.ok) {
        toast.success(`Proyecto "${res.project_name}" creado con ${res.units_created} unidades`);
        onCreated();
        handleClose();
      } else {
        const msg = res.message || res.error || 'Error al cargar el proyecto';
        toast.error(msg);
        if (res.errors?.length) {
          res.errors.forEach((e: string) => toast.error(e, { duration: 6000 }));
        }
      }
    } catch {
      toast.error('Error de conexión con el servidor');
    } finally {
      setUploading(false);
    }
  }, [file, developerId, onCreated, handleClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg bg-white border-gray-200">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-2">
            <FileSpreadsheet size={22} className="text-blue-700" />
          </div>
          <DialogTitle className="text-gray-900 font-display text-xl">Nuevo Proyecto</DialogTitle>
          <DialogDescription className="text-gray-500">
            Subí el CSV con los datos del proyecto y sus unidades.
          </DialogDescription>
        </DialogHeader>

        {/* Download template */}
        <a
          href={api.getTemplateUrl()}
          download="proyecto_template.csv"
          className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800 transition-colors group w-fit"
        >
          <Download size={15} className="group-hover:-translate-y-0.5 transition-transform" />
          Descargar template CSV
        </a>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 select-none
            ${dragOver
              ? 'border-blue-500 bg-blue-50'
              : file
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
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
              <FileSpreadsheet size={28} className="text-emerald-600" />
              <div className="text-center">
                <p className="text-gray-900 font-medium text-sm">{file.name}</p>
                <p className="text-gray-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-xs text-gray-400 hover:text-red-600 transition-colors"
              >
                Cambiar archivo
              </button>
            </>
          ) : (
            <>
              <Upload size={28} className="text-gray-400" />
              <div className="text-center">
                <p className="text-gray-900 text-sm font-medium">Arrastrá tu CSV acá</p>
                <p className="text-gray-400 text-xs mt-1">o hacé click para seleccionar</p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 border-gray-200 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="flex-1 bg-blue-700 hover:bg-blue-800 text-white border-0"
          >
            {uploading ? (
              <>
                <Loader2 size={15} className="animate-spin mr-2" />
                Cargando...
              </>
            ) : (
              <>
                <Upload size={15} className="mr-2" />
                Crear Proyecto
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
