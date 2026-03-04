'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { api, Project } from '@/lib/api';
import { Building2, BarChart2, MapPin, FileText, Users, HardHat, ChevronLeft, ClipboardList, DollarSign, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const tabs = [
  { href: '', label: 'Dashboard', icon: BarChart2 },
  { href: '/unidades', label: 'Unidades', icon: MapPin },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/reservas', label: 'Reservas', icon: ClipboardList },
  { href: '/documentos', label: 'Documentos', icon: FileText },
  { href: '/obra', label: 'Obra', icon: HardHat },
  { href: '/financiero', label: 'Financiero', icon: DollarSign },
  { href: '/inversores', label: 'Inversores', icon: Briefcase },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);

  useEffect(() => {
    if (id) {
      api.getProject(id)
        .then(setProject)
        .catch(console.error)
        .finally(() => setLoadingProject(false));
    }
  }, [id]);

  return (
    <div className="flex flex-col h-full">
      {/* Project Header */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-8 pt-4 pb-0">
        <Link
          href="/proyectos"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-blue-700 mb-3 transition-colors group"
        >
          <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
          Proyectos
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/80 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Building2 size={17} className="text-blue-700" />
          </div>
          <div className="min-w-0">
            {loadingProject ? (
              <>
                <Skeleton className="h-5 w-40 mb-1.5 bg-gray-200" />
                <Skeleton className="h-3 w-28 bg-gray-100" />
              </>
            ) : (
              <>
                <h1 className="text-gray-900 font-display font-bold text-lg leading-tight truncate">
                  {project?.name ?? 'Proyecto'}
                </h1>
                {project && (
                  <p className="text-[11px] text-gray-400 font-medium">
                    {project.neighborhood ? `${project.neighborhood} · ` : ''}{project.city || 'CABA'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabs — horizontally scrollable on mobile */}
        <div className="flex gap-0 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          {tabs.map(({ href, label, icon: Icon }) => {
            const fullPath = `/proyectos/${id}${href}`;
            const active = href === '' ? pathname === fullPath : pathname.startsWith(fullPath);
            return (
              <Link
                key={href}
                href={fullPath}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium border-b-[2.5px] whitespace-nowrap transition-all flex-shrink-0',
                  active
                    ? 'border-blue-700 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
                )}
              >
                <Icon size={13} className={active ? 'text-blue-500' : 'text-gray-400'} />
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
