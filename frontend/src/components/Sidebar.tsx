'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, HardHat, ChevronRight, ChevronLeft, MessageSquare, LogOut, Menu, Bell, Wrench, Users, KeyRound, BookOpen, CreditCard } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import AlertsPanel, { useAlertCount } from '@/components/AlertsPanel';
import ChangePasswordModal from '@/components/ChangePasswordModal';

const navItems = [
  { href: '/proyectos', label: 'Proyectos', icon: Building2 },
  { href: '/cobranza', label: 'Cobranza', icon: CreditCard },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/tools', label: 'Tools', icon: Wrench },
];

function NavContent({
  collapsed,
  onNavigate,
  onAlertsClick,
  alertCount,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onAlertsClick?: () => void;
  alertCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, nombre, isAdmin, logout, userId } = useAuth();
  const { inboxUnreadCount } = useNotifications();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  return (
    <>
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-3 px-5 py-5 border-b border-gray-100/80',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-600/30 ring-1 ring-blue-700/10">
          <HardHat size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-gray-900 font-display font-bold text-lg tracking-tight leading-none">REALIA</span>
            <span className="text-[9px] text-blue-600 font-semibold uppercase tracking-[0.18em] mt-0.5">Workspace</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          const isInbox = href === '/inbox';
          const showBadge = isInbox && inboxUnreadCount > 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'relative flex items-center gap-3 rounded-xl transition-all duration-150 group',
                collapsed ? 'justify-center p-3' : 'px-3.5 py-2.5',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-100/80 hover:text-gray-800'
              )}
            >
              {/* Left active indicator bar */}
              {active && !collapsed && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-700 rounded-r-full" />
              )}
              <div className="relative flex-shrink-0">
                <Icon
                  size={17}
                  className={cn(
                    'transition-colors duration-150',
                    active ? 'text-blue-700' : 'group-hover:text-gray-700'
                  )}
                />
                {showBadge && collapsed && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-700" />
                )}
              </div>
              {!collapsed && <span className="text-sm font-medium">{label}</span>}
              {!collapsed && showBadge && (
                <span className="ml-auto min-w-5 h-5 rounded-full bg-blue-700 text-white text-[10px] flex items-center justify-center font-bold px-1">
                  {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Admin links */}
      {isAdmin && (
        <div className={cn('px-3 pb-1', collapsed && 'px-0 flex flex-col items-center')}>
          <Link
            href="/admin/usuarios"
            onClick={onNavigate}
            className={cn(
              'relative flex items-center gap-3 rounded-xl transition-all duration-150 group',
              collapsed ? 'justify-center p-3' : 'px-3.5 py-2.5',
              pathname.startsWith('/admin/usuarios')
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:bg-gray-100/80 hover:text-gray-800'
            )}
          >
            {pathname.startsWith('/admin/usuarios') && !collapsed && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-700 rounded-r-full" />
            )}
            <Users size={17} className="flex-shrink-0 transition-colors duration-150" />
            {!collapsed && <span className="text-sm font-medium">Usuarios</span>}
          </Link>
        </div>
      )}

      {/* Alerts button */}
      {onAlertsClick && (
        <div className={cn('px-3 pb-3', collapsed && 'px-0 flex justify-center')}>
          <button
            type="button"
            onClick={onAlertsClick}
            className={cn(
              'relative flex items-center gap-3 rounded-xl transition-all duration-150 text-gray-500 hover:bg-gray-100/80 hover:text-gray-800 w-full',
              collapsed ? 'justify-center p-3' : 'px-3.5 py-2.5',
            )}
          >
            <div className="relative flex-shrink-0">
              <Bell size={17} />
              {(alertCount ?? 0) > 0 && collapsed && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </div>
            {!collapsed && <span className="text-sm font-medium">Alertas</span>}
            {!collapsed && (alertCount ?? 0) > 0 && (
              <span className="ml-auto min-w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold px-1">
                {(alertCount ?? 0) > 99 ? '99+' : alertCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Footer */}
      <div
        className={cn(
          'mt-auto border-t border-gray-100',
          collapsed ? 'px-0 py-4 flex justify-center' : 'px-4 py-3.5'
        )}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Link
              href="/guia"
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Guía de uso"
            >
              <BookOpen size={17} />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[11px] font-bold">
                  {(nombre || user || 'A').charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-700 font-medium truncate">{nombre || user || 'Admin'}</p>
            </div>
            <div className="flex items-center gap-0.5">
              {userId && (
                <button
                  type="button"
                  onClick={() => setShowChangePassword(true)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  title="Cambiar contraseña"
                >
                  <KeyRound size={14} />
                </button>
              )}
              <Link
                href="/guia"
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Guía de uso"
              >
                <BookOpen size={14} />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
        {showChangePassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <ChangePasswordModal
              onSuccess={() => setShowChangePassword(false)}
              onCancel={() => setShowChangePassword(false)}
            />
          </div>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { count: alertCount, refresh: refreshAlerts } = useAlertCount();
  const pathname = usePathname();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile: hamburger button */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-white border border-gray-200 shadow-sm text-gray-600 hover:text-gray-900 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Mobile: Sheet drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 bg-white border-r border-gray-200 flex flex-col"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Menú de navegación</SheetTitle>
          </SheetHeader>
          <NavContent
            onNavigate={() => setMobileOpen(false)}
            onAlertsClick={() => { setMobileOpen(false); setAlertsOpen(true); }}
            alertCount={alertCount}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop: persistent sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out flex-shrink-0 z-40 relative',
          collapsed ? 'w-20' : 'w-64'
        )}
      >
        <NavContent
          collapsed={collapsed}
          onAlertsClick={() => setAlertsOpen(true)}
          alertCount={alertCount}
        />

        {/* Collapse toggle button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 bg-white border border-gray-200 text-gray-400 hover:text-gray-700 transition-all w-6 h-6 rounded-full flex items-center justify-center shadow-sm z-50 hover:shadow-md"
          style={{ left: collapsed ? '4.5rem' : '15.5rem' }}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* Alerts panel */}
      <AlertsPanel
        open={alertsOpen}
        onOpenChange={setAlertsOpen}
        onRead={refreshAlerts}
      />
    </>
  );
}
