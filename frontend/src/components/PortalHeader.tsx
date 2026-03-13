'use client';

import { LogOut } from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { useRouter } from 'next/navigation';

interface PortalHeaderProps {
  projectName?: string | null;
}

export default function PortalHeader({ projectName }: PortalHeaderProps) {
  const { nombre, logout } = usePortalAuth();
  const router = useRouter();

  const initials = nombre
    ? nombre.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?';

  const handleLogout = () => {
    logout();
    router.replace('/portal/login');
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: brand + project */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-xl text-gray-900 tracking-tight shrink-0">
            REALIA
          </span>
          {projectName && (
            <>
              <span className="text-gray-200 shrink-0">/</span>
              <span className="text-sm text-gray-500 font-medium truncate">{projectName}</span>
            </>
          )}
        </div>

        {/* Right: user + logout */}
        <div className="flex items-center gap-3 shrink-0">
          {nombre && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
              <span className="text-sm text-gray-700 font-medium hidden sm:block">{nombre}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>
    </header>
  );
}
