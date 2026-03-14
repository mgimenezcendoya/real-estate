'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import Sidebar from '@/components/Sidebar';
import ChangePasswordModal from '@/components/ChangePasswordModal';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading, mustChangePassword, setMustChangePassword, logout } = useAuth();

  if (pathname.startsWith('/portal')) {
    return <>{children}</>;
  }

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      if (pathname !== '/') {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('realia_redirect', window.location.pathname + window.location.search);
        }
        router.replace('/');
      }
      return;
    }
    if (pathname === '/') {
      const redirect = typeof window !== 'undefined' ? sessionStorage.getItem('realia_redirect') : null;
      if (redirect) {
        sessionStorage.removeItem('realia_redirect');
        router.replace(redirect);
      } else {
        router.replace('/proyectos');
      }
    }
  }, [loading, isAuthenticated, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
          </div>
          <p className="text-sm text-gray-500 font-medium">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (pathname === '/') return <div className="min-h-screen w-full flex">{children}</div>;
    return null;
  }

  if (pathname === '/') {
    return (
      <div className="flex h-screen items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
          </div>
          <p className="text-sm text-gray-500 font-medium">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return (
    <NotificationsProvider>
      {mustChangePassword && (
        <ChangePasswordModal
          forced
          onSuccess={() => setMustChangePassword(false)}
          onCancel={logout}
        />
      )}
      <Sidebar />
      <main className="flex-1 overflow-auto bg-transparent relative">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none mix-blend-overlay" />
        <div className="relative z-10 w-full h-full">{children}</div>
      </main>
    </NotificationsProvider>
  );
}
