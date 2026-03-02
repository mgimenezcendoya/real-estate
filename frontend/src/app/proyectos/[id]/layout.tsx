'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { api, Project } from '@/lib/api';
import { Building2, BarChart2, MapPin, FileText, Users, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';

const tabs = [
    { href: '', label: 'Dashboard', icon: BarChart2 },
    { href: '/unidades', label: 'Unidades', icon: MapPin },
    { href: '/leads', label: 'Leads', icon: Users },
    { href: '/documentos', label: 'Documentos', icon: FileText },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
    const { id } = useParams<{ id: string }>();
    const pathname = usePathname();
    const [project, setProject] = useState<Project | null>(null);

    useEffect(() => {
        if (id) api.getProject(id).then(setProject).catch(console.error);
    }, [id]);

    return (
        <div className="flex flex-col h-full">
            {/* Project Header */}
            <div className="bg-[#11141D] border-b border-[#1E2235] px-8 pt-6 pb-0">
                <Link href="/proyectos" className="flex items-center gap-1 text-xs text-[#8B91A8] hover:text-white mb-3 transition-colors w-fit">
                    <ChevronLeft size={14} /> Proyectos
                </Link>
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-600/20 flex items-center justify-center">
                        <Building2 size={18} className="text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-white font-bold text-xl leading-tight">
                            {project?.name || <span className="opacity-40">Cargando…</span>}
                        </h1>
                        <p className="text-xs text-[#8B91A8]">
                            {project ? `${project.neighborhood || ''} · ${project.city || 'CABA'}` : ''}
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1">
                    {tabs.map(({ href, label, icon: Icon }) => {
                        const fullPath = `/proyectos/${id}${href}`;
                        const active = href === '' ? pathname === fullPath : pathname.startsWith(fullPath);
                        return (
                            <Link
                                key={href}
                                href={fullPath}
                                className={clsx(
                                    'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                                    active
                                        ? 'border-indigo-500 text-indigo-400'
                                        : 'border-transparent text-[#8B91A8] hover:text-white hover:border-[#1E2235]'
                                )}
                            >
                                <Icon size={15} />
                                {label}
                            </Link>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {children}
            </div>
        </div>
    );
}
