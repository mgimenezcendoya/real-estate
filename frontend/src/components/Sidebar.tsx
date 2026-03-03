'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, HardHat, ChevronRight, ChevronLeft, MessageSquare, LogOut, Menu } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const navItems = [
  { href: '/proyectos', label: 'Proyectos', icon: Building2 },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
];

function NavContent({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { inboxUnreadCount } = useNotifications();

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  return (
    <>
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-3 px-5 py-6 border-b border-gray-100',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20">
          <HardHat size={20} className="text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-gray-900 font-display font-semibold text-xl tracking-wide">REALIA</span>
            <span className="text-[10px] text-indigo-600 font-medium uppercase tracking-widest">Workspace</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-6 space-y-1">
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
                'flex items-center gap-3 rounded-xl transition-all duration-150 relative group',
                collapsed ? 'justify-center p-3' : 'px-4 py-2.5',
                active
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent'
              )}
            >
              <div className="relative flex-shrink-0">
                <Icon
                  size={18}
                  className={cn(
                    'transition-transform duration-150',
                    active ? 'text-indigo-600' : 'group-hover:text-gray-700'
                  )}
                />
                {showBadge && collapsed && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-600" />
                )}
              </div>
              {!collapsed && <span className="text-sm font-medium">{label}</span>}
              {!collapsed && showBadge && (
                <span className="ml-auto min-w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold px-1">
                  {inboxUnreadCount > 99 ? '99+' : inboxUnreadCount}
                </span>
              )}
              {active && !collapsed && !showBadge && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-indigo-600" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          'mt-auto border-t border-gray-100 bg-gray-50',
          collapsed ? 'px-0 py-4 flex justify-center' : 'px-5 py-4'
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 rounded-xl text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-700 text-xs font-bold">
                  {(user || 'A').charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-800 font-medium truncate">{user || 'Admin'}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={13} />
              Salir
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
          <NavContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop: persistent sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-in-out flex-shrink-0 z-40 relative',
          collapsed ? 'w-20' : 'w-64'
        )}
      >
        <NavContent collapsed={collapsed} />

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
    </>
  );
}
