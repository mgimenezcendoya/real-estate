'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { api, Project } from '@/lib/api';
import { Building2, BarChart2, MapPin, FileText, Users, HardHat, ChevronLeft, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const tabs = [
  { href: '', label: 'Dashboard', icon: BarChart2 },
  { href: '/unidades', label: 'Unidades', icon: MapPin },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/reservas', label: 'Reservas', icon: ClipboardList },
  { href: '/documentos', label: 'Documentos', icon: FileText },
  { href: '/obra', label: 'Obra', icon: HardHat },
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
      <div className="bg-white border-b border-gray-200 px-4 md:px-8 pt-5 pb-0">
        <Link
          href="/proyectos"
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 mb-3 transition-colors w-fit"
        >
          <ChevronLeft size={14} />
          Proyectos
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center flex-shrink-0">
            <Building2 size={18} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            {loadingProject ? (
              <>
                <Skeleton className="h-5 w-40 mb-1.5 bg-gray-200" />
                <Skeleton className="h-3 w-28 bg-gray-100" />
              </>
            ) : (
              <>
                <h1 className="text-gray-900 font-bold text-xl leading-tight truncate">
                  {project?.name ?? 'Proyecto'}
                </h1>
                <p className="text-xs text-gray-500">
                  {project ? `${project.neighborhood || ''}${project.neighborhood ? ' · ' : ''}${project.city || 'CABA'}` : ''}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Tabs — horizontally scrollable on mobile */}
        <div className="flex gap-0.5 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          {tabs.map(({ href, label, icon: Icon }) => {
            const fullPath = `/proyectos/${id}${href}`;
            const active = href === '' ? pathname === fullPath : pathname.startsWith(fullPath);
            return (
              <Link
                key={href}
                href={fullPath}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-all flex-shrink-0',
                  active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
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
