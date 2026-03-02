'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { api, Document } from '@/lib/api';
import clsx from 'clsx';
import { FileText, Upload, ExternalLink, Calendar, Layers } from 'lucide-react';

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

    // Upload form state
    const [uploadDocType, setUploadDocType] = useState(DOC_TYPES[0]);
    const [uploadUnit, setUploadUnit] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = () => {
        if (!id) return;
        api.getDocuments(id, filter || undefined)
            .then(setDocs)
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
            setShowUpload(false);
            setUploadFile(null);
            load();
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-white font-bold text-base">Documentos del proyecto</h2>
                    <p className="text-xs text-[#8B91A8] mt-0.5">{docs.length} documentos activos</p>
                </div>
                <button
                    onClick={() => setShowUpload(!showUpload)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Upload size={15} /> Subir documento
                </button>
            </div>

            {/* Upload form */}
            {showUpload && (
                <form
                    onSubmit={handleUpload}
                    className="bg-[#11141D] border border-indigo-600/30 rounded-2xl p-5 mb-6 space-y-4"
                >
                    <h3 className="text-white font-semibold text-sm">Nuevo documento</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-[#8B91A8] mb-1 block">Tipo de documento</label>
                            <select
                                value={uploadDocType}
                                onChange={e => setUploadDocType(e.target.value)}
                                className="w-full bg-[#090B10] border border-[#1E2235] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                            >
                                {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_LABELS[t] || t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-[#8B91A8] mb-1 block">Unidad (opcional)</label>
                            <input
                                type="text"
                                placeholder="ej: 4B"
                                value={uploadUnit}
                                onChange={e => setUploadUnit(e.target.value)}
                                className="w-full bg-[#090B10] border border-[#1E2235] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-[#4B5268]"
                            />
                        </div>
                    </div>
                    <div
                        onClick={() => fileRef.current?.click()}
                        className={clsx(
                            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                            uploadFile ? 'border-indigo-500 bg-indigo-500/5' : 'border-[#1E2235] hover:border-indigo-600/40'
                        )}
                    >
                        <input type="file" ref={fileRef} accept=".pdf" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                        <Upload size={20} className={clsx('mx-auto mb-2', uploadFile ? 'text-indigo-400' : 'text-[#4B5268]')} />
                        <p className="text-sm text-[#8B91A8]">
                            {uploadFile ? uploadFile.name : 'Hacé click para seleccionar un PDF'}
                        </p>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 rounded-lg text-sm text-[#8B91A8] hover:text-white transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!uploadFile || uploading}
                            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                        >
                            {uploading ? 'Subiendo…' : 'Subir'}
                        </button>
                    </div>
                </form>
            )}

            {/* Filter tabs */}
            <div className="flex gap-2 mb-5 flex-wrap">
                <button
                    onClick={() => setFilter(null)}
                    className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', !filter ? 'bg-indigo-600 text-white' : 'bg-[#11141D] text-[#8B91A8] hover:text-white border border-[#1E2235]')}
                >
                    Todos
                </button>
                {DOC_TYPES.map(t => (
                    <button
                        key={t}
                        onClick={() => setFilter(t)}
                        className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === t ? 'bg-indigo-600 text-white' : 'bg-[#11141D] text-[#8B91A8] hover:text-white border border-[#1E2235]')}
                    >
                        {DOC_LABELS[t] || t}
                    </button>
                ))}
            </div>

            {/* Docs list */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 bg-[#11141D] rounded-xl animate-pulse" />)}
                </div>
            ) : docs.length === 0 ? (
                <div className="flex flex-col items-center py-20 text-center">
                    <FileText size={28} className="text-[#4B5268] mb-3" />
                    <p className="text-white font-semibold mb-1">Sin documentos</p>
                    <p className="text-[#8B91A8] text-sm">Subí el primero con el botón de arriba.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(grouped).map(([type, typeDocs]) => (
                        <section key={type}>
                            <h3 className="text-xs font-semibold text-[#4B5268] uppercase tracking-widest mb-3">
                                {DOC_LABELS[type] || type}
                            </h3>
                            <div className="space-y-2">
                                {typeDocs.map(doc => (
                                    <div key={doc.id} className="flex items-center gap-3 bg-[#11141D] border border-[#1E2235] rounded-xl px-4 py-3 hover:border-indigo-600/20 transition-colors">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center flex-shrink-0">
                                            <FileText size={15} className="text-indigo-400" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{doc.filename}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {doc.unit_identifier && (
                                                    <span className="text-xs text-[#8B91A8]">Unidad {doc.unit_identifier}</span>
                                                )}
                                                <span className="flex items-center gap-1 text-xs text-[#4B5268]">
                                                    <Layers size={10} /> v{doc.version}
                                                </span>
                                                <span className="flex items-center gap-1 text-xs text-[#4B5268]">
                                                    <Calendar size={10} /> {new Date(doc.uploaded_at).toLocaleDateString('es-AR')}
                                                </span>
                                            </div>
                                        </div>
                                        {doc.file_url && (
                                            <a
                                                href={doc.file_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[#4B5268] hover:text-indigo-400 transition-colors flex-shrink-0"
                                            >
                                                <ExternalLink size={16} />
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
