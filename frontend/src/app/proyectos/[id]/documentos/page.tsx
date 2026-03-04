'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { api, Document } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FileText, Upload, ExternalLink, Calendar, Layers, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const DOC_TYPES = ['memoria', 'plano', 'reglamento', 'precios', 'faq', 'contrato', 'cronograma'];

const DOC_LABELS: Record<string, string> = {
  memoria: 'Memoria descriptiva',
  plano: 'Planos',
  reglamento: 'Reglamento',
  precios: 'Lista de precios',
  faq: 'FAQs',
  contrato: 'Contratos',
  cronograma: 'Cronograma',
};

export default function DocumentosPage() {
  const { id } = useParams<{ id: string }>();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const [uploadDocType, setUploadDocType] = useState(DOC_TYPES[0]);
  const [uploadUnit, setUploadUnit] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.getDocuments(id, filter || undefined)
      .then(setDocs)
      .catch(() => toast.error('No se pudieron cargar los documentos'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id, filter]);

  const grouped = docs.reduce<Record<string, Document[]>>((acc, d) => {
    (acc[d.doc_type] = acc[d.doc_type] || []).push(d);
    return acc;
  }, {});

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !id) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('project_id', id);
    fd.append('doc_type', uploadDocType);
    if (uploadUnit) fd.append('unit_identifier', uploadUnit);
    try {
      await api.uploadDocument(fd);
      toast.success(`"${uploadFile.name}" subido correctamente`);
      setShowUpload(false);
      setUploadFile(null);
      setUploadUnit('');
      load();
    } catch {
      toast.error('Error al subir el documento');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-gray-900 font-bold text-base">Documentos del proyecto</h2>
          <p className="text-xs text-gray-500 mt-0.5">{docs.length} documentos activos</p>
        </div>
        <Button
          onClick={() => setShowUpload(!showUpload)}
          className={cn(
            'gap-2 text-sm transition-all',
            showUpload
              ? 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              : 'bg-blue-700 hover:bg-blue-800 text-white border-0 shadow-sm'
          )}
          variant={showUpload ? 'outline' : 'default'}
        >
          {showUpload ? 'Cancelar' : (
            <>
              <Plus size={15} />
              Subir documento
            </>
          )}
        </Button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <form
          onSubmit={handleUpload}
          className="bg-white border border-blue-200 rounded-2xl p-5 mb-6 space-y-4 animate-fade-in-up shadow-sm"
        >
          <h3 className="text-gray-900 font-semibold text-sm">Nuevo documento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Tipo de documento</Label>
              <Select value={uploadDocType} onValueChange={setUploadDocType}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-900 focus:ring-blue-500 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 text-gray-900">
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="focus:bg-blue-50 focus:text-blue-800">
                      {DOC_LABELS[t] || t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Unidad (opcional)</Label>
              <Input
                type="text"
                placeholder="ej: 4B"
                value={uploadUnit}
                onChange={(e) => setUploadUnit(e.target.value)}
                className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus-visible:ring-blue-500 h-9"
              />
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); setUploadFile(e.dataTransfer.files[0] || null); }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors select-none',
              dragOver ? 'border-blue-500 bg-blue-50' :
              uploadFile ? 'border-blue-500 bg-blue-50' :
              'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
            )}
          >
            <input type="file" ref={fileRef} accept=".pdf" className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
            <Upload size={20} className={cn('mx-auto mb-2', uploadFile ? 'text-blue-700' : 'text-gray-400')} />
            <p className="text-sm text-gray-500">
              {uploadFile ? (
                <span className="text-gray-900 font-medium">{uploadFile.name}</span>
              ) : (
                'Arrastrá un PDF acá o hacé click para seleccionar'
              )}
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="submit"
              disabled={!uploadFile || uploading}
              className="bg-blue-700 hover:bg-blue-800 text-white border-0 gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Subir
                </>
              )}
            </Button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilter(null)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
            !filter
              ? 'bg-blue-700 text-white border-blue-700'
              : 'bg-white text-gray-500 hover:text-gray-900 border-gray-200 hover:border-gray-300'
          )}
        >
          Todos
        </button>
        {DOC_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
              filter === t
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-gray-500 hover:text-gray-900 border-gray-200 hover:border-gray-300'
            )}
          >
            {DOC_LABELS[t] || t}
          </button>
        ))}
      </div>

      {/* Docs list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
              <Skeleton className="w-8 h-8 rounded-lg bg-gray-200" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/2 bg-gray-200" />
                <Skeleton className="h-3 w-1/3 bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4">
            <FileText size={26} className="text-blue-700" />
          </div>
          <p className="text-gray-900 font-semibold mb-1">Sin documentos</p>
          <p className="text-gray-500 text-sm">Subí el primero con el botón de arriba.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {Object.entries(grouped).map(([type, typeDocs]) => (
            <section key={type}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                  {DOC_LABELS[type] || type}
                </h3>
                <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">
                  {typeDocs.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {typeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-blue-300 transition-colors shadow-sm"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-blue-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 text-sm font-medium truncate">{doc.filename}</p>
                      <div className="flex items-center flex-wrap gap-2 mt-0.5">
                        {doc.unit_identifier && (
                          <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">
                            Unidad {doc.unit_identifier}
                          </Badge>
                        )}
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Layers size={9} /> v{doc.version}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar size={9} /> {new Date(doc.uploaded_at).toLocaleDateString('es-AR')}
                        </span>
                      </div>
                    </div>
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-blue-700 transition-colors flex-shrink-0 p-1 rounded-lg hover:bg-gray-100"
                        title="Abrir documento"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
