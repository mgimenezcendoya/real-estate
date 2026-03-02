'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, HardHat, X, ChevronRight, MessageSquare, LogOut } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
    { href: '/proyectos', label: 'Proyectos', icon: Building2 },
    { href: '/inbox', label: 'Inbox', icon: MessageSquare },
];

export default function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout } = useAuth();
    const [collapsed, setCollapsed] = useState(false);

    const handleLogout = () => {
        logout();
        router.replace('/');
    };

    return (
        <aside
            className={clsx(
                'flex flex-col border-r transition-all duration-300 ease-in-out flex-shrink-0 z-50',
                'glass border-r-[rgba(255,255,255,0.08)]',
                collapsed ? 'w-20' : 'w-64'
            )}
        >
            {/* Logo */}
            <div className={clsx("flex items-center gap-3 px-5 py-6 border-b border-[rgba(255,255,255,0.06)]", collapsed && "justify-center px-0")}>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
                    <HardHat size={20} className="text-white" />
                </div>
                {!collapsed && (
                    <div className="flex flex-col">
                        <span className="text-white font-display font-semibold text-xl tracking-wide">REALIA</span>
                        <span className="text-[10px] text-indigo-400 font-medium uppercase tracking-widest">Workspace</span>
                    </div>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-6 space-y-2 relative">
                {/* Collapse button absolutely positioned in the middle of the nav */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="absolute -right-3 top-6 bg-[#1A1E2A] border border-[rgba(255,255,255,0.1)] text-[#8B91A8] hover:text-white transition-all w-6 h-6 rounded-full flex items-center justify-center shadow-md z-10 hover:scale-110"
                >
                    {collapsed ? <ChevronRight size={14} /> : <X size={14} />}
                </button>

                {navItems.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={clsx(
                                'flex items-center gap-3 rounded-xl transition-all duration-300 relative group',
                                collapsed ? 'justify-center p-3' : 'px-4 py-3',
                                active
                                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                                    : 'text-[#8B91A8] hover:bg-white/5 hover:text-white border border-transparent'
                            )}
                        >
                            <Icon size={active ? 20 : 18} className={clsx("flex-shrink-0 transition-transform duration-300 group-hover:scale-110", active && "text-indigo-400")} />
                            {!collapsed && <span className="text-sm font-medium">{label}</span>}

                            {/* Active indicator */}
                            {active && !collapsed && (
                                <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className={clsx("mt-auto border-t border-[rgba(255,255,255,0.06)] bg-white/[0.02]", collapsed ? "px-0 py-4 flex justify-center" : "px-5 py-6")}>
                {collapsed ? (
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="p-2 rounded-xl text-[#8B91A8] hover:bg-white/5 hover:text-white transition-colors"
                        title="Cerrar sesión"
                    >
                        <LogOut size={18} />
                    </button>
                ) : (
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                                <span className="text-indigo-300 text-xs font-bold">
                                    {(user || 'A').charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <p className="text-sm text-white font-medium truncate">{user || 'Admin'}</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-medium text-[#94A3B8] hover:bg-white/5 hover:text-white transition-colors"
                            title="Cerrar sesión"
                        >
                            <LogOut size={14} />
                            Salir
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
}
