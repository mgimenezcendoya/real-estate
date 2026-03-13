'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PortalAuthProvider, usePortalAuth } from '@/contexts/PortalAuthContext';
import { Toaster } from '@/components/ui/sonner';

function PortalGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, loading, mustChangePassword } = usePortalAuth();

  useEffect(() => {
    if (loading) return;
    const isLoginPage = pathname === '/portal/login';
    const isChangePwPage = pathname === '/portal/change-password';

    if (!isAuthenticated && !isLoginPage) {
      router.replace('/portal/login');
      return;
    }
    if (isAuthenticated && isLoginPage) {
      router.replace(mustChangePassword ? '/portal/change-password' : '/portal/dashboard');
      return;
    }
    if (isAuthenticated && mustChangePassword && !isChangePwPage) {
      router.replace('/portal/change-password');
    }
  }, [loading, isAuthenticated, mustChangePassword, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-700 rounded-full animate-spin" />
          </div>
          <p className="text-sm text-gray-500 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return <div className="w-full min-h-screen overflow-auto">{children}</div>;
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthProvider>
      <PortalGuard>{children}</PortalGuard>
      <Toaster theme="light" position="bottom-right" richColors closeButton />
    </PortalAuthProvider>
  );
}
